import { ContentfulStatusCode } from 'hono/utils/http-status';
import { AuthUser } from '../types';
import {
  CreateCycleInput,
  SaveAnswerInput,
  AttachEvidenceInput,
} from '../validators/auditSchemas';
import { calculateAuditScore } from './scoringEngine';
import { generateAndSaveComparison } from './comparisonService';

export class AuditError extends Error {
  constructor(
    public code: string,
    message: string,
    public statusCode: ContentfulStatusCode = 400,
    public details?: unknown
  ) {
    super(message);
    this.name = 'AuditError';
  }
}

export interface AuditCycleRow {
  id: string;
  code: string;
  title: string;
  period_start: string;
  period_end: string;
  self_due_at: string;
  official_due_at: string;
  status: 'DRAFT' | 'OPEN' | 'CLOSED';
  template_version_id: string;
}

export interface AuditRow {
  id: string;
  cycle_id: string;
  depot_id: string;
  audit_type: 'SELF' | 'OFFICIAL';
  status: 'DRAFT' | 'SUBMITTED' | 'REOPENED' | 'VOID';
  assigned_user_id: string;
  template_version_id: string;
  score: number | null;
  category: string | null;
  started_at?: string | null;
  version?: number;
  submitted_at: string | null;
  created_at: string;
  updated_at: string;
  answer_count?: number;
  evidence_count?: number;
}

export interface QuestionWithAnswer {
  id: string;
  section_id: string;
  code: string;
  prompt: string;
  display_order: number;
  evidence_required: boolean;
  is_required: boolean;
  weight: number | null;
  options: Array<{
    id: string;
    code: string;
    label: string;
    numeric_value: number | null;
    display_order: number;
    is_na: boolean;
  }>;
  current_answer?: {
    id: string;
    option_id: string | null;
    note: string | null;
    improvement_title?: string;
    numeric_value_snapshot: number | null;
    updated_at: string;
    evidence_count: number;
    evidence: Array<{
      id: string;
      object_key: string;
      original_name: string;
      mime_type: string;
      size_bytes: number;
      uploaded_at: string;
    }>;
  };
  self_answer?: {
    option_id: string | null;
    option_label: string | null;
    numeric_value?: number | null;
    note: string | null;
    improvement_title?: string;
    evidence: Array<{
      id: string;
      original_name: string;
      size_bytes: number;
    }>;
  };
}

export interface AuditSectionWithQuestions {
  id: string;
  code: string;
  title: string;
  display_order: number;
  weight: number | null;
  questions: QuestionWithAnswer[];
}

export interface AuditDetailResponse {
  audit: AuditRow;
  cycle: AuditCycleRow;
  depot: { id: string; code: string; name: string };
  sections: AuditSectionWithQuestions[];
  progress: {
    total_questions: number;
    answered_questions: number;
    required_questions: number;
    required_answered: number;
    evidence_required_questions: number;
    evidence_provided_count: number;
    is_ready_for_submit: boolean;
  };
}

/**
 * Record an audit event into audit_events table.
 */
