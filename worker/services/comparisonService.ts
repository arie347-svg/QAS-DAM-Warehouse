import { AuthUser } from '../types';
import { AuditError, recordAuditEvent } from './auditService';

export interface QuestionComparisonItem {
  question_id: string;
  question_code: string;
  prompt: string;
  section_id: string;
  section_code: string;
  self_option_id: string | null;
  self_option_code: string | null;
  self_option_label: string | null;
  self_numeric_value: number | null;
  self_note: string | null;
  self_evidence_count: number;
  official_option_id: string | null;
  official_option_code: string | null;
  official_option_label: string | null;
  official_numeric_value: number | null;
  official_note: string | null;
  official_evidence_count: number;
  gap: number;
  status: 'MATCH' | 'SELF_HIGHER' | 'OFFICIAL_HIGHER' | 'DIFF_OPTION_SAME_SCORE' | 'NA';
  is_option_different?: boolean;
}

export interface SectionComparisonItem {
  section_id: string;
  section_code: string;
  section_title: string;
  self_score: number | null;
  official_score: number | null;
  gap: number | null;
}

export interface ComparisonSummary {
  cycle_id: string;
  cycle_code: string;
  cycle_title: string;
  depot_id: string;
  depot_code: string;
  depot_name: string;
  self_audit_id: string;
  self_score: number | null;
  self_category: string | null;
  self_submitted_at: string | null;
  official_audit_id: string;
  official_score: number | null;
  official_category: string | null;
  official_submitted_at: string | null;
  score_gap: number | null;
  total_questions: number;
  match_count: number;
  mismatch_count: number;
  self_higher_count: number;
  official_higher_count: number;
  na_count: number;
  max_negative_gap_question: {
    code: string;
    gap: number;
    prompt: string;
  } | null;
  max_positive_gap_question?: {
    code: string;
    gap: number;
    prompt: string;
  } | null;
  questions_with_gap_count?: number;
  different_options_count?: number;
  section_comparisons: SectionComparisonItem[];
  question_comparisons: QuestionComparisonItem[];
  generated_at: string;
}

export interface ComparisonResponse {
  id: string;
  cycle_id: string;
  depot_id: string;
  self_audit_id: string;
  official_audit_id: string;
  summary: ComparisonSummary;
  created_at: string;
  acknowledgement: {
    id: string;
    user_id: string;
    user_name: string;
    note: string | null;
    acknowledged_at: string;
  } | null;
}

/**
 * Generates and stores comparison snapshot between Self and Official audits.
 * Invoked atomically when Official Audit is SUBMITTED.
 */
