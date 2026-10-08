import { AuthUser } from '../types';
import { AuditError, recordAuditEvent } from './auditService';

export interface DashboardFilter {
  cycleId?: string;
  depotId?: string;
  status?: string;
}

export interface DepotMetricSummary {
  depot_id: string;
  depot_code: string;
  depot_name: string;
  self_status: string;
  self_score: number | null;
  self_category: string | null;
  official_status: string;
  official_score: number | null;
  official_category: string | null;
  gap: number | null;
  acknowledged: boolean;
}

export interface SectionGapSummary {
  section_code: string;
  section_title: string;
  avg_self_score: number | null;
  avg_official_score: number | null;
  avg_gap: number | null;
}

export interface PriorityFinding {
  question_code: string;
  prompt: string;
  section_code: string;
  depot_code: string;
  self_score: number | null;
  official_score: number | null;
  gap: number;
}

export interface DashboardData {
  kpis: {
    total_cycles: number;
    total_audits: number;
    submitted_audits: number;
    in_progress_audits: number;
    avg_self_score: number | null;
    avg_official_score: number | null;
    overall_gap: number | null;
    compliance_rate: number;
  };
  depots: DepotMetricSummary[];
  section_gaps: SectionGapSummary[];
  priority_findings: PriorityFinding[];
  available_cycles: Array<{ id: string; code: string; title: string; status: string }>;
  available_depots: Array<{ id: string; code: string; name: string }>;
  generated_at: string;
}

/**
 * Enforces scope on filter: PIC can only view their assigned depot.
 */
function enforceUserScope(filter: DashboardFilter, user: AuthUser): DashboardFilter {
  const isAdmin = user.scopes.some((s) => s.role === 'ADMIN');
  const isAuditor = user.scopes.some((s) => s.role === 'AUDITOR_QAS');

  if (!isAdmin && !isAuditor) {
    const picScope = user.scopes.find((s) => s.role === 'PIC_QAS');
    if (!picScope || !picScope.depotId) {
      throw new AuditError('FORBIDDEN', 'Pengguna tidak memiliki cakupan depo yang valid.', 403);
    }
    return {
      ...filter,
      depotId: picScope.depotId,
    };
  }

  return filter;
}

/**
 * Aggregates dashboard metrics according to user scope and filters.
 */