export async function recordAuditEvent(
  db: D1Database,
  entityType: string,
  entityId: string,
  eventType: string,
  actorUserId: string | null,
  requestId: string | null,
  reason: string | null = null,
  payload: unknown = null
): Promise<void> {
  const eventId = `evt-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
  await db
    .prepare(
      `INSERT INTO audit_events 
       (id, entity_type, entity_id, event_type, actor_user_id, reason, payload_json, request_id, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .bind(
      eventId,
      entityType,
      entityId,
      eventType,
      actorUserId,
      reason,
      payload ? JSON.stringify(payload) : null,
      requestId,
      new Date().toISOString()
    )
    .run();
}

/**
 * Lists audit cycles with user role and depot scoping.
 */
export async function listCycles(
  db: D1Database,
  user: AuthUser
): Promise<Array<AuditCycleRow & { audits: AuditRow[] }>> {
  const cyclesResult = await db
    .prepare('SELECT * FROM audit_cycles ORDER BY period_start DESC')
    .all<AuditCycleRow>();

  const cycles = cyclesResult.results || [];
  if (cycles.length === 0) {
    return [];
  }

  // Determine allowed depot IDs for this user
  const isGlobalUser = user.scopes.some(
    (s) => s.role === 'ADMIN' || s.role === 'AUDITOR_QAS'
  );
  const userDepotIds = user.scopes
    .map((s) => s.depotId)
    .filter((id): id is string => id !== null);

  // Fetch audits for all cycles
  const auditsResult = await db
    .prepare(`
      SELECT a.*,
        (SELECT COUNT(*) FROM audit_answers ans
          WHERE ans.audit_id = a.id AND ans.option_id IS NOT NULL) AS answer_count,
        (SELECT COUNT(*) FROM evidence_files ef
          JOIN audit_answers ans ON ans.id = ef.answer_id
          WHERE ans.audit_id = a.id AND ef.deleted_at IS NULL) AS evidence_count
      FROM audits a
    `)
    .all<AuditRow>();
  const allAudits = auditsResult.results || [];

  return cycles.map((cycle) => {
    let cycleAudits = allAudits.filter((a) => a.cycle_id === cycle.id);

    // If PIC, strictly filter to their assigned depot
    if (!isGlobalUser) {
      cycleAudits = cycleAudits.filter((a) => userDepotIds.includes(a.depot_id));
    }

    // Apply blind audit sanitization for Auditor
    cycleAudits = sanitizeAuditsForBlindMode(cycleAudits, user);

    return {
      ...cycle,
      audits: cycleAudits,
    };
  });
}

function sanitizeAuditsForBlindMode(audits: AuditRow[], user: AuthUser): AuditRow[] {
  const isAuditorOnly =
    user.scopes.some((s) => s.role === 'AUDITOR_QAS') &&
    !user.scopes.some((s) => s.role === 'ADMIN');

  if (!isAuditorOnly) {
    return audits;
  }

  const submittedOfficialDepots = new Set(
    audits
      .filter((a) => a.audit_type === 'OFFICIAL' && a.status === 'SUBMITTED')
      .map((a) => a.depot_id)
  );

  return audits.map((a) => {
    if (a.audit_type === 'SELF' && !submittedOfficialDepots.has(a.depot_id)) {
      return {
        ...a,
        score: null,
        category: null,
      };
    }
    return a;
  });
}

/**
 * Gets a single cycle by ID.
 */
export async function getCycleById(
  db: D1Database,
  cycleId: string,
  user: AuthUser
): Promise<AuditCycleRow & { audits: AuditRow[] }> {
  const cycle = await db
    .prepare('SELECT * FROM audit_cycles WHERE id = ?')
    .bind(cycleId)
    .first<AuditCycleRow>();

  if (!cycle) {
    throw new AuditError('NOT_FOUND', `Siklus audit dengan ID ${cycleId} tidak ditemukan.`, 404);
  }

  const isGlobalUser = user.scopes.some(
    (s) => s.role === 'ADMIN' || s.role === 'AUDITOR_QAS'
  );
  const userDepotIds = user.scopes
    .map((s) => s.depotId)
    .filter((id): id is string => id !== null);

  const auditsResult = await db
    .prepare(`
      SELECT a.*,
        (SELECT COUNT(*) FROM audit_answers ans
          WHERE ans.audit_id = a.id AND ans.option_id IS NOT NULL) AS answer_count,
        (SELECT COUNT(*) FROM evidence_files ef
          JOIN audit_answers ans ON ans.id = ef.answer_id
          WHERE ans.audit_id = a.id AND ef.deleted_at IS NULL) AS evidence_count
      FROM audits a
      WHERE a.cycle_id = ?
    `)
    .bind(cycleId)
    .all<AuditRow>();

  let cycleAudits = auditsResult.results || [];
  if (!isGlobalUser) {
    cycleAudits = cycleAudits.filter((a) => userDepotIds.includes(a.depot_id));
  }

  cycleAudits = sanitizeAuditsForBlindMode(cycleAudits, user);

  return {
    ...cycle,
    audits: cycleAudits,
  };
}

/**
 * Creates a new audit cycle (Admin/Auditor only).
 */
export async function createCycle(
  db: D1Database,
  input: CreateCycleInput,
  actorUser: AuthUser,
  requestId: string
): Promise<AuditCycleRow> {
  const isMasterOrAdmin = actorUser.scopes.some(
    (s) => s.role === 'ADMIN' || s.role === 'AUDITOR_QAS'
  );
  if (!isMasterOrAdmin) {
    throw new AuditError(
      'FORBIDDEN',
      'Hanya Administrator atau Auditor yang dapat membuat siklus audit.',
      403
    );
  }

  // Verify template version exists
  const version = await db
    .prepare('SELECT id, status FROM audit_template_versions WHERE id = ?')
    .bind(input.template_version_id)
    .first<{ id: string; status: string }>();

  if (!version) {
    throw new AuditError(
      'INVALID_TEMPLATE_VERSION',
      `Template version ${input.template_version_id} tidak ditemukan.`,
      400
    );
  }

  // Check unique code
  const existingCode = await db
    .prepare('SELECT id FROM audit_cycles WHERE code = ?')
    .bind(input.code)
    .first<{ id: string }>();

  if (existingCode) {
    throw new AuditError(
      'DUPLICATE_CYCLE_CODE',
      `Kode siklus "${input.code}" sudah digunakan.`,
      409
    );
  }

  const cycleId = `cyc-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
  const status = input.status || 'OPEN';

  await db
    .prepare(
      `INSERT INTO audit_cycles 
       (id, code, title, period_start, period_end, self_due_at, official_due_at, status, template_version_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .bind(
      cycleId,
      input.code,
      input.title,
      input.period_start,
      input.period_end,
      input.self_due_at,
      input.official_due_at,
      status,
      input.template_version_id
    )
    .run();

  await recordAuditEvent(
    db,
    'CYCLE',
    cycleId,
    'CYCLE_CREATED',
    actorUser.id,
    requestId,
    null,
    { code: input.code, title: input.title }
  );

  return {
    id: cycleId,
    code: input.code,
    title: input.title,
    period_start: input.period_start,
    period_end: input.period_end,
    self_due_at: input.self_due_at,
    official_due_at: input.official_due_at,
    status,
    template_version_id: input.template_version_id,
  };
}

/**
 * Starts or retrieves the SELF audit slot for a depot in a cycle.
 */
export async function startOrGetSelfAudit(
  db: D1Database,
  cycleId: string,
  requestedDepotId: string | undefined,
  user: AuthUser,
  requestId: string
): Promise<AuditRow> {
  const isGlobalUser = user.scopes.some(
    (s) => s.role === 'ADMIN' || s.role === 'AUDITOR_QAS'
  );

  let targetDepotId = requestedDepotId;
  if (!isGlobalUser) {
    const picScope = user.scopes.find((s) => s.role === 'PIC_QAS');
    if (!picScope || !picScope.depotId) {
      throw new AuditError(
        'FORBIDDEN_DEPOT_ACCESS',
        'Pengguna tidak memiliki penugasan depo yang valid.',
        403
      );
    }
    if (requestedDepotId && requestedDepotId !== picScope.depotId) {
      throw new AuditError(
        'FORBIDDEN_DEPOT_ACCESS',
        'PIC hanya berhak mengakses self audit untuk depo sendiri.',
        403
      );
    }
    targetDepotId = picScope.depotId;
  }

  if (!targetDepotId) {
    throw new AuditError('DEPOT_REQUIRED', 'Depot ID wajib ditentukan.', 400);
  }

  // Verify cycle exists
  const cycle = await db
    .prepare('SELECT * FROM audit_cycles WHERE id = ?')
    .bind(cycleId)
    .first<AuditCycleRow>();

  if (!cycle) {
    throw new AuditError('NOT_FOUND', `Siklus audit ${cycleId} tidak ditemukan.`, 404);
  }

  if (cycle.status !== 'OPEN') {
    throw new AuditError(
      'CYCLE_NOT_OPEN',
      `Siklus audit ${cycle.code} tidak dalam status OPEN (status saat ini: ${cycle.status}).`,
      400
    );
  }

  // Check if self audit exists
  const existingAudit = await db
    .prepare("SELECT * FROM audits WHERE cycle_id = ? AND depot_id = ? AND audit_type = 'SELF'")
    .bind(cycleId, targetDepotId)
    .first<AuditRow>();

  if (existingAudit) {
    if (!isGlobalUser && existingAudit.assigned_user_id && existingAudit.assigned_user_id !== user.id) {
      throw new AuditError(
        'AUDIT_NOT_ASSIGNED',
        `Self Audit ini ditugaskan kepada PIC resmi (ID: ${existingAudit.assigned_user_id}). Akun Anda (${user.email}) tidak berhak mengakses audit ini.`,
        403
      );
    }

    if (existingAudit.started_at === null) {
      const now = new Date().toISOString();
      const updateRes = await db
        .prepare(
          `UPDATE audits
           SET started_at = ?,
               version = version + 1,
               updated_at = ?
           WHERE id = ?
             AND version = ?
             AND started_at IS NULL`
        )
        .bind(now, now, existingAudit.id, existingAudit.version)
        .run();

      if (updateRes.meta.changes > 0) {
        await recordAuditEvent(
          db,
          'audit',
          existingAudit.id,
          'AUDIT_STARTED',
          user.id,
          requestId,
          `Audit dimulai oleh ${user.fullName} (${user.email})`,
          {
            cycle_id: existingAudit.cycle_id,
            depot_id: existingAudit.depot_id,
            audit_type: 'SELF',
            started_at: now,
          }
        );
        return {
          ...existingAudit,
          started_at: now,
          version: (existingAudit.version || 1) + 1,
          updated_at: now,
        };
      }
    }
    return existingAudit;
  }

  // Create new self audit slot
  const auditId = `aud-self-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
  const now = new Date().toISOString();

  await db
    .prepare(
      `INSERT INTO audits 
       (id, cycle_id, depot_id, audit_type, status, assigned_user_id, template_version_id, started_at, version, created_at, updated_at)
       VALUES (?, ?, ?, 'SELF', 'DRAFT', ?, ?, ?, 1, ?, ?)`
    )
    .bind(
      auditId,
      cycleId,
      targetDepotId,
      user.id,
      cycle.template_version_id,
      now,
      now,
      now
    )
    .run();

  await recordAuditEvent(
    db,
    'AUDIT',
    auditId,
    'AUDIT_CREATED',
    user.id,
    requestId,
    null,
    { audit_type: 'SELF', depot_id: targetDepotId, cycle_id: cycleId }
  );

  await recordAuditEvent(
    db,
    'AUDIT',
    auditId,
    'AUDIT_STARTED',
    user.id,
    requestId,
    `Audit dimulai oleh ${user.fullName} (${user.email})`,
    { audit_type: 'SELF', depot_id: targetDepotId, cycle_id: cycleId, started_at: now }
  );

  return {
    id: auditId,
    cycle_id: cycleId,
    depot_id: targetDepotId,
    audit_type: 'SELF',
    status: 'DRAFT',
    assigned_user_id: user.id,
    template_version_id: cycle.template_version_id,
    score: null,
    category: null,
    started_at: now,
    version: 1,
    submitted_at: null,
    created_at: now,
    updated_at: now,
  };
}

/**
 * Starts or retrieves the OFFICIAL audit slot for a depot in a cycle.
 * Guard: Self audit must be SUBMITTED before official audit can start.
 */
export async function startOrGetOfficialAudit(
  db: D1Database,
  cycleId: string,
  depotId: string,
  user: AuthUser,
  requestId: string
): Promise<AuditRow> {
  const isAuditorOrAdmin = user.scopes.some(
    (s) => s.role === 'AUDITOR_QAS' || s.role === 'ADMIN'
  );
  if (!isAuditorOrAdmin) {
    throw new AuditError(
      'AUDIT_TYPE_NOT_ALLOWED',
      'Hanya Auditor QAS atau Administrator yang dapat membuat atau mengaudit Official Audit.',
      403
    );
  }

  const cycle = await db
    .prepare('SELECT * FROM audit_cycles WHERE id = ?')
    .bind(cycleId)
    .first<AuditCycleRow>();

  if (!cycle) {
    throw new AuditError('NOT_FOUND', `Siklus audit ${cycleId} tidak ditemukan.`, 404);
  }

  if (cycle.status !== 'OPEN') {
    throw new AuditError(
      'CYCLE_NOT_OPEN',
      `Siklus audit ${cycle.code} tidak dalam status OPEN (status saat ini: ${cycle.status}).`,
      400
    );
  }

  // Enforce prerequisite: Self Audit must be SUBMITTED
  const selfAudit = await db
    .prepare("SELECT status FROM audits WHERE cycle_id = ? AND depot_id = ? AND audit_type = 'SELF'")
    .bind(cycleId, depotId)
    .first<{ status: string }>();

  if (!selfAudit || selfAudit.status !== 'SUBMITTED') {
    throw new AuditError(
      'SELF_AUDIT_NOT_SUBMITTED',
      'Audit resmi belum dapat dimulai: Self Audit untuk depo ini belum disubmit.',
      400
    );
  }

  // Check if official audit exists
  const existingOfficial = await db
    .prepare("SELECT * FROM audits WHERE cycle_id = ? AND depot_id = ? AND audit_type = 'OFFICIAL'")
    .bind(cycleId, depotId)
    .first<AuditRow>();

  if (existingOfficial) {
    if (!user.scopes.some((s) => s.role === 'ADMIN') && existingOfficial.assigned_user_id && existingOfficial.assigned_user_id !== user.id) {
      throw new AuditError(
        'AUDIT_NOT_ASSIGNED',
        `Audit Resmi ini ditugaskan kepada Auditor lain (ID: ${existingOfficial.assigned_user_id}). Akun Anda (${user.email}) tidak berhak mengakses audit ini.`,
        403
      );
    }

    if (existingOfficial.started_at === null) {
      const now = new Date().toISOString();
      const updateRes = await db
        .prepare(
          `UPDATE audits
           SET started_at = ?,
               version = version + 1,
               updated_at = ?
           WHERE id = ?
             AND version = ?
             AND started_at IS NULL`
        )
        .bind(now, now, existingOfficial.id, existingOfficial.version)
        .run();

      if (updateRes.meta.changes > 0) {
        await recordAuditEvent(
          db,
          'audit',
          existingOfficial.id,
          'AUDIT_STARTED',
          user.id,
          requestId,
          `Audit resmi dimulai oleh ${user.fullName} (${user.email})`,
          {
            cycle_id: existingOfficial.cycle_id,
            depot_id: existingOfficial.depot_id,
            audit_type: 'OFFICIAL',
            started_at: now,
          }
        );
        return {
          ...existingOfficial,
          started_at: now,
          version: (existingOfficial.version || 1) + 1,
          updated_at: now,
        };
      }
    }
    return existingOfficial;
  }

  const auditId = `aud-off-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
  const now = new Date().toISOString();

  await db
    .prepare(
      `INSERT INTO audits 
       (id, cycle_id, depot_id, audit_type, status, assigned_user_id, template_version_id, started_at, version, created_at, updated_at)
       VALUES (?, ?, ?, 'OFFICIAL', 'DRAFT', ?, ?, ?, 1, ?, ?)`
    )
    .bind(
      auditId,
      cycleId,
      depotId,
      user.id,
      cycle.template_version_id,
      now,
      now,
      now
    )
    .run();

  await recordAuditEvent(
    db,
    'AUDIT',
    auditId,
    'AUDIT_CREATED',
    user.id,
    requestId,
    null,
    { audit_type: 'OFFICIAL', depot_id: depotId, cycle_id: cycleId }
  );

  await recordAuditEvent(
    db,
    'AUDIT',
    auditId,
    'AUDIT_STARTED',
    user.id,
    requestId,
    `Audit resmi dimulai oleh ${user.fullName} (${user.email})`,
    { audit_type: 'OFFICIAL', depot_id: depotId, cycle_id: cycleId, started_at: now }
  );

  return {
    id: auditId,
    cycle_id: cycleId,
    depot_id: depotId,
    audit_type: 'OFFICIAL',
    status: 'DRAFT',
    assigned_user_id: user.id,
    template_version_id: cycle.template_version_id,
    score: null,
    category: null,
    started_at: now,
    version: 1,
    submitted_at: null,
    created_at: now,
    updated_at: now,
  };
}

/**
 * Operasi Start Audit eksplisit (by auditId):
 * Mencari slot audit DRAFT, memvalidasi role, depot, cycle, dan assignment.
 * Mengisi started_at menggunakan waktu server, menambah version atomik,
 * menulis event AUDIT_STARTED, dan mengembalikan detail audit (idempotent).
 */
export async function startAudit(
  db: D1Database,
  auditId: string,
  user: AuthUser,
  requestId: string
): Promise<AuditDetailResponse> {
  if (!auditId || typeof auditId !== 'string' || auditId.trim() === '') {
    throw new AuditError('AUDIT_ID_MISSING', 'Parameter audit ID wajib disertakan.', 400);
  }

  const cleanId = auditId.trim();
  const audit = await db
    .prepare('SELECT * FROM audits WHERE id = ?')
    .bind(cleanId)
    .first<AuditRow>();

  if (!audit) {
    throw new AuditError('AUDIT_NOT_FOUND', `Audit dengan ID ${cleanId} tidak ditemukan.`, 404);
  }

  // 1. Validasi Siklus
  const cycle = await db
    .prepare('SELECT * FROM audit_cycles WHERE id = ?')
    .bind(audit.cycle_id)
    .first<AuditCycleRow>();

  if (!cycle) {
    throw new AuditError('NOT_FOUND', `Siklus audit ${audit.cycle_id} tidak ditemukan.`, 404);
  }

  if (cycle.status !== 'OPEN') {
    throw new AuditError(
      'CYCLE_NOT_OPEN',
      `Siklus audit ${cycle.code} tidak dalam status OPEN (status saat ini: ${cycle.status}).`,
      400
    );
  }

  // 2. Validasi Depo
  const depot = await db
    .prepare('SELECT id, code, name, is_active FROM depots WHERE id = ?')
    .bind(audit.depot_id)
    .first<{ id: string; code: string; name: string; is_active: number }>();

  if (!depot || depot.is_active !== 1) {
    throw new AuditError(
      'DEPOT_ACCESS_DENIED',
      `Depo ${audit.depot_id} tidak aktif atau tidak ditemukan.`,
      403
    );
  }

  // 3. Validasi Versi Template
  const templateVer = await db
    .prepare('SELECT id, status FROM audit_template_versions WHERE id = ?')
    .bind(audit.template_version_id)
    .first<{ id: string; status: string }>();

  if (!templateVer || templateVer.status !== 'PUBLISHED') {
    throw new AuditError(
      'TEMPLATE_NOT_PUBLISHED',
      `Versi template ${audit.template_version_id} belum dipublikasikan.`,
      400
    );
  }

  // 4. Validasi Role, Depot Scope, dan Assignment
  const isAdmin = user.scopes.some((s) => s.role === 'ADMIN');
  const isAuditor = user.scopes.some((s) => s.role === 'AUDITOR_QAS');
  const isPic = user.scopes.some((s) => s.role === 'PIC_QAS');

  if (audit.audit_type === 'SELF') {
    if (!isPic && !isAdmin) {
      throw new AuditError(
        'AUDIT_TYPE_NOT_ALLOWED',
        'Hanya PIC QAS yang berhak memulai Self Audit.',
        403
      );
    }

    if (!isAdmin) {
      const hasDepotScope = user.scopes.some(
        (s) => s.role === 'PIC_QAS' && s.depotId === audit.depot_id
      );
      if (!hasDepotScope) {
        throw new AuditError(
          'DEPOT_ACCESS_DENIED',
          `Anda tidak memiliki akses otorisasi untuk Depo ${depot.name} (${audit.depot_id}).`,
          403
        );
      }

      if (audit.assigned_user_id && audit.assigned_user_id !== user.id) {
        throw new AuditError(
          'AUDIT_NOT_ASSIGNED',
          `Self Audit ini ditugaskan kepada PIC resmi (ID: ${audit.assigned_user_id}). Akun Anda (${user.email}) tidak berhak memulai audit ini.`,
          403
        );
      }
    }
  } else if (audit.audit_type === 'OFFICIAL') {
    if (!isAuditor && !isAdmin) {
      throw new AuditError(
        'AUDIT_TYPE_NOT_ALLOWED',
        'Hanya Auditor QAS yang berhak memulai Audit Resmi.',
        403
      );
    }

    // Prasyarat: Self Audit harus sudah SUBMITTED
    const selfAudit = await db
      .prepare("SELECT status FROM audits WHERE cycle_id = ? AND depot_id = ? AND audit_type = 'SELF'")
      .bind(audit.cycle_id, audit.depot_id)
      .first<{ status: string }>();

    if (!selfAudit || selfAudit.status !== 'SUBMITTED') {
      throw new AuditError(
        'SELF_AUDIT_NOT_SUBMITTED',
        'Self Audit harus disubmit terlebih dahulu sebelum memulai Audit Resmi.',
        400
      );
    }

    if (!isAdmin && audit.assigned_user_id && audit.assigned_user_id !== user.id) {
      throw new AuditError(
        'AUDIT_NOT_ASSIGNED',
        `Audit Resmi ini ditugaskan kepada Auditor lain (ID: ${audit.assigned_user_id}). Akun Anda (${user.email}) tidak berhak memulai audit ini.`,
        403
      );
    }
  }

  // 5. Inisialisasi Mulai Atomik & Idempotent
  if (audit.started_at === null) {
    const now = new Date().toISOString();
    const updateRes = await db
      .prepare(
        `UPDATE audits
         SET started_at = ?,
             version = version + 1,
             updated_at = ?
         WHERE id = ?
           AND version = ?
           AND started_at IS NULL`
      )
      .bind(now, now, audit.id, audit.version)
      .run();

    if (updateRes.meta.changes > 0) {
      await recordAuditEvent(
        db,
        'AUDIT',
        audit.id,
        'AUDIT_STARTED',
        user.id,
        requestId,
        `Audit dimulai oleh ${user.fullName} (${user.email})`,
        {
          cycle_id: audit.cycle_id,
          depot_id: audit.depot_id,
          audit_type: audit.audit_type,
          started_at: now,
        }
      );
    }
  }

  return getAuditDetail(db, audit.id, user);
}

/**
 * Gets detailed audit data including questions tree, current answers, and evidence.
 * Enforces Zero Trust cross-depot protection and Blind Audit rule.
 */
export async function getAuditDetail(
  db: D1Database,
  auditId: string,
  user: AuthUser
): Promise<AuditDetailResponse> {
  const audit = await db
    .prepare('SELECT * FROM audits WHERE id = ?')
    .bind(auditId)
    .first<AuditRow>();

  if (!audit) {
    throw new AuditError('AUDIT_NOT_FOUND', `Audit dengan ID ${auditId} tidak ditemukan.`, 404);
  }

  const isGlobalUser = user.scopes.some(
    (s) => s.role === 'ADMIN' || s.role === 'AUDITOR_QAS'
  );

  // Cross-Depot Protection & Assignment Protection for PIC QAS
  if (!isGlobalUser) {
    const hasDepotAccess = user.scopes.some(
      (s) => s.role === 'PIC_QAS' && s.depotId === audit.depot_id
    );
    if (!hasDepotAccess) {
      throw new AuditError(
        'FORBIDDEN_DEPOT_ACCESS',
        'Anda tidak memiliki hak akses untuk melihat audit depo ini.',
        403
      );
    }

    if (audit.audit_type === 'SELF' && audit.assigned_user_id && audit.assigned_user_id !== user.id) {
      throw new AuditError(
        'AUDIT_NOT_ASSIGNED',
        `Self Audit ini ditugaskan kepada PIC resmi (ID: ${audit.assigned_user_id}). Akun Anda (${user.email}) tidak berhak mengakses audit ini.`,
        403
      );
    }
  }

  // Blind Audit Guard:
  // If an Auditor QAS (non-admin) attempts to read a SELF audit, they are strictly prohibited
  // unless the OFFICIAL audit for that cycle and depot is already SUBMITTED.
  if (audit.audit_type === 'SELF' && !user.scopes.some((s) => s.role === 'ADMIN')) {
    const isAuditorOnly = user.scopes.some((s) => s.role === 'AUDITOR_QAS');
    if (isAuditorOnly) {
      const official = await db
        .prepare("SELECT status FROM audits WHERE cycle_id = ? AND depot_id = ? AND audit_type = 'OFFICIAL'")
        .bind(audit.cycle_id, audit.depot_id)
        .first<{ status: string }>();

      if (!official || official.status !== 'SUBMITTED') {
        throw new AuditError(
          'BLIND_AUDIT_RESTRICTION',
          'Mode Blind Audit aktif: Auditor dilarang melihat jawaban Self Audit sebelum Official Audit berstatus SUBMITTED.',
          403
        );
      }
    }
  }

  // Fetch Cycle and Depot metadata
  const cycle = await db
    .prepare('SELECT * FROM audit_cycles WHERE id = ?')
    .bind(audit.cycle_id)
    .first<AuditCycleRow>();

  if (!cycle) {
    throw new AuditError('NOT_FOUND', 'Siklus audit induk tidak ditemukan.', 404);
  }

  const depot = await db
    .prepare('SELECT id, code, name FROM depots WHERE id = ?')
    .bind(audit.depot_id)
    .first<{ id: string; code: string; name: string }>();

  if (!depot) {
    throw new AuditError('NOT_FOUND', 'Depo terkait audit tidak ditemukan.', 404);
  }

  // Fetch sections, questions, and options for this template version
  const sectionsResult = await db
    .prepare(
      'SELECT id, code, title, display_order, weight FROM audit_sections WHERE version_id = ? ORDER BY display_order ASC'
    )
    .bind(audit.template_version_id)
    .all<{
      id: string;
      code: string;
      title: string;
      display_order: number;
      weight: number | null;
    }>();

  const sections = sectionsResult.results || [];
  const sectionIds = sections.map((s) => s.id);

  let questions: Array<{
    id: string;
    section_id: string;
    code: string;
    prompt: string;
    display_order: number;
    evidence_required: number;
    is_required: number;
    weight: number | null;
  }> = [];

  if (sectionIds.length > 0) {
    const placeholders = sectionIds.map(() => '?').join(',');
    const qResult = await db
      .prepare(
        `SELECT id, section_id, code, prompt, display_order, evidence_required, is_required, weight
         FROM audit_questions 
         WHERE section_id IN (${placeholders})
         ORDER BY display_order ASC`
      )
      .bind(...sectionIds)
      .all<{
        id: string;
        section_id: string;
        code: string;
        prompt: string;
        display_order: number;
        evidence_required: number;
        is_required: number;
        weight: number | null;
      }>();
    questions = qResult.results || [];
  }

  const questionIds = questions.map((q) => q.id);

  let options: Array<{
    id: string;
    question_id: string;
    code: string;
    label: string;
    numeric_value: number | null;
    display_order: number;
    is_na: number;
  }> = [];

  if (questionIds.length > 0) {
    const qPlaceholders = questionIds.map(() => '?').join(',');
    const optResult = await db
      .prepare(
        `SELECT id, question_id, code, label, numeric_value, display_order, is_na
         FROM answer_options 
         WHERE question_id IN (${qPlaceholders})
         ORDER BY display_order ASC`
      )
      .bind(...questionIds)
      .all<{
        id: string;
        question_id: string;
        code: string;
        label: string;
        numeric_value: number | null;
        display_order: number;
        is_na: number;
      }>();
    options = optResult.results || [];
  }

  // Fetch existing answers
  const answersResult = await db
    .prepare(
      `SELECT id, question_id, option_id, note, numeric_value_snapshot, updated_at
       FROM audit_answers 
       WHERE audit_id = ?`
    )
    .bind(auditId)
    .all<{
      id: string;
      question_id: string;
      option_id: string | null;
      note: string | null;
      numeric_value_snapshot: number | null;
      updated_at: string;
    }>();

  const answers = answersResult.results || [];
  const answerIds = answers.map((a) => a.id);

  // Fetch evidence metadata
  let evidenceList: Array<{
    id: string;
    answer_id: string;
    object_key: string;
    original_name: string;
    mime_type: string;
    size_bytes: number;
    uploaded_at: string;
  }> = [];

  if (answerIds.length > 0) {
    const aPlaceholders = answerIds.map(() => '?').join(',');
    const evResult = await db
      .prepare(
        `SELECT id, answer_id, object_key, original_name, mime_type, size_bytes, uploaded_at
         FROM evidence_files 
         WHERE answer_id IN (${aPlaceholders}) AND deleted_at IS NULL`
      )
      .bind(...answerIds)
      .all<{
        id: string;
        answer_id: string;
        object_key: string;
        original_name: string;
        mime_type: string;
        size_bytes: number;
        uploaded_at: string;
      }>();
    evidenceList = evResult.results || [];
  }

  // If this is an OFFICIAL audit, fetch Self Audit answers if Self Audit is SUBMITTED
  const selfAuditAnswers: Record<
    string,
    {
      option_id: string | null;
      option_label: string | null;
      numeric_value?: number | null;
      note: string | null;
      improvement_title?: string;
      evidence: Array<{ id: string; original_name: string; size_bytes: number }>;
    }
  > = {};

  // Allow Auditor to see Self Audit answers once Self Audit is SUBMITTED
  if (audit.audit_type === 'OFFICIAL') {
    const selfAudit = await db
      .prepare("SELECT id, status FROM audits WHERE cycle_id = ? AND depot_id = ? AND audit_type = 'SELF'")
      .bind(audit.cycle_id, audit.depot_id)
      .first<{ id: string; status: string }>();

    if (selfAudit && selfAudit.status === 'SUBMITTED') {
      const selfAnsResult = await db
        .prepare(
          `SELECT a.id, a.question_id, a.option_id, a.note, a.numeric_value_snapshot, o.label as option_label, o.numeric_value as option_numeric_value
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
          option_label: string | null;
          option_numeric_value: number | null;
        }>();

      const selfAnswersList = selfAnsResult.results || [];
      const selfAnsIds = selfAnswersList.map((sa) => sa.id);

      let selfEvList: Array<{
        id: string;
        answer_id: string;
        original_name: string;
        size_bytes: number;
      }> = [];

      if (selfAnsIds.length > 0) {
        const p = selfAnsIds.map(() => '?').join(',');
        const evR = await db
          .prepare(
            `SELECT id, answer_id, original_name, size_bytes 
             FROM evidence_files 
             WHERE answer_id IN (${p}) AND deleted_at IS NULL`
          )
          .bind(...selfAnsIds)
          .all<{ id: string; answer_id: string; original_name: string; size_bytes: number }>();
        selfEvList = evR.results || [];
      }

      for (const sa of selfAnswersList) {
        let saNote = sa.note;
        let saTitle: string | undefined = undefined;
        if (sa.note) {
          const match = sa.note.match(/^\[IMPROVEMENT: (.*?)\](?:\n([\s\S]*))?$/);
          if (match) {
            saTitle = match[1];
            saNote = match[2] || '';
          }
        }
        selfAuditAnswers[sa.question_id] = {
          option_id: sa.option_id,
          option_label: sa.option_label,
          numeric_value: sa.numeric_value_snapshot ?? sa.option_numeric_value ?? null,
          note: saNote,
          improvement_title: saTitle,
          evidence: selfEvList.filter((e) => e.answer_id === sa.id),
        };
      }
    }
  }

  // Build hierarchical response and calculate progress
  let totalQuestions = 0;
  let answeredQuestions = 0;
  let requiredQuestions = 0;
  let requiredAnswered = 0;
  let evidenceRequiredQuestions = 0;
  let evidenceProvidedCount = 0;

  const sectionsWithQuestions: AuditSectionWithQuestions[] = sections.map((sec) => {
    const secQuestions = questions.filter((q) => q.section_id === sec.id);

    const questionsMapped: QuestionWithAnswer[] = secQuestions.map((q) => {
      totalQuestions++;
      const isReq = q.is_required === 1;
      const evReq = q.evidence_required === 1;

      if (isReq) requiredQuestions++;
      if (evReq) evidenceRequiredQuestions++;

      const ans = answers.find((a) => a.question_id === q.id);
      const isAnswered = Boolean(ans && ans.option_id);

      if (isAnswered) {
        answeredQuestions++;
        if (isReq) requiredAnswered++;
      }

      const qEvidence = ans
        ? evidenceList.filter((ev) => ev.answer_id === ans.id)
        : [];

      if (evReq && qEvidence.length > 0) {
        evidenceProvidedCount++;
      }

      const qOptions = options
        .filter((o) => o.question_id === q.id)
        .map((o) => ({
          id: o.id,
          code: o.code,
          label: o.label,
          numeric_value: o.numeric_value,
          display_order: o.display_order,
          is_na: o.is_na === 1,
        }));

      let cleanNote = ans?.note ?? null;
      let impTitle: string | undefined = undefined;
      if (ans?.note) {
        const match = ans.note.match(/^\[IMPROVEMENT: (.*?)\](?:\n([\s\S]*))?$/);
        if (match) {
          impTitle = match[1];
          cleanNote = match[2] || '';
        }
      }

      return {
        id: q.id,
        section_id: q.section_id,
        code: q.code,
        prompt: q.prompt,
        display_order: q.display_order,
        evidence_required: evReq,
        is_required: isReq,
        weight: q.weight,
        options: qOptions,
        current_answer: ans
          ? {
              id: ans.id,
              option_id: ans.option_id,
              note: cleanNote,
              improvement_title: impTitle,
              numeric_value_snapshot: ans.numeric_value_snapshot,
              updated_at: ans.updated_at,
              evidence_count: qEvidence.length,
              evidence: qEvidence.map((ev) => ({
                id: ev.id,
                object_key: ev.object_key,
                original_name: ev.original_name,
                mime_type: ev.mime_type,
                size_bytes: ev.size_bytes,
                uploaded_at: ev.uploaded_at,
              })),
            }
          : undefined,
        self_answer: audit.audit_type === 'OFFICIAL' ? selfAuditAnswers[q.id] : undefined,
      };
    });

    return {
      id: sec.id,
      code: sec.code,
      title: sec.title,
      display_order: sec.display_order,
      weight: sec.weight,
      questions: questionsMapped,
    };
  });

  const isReadyForSubmit =
    requiredQuestions === requiredAnswered &&
    evidenceRequiredQuestions === evidenceProvidedCount;

  return {
    audit,
    cycle,
    depot,
    sections: sectionsWithQuestions,
    progress: {
      total_questions: totalQuestions,
      answered_questions: answeredQuestions,
      required_questions: requiredQuestions,
      required_answered: requiredAnswered,
      evidence_required_questions: evidenceRequiredQuestions,
      evidence_provided_count: evidenceProvidedCount,
      is_ready_for_submit: isReadyForSubmit,
    },
  };
}

/**
 * Saves or updates an answer for a specific question.
 * Performs snapshotting of the chosen option's numeric score.
 */
export async function saveAnswer(
  db: D1Database,
  auditId: string,
  questionId: string,
  input: SaveAnswerInput,
  user: AuthUser,
  requestId: string
): Promise<{
  id: string;
  question_id: string;
  option_id: string | null;
  note: string | null;
  numeric_value_snapshot: number | null;
  conflict?: boolean;
  server_updated_at?: string;
  updated_at?: string;
  improvement_title?: string;
  new_version: number;
}> {
  const audit = await db
    .prepare('SELECT * FROM audits WHERE id = ?')
    .bind(auditId)
    .first<AuditRow>();

  if (!audit) {
    throw new AuditError('NOT_FOUND', `Audit ${auditId} tidak ditemukan.`, 404);
  }

  // Lock Guard
  if (audit.status === 'SUBMITTED') {
    throw new AuditError(
      'AUDIT_LOCKED',
      'Audit telah disubmit dan terkunci dari perubahan.',
      400
    );
  }
  if (audit.status === 'VOID') {
    throw new AuditError('AUDIT_VOID', 'Audit telah dibatalkan.', 400);
  }

  // Role & Scope Guard
  if (audit.audit_type === 'SELF') {
    const isPic = user.scopes.some(
      (s) => s.role === 'PIC_QAS' && s.depotId === audit.depot_id
    );
    const isAdmin = user.scopes.some((s) => s.role === 'ADMIN');
    if (!isPic && !isAdmin) {
      throw new AuditError(
        'FORBIDDEN_SELF_AUDIT_EDIT',
        'Hanya PIC depo yang bersangkutan yang dapat mengisi atau mengedit Self Audit.',
        403
      );
    }
  } else if (audit.audit_type === 'OFFICIAL') {
    const isAuditorOrAdmin = user.scopes.some(
      (s) => s.role === 'AUDITOR_QAS' || s.role === 'ADMIN'
    );
    if (!isAuditorOrAdmin) {
      throw new AuditError(
        'FORBIDDEN_OFFICIAL_AUDIT_EDIT',
        'Hanya Auditor QAS atau Administrator yang dapat mengisi atau mengedit Official Audit.',
        403
      );
    }
  }

  // Verify question belongs to this audit's template version
  const question = await db
    .prepare(
      `SELECT q.id, q.code, s.version_id 
       FROM audit_questions q 
       JOIN audit_sections s ON q.section_id = s.id 
       WHERE q.id = ? AND s.version_id = ?`
    )
    .bind(questionId, audit.template_version_id)
    .first<{ id: string; code: string; version_id: string }>();

  if (!question) {
    throw new AuditError(
      'INVALID_QUESTION',
      'Pertanyaan tidak ditemukan dalam template versi audit ini.',
      404
    );
  }

  // If option is chosen, verify option belongs to question and snapshot numeric_value
  let numericSnapshot: number | null = null;
  if (input.option_id) {
    const option = await db
      .prepare('SELECT id, numeric_value FROM answer_options WHERE id = ? AND question_id = ?')
      .bind(input.option_id, questionId)
      .first<{ id: string; numeric_value: number | null }>();

    if (!option) {
      throw new AuditError(
        'INVALID_OPTION',
        'Pilihan jawaban tidak valid untuk pertanyaan ini.',
        400
      );
    }
    numericSnapshot = option.numeric_value;
  }

  const now = new Date().toISOString();
  let noteToSave = input.note ?? null;
  if (input.improvement_title && input.improvement_title.trim()) {
    const titleHeader = `[IMPROVEMENT: ${input.improvement_title.trim()}]`;
    noteToSave = input.note ? `${titleHeader}\n${input.note.trim()}` : titleHeader;
  }

  const existingAnswer = await db
    .prepare('SELECT id, updated_at, client_version, option_id, note FROM audit_answers WHERE audit_id = ? AND question_id = ?')
    .bind(auditId, questionId)
    .first<{ id: string; updated_at: string; client_version?: number; option_id?: string | null; note?: string | null }>();

  // 1. Atomic Optimistic Concurrency Check on audits table
  if (input.client_version !== undefined) {
    const updateAuditRes = await db
      .prepare(
        `UPDATE audits
         SET version = version + 1,
             started_at = COALESCE(started_at, ?),
             updated_at = ?
         WHERE id = ?
           AND version = ?`
      )
      .bind(now, now, auditId, input.client_version)
      .run();

    const changes = updateAuditRes.meta?.changes ?? (updateAuditRes as unknown as { rows_written?: number }).rows_written ?? 0;
    if (changes === 0) {
      throw new AuditError(
        'CONFLICT',
        'Draft telah diperbarui dari perangkat lain.',
        409,
        { audit_id: auditId, client_version: input.client_version }
      );
    }
  } else {
    // If client_version not specified, increment version unconditionally
    await db
      .prepare(
        `UPDATE audits 
         SET version = version + 1,
             started_at = COALESCE(started_at, ?),
             updated_at = ?
         WHERE id = ?`
      )
      .bind(now, now, auditId)
      .run();
  }

  // 2. Save or update answer in audit_answers
  let answerId: string;
  if (existingAnswer) {
    answerId = existingAnswer.id;
    await db
      .prepare(
        `UPDATE audit_answers 
         SET option_id = ?, note = ?, numeric_value_snapshot = ?, improvement_title = ?, client_version = COALESCE(client_version, 1) + 1, updated_at = ?
         WHERE id = ?`
      )
      .bind(
        input.option_id ?? null,
        noteToSave,
        numericSnapshot,
        input.improvement_title?.trim() || null,
        now,
        answerId
      )
      .run();
  } else {
    answerId = `ans-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
    await db
      .prepare(
        `INSERT INTO audit_answers 
         (id, audit_id, question_id, option_id, note, improvement_title, client_version, numeric_value_snapshot, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?)`
      )
      .bind(
        answerId,
        auditId,
        questionId,
        input.option_id ?? null,
        noteToSave,
        input.improvement_title?.trim() || null,
        numericSnapshot,
        now
      )
      .run();
  }

  await recordAuditEvent(
    db,
    'ANSWER',
    answerId,
    'ANSWER_CHANGED',
    user.id,
    requestId,
    null,
    { auditId, questionId, optionId: input.option_id, note: input.note, improvement_title: input.improvement_title }
  );

  const currentAudit = await db
    .prepare('SELECT version FROM audits WHERE id = ?')
    .bind(auditId)
    .first<{ version: number }>();

  return {
    id: answerId,
    question_id: questionId,
    option_id: input.option_id ?? null,
    note: input.note ?? null,
    improvement_title: input.improvement_title ?? undefined,
    numeric_value_snapshot: numericSnapshot,
    updated_at: now,
    new_version: currentAudit?.version ?? ((audit.version ?? 0) + 1),
  };
}

/**
 * Attaches evidence metadata to an answer.
 */
export async function attachEvidence(
  db: D1Database,
  answerId: string,
  input: AttachEvidenceInput,
  user: AuthUser,
  requestId: string
): Promise<{ id: string; object_key: string }> {
  const answer = await db
    .prepare(
      `SELECT a.id, a.audit_id, au.status, au.depot_id, au.audit_type 
       FROM audit_answers a 
       JOIN audits au ON a.audit_id = au.id 
       WHERE a.id = ?`
    )
    .bind(answerId)
    .first<{
      id: string;
      audit_id: string;
      status: string;
      depot_id: string;
      audit_type: string;
    }>();

  if (!answer) {
    throw new AuditError('NOT_FOUND', 'Jawaban tidak ditemukan.', 404);
  }

  if (answer.status === 'SUBMITTED') {
    throw new AuditError('AUDIT_LOCKED', 'Audit telah disubmit dan terkunci.', 400);
  }

  const evidenceId = `evd-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
  const objectKey = `evidence/${answer.audit_id}/${evidenceId}-${input.original_name.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
  const now = new Date().toISOString();

  await db
    .prepare(
      `INSERT INTO evidence_files 
       (id, answer_id, object_key, original_name, mime_type, size_bytes, sha256, uploaded_by, uploaded_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .bind(
      evidenceId,
      answerId,
      objectKey,
      input.original_name,
      input.mime_type,
      input.size_bytes,
      input.sha256 || null,
      user.id,
      now
    )
    .run();

  await recordAuditEvent(
    db,
    'EVIDENCE',
    evidenceId,
    'EVIDENCE_UPLOADED',
    user.id,
    requestId,
    null,
    { answerId, filename: input.original_name, size: input.size_bytes }
  );

  return { id: evidenceId, object_key: objectKey };
}

/**
 * Submits an audit (idempotent, performs completeness checks, locks state).
 */
export async function submitAudit(
  db: D1Database,
  auditId: string,
  user: AuthUser,
  requestId: string
): Promise<{ audit: AuditRow; idempotent: boolean; message: string }> {
  const audit = await db
    .prepare('SELECT * FROM audits WHERE id = ?')
    .bind(auditId)
    .first<AuditRow>();

  if (!audit) {
    throw new AuditError('NOT_FOUND', `Audit ${auditId} tidak ditemukan.`, 404);
  }

  // Idempotency: if already SUBMITTED, return early without error
  if (audit.status === 'SUBMITTED') {
    return {
      audit,
      idempotent: true,
      message: 'Audit sudah berstatus SUBMITTED (idempotent submission).',
    };
  }

  if (audit.status === 'VOID') {
    throw new AuditError('AUDIT_VOID', 'Audit telah dibatalkan dan tidak dapat disubmit.', 400);
  }

  // Check user permissions
  if (audit.audit_type === 'SELF') {
    const isPic = user.scopes.some(
      (s) => s.role === 'PIC_QAS' && s.depotId === audit.depot_id
    );
    const isAdmin = user.scopes.some((s) => s.role === 'ADMIN');
    if (!isPic && !isAdmin) {
      throw new AuditError(
        'FORBIDDEN',
        'Hanya PIC depo yang bersangkutan atau Administrator yang dapat men-submit Self Audit.',
        403
      );
    }
  } else if (audit.audit_type === 'OFFICIAL') {
    const isAuditorOrAdmin = user.scopes.some(
      (s) => s.role === 'AUDITOR_QAS' || s.role === 'ADMIN'
    );
    if (!isAuditorOrAdmin) {
      throw new AuditError(
        'FORBIDDEN',
        'Hanya Auditor QAS atau Administrator yang dapat men-submit Official Audit.',
        403
      );
    }
  }

  // Validate Completeness: Mandatory questions & Evidence
  const requiredQuestions = await db
    .prepare(
      `SELECT q.id, q.code, q.prompt, q.evidence_required 
       FROM audit_questions q 
       JOIN audit_sections s ON q.section_id = s.id 
       WHERE s.version_id = ? AND q.is_required = 1`
    )
    .bind(audit.template_version_id)
    .all<{
      id: string;
      code: string;
      prompt: string;
      evidence_required: number;
    }>();

  const questionsList = requiredQuestions.results || [];
  const answers = await db
    .prepare('SELECT id, question_id, option_id FROM audit_answers WHERE audit_id = ?')
    .bind(auditId)
    .all<{ id: string; question_id: string; option_id: string | null }>();

  const answersList = answers.results || [];

  const missingAnswers: string[] = [];
  const missingEvidence: string[] = [];

  for (const q of questionsList) {
    const ans = answersList.find((a) => a.question_id === q.id && a.option_id !== null);
    if (!ans) {
      missingAnswers.push(`[${q.code}] ${q.prompt}`);
      continue;
    }

    if (q.evidence_required === 1) {
      const evCount = await db
        .prepare('SELECT count(*) as count FROM evidence_files WHERE answer_id = ? AND deleted_at IS NULL')
        .bind(ans.id)
        .first<{ count: number }>();

      if (!evCount || evCount.count === 0) {
        missingEvidence.push(`[${q.code}] Bukti foto wajib dilampirkan`);
      }
    }
  }

  if (missingAnswers.length > 0 || missingEvidence.length > 0) {
    throw new AuditError(
      'INCOMPLETE_AUDIT',
      'Audit tidak dapat disubmit: Terdapat pertanyaan wajib atau bukti foto wajib yang belum dilengkapi.',
      400,
      {
        missing_answers: missingAnswers,
        missing_evidence: missingEvidence,
      }
    );
  }

  // --- SCORING CALCULATION (Task 8) ---
  const templateVersion = await db
    .prepare('SELECT scoring_config_json FROM audit_template_versions WHERE id = ?')
    .bind(audit.template_version_id)
    .first<{ scoring_config_json: string | null }>();

  // Fetch sections
  const secResult = await db
    .prepare('SELECT id, code, title, weight FROM audit_sections WHERE version_id = ?')
    .bind(audit.template_version_id)
    .all<{ id: string; code: string; title: string; weight: number | null }>();
  const secList = secResult.results || [];
  const secIds = secList.map((s) => s.id);

  // Fetch all questions for version
  let allQList: Array<{ id: string; section_id: string; code: string; weight: number | null }> = [];
  if (secIds.length > 0) {
    const placeholders = secIds.map(() => '?').join(',');
    const qRes = await db
      .prepare(`SELECT id, section_id, code, weight FROM audit_questions WHERE section_id IN (${placeholders})`)
      .bind(...secIds)
      .all<{ id: string; section_id: string; code: string; weight: number | null }>();
    allQList = qRes.results || [];
  }
  const allQIds = allQList.map((q) => q.id);

  // Fetch all options
  let allOptList: Array<{ id: string; question_id: string; code: string; label: string; numeric_value: number | null; is_na: number }> = [];
  if (allQIds.length > 0) {
    const placeholders = allQIds.map(() => '?').join(',');
    const optRes = await db
      .prepare(`SELECT id, question_id, code, label, numeric_value, is_na FROM answer_options WHERE question_id IN (${placeholders})`)
      .bind(...allQIds)
      .all<{ id: string; question_id: string; code: string; label: string; numeric_value: number | null; is_na: number }>();
    allOptList = optRes.results || [];
  }

  // Format inputs for scoring engine
  const questionsInput = allQList.map((q) => {
    const ans = answersList.find((a) => a.question_id === q.id);
    return {
      id: q.id,
      section_id: q.section_id,
      code: q.code,
      weight: q.weight,
      chosen_option_id: ans?.option_id || null,
    };
  });

  const optionsInput = allOptList.map((o) => ({
    id: o.id,
    question_id: o.question_id,
    code: o.code,
    label: o.label,
    numeric_value: o.numeric_value,
    is_na: o.is_na === 1,
  }));

  const scoringResult = await calculateAuditScore(
    templateVersion?.scoring_config_json || null,
    secList,
    questionsInput,
    optionsInput
  );

  // Update snapshot values in audit_answers
  for (const qScore of scoringResult.questionScores) {
    if (qScore.chosenOptionId) {
      await db
        .prepare('UPDATE audit_answers SET numeric_value_snapshot = ? WHERE audit_id = ? AND question_id = ?')
        .bind(qScore.numericValue, auditId, qScore.questionId)
        .run();
    }
  }

  const now = new Date().toISOString();
  await db
    .prepare(
      `UPDATE audits 
       SET status = 'SUBMITTED', score = ?, category = ?, submitted_at = ?, updated_at = ?
       WHERE id = ?`
    )
    .bind(scoringResult.score, scoringResult.category.label, now, now, auditId)
    .run();

  await recordAuditEvent(
    db,
    'AUDIT',
    auditId,
    'AUDIT_SUBMITTED',
    user.id,
    requestId,
    null,
    {
      audit_type: audit.audit_type,
      depot_id: audit.depot_id,
      cycle_id: audit.cycle_id,
      score: scoringResult.score,
      category: scoringResult.category.label,
      config_hash: scoringResult.configHash,
    }
  );

  // If this is an OFFICIAL audit, automatically generate and save comparison snapshot
  if (audit.audit_type === 'OFFICIAL') {
    try {
      await generateAndSaveComparison(
        db,
        audit.cycle_id,
        audit.depot_id,
        auditId,
        user,
        requestId
      );
    } catch (err) {
      console.warn('Gagal membuat perbandingan otomatis saat submit official audit:', err);
    }
  }

  const updatedAudit: AuditRow = {
    ...audit,
    status: 'SUBMITTED',
    score: scoringResult.score,
    category: scoringResult.category.label,
    submitted_at: now,
    updated_at: now,
  };

  return {
    audit: updatedAudit,
    idempotent: false,
    message: 'Audit berhasil disubmit, skor dihitung, dan hasil terkunci.',
  };
}

/**
 * Reopens a submitted audit with explicit mandatory reason (Admin / Auditor only).
 */
export async function reopenAudit(
  db: D1Database,
  auditId: string,
  reason: string,
  user: AuthUser,
  requestId: string
): Promise<AuditRow> {
  const isMasterOrAdmin = user.scopes.some(
    (s) => s.role === 'ADMIN' || s.role === 'AUDITOR_QAS'
  );
  if (!isMasterOrAdmin) {
    throw new AuditError(
      'FORBIDDEN',
      'Hanya Auditor QAS atau Administrator yang dapat membuka kembali audit yang sudah disubmit.',
      403
    );
  }

  if (!reason || reason.trim().length < 5) {
    throw new AuditError(
      'REASON_REQUIRED',
      'Alasan pembukaan kembali audit wajib diisi (minimal 5 karakter).',
      400
    );
  }

  const audit = await db
    .prepare('SELECT * FROM audits WHERE id = ?')
    .bind(auditId)
    .first<AuditRow>();

  if (!audit) {
    throw new AuditError('NOT_FOUND', `Audit ${auditId} tidak ditemukan.`, 404);
  }

  if (audit.status !== 'SUBMITTED') {
    throw new AuditError(
      'INVALID_STATE_FOR_REOPEN',
      `Audit saat ini berstatus ${audit.status}. Hanya audit berstatus SUBMITTED yang dapat dibuka kembali.`,
      400
    );
  }

  const now = new Date().toISOString();
  await db
    .prepare("UPDATE audits SET status = 'REOPENED', updated_at = ? WHERE id = ?")
    .bind(now, auditId)
    .run();

  await recordAuditEvent(
    db,
    'AUDIT',
    auditId,
    'AUDIT_REOPENED',
    user.id,
    requestId,
    reason,
    { previous_status: 'SUBMITTED', new_status: 'REOPENED' }
  );

  return {
    ...audit,
    status: 'REOPENED',
    updated_at: now,
  };
}

/**
 * Resets active cycle audits, clearing answers, evidence, and scores back to initial clean state.
 */
export async function resetAuditsData(
  db: D1Database,
  actorUser: AuthUser,
  requestId: string
): Promise<{ success: boolean; message: string }> {
  if (!actorUser.scopes.some((scope) => scope.role === 'ADMIN')) {
    throw new AuditError('FORBIDDEN', 'Hanya Administrator yang dapat mereset data audit.', 403);
  }
  // Find current open cycle
  const activeCycle = await db
    .prepare("SELECT id FROM audit_cycles WHERE status = 'OPEN' ORDER BY period_start DESC LIMIT 1")
    .first<{ id: string }>();

  if (activeCycle) {
    const audits = await db
      .prepare('SELECT id FROM audits WHERE cycle_id = ?')
      .bind(activeCycle.id)
      .all<{ id: string }>();

    const auditIds = (audits.results || []).map((a) => a.id);
    if (auditIds.length > 0) {
      const p = auditIds.map(() => '?').join(',');

      // Delete evidence files attached to these audits
      await db
        .prepare(`
          DELETE FROM evidence_files 
          WHERE answer_id IN (SELECT id FROM audit_answers WHERE audit_id IN (${p}))
        `)
        .bind(...auditIds)
        .run();

      // Delete answers
      await db
        .prepare(`DELETE FROM audit_answers WHERE audit_id IN (${p})`)
        .bind(...auditIds)
        .run();

      // Reset audits status
      const now = new Date().toISOString();
      await db
        .prepare(`
          UPDATE audits 
          SET status = 'DRAFT', score = NULL, category = NULL, submitted_at = NULL, updated_at = ?
          WHERE id IN (${p})
        `)
        .bind(now, ...auditIds)
        .run();

      // Delete comparisons and acknowledgements for this cycle
      await db
        .prepare('DELETE FROM comparison_snapshots WHERE cycle_id = ?')
        .bind(activeCycle.id)
        .run();

      await db
        .prepare(`
          DELETE FROM acknowledgements 
          WHERE official_audit_id IN (${p})
        `)
        .bind(...auditIds)
        .run();
    }
  }

  await recordAuditEvent(
    db,
    'SYSTEM',
    'ALL_AUDITS',
    'AUDITS_RESET',
    actorUser.id,
    requestId,
    'Pembersihan data hasil audit siklus berjalan atas permintaan pengguna',
    { cycle_id: activeCycle?.id }
  );

  return {
    success: true,
    message: 'Data hasil audit siklus aktif berhasil dibersihkan dan direset ke Draft awal.',
  };
}

/**
 * Deletes or resets a single draft audit.
 * Rejects with error if the audit is already SUBMITTED or FINALIZED.
 * Logs to audit_events.
 */
export async function deleteAuditDraft(
  db: D1Database,
  auditId: string,
  user: AuthUser,
  requestId: string,
  r2?: R2Bucket
): Promise<{ success: boolean; message: string }> {
  const audit = await db
    .prepare('SELECT * FROM audits WHERE id = ?')
    .bind(auditId)
    .first<AuditRow>();

  if (!audit) {
    throw new AuditError('NOT_FOUND', `Audit ${auditId} tidak ditemukan.`, 404);
  }

  if (audit.status === 'SUBMITTED') {
    throw new AuditError(
      'LOCKED_AUDIT_CANNOT_BE_DELETED',
      'Data audit yang sudah berstatus SUBMITTED dilarang dihapus demi menjaga kepatuhan dan integritas audit.',
      400
    );
  }

  const isAdmin = user.scopes.some((s) => s.role === 'ADMIN');
  if (!isAdmin) {
    if (audit.audit_type === 'SELF') {
      const isPicOwn = user.scopes.some(
        (s) => s.role === 'PIC_QAS' && s.depotId === audit.depot_id
      );
      if (!isPicOwn) {
        throw new AuditError('FORBIDDEN', 'Hanya PIC depo terkait atau Admin yang berhak menghapus draft Self Audit.', 403);
      }
    } else if (audit.audit_type === 'OFFICIAL') {
      const isAuditor = user.scopes.some((s) => s.role === 'AUDITOR_QAS');
      if (!isAuditor) {
        throw new AuditError('FORBIDDEN', 'Hanya Auditor QAS atau Admin yang berhak menghapus draft Official Audit.', 403);
      }
    }
  }

  // 1. Ambil seluruh object_key bukti yang terkait
  const evResult = await db
    .prepare(`
      SELECT id, object_key FROM evidence_files 
      WHERE answer_id IN (SELECT id FROM audit_answers WHERE audit_id = ?)
        AND deleted_at IS NULL
    `)
    .bind(auditId)
    .all<{ id: string; object_key: string }>();

  const filesToDelete = evResult.results || [];
  const now = new Date().toISOString();

  // 1b. Tandai sebagai DELETE_PENDING (soft-delete di D1) sebelum penghapusan R2
  if (filesToDelete.length > 0) {
    await db
      .prepare(`
        UPDATE evidence_files 
        SET deleted_at = ? 
        WHERE answer_id IN (SELECT id FROM audit_answers WHERE audit_id = ?)
          AND deleted_at IS NULL
      `)
      .bind(now, auditId)
      .run();
  }

  // 2. Hapus berkas dari R2 private bucket
  if (r2 && filesToDelete.length > 0) {
    for (const file of filesToDelete) {
      try {
        await r2.delete(file.object_key);
      } catch (r2Err) {
        // Kembalikan status jika R2 gagal agar data dapat direkonsiliasi
        await db
          .prepare('UPDATE evidence_files SET deleted_at = NULL WHERE id = ?')
          .bind(file.id)
          .run();

        // Rekonsiliasi: Catat kegagalan dan jangan hapus metadata D1 bila R2 gagal
        await recordAuditEvent(
          db,
          'EVIDENCE',
          file.id,
          'R2_DELETE_FAILED',
          user.id,
          requestId,
          `Gagal menghapus objek R2: ${file.object_key}`,
          { object_key: file.object_key, error: String(r2Err) }
        );
        throw new AuditError(
          'R2_DELETE_FAILED',
          `Gagal menghapus berkas bukti dari penyimpanan R2: ${file.object_key}`,
          500,
          { failed_object_key: file.object_key }
        );
      }
    }
  }

  // 3. Hapus metadata dari D1
  await db
    .prepare(`
      DELETE FROM evidence_files 
      WHERE answer_id IN (SELECT id FROM audit_answers WHERE audit_id = ?)
    `)
    .bind(auditId)
    .run();

  // 4. Hapus seluruh jawaban draft
  await db
    .prepare('DELETE FROM audit_answers WHERE audit_id = ?')
    .bind(auditId)
    .run();

  // 5. Reset status audit kembali ke draft unstarted
  await db
    .prepare(`
      UPDATE audits 
      SET status = 'DRAFT', started_at = NULL, version = 1, score = NULL, category = NULL, submitted_at = NULL, updated_at = ?
      WHERE id = ?
    `)
    .bind(now, auditId)
    .run();

  // 6. Catat event DRAFT_DELETED di audit_events
  await recordAuditEvent(
    db,
    'AUDIT',
    auditId,
    'DRAFT_DELETED',
    user.id,
    requestId,
    'Draft audit dihapus oleh pengguna',
    { 
      audit_id: auditId, 
      depot_id: audit.depot_id, 
      audit_type: audit.audit_type,
      deleted_evidence_count: filesToDelete.length 
    }
  );

  return {
    success: true,
    message: 'Draft audit dan bukti terkait berhasil dibersihkan dan direset.',
  };
}

/**
 * Deletes drafts for a specific cycle and depot.
 * Prevents deletion if any audit is SUBMITTED or FINALIZED.
 */
export async function deleteCycleDepotDrafts(
  db: D1Database,
  cycleId: string,
  depotId: string,
  user: AuthUser,
  requestId: string,
  r2?: R2Bucket
): Promise<{ success: boolean; message: string }> {
  const audits = await db
    .prepare('SELECT id, status, audit_type, depot_id FROM audits WHERE cycle_id = ? AND depot_id = ?')
    .bind(cycleId, depotId)
    .all<{ id: string; status: string; audit_type: string; depot_id: string }>();

  const list = audits.results || [];
  const hasSubmitted = list.some((a) => a.status === 'SUBMITTED' || a.status === 'FINALIZED');
  if (hasSubmitted) {
    throw new AuditError(
      'LOCKED_AUDIT_CANNOT_BE_DELETED',
      'Tidak dapat menghapus data: Terdapat audit yang sudah SUBMITTED atau FINALIZED pada periode ini.',
      400
    );
  }

  for (const a of list) {
    await deleteAuditDraft(db, a.id, user, requestId, r2);
  }

  return {
    success: true,
    message: 'Data draft audit untuk depo dan periode ini berhasil dihapus.',
  };
}

/**
 * Reconciliation job for handling cases where R2 objects were deleted but D1 finalization failed,
 * or where evidence metadata is stuck in DELETE_PENDING state (deleted_at IS NOT NULL).
 */
export async function reconcilePendingEvidenceDeletions(
  db: D1Database,
  r2?: R2Bucket
): Promise<{ checked_count: number; cleaned_count: number }> {
  const pendingFiles = await db
    .prepare('SELECT id, object_key FROM evidence_files WHERE deleted_at IS NOT NULL')
    .all<{ id: string; object_key: string }>();

  const list = pendingFiles.results || [];
  let cleaned = 0;

  for (const file of list) {
    if (r2) {
      try {
        await r2.delete(file.object_key);
      } catch {
        // Ignore if already deleted from R2
      }
    }
    await db.prepare('DELETE FROM evidence_files WHERE id = ?').bind(file.id).run();
    cleaned++;
  }

  return { checked_count: list.length, cleaned_count: cleaned };
}