export async function generateAndSaveComparison(
  db: D1Database,
  cycleId: string,
  depotId: string,
  officialAuditId: string,
  user: AuthUser,
  requestId: string
): Promise<ComparisonResponse> {
  // 1. Fetch Official Audit
  const officialAudit = await db
    .prepare('SELECT * FROM audits WHERE id = ?')
    .bind(officialAuditId)
    .first<{
      id: string;
      cycle_id: string;
      depot_id: string;
      audit_type: string;
      status: string;
      score: number | null;
      category: string | null;
      template_version_id: string;
      submitted_at: string | null;
    }>();

  if (!officialAudit) {
    throw new AuditError('NOT_FOUND', `Official audit ${officialAuditId} tidak ditemukan.`, 404);
  }

  // 2. Fetch Self Audit for same cycle and depot
  const selfAudit = await db
    .prepare("SELECT * FROM audits WHERE cycle_id = ? AND depot_id = ? AND audit_type = 'SELF'")
    .bind(cycleId, depotId)
    .first<{
      id: string;
      cycle_id: string;
      depot_id: string;
      audit_type: string;
      status: string;
      score: number | null;
      category: string | null;
      template_version_id: string;
      submitted_at: string | null;
    }>();

  if (!selfAudit || selfAudit.status !== 'SUBMITTED') {
    throw new AuditError(
      'SELF_AUDIT_NOT_SUBMITTED',
      'Self audit harus berstatus SUBMITTED untuk membuat perbandingan.',
      400
    );
  }

  // 3. Fetch Cycle & Depot details
  const cycle = await db
    .prepare('SELECT id, code, title FROM audit_cycles WHERE id = ?')
    .bind(cycleId)
    .first<{ id: string; code: string; title: string }>();

  const depot = await db
    .prepare('SELECT id, code, name FROM depots WHERE id = ?')
    .bind(depotId)
    .first<{ id: string; code: string; name: string }>();

  if (!cycle || !depot) {
    throw new AuditError('NOT_FOUND', 'Metadata siklus atau depo tidak ditemukan.', 404);
  }

  // 4. Fetch sections & questions for the template version
  const sections = await db
    .prepare(
      'SELECT id, code, title, display_order FROM audit_sections WHERE version_id = ? ORDER BY display_order ASC'
    )
    .bind(officialAudit.template_version_id)
    .all<{ id: string; code: string; title: string; display_order: number }>();

  const sectionList = sections.results || [];
  const sectionIds = sectionList.map((s) => s.id);

  let questionList: Array<{
    id: string;
    section_id: string;
    code: string;
    prompt: string;
    display_order: number;
  }> = [];

  if (sectionIds.length > 0) {
    const placeholders = sectionIds.map(() => '?').join(',');
    const qRes = await db
      .prepare(
        `SELECT id, section_id, code, prompt, display_order 
         FROM audit_questions 
         WHERE section_id IN (${placeholders}) 
         ORDER BY display_order ASC`
      )
      .bind(...sectionIds)
      .all<{ id: string; section_id: string; code: string; prompt: string; display_order: number }>();
    questionList = qRes.results || [];
  }

  // 5. Fetch answers and evidence counts for both audits
  const selfAnswers = await db
    .prepare(
      `SELECT a.id, a.question_id, a.option_id, a.note, a.numeric_value_snapshot, 
              o.code as option_code, o.label as option_label, o.is_na,
              (SELECT COUNT(*) FROM evidence_files e WHERE e.answer_id = a.id AND e.deleted_at IS NULL) as evidence_count
       FROM audit_answers a
       LEFT JOIN answer_options o ON a.option_id = o.id
       WHERE a.audit_id = ?`
    )
    .bind(selfAudit.id)
    .all<{
      id: string;
      question_id: string;
      option_id: string | null;
      note: string | null;
      numeric_value_snapshot: number | null;
      option_code: string | null;
      option_label: string | null;
      is_na: number | null;
      evidence_count: number;
    }>();

  const officialAnswers = await db
    .prepare(
      `SELECT a.id, a.question_id, a.option_id, a.note, a.numeric_value_snapshot, 
              o.code as option_code, o.label as option_label, o.is_na,
              (SELECT COUNT(*) FROM evidence_files e WHERE e.answer_id = a.id AND e.deleted_at IS NULL) as evidence_count
       FROM audit_answers a
       LEFT JOIN answer_options o ON a.option_id = o.id
       WHERE a.audit_id = ?`
    )
    .bind(officialAudit.id)
    .all<{
      id: string;
      question_id: string;
      option_id: string | null;
      note: string | null;
      numeric_value_snapshot: number | null;
      option_code: string | null;
      option_label: string | null;
      is_na: number | null;
      evidence_count: number;
    }>();

  const selfAnsMap = new Map((selfAnswers.results || []).map((a) => [a.question_id, a]));
  const officialAnsMap = new Map((officialAnswers.results || []).map((a) => [a.question_id, a]));

  // 6. Build question comparison items
  let matchCount = 0;
  let mismatchCount = 0;
  let selfHigherCount = 0;
  let officialHigherCount = 0;
  let naCount = 0;

  let maxNegativeGap = 0;
  let maxNegativeGapQuestion: { code: string; gap: number; prompt: string } | null = null;
  let maxPositiveGap = 0;
  let maxPositiveGapQuestion: { code: string; gap: number; prompt: string } | null = null;

  const questionComparisons: QuestionComparisonItem[] = questionList.map((q) => {
    const sAns = selfAnsMap.get(q.id);
    const oAns = officialAnsMap.get(q.id);

    const sVal = sAns?.numeric_value_snapshot ?? null;
    const oVal = oAns?.numeric_value_snapshot ?? null;

    const sIsNa = sAns?.is_na === 1;
    const oIsNa = oAns?.is_na === 1;

    let gap = 0;
    let status: 'MATCH' | 'SELF_HIGHER' | 'OFFICIAL_HIGHER' | 'DIFF_OPTION_SAME_SCORE' | 'NA' = 'MATCH';
    const isOptionDifferent =
      Boolean(sAns?.option_id && oAns?.option_id && sAns.option_id !== oAns.option_id) ||
      (!sAns?.option_id && Boolean(oAns?.option_id)) ||
      (Boolean(sAns?.option_id) && !oAns?.option_id);

    if (sIsNa || oIsNa) {
      status = 'NA';
      naCount++;
    } else if (!isOptionDifferent) {
      status = 'MATCH';
      matchCount++;
      gap = 0;
    } else {
      mismatchCount++;
      gap = (oVal ?? 0) - (sVal ?? 0);
      if (gap < 0) {
        status = 'SELF_HIGHER';
        selfHigherCount++;
        if (gap < maxNegativeGap) {
          maxNegativeGap = gap;
          maxNegativeGapQuestion = {
            code: q.code,
            gap,
            prompt: q.prompt,
          };
        }
      } else if (gap > 0) {
        status = 'OFFICIAL_HIGHER';
        officialHigherCount++;
        if (gap > maxPositiveGap) {
          maxPositiveGap = gap;
          maxPositiveGapQuestion = {
            code: q.code,
            gap,
            prompt: q.prompt,
          };
        }
      } else {
        // Different option, but same score!
        status = 'DIFF_OPTION_SAME_SCORE';
      }
    }

    const sec = sectionList.find((s) => s.id === q.section_id);

    return {
      question_id: q.id,
      question_code: q.code,
      prompt: q.prompt,
      section_id: q.section_id,
      section_code: sec?.code || '',
      self_option_id: sAns?.option_id || null,
      self_option_code: sAns?.option_code || null,
      self_option_label: sAns?.option_label || null,
      self_numeric_value: sVal,
      self_note: sAns?.note || null,
      self_evidence_count: sAns?.evidence_count || 0,
      official_option_id: oAns?.option_id || null,
      official_option_code: oAns?.option_code || null,
      official_option_label: oAns?.option_label || null,
      official_numeric_value: oVal,
      official_note: oAns?.note || null,
      official_evidence_count: oAns?.evidence_count || 0,
      gap,
      status,
      is_option_different: isOptionDifferent,
    };
  });

  // 7. Build section comparisons
  const sectionComparisons: SectionComparisonItem[] = sectionList.map((sec) => {
    const secQuestions = questionComparisons.filter((q) => q.section_id === sec.id);
    let sSum = 0;
    let sCount = 0;
    let oSum = 0;
    let oCount = 0;

    for (const q of secQuestions) {
      if (q.self_numeric_value !== null) {
        sSum += q.self_numeric_value;
        sCount++;
      }
      if (q.official_numeric_value !== null) {
        oSum += q.official_numeric_value;
        oCount++;
      }
    }

    const sScore = sCount > 0 ? Math.round((sSum / sCount) * 100) / 100 : null;
    const oScore = oCount > 0 ? Math.round((oSum / oCount) * 100) / 100 : null;
    const gap = sScore !== null && oScore !== null ? Math.round((oScore - sScore) * 100) / 100 : null;

    return {
      section_id: sec.id,
      section_code: sec.code,
      section_title: sec.title,
      self_score: sScore,
      official_score: oScore,
      gap,
    };
  });

  const scoreGap =
    officialAudit.score !== null && selfAudit.score !== null
      ? Math.round((officialAudit.score - selfAudit.score) * 100) / 100
      : null;

  const now = new Date().toISOString();

  const questionsWithGapCount = questionComparisons.filter(
    (q) => Math.abs(q.gap) > 0 || q.is_option_different
  ).length;
  const differentOptionsCount = questionComparisons.filter(
    (q) => q.is_option_different
  ).length;

  const summary: ComparisonSummary = {
    cycle_id: cycleId,
    cycle_code: cycle.code,
    cycle_title: cycle.title,
    depot_id: depotId,
    depot_code: depot.code,
    depot_name: depot.name,
    self_audit_id: selfAudit.id,
    self_score: selfAudit.score,
    self_category: selfAudit.category,
    self_submitted_at: selfAudit.submitted_at,
    official_audit_id: officialAudit.id,
    official_score: officialAudit.score,
    official_category: officialAudit.category,
    official_submitted_at: officialAudit.submitted_at,
    score_gap: scoreGap,
    total_questions: questionList.length,
    match_count: matchCount,
    mismatch_count: mismatchCount,
    self_higher_count: selfHigherCount,
    official_higher_count: officialHigherCount,
    na_count: naCount,
    max_negative_gap_question: maxNegativeGapQuestion,
    max_positive_gap_question: maxPositiveGapQuestion,
    questions_with_gap_count: questionsWithGapCount,
    different_options_count: differentOptionsCount,
    section_comparisons: sectionComparisons,
    question_comparisons: questionComparisons,
    generated_at: now,
  };

  const snapshotId = `cmp-${cycleId}-${depotId}`;
  const summaryJson = JSON.stringify(summary);

  // 8. Insert or replace into comparison_snapshots table (Idempotent)
  await db
    .prepare(
      `INSERT INTO comparison_snapshots 
       (id, cycle_id, depot_id, self_audit_id, official_audit_id, summary_json, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(cycle_id, depot_id) DO UPDATE SET
         self_audit_id = excluded.self_audit_id,
         official_audit_id = excluded.official_audit_id,
         summary_json = excluded.summary_json,
         created_at = excluded.created_at`
    )
    .bind(
      snapshotId,
      cycleId,
      depotId,
      selfAudit.id,
      officialAudit.id,
      summaryJson,
      now
    )
    .run();

  await recordAuditEvent(
    db,
    'COMPARISON',
    snapshotId,
    'AUDIT_FINALIZED',
    user.id,
    requestId,
    null,
    {
      cycle_id: cycleId,
      depot_id: depotId,
      self_score: selfAudit.score,
      official_score: officialAudit.score,
      gap: scoreGap,
    }
  );

  return {
    id: snapshotId,
    cycle_id: cycleId,
    depot_id: depotId,
    self_audit_id: selfAudit.id,
    official_audit_id: officialAudit.id,
    summary,
    created_at: now,
    acknowledgement: null,
  };
}