export async function getDashboardMetrics(
  db: D1Database,
  rawFilter: DashboardFilter,
  user: AuthUser
): Promise<DashboardData> {
  const filter = enforceUserScope(rawFilter, user);

  // 1. Fetch available cycles
  const cyclesResult = await db
    .prepare('SELECT id, code, title, status FROM audit_cycles ORDER BY period_start DESC')
    .all<{ id: string; code: string; title: string; status: string }>();
  const availableCycles = cyclesResult.results || [];

  // Determine active cycle
  let activeCycleId = filter.cycleId;
  if (!activeCycleId && availableCycles.length > 0) {
    activeCycleId = availableCycles[0].id;
  }

  // 2. Fetch available depots based on role
  let depotsQuery = 'SELECT id, code, name FROM depots WHERE is_active = 1';
  const depotsParams: string[] = [];
  if (filter.depotId) {
    depotsQuery += ' AND id = ?';
    depotsParams.push(filter.depotId);
  }
  depotsQuery += ' ORDER BY code ASC';

  const depotsResult = await db
    .prepare(depotsQuery)
    .bind(...depotsParams)
    .all<{ id: string; code: string; name: string }>();
  const availableDepots = depotsResult.results || [];

  // 3. Fetch audits for active cycle and depots
  let auditsQuery = `
    SELECT a.*,
      (SELECT COUNT(*) FROM audit_answers ans WHERE ans.audit_id = a.id AND (ans.option_id IS NOT NULL OR (ans.note IS NOT NULL AND LENGTH(TRIM(ans.note)) > 0))) as answer_count,
      (SELECT COUNT(*) FROM evidence_files ef JOIN audit_answers ans ON ef.answer_id = ans.id WHERE ans.audit_id = a.id AND ef.deleted_at IS NULL) as evidence_count
    FROM audits a 
    WHERE 1=1
  `;
  const auditsParams: string[] = [];

  if (activeCycleId) {
    auditsQuery += ' AND a.cycle_id = ?';
    auditsParams.push(activeCycleId);
  }
  if (filter.depotId) {
    auditsQuery += ' AND a.depot_id = ?';
    auditsParams.push(filter.depotId);
  }

  const auditsResult = await db
    .prepare(auditsQuery)
    .bind(...auditsParams)
    .all<{
      id: string;
      cycle_id: string;
      depot_id: string;
      audit_type: 'SELF' | 'OFFICIAL';
      status: string;
      score: number | null;
      category: string | null;
      submitted_at: string | null;
      started_at?: string | null;
      answer_count?: number;
      evidence_count?: number;
    }>();

  const auditsList = auditsResult.results || [];

  // 4. Calculate KPIs (Rule: Planned/empty slots without activity are not counted)
  let totalSelfScore = 0;
  let selfScoreCount = 0;
  let totalOfficialScore = 0;
  let officialScoreCount = 0;
  let submittedCount = 0;
  let inProgressCount = 0;

  for (const a of auditsList) {
    const isSubmitted = a.status === 'SUBMITTED' || a.status === 'FINALIZED';
    const hasActivity =
      isSubmitted ||
      Boolean(a.started_at) ||
      (a.answer_count || 0) > 0 ||
      (a.evidence_count || 0) > 0;

    if (!hasActivity) {
      // Empty planned slot with no answers, evidence, or started_at is ignored
      continue;
    }

    if (isSubmitted) {
      submittedCount++;
      if (a.audit_type === 'SELF' && a.score !== null) {
        totalSelfScore += a.score;
        selfScoreCount++;
      } else if (a.audit_type === 'OFFICIAL' && a.score !== null) {
        totalOfficialScore += a.score;
        officialScoreCount++;
      }
    } else {
      inProgressCount++;
    }
  }

  const avgSelfScore = selfScoreCount > 0 ? Math.round((totalSelfScore / selfScoreCount) * 100) / 100 : null;
  const avgOfficialScore = officialScoreCount > 0 ? Math.round((totalOfficialScore / officialScoreCount) * 100) / 100 : null;
  const overallGap =
    avgOfficialScore !== null && avgSelfScore !== null
      ? Math.round((avgOfficialScore - avgSelfScore) * 100) / 100
      : null;

  const totalAudits = submittedCount + inProgressCount;
  const complianceRate = totalAudits > 0 ? Math.round((submittedCount / totalAudits) * 100) : 0;

  // 5. Depot Summaries
  const depotSummaries: DepotMetricSummary[] = [];

  for (const dep of availableDepots) {
    const selfA = auditsList.find((a) => a.depot_id === dep.id && a.audit_type === 'SELF');
    const offA = auditsList.find((a) => a.depot_id === dep.id && a.audit_type === 'OFFICIAL');

    let gap: number | null = null;
    if (offA?.score !== null && selfA?.score !== null && offA?.score !== undefined && selfA?.score !== undefined) {
      gap = Math.round((offA.score - selfA.score) * 100) / 100;
    }

    let acknowledged = false;
    if (offA?.id) {
      const ack = await db
        .prepare('SELECT id FROM acknowledgements WHERE official_audit_id = ?')
        .bind(offA.id)
        .first();
      acknowledged = Boolean(ack);
    }

    depotSummaries.push({
      depot_id: dep.id,
      depot_code: dep.code,
      depot_name: dep.name,
      self_status: selfA?.status || 'BELUM DIMULAI',
      self_score: selfA?.score ?? null,
      self_category: selfA?.category ?? null,
      official_status: offA?.status || 'BELUM DIMULAI',
      official_score: offA?.score ?? null,
      official_category: offA?.category ?? null,
      gap,
      acknowledged,
    });
  }

  // 6. Section Gaps & Priority Findings from Comparison Snapshots
  let comparisonQuery = 'SELECT summary_json FROM comparison_snapshots WHERE 1=1';
  const compParams: string[] = [];

  if (activeCycleId) {
    comparisonQuery += ' AND cycle_id = ?';
    compParams.push(activeCycleId);
  }
  if (filter.depotId) {
    comparisonQuery += ' AND depot_id = ?';
    compParams.push(filter.depotId);
  }

  const compResult = await db.prepare(comparisonQuery).bind(...compParams).all<{ summary_json: string }>();
  const snapshots = (compResult.results || []).map((r) => JSON.parse(r.summary_json));

  // Aggregate Section Gaps
  const sectionMap = new Map<
    string,
    { title: string; selfSum: number; selfCount: number; offSum: number; offCount: number }
  >();

  const allFindings: PriorityFinding[] = [];

  for (const snap of snapshots) {
    if (Array.isArray(snap.section_comparisons)) {
      for (const sec of snap.section_comparisons) {
        if (!sectionMap.has(sec.section_code)) {
          sectionMap.set(sec.section_code, {
            title: sec.section_title,
            selfSum: 0,
            selfCount: 0,
            offSum: 0,
            offCount: 0,
          });
        }
        const item = sectionMap.get(sec.section_code)!;
        if (sec.self_score !== null) {
          item.selfSum += sec.self_score;
          item.selfCount++;
        }
        if (sec.official_score !== null) {
          item.offSum += sec.official_score;
          item.offCount++;
        }
      }
    }

    if (Array.isArray(snap.question_comparisons)) {
      for (const q of snap.question_comparisons) {
        if (q.gap < 0) {
          allFindings.push({
            question_code: q.question_code,
            prompt: q.prompt,
            section_code: q.section_code,
            depot_code: snap.depot_code,
            self_score: q.self_numeric_value,
            official_score: q.official_numeric_value,
            gap: q.gap,
          });
        }
      }
    }
  }

  const sectionGaps: SectionGapSummary[] = Array.from(sectionMap.entries()).map(([code, val]) => {
    const sAvg = val.selfCount > 0 ? Math.round((val.selfSum / val.selfCount) * 100) / 100 : null;
    const oAvg = val.offCount > 0 ? Math.round((val.offSum / val.offCount) * 100) / 100 : null;
    const gap = sAvg !== null && oAvg !== null ? Math.round((oAvg - sAvg) * 100) / 100 : null;
    return {
      section_code: code,
      section_title: val.title,
      avg_self_score: sAvg,
      avg_official_score: oAvg,
      avg_gap: gap,
    };
  });

  // Sort priority findings by gap ascending (most negative first)
  allFindings.sort((a, b) => a.gap - b.gap);
  const priorityFindings = allFindings.slice(0, 5);

  return {
    kpis: {
      total_cycles: availableCycles.length,
      total_audits: totalAudits,
      submitted_audits: submittedCount,
      in_progress_audits: inProgressCount,
      avg_self_score: avgSelfScore,
      avg_official_score: avgOfficialScore,
      overall_gap: overallGap,
      compliance_rate: complianceRate,
    },
    depots: depotSummaries,
    section_gaps: sectionGaps,
    priority_findings: priorityFindings,
    available_cycles: availableCycles,
    available_depots: availableDepots,
    generated_at: new Date().toISOString(),
  };
}

