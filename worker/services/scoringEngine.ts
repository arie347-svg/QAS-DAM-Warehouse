/**
 * Scoring Engine for QAS Audit App
 * Implements pure calculation functions based on audit_template_versions scoring_config_json.
 * 
 * Guardrail:
 * - No hardcoded formula in UI or ad-hoc calculation in routes.
 * - Configuration-driven: supports weighted sections, weighted questions, N/A exclusion,
 *   half-up rounding, and threshold categories.
 */

export interface ScoringCategory {
  code: string;
  label: string;
  min: number;
  max?: number;
}

export interface ScoringConfig {
  method: 'weighted_average' | 'weighted_normalized' | 'simple_sum';
  decimalPlaces: number;
  rounding: 'half_up' | 'floor' | 'ceil';
  naPolicy: 'exclude_from_denominator' | 'zero_score';
  categories: ScoringCategory[];
}

export interface QuestionScoringInput {
  id: string;
  section_id: string;
  code: string;
  weight: number | null;
  chosen_option_id: string | null;
}

export interface OptionScoringInput {
  id: string;
  question_id: string;
  code: string;
  label: string;
  numeric_value: number | null;
  is_na: boolean;
}

export interface SectionScoringInput {
  id: string;
  code: string;
  title: string;
  weight: number | null;
}

export interface QuestionScoreResult {
  questionId: string;
  questionCode: string;
  sectionId: string;
  chosenOptionId: string | null;
  chosenOptionCode: string | null;
  chosenOptionLabel: string | null;
  numericValue: number | null;
  isNa: boolean;
  effectiveWeight: number;
}

export interface SectionScoreResult {
  sectionId: string;
  sectionCode: string;
  sectionTitle: string;
  rawScore: number | null;
  roundedScore: number | null;
  weight: number;
  totalQuestions: number;
  answeredQuestions: number;
  naQuestions: number;
}

export interface AuditScoringResult {
  score: number;
  rawScore: number;
  category: {
    code: string;
    label: string;
  };
  sectionScores: SectionScoreResult[];
  questionScores: QuestionScoreResult[];
  configHash: string;
}

/**
 * Computes a SHA-256 hash string for scoring config traceability.
 */