/**
 * Retrieves a comparison snapshot.
 * Protected by server-side RBAC: PIC can only view their own depot, Auditor/Admin can view all.
 */
export async function getComparison(
  db: D1Database,
  cycleId: string,
  depotId: string,
  user: AuthUser
): Promise<ComparisonResponse> {
  const isAdmin = user.scopes.some((s) => s.role === 'ADMIN');
  const isAuditor = user.scopes.some((s) => s.role === 'AUDITOR_QAS');
  const isAuthorizedPic = user.scopes.some(
    (s) => s.role === 'PIC_QAS' && s.depotId === depotId
  );

  if (!isAdmin && !isAuditor && !isAuthorizedPic) {
    throw new AuditError(
      'FORBIDDEN',
      'Anda tidak memiliki izin untuk melihat hasil perbandingan audit depo ini.',
      403
    );
  }

  const row = await db
    .prepare('SELECT * FROM comparison_snapshots WHERE cycle_id = ? AND depot_id = ?')
    .bind(cycleId, depotId)
    .first<{
      id: string;
      cycle_id: string;
      depot_id: string;
      self_audit_id: string;
      official_audit_id: string;
      summary_json: string;
      created_at: string;
    }>();

  if (!row) {
    // Check if official audit exists and is submitted
    const official = await db
      .prepare("SELECT status FROM audits WHERE cycle_id = ? AND depot_id = ? AND audit_type = 'OFFICIAL'")
      .bind(cycleId, depotId)
      .first<{ status: string }>();

    if (!official || official.status !== 'SUBMITTED') {
      throw new AuditError(
        'COMPARISON_NOT_READY',
        'Hasil perbandingan belum tersedia karena Audit Resmi belum disubmit.',
        404
      );
    }

    throw new AuditError(
      'NOT_FOUND',
      'Snapshot perbandingan tidak ditemukan.',
      404
    );
  }

  const summary = JSON.parse(row.summary_json) as ComparisonSummary;

  // Fetch acknowledgement if exists
  const ackRow = await db
    .prepare(
      `SELECT a.id, a.user_id, a.note, a.acknowledged_at, u.full_name as user_name
       FROM acknowledgements a
       JOIN users u ON a.user_id = u.id
       WHERE a.official_audit_id = ?`
    )
    .bind(row.official_audit_id)
    .first<{
      id: string;
      user_id: string;
      note: string | null;
      acknowledged_at: string;
      user_name: string;
    }>();

  return {
    id: row.id,
    cycle_id: row.cycle_id,
    depot_id: row.depot_id,
    self_audit_id: row.self_audit_id,
    official_audit_id: row.official_audit_id,
    summary,
    created_at: row.created_at,
    acknowledgement: ackRow || null,
  };
}