/**
 * Generates CSV Export string for audits based on filter and user scope.
 */
export async function exportAuditsCsv(
  db: D1Database,
  rawFilter: DashboardFilter,
  user: AuthUser,
  requestId: string
): Promise<string> {
  const filter = enforceUserScope(rawFilter, user);

  let query = `
    SELECT 
      c.code as cycle_code,
      c.title as cycle_title,
      d.code as depot_code,
      d.name as depot_name,
      a.audit_type,
      a.status,
      a.score,
      a.category,
      u.full_name as assigned_user,
      a.submitted_at,
      (SELECT COUNT(*) FROM evidence_files e JOIN audit_answers ans ON e.answer_id = ans.id WHERE ans.audit_id = a.id AND e.deleted_at IS NULL) as evidence_count
    FROM audits a
    JOIN audit_cycles c ON a.cycle_id = c.id
    JOIN depots d ON a.depot_id = d.id
    JOIN users u ON a.assigned_user_id = u.id
    WHERE 1=1
  `;
  const params: string[] = [];

  if (filter.cycleId) {
    query += ' AND a.cycle_id = ?';
    params.push(filter.cycleId);
  }
  if (filter.depotId) {
    query += ' AND a.depot_id = ?';
    params.push(filter.depotId);
  }
  if (filter.status) {
    query += ' AND a.status = ?';
    params.push(filter.status);
  }

  query += ' ORDER BY c.period_start DESC, d.code ASC, a.audit_type ASC';

  const rows = await db.prepare(query).bind(...params).all<{
    cycle_code: string;
    cycle_title: string;
    depot_code: string;
    depot_name: string;
    audit_type: string;
    status: string;
    score: number | null;
    category: string | null;
    assigned_user: string;
    submitted_at: string | null;
    evidence_count: number;
  }>();

  // Helper for CSV escaping
  const escapeCsv = (str: string | number | null | undefined): string => {
    if (str === null || str === undefined) return '""';
    const s = String(str).replace(/"/g, '""');
    return `"${s}"`;
  };

  const headers = [
    'Kode Siklus',
    'Nama Siklus',
    'Kode Depo',
    'Nama Depo',
    'Tipe Audit',
    'Status',
    'Skor Akhir',
    'Kategori',
    'Petugas Audit',
    'Waktu Submit',
    'Jumlah Bukti Foto',
  ];

  const lines = [headers.map(escapeCsv).join(',')];

  for (const r of rows.results || []) {
    lines.push(
      [
        escapeCsv(r.cycle_code),
        escapeCsv(r.cycle_title),
        escapeCsv(r.depot_code),
        escapeCsv(r.depot_name),
        escapeCsv(r.audit_type),
        escapeCsv(r.status),
        escapeCsv(r.score !== null ? r.score.toFixed(2) : '-'),
        escapeCsv(r.category || '-'),
        escapeCsv(r.assigned_user),
        escapeCsv(r.submitted_at || '-'),
        escapeCsv(r.evidence_count),
      ].join(',')
    );
  }

  await recordAuditEvent(
    db,
    'EXPORT',
    `exp-${Date.now()}`,
    'EXPORT_CREATED',
    user.id,
    requestId,
    null,
    { filter, total_rows: (rows.results || []).length }
  );

  return lines.join('\r\n');
}

export interface AuditReportFilter {
  cycleId?: string;
  year?: string;
  month?: string;
  depotId?: string;
  auditType?: 'RECONCILIATION' | 'SELF' | 'OFFICIAL';
}

export interface ExportEvidenceItem {
  id?: string;
  original_name?: string;
  preview_url?: string;
}

export interface ExportQuestionItem {
  question_id: string;
  question_code: string;
  prompt: string;
  weight: number;
  self_score: number | null;
  self_option_label?: string | null;
  self_note?: string | null;
  self_evidences?: ExportEvidenceItem[];
  official_score: number | null;
  official_option_label?: string | null;
  official_note?: string | null;
  official_evidences?: ExportEvidenceItem[];
  gap: number | null;
}

export interface ExportSectionItem {
  section_id: string;
  section_code: string;
  section_title: string;
  weight?: number;
  questions: ExportQuestionItem[];
}

export interface AuditExportReportData {
  cycle_code: string;
  cycle_title: string;
  period_label: string;
  depot_code: string;
  depot_name: string;
  document_type: 'RECONCILIATION' | 'SELF' | 'OFFICIAL';
  pic_name: string;
  pic_status: string;
  pic_submitted_at: string | null;
  auditor_name: string;
  auditor_status: string;
  auditor_submitted_at: string | null;
  overall_self_score: number | null;
  overall_official_score: number | null;
  overall_gap: number | null;
  final_predicate: string;
  sections: ExportSectionItem[];
}

/**
 * Mengambil data komprehensif audit untuk ekspor laporan Excel portrait.
 * Menerapkan Zero Client Trust: PIC hanya dapat mengakses depo miliknya sendiri,
 * sedangkan Auditor QAS / Admin dapat memilih semua depo (all) atau spesifik depo.
 * Menerapkan Blind Audit Guardrail untuk PIC sebelum Official Audit disubmit.
 */
export async function getAuditExportReportData(
  db: D1Database,
  rawFilter: AuditReportFilter,
  user: AuthUser,
  requestId: string
): Promise<AuditExportReportData[]> {
  const isAdmin = user.scopes.some((s) => s.role === 'ADMIN');
  const isAuditor = user.scopes.some((s) => s.role === 'AUDITOR_QAS');

  let targetDepotId: string | undefined = rawFilter.depotId;

  if (!isAdmin && !isAuditor) {
    const picScope = user.scopes.find((s) => s.role === 'PIC_QAS');
    if (!picScope || !picScope.depotId) {
      throw new AuditError('FORBIDDEN', 'Pengguna tidak memiliki cakupan depo yang valid.', 403);
    }
    if (rawFilter.depotId && rawFilter.depotId !== 'all' && rawFilter.depotId !== picScope.depotId) {
      throw new AuditError(
        'FORBIDDEN_DEPOT_ACCESS',
        'PIC QAS hanya berwenang mengekspor data depo miliknya sendiri.',
        403
      );
    }
    targetDepotId = picScope.depotId;
  } else {
    if (targetDepotId === 'all') {
      targetDepotId = undefined;
    }
  }

  // 1. Ambil Siklus Audit
  let cycleQuery = 'SELECT id, code, title, period_start, period_end, template_version_id FROM audit_cycles WHERE 1=1';
  const cycleParams: string[] = [];

  if (rawFilter.cycleId) {
    cycleQuery += ' AND id = ?';
    cycleParams.push(rawFilter.cycleId);
  } else if (rawFilter.year && rawFilter.month && rawFilter.month !== 'all') {
    const paddedMonth = rawFilter.month.padStart(2, '0');
    cycleQuery += ' AND (period_start LIKE ? OR code LIKE ?)';
    cycleParams.push(`${rawFilter.year}-${paddedMonth}%`, `%${rawFilter.year}${paddedMonth}%`);
  } else if (rawFilter.year) {
    cycleQuery += ' AND (period_start LIKE ? OR code LIKE ?)';
    cycleParams.push(`${rawFilter.year}-%`, `%${rawFilter.year}%`);
  }

  cycleQuery += ' ORDER BY period_start DESC LIMIT 5';
  const cyclesResult = await db.prepare(cycleQuery).bind(...cycleParams).all<{
    id: string;
    code: string;
    title: string;
    period_start: string;
    period_end: string;
    template_version_id: string;
  }>();

  let targetCycle = cyclesResult.results?.[0];
  if (!targetCycle) {
    const latest = await db
      .prepare('SELECT id, code, title, period_start, period_end, template_version_id FROM audit_cycles ORDER BY period_start DESC LIMIT 1')
      .first<{
        id: string;
        code: string;
        title: string;
        period_start: string;
        period_end: string;
        template_version_id: string;
      }>();
    if (!latest) {
      return [];
    }
    targetCycle = latest;
  }

  // 2. Ambil Depo Sesuai Filter
  let depotsQuery = 'SELECT id, code, name FROM depots WHERE is_active = 1';
  const depotParams: string[] = [];
  if (targetDepotId) {
    depotsQuery += ' AND id = ?';
    depotParams.push(targetDepotId);
  }
  depotsQuery += ' ORDER BY code ASC';

  const depotsRes = await db.prepare(depotsQuery).bind(...depotParams).all<{
    id: string;
    code: string;
    name: string;
  }>();
  const depots = depotsRes.results || [];
  if (depots.length === 0) return [];

  // 3. Ambil Seksi & Pertanyaan dari Versi Template
  const sectionsRes = await db
    .prepare('SELECT id, code, title, display_order, weight FROM audit_sections WHERE version_id = ? ORDER BY display_order ASC')
    .bind(targetCycle.template_version_id)
    .all<{
      id: string;
      code: string;
      title: string;
      display_order: number;
      weight: number | null;
    }>();
  const sections = sectionsRes.results || [];
  const sectionIds = sections.map((s) => s.id);

  let questions: Array<{
    id: string;
    section_id: string;
    code: string;
    prompt: string;
    display_order: number;
    weight: number | null;
  }> = [];

  if (sectionIds.length > 0) {
    const qPlaceholders = sectionIds.map(() => '?').join(',');
    const qRes = await db
      .prepare(`SELECT id, section_id, code, prompt, display_order, weight FROM audit_questions WHERE section_id IN (${qPlaceholders}) ORDER BY display_order ASC`)
      .bind(...sectionIds)
      .all<{
        id: string;
        section_id: string;
        code: string;
        prompt: string;
        display_order: number;
        weight: number | null;
      }>();
    questions = qRes.results || [];
  }

  const reports: AuditExportReportData[] = [];

  for (const depot of depots) {
    const auditsRes = await db
      .prepare(
        `SELECT a.*, u.full_name as user_full_name
         FROM audits a
         LEFT JOIN users u ON a.assigned_user_id = u.id
         WHERE a.cycle_id = ? AND a.depot_id = ?`
      )
      .bind(targetCycle.id, depot.id)
      .all<{
        id: string;
        cycle_id: string;
        depot_id: string;
        audit_type: 'SELF' | 'OFFICIAL';
        status: string;
        score: number | null;
        category: string | null;
        submitted_at: string | null;
        user_full_name: string | null;
      }>();

    const selfAudit = auditsRes.results?.find((a) => a.audit_type === 'SELF');
    const offAudit = auditsRes.results?.find((a) => a.audit_type === 'OFFICIAL');

    // Blind Audit Guard: Jika PIC, dan Official Audit belum SUBMITTED, jangan bocorkan data Official
    const isBlindMode = !isAdmin && !isAuditor && (!offAudit || offAudit.status !== 'SUBMITTED');

    // Fetch jawaban & foto Self Audit
    const selfAnswersMap = new Map<string, { id: string; question_id: string; note: string | null; numeric_value_snapshot: number | null; option_label: string | null }>();
    const selfEvidencesMap = new Map<string, ExportEvidenceItem[]>();
    if (selfAudit) {
      const answers = await db
        .prepare(
          `SELECT a.id, a.question_id, a.note, a.numeric_value_snapshot, o.label as option_label
           FROM audit_answers a
           LEFT JOIN answer_options o ON a.option_id = o.id
           WHERE a.audit_id = ?`
        )
        .bind(selfAudit.id)
        .all<{
          id: string;
          question_id: string;
          note: string | null;
          numeric_value_snapshot: number | null;
          option_label: string | null;
        }>();

      (answers.results || []).forEach((ans) => {
        selfAnswersMap.set(ans.question_id, ans);
      });

      const answerIds = (answers.results || []).map((a) => a.id);
      if (answerIds.length > 0) {
        const evPlaceholders = answerIds.map(() => '?').join(',');
        const evRes = await db
          .prepare(
            `SELECT e.id, e.answer_id, e.original_name
             FROM evidence_files e
             WHERE e.answer_id IN (${evPlaceholders}) AND e.deleted_at IS NULL`
          )
          .bind(...answerIds)
          .all<{ id: string; answer_id: string; original_name: string }>();

        (evRes.results || []).forEach((ev) => {
          const list = selfEvidencesMap.get(ev.answer_id) || [];
          list.push({
            id: ev.id,
            original_name: ev.original_name,
            preview_url: `/api/evidence/${ev.id}`,
          });
          selfEvidencesMap.set(ev.answer_id, list);
        });
      }
    }

    // Fetch jawaban & foto Official Audit
    const offAnswersMap = new Map<string, { id: string; question_id: string; note: string | null; numeric_value_snapshot: number | null; option_label: string | null }>();
    const offEvidencesMap = new Map<string, ExportEvidenceItem[]>();
    if (offAudit && !isBlindMode) {
      const answers = await db
        .prepare(
          `SELECT a.id, a.question_id, a.note, a.numeric_value_snapshot, o.label as option_label
           FROM audit_answers a
           LEFT JOIN answer_options o ON a.option_id = o.id
           WHERE a.audit_id = ?`
        )
        .bind(offAudit.id)
        .all<{
          id: string;
          question_id: string;
          note: string | null;
          numeric_value_snapshot: number | null;
          option_label: string | null;
        }>();

      (answers.results || []).forEach((ans) => {
        offAnswersMap.set(ans.question_id, ans);
      });

      const answerIds = (answers.results || []).map((a) => a.id);
      if (answerIds.length > 0) {
        const evPlaceholders = answerIds.map(() => '?').join(',');
        const evRes = await db
          .prepare(
            `SELECT e.id, e.answer_id, e.original_name
             FROM evidence_files e
             WHERE e.answer_id IN (${evPlaceholders}) AND e.deleted_at IS NULL`
          )
          .bind(...answerIds)
          .all<{ id: string; answer_id: string; original_name: string }>();

        (evRes.results || []).forEach((ev) => {
          const list = offEvidencesMap.get(ev.answer_id) || [];
          list.push({
            id: ev.id,
            original_name: ev.original_name,
            preview_url: `/api/evidence/${ev.id}`,
          });
          offEvidencesMap.set(ev.answer_id, list);
        });
      }
    }

    // Susun Seksi dan Pertanyaan
    const exportSections: ExportSectionItem[] = sections.map((sec) => {
      const secQuestions = questions.filter((q) => q.section_id === sec.id);
      const questionItems: ExportQuestionItem[] = secQuestions.map((q) => {
        const sAns = selfAnswersMap.get(q.id);
        const oAns = isBlindMode ? null : offAnswersMap.get(q.id);

        const sScore = sAns ? sAns.numeric_value_snapshot : null;
        const oScore = oAns ? oAns.numeric_value_snapshot : null;
        const gap = sScore !== null && oScore !== null ? Number((oScore - sScore).toFixed(2)) : null;

        const sEv = sAns ? selfEvidencesMap.get(sAns.id) || [] : [];
        const oEv = oAns ? offEvidencesMap.get(oAns.id) || [] : [];

        return {
          question_id: q.id,
          question_code: q.code,
          prompt: q.prompt,
          weight: q.weight || 1.0,
          self_score: sScore,
          self_option_label: sAns?.option_label || null,
          self_note: sAns?.note || null,
          self_evidences: sEv,
          official_score: oScore,
          official_option_label: oAns?.option_label || null,
          official_note: oAns?.note || null,
          official_evidences: oEv,
          gap,
        };
      });

      return {
        section_id: sec.id,
        section_code: sec.code,
        section_title: sec.title,
        weight: sec.weight || 1.0,
        questions: questionItems,
      };
    });

    const offScoreVal = offAudit?.score ?? null;
    const selfScoreVal = selfAudit?.score ?? null;
    const scoreGap =
      offScoreVal !== null && selfScoreVal !== null ? Number((offScoreVal - selfScoreVal).toFixed(2)) : null;

    const baseScore = offScoreVal !== null ? offScoreVal : selfScoreVal ?? 0;
    const predicate = baseScore >= 4.0 ? 'Baik Sekali' : baseScore >= 3.0 ? 'Baik' : 'Cukup';

    reports.push({
      cycle_code: targetCycle.code,
      cycle_title: targetCycle.title,
      period_label: `${targetCycle.period_start} s/d ${targetCycle.period_end}`,
      depot_code: depot.code,
      depot_name: depot.name,
      document_type: rawFilter.auditType || 'RECONCILIATION',
      pic_name: selfAudit?.user_full_name || 'PIC QAS Depo',
      pic_status: selfAudit?.status || 'DRAFT',
      pic_submitted_at: selfAudit?.submitted_at || null,
      auditor_name: offAudit?.user_full_name || 'Auditor QAS Logistik',
      auditor_status: offAudit?.status || 'DRAFT',
      auditor_submitted_at: offAudit?.submitted_at || null,
      overall_self_score: selfScoreVal,
      overall_official_score: isBlindMode ? null : offScoreVal,
      overall_gap: isBlindMode ? null : scoreGap,
      final_predicate: predicate,
      sections: exportSections,
    });
  }

  await recordAuditEvent(
    db,
    'EXPORT',
    `exp-${Date.now()}`,
    'EXPORT_CREATED',
    user.id,
    requestId,
    null,
    { filter: rawFilter, total_reports: reports.length }
  );

  return reports;
}