export async function computeConfigHash(configJson: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(configJson);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Applies decimal rounding based on the rounding strategy.
 */
export function applyRounding(
  value: number,
  decimalPlaces: number,
  strategy: 'half_up' | 'floor' | 'ceil'
): number {
  const factor = Math.pow(10, decimalPlaces);
  if (strategy === 'floor') {
    return Math.floor(value * factor) / factor;
  }
  if (strategy === 'ceil') {
    return Math.ceil(value * factor) / factor;
  }
  // half_up
  return Math.round((value + Number.EPSILON) * factor) / factor;
}

/**
 * Default fallback scoring config if not configured.
 */
export const DEFAULT_SCORING_CONFIG: ScoringConfig = {
  method: 'weighted_average',
  decimalPlaces: 2,
  rounding: 'half_up',
  naPolicy: 'exclude_from_denominator',
  categories: [
    { code: 'ISTIMEWA', label: 'Istimewa', min: 4.61 },
    { code: 'BAIK_SEKALI', label: 'Baik Sekali', min: 4.36 },
    { code: 'BAIK', label: 'Baik', min: 4.00 },
    { code: 'BURUK', label: 'Buruk', min: 2.00 },
    { code: 'BURUK_SEKALI', label: 'Buruk Sekali', min: 0.00 },
  ],
};

/**
 * Main Pure Scoring Function
 */
export async function calculateAuditScore(
  configJson: string | null,
  sections: SectionScoringInput[],
  questions: QuestionScoringInput[],
  options: OptionScoringInput[]
): Promise<AuditScoringResult> {
  let config: ScoringConfig = DEFAULT_SCORING_CONFIG;
  const rawConfigStr = configJson || JSON.stringify(DEFAULT_SCORING_CONFIG);

  if (configJson) {
    try {
      config = JSON.parse(configJson) as ScoringConfig;
    } catch {
      config = DEFAULT_SCORING_CONFIG;
    }
  }

  const configHash = await computeConfigHash(rawConfigStr);

  // 1. Map Questions with their chosen options & scores
  const questionScores: QuestionScoreResult[] = questions.map((q) => {
    const chosenOpt = q.chosen_option_id
      ? options.find((o) => o.id === q.chosen_option_id && o.question_id === q.id)
      : null;

    const isNa = chosenOpt?.is_na === true;
    let numericValue: number | null = chosenOpt?.numeric_value ?? null;

    if (isNa && config.naPolicy === 'zero_score') {
      numericValue = 0;
    }

    const effectiveWeight = q.weight && q.weight > 0 ? q.weight : 1.0;

    return {
      questionId: q.id,
      questionCode: q.code,
      sectionId: q.section_id,
      chosenOptionId: q.chosen_option_id,
      chosenOptionCode: chosenOpt?.code || null,
      chosenOptionLabel: chosenOpt?.label || null,
      numericValue: isNa && config.naPolicy === 'exclude_from_denominator' ? null : numericValue,
      isNa,
      effectiveWeight,
    };
  });

  // 2. Calculate Section Scores
  const sectionScores: SectionScoreResult[] = sections.map((sec) => {
    const secQuestions = questionScores.filter((q) => q.sectionId === sec.id);
    const totalQuestions = secQuestions.length;
    let answeredQuestions = 0;
    let naQuestions = 0;

    let weightedSum = 0;
    let weightSum = 0;

    for (const q of secQuestions) {
      if (q.isNa && config.naPolicy === 'exclude_from_denominator') {
        naQuestions++;
        continue;
      }

      if (q.numericValue !== null) {
        answeredQuestions++;
        weightedSum += q.numericValue * q.effectiveWeight;
        weightSum += q.effectiveWeight;
      }
    }

    const secWeight = sec.weight && sec.weight > 0 ? sec.weight : 1.0;
    const rawScore = weightSum > 0 ? weightedSum / weightSum : null;
    const roundedScore =
      rawScore !== null
        ? applyRounding(rawScore, config.decimalPlaces, config.rounding)
        : null;

    return {
      sectionId: sec.id,
      sectionCode: sec.code,
      sectionTitle: sec.title,
      rawScore,
      roundedScore,
      weight: secWeight,
      totalQuestions,
      answeredQuestions,
      naQuestions,
    };
  });

  // 3. Calculate Audit Level Final Score
  let rawFinalScore = 0;

  if (config.method === 'simple_sum') {
    let sum = 0;
    for (const q of questionScores) {
      if (q.numericValue !== null) {
        sum += q.numericValue;
      }
    }
    rawFinalScore = sum;
  } else {
    // Weighted average across sections
    let totalWeightedSectionScore = 0;
    let totalApplicableSectionWeight = 0;

    for (const s of sectionScores) {
      if (s.rawScore !== null) {
        totalWeightedSectionScore += s.rawScore * s.weight;
        totalApplicableSectionWeight += s.weight;
      }
    }

    if (totalApplicableSectionWeight > 0) {
      rawFinalScore = totalWeightedSectionScore / totalApplicableSectionWeight;
    } else {
      // Fallback: direct question weighted average if sections have no valid score
      let directWeightedSum = 0;
      let directWeightSum = 0;
      for (const q of questionScores) {
        if (q.numericValue !== null) {
          directWeightedSum += q.numericValue * q.effectiveWeight;
          directWeightSum += q.effectiveWeight;
        }
      }
      rawFinalScore = directWeightSum > 0 ? directWeightedSum / directWeightSum : 0;
    }
  }

  const finalScore = applyRounding(rawFinalScore, config.decimalPlaces, config.rounding);

  // 4. Determine Category from threshold table
  // Sort categories by min descending to pick the highest matching tier
  const sortedCategories = [...config.categories].sort((a, b) => b.min - a.min);
  let matchedCategory = sortedCategories[sortedCategories.length - 1] || {
    code: 'UNKNOWN',
    label: 'Tidak Diketahui',
    min: 0,
  };

  for (const cat of sortedCategories) {
    if (finalScore >= cat.min) {
      matchedCategory = cat;
      break;
    }
  }

  return {
    score: finalScore,
    rawScore: rawFinalScore,
    category: {
      code: matchedCategory.code,
      label: matchedCategory.label,
    },
    sectionScores,
    questionScores,
    configHash,
  };
}