/**
 * PIC Acknowledges the Official Audit results.
 */
export async function acknowledgeAuditResult(
  db: D1Database,
  officialAuditId: string,
  note: string | null,
  user: AuthUser,
  requestId: string
): Promise<{ id: string; official_audit_id: string; acknowledged_at: string }> {
  const audit = await db
    .prepare('SELECT id, depot_id, status, audit_type FROM audits WHERE id = ?')
    .bind(officialAuditId)
    .first<{ id: string; depot_id: string; status: string; audit_type: string }>();

  if (!audit) {
    throw new AuditError('NOT_FOUND', 'Audit tidak ditemukan.', 404);
  }

  if (audit.audit_type !== 'OFFICIAL' || audit.status !== 'SUBMITTED') {
    throw new AuditError(
      'INVALID_AUDIT_STATE',
      'Hanya Audit Resmi yang telah berstatus SUBMITTED yang dapat di-acknowledge.',
      400
    );
  }

  // Permission: PIC of the depot or Admin
  const isPicOfDepot = user.scopes.some(
    (s) => s.role === 'PIC_QAS' && s.depotId === audit.depot_id
  );
  const isAdmin = user.scopes.some((s) => s.role === 'ADMIN');

  if (!isPicOfDepot && !isAdmin) {
    throw new AuditError(
      'FORBIDDEN',
      'Hanya PIC Depo terkait atau Administrator yang dapat memberikan acknowledgement.',
      403
    );
  }

  const ackId = `ack-${officialAuditId}-${user.id}`;
  const now = new Date().toISOString();

  await db
    .prepare(
      `INSERT INTO acknowledgements (id, official_audit_id, user_id, note, acknowledged_at)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(official_audit_id, user_id) DO UPDATE SET
         note = excluded.note,
         acknowledged_at = excluded.acknowledged_at`
    )
    .bind(ackId, officialAuditId, user.id, note, now)
    .run();

  await recordAuditEvent(
    db,
    'ACKNOWLEDGEMENT',
    ackId,
    'AUDIT_ACKNOWLEDGED',
    user.id,
    requestId,
    null,
    { official_audit_id: officialAuditId, note }
  );

  return {
    id: ackId,
    official_audit_id: officialAuditId,
    acknowledged_at: now,
  };
}
