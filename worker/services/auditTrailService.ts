import { ContentfulStatusCode } from 'hono/utils/http-status';
import { AuthUser } from '../types';

export class AuditTrailError extends Error {
  constructor(
    public code: string,
    message: string,
    public statusCode: ContentfulStatusCode = 400,
    public details?: unknown
  ) {
    super(message);
    this.name = 'AuditTrailError';
  }
}

export interface AuditEventRecord {
  id: string;
  entity_type: string;
  entity_id: string;
  event_type: string;
  actor_user_id: string | null;
  actor_name: string | null;
  actor_email: string | null;
  reason: string | null;
  payload: Record<string, unknown> | null;
  request_id: string | null;
  created_at: string;
}

export interface ListAuditEventsFilter {
  entityType?: string;
  entityId?: string;
  eventType?: string;
  limit?: number;
  offset?: number;
}

/**
 * Retrieves the comprehensive chronological audit trail for a specific audit.
 * Enforces Zero Trust scope isolation and Blind Audit rules.
 */
export async function getAuditTimeline(
  db: D1Database,
  auditId: string,
  user: AuthUser
): Promise<{
  audit_id: string;
  audit_type: string;
  depot_id: string;
  status: string;
  total_events: number;
  events: AuditEventRecord[];
}> {
  // 1. Verify audit existence
  const audit = await db
    .prepare('SELECT id, cycle_id, depot_id, audit_type, status FROM audits WHERE id = ?')
    .bind(auditId)
    .first<{
      id: string;
      cycle_id: string;
      depot_id: string;
      audit_type: string;
      status: string;
    }>();

  if (!audit) {
    throw new AuditTrailError('AUDIT_NOT_FOUND', `Audit dengan ID ${auditId} tidak ditemukan.`, 404);
  }

  // 2. Scope & RBAC Check
  const isGlobalUser = user.scopes.some(
    (s) => s.role === 'ADMIN' || s.role === 'AUDITOR_QAS'
  );

  // If user is PIC QAS (and not Admin/Auditor), strictly limit to their depot
  if (!isGlobalUser) {
    const hasDepotAccess = user.scopes.some(
      (s) => s.role === 'PIC_QAS' && s.depotId === audit.depot_id
    );
    if (!hasDepotAccess) {
      throw new AuditTrailError(
        'FORBIDDEN_DEPOT_ACCESS',
        'Anda tidak memiliki akses ke riwayat audit depo lain.',
        403
      );
    }
  }

  // 3. Blind Audit Guard for Auditor
  // Auditor cannot inspect Self Audit events until Official Audit is SUBMITTED
  if (audit.audit_type === 'SELF' && !user.scopes.some((s) => s.role === 'ADMIN')) {
    const isAuditorOnly = user.scopes.some((s) => s.role === 'AUDITOR_QAS');
    if (isAuditorOnly) {
      const official = await db
        .prepare(
          "SELECT status FROM audits WHERE cycle_id = ? AND depot_id = ? AND audit_type = 'OFFICIAL'"
        )
        .bind(audit.cycle_id, audit.depot_id)
        .first<{ status: string }>();

      if (!official || official.status !== 'SUBMITTED') {
        throw new AuditTrailError(
          'BLIND_AUDIT_RESTRICTION',
          'Mode Blind Audit aktif: Auditor dilarang memeriksa riwayat audit trail Self Audit sebelum Official Audit berstatus SUBMITTED.',
          403
        );
      }
    }
  }

  // 4. Gather related entity IDs (Answers & Evidences associated with this audit)
  const answers = await db
    .prepare('SELECT id FROM audit_answers WHERE audit_id = ?')
    .bind(auditId)
    .all<{ id: string }>();
  const answerIds = (answers.results || []).map((a) => a.id);

  let evidenceIds: string[] = [];
  if (answerIds.length > 0) {
    const placeholders = answerIds.map(() => '?').join(',');
    const evidences = await db
      .prepare(`SELECT id FROM evidence_files WHERE answer_id IN (${placeholders})`)
      .bind(...answerIds)
      .all<{ id: string }>();
    evidenceIds = (evidences.results || []).map((e) => e.id);
  }

  // 5. Query all matching audit events
  // Events include:
  // - entity_type = 'AUDIT' AND entity_id = auditId
  // - entity_type = 'ANSWER' AND entity_id IN (answerIds)
  // - entity_type = 'EVIDENCE' AND entity_id IN (evidenceIds)
  const conditions: string[] = [`(e.entity_type = 'AUDIT' AND e.entity_id = ?)`];
  const queryParams: unknown[] = [auditId];

  if (answerIds.length > 0) {
    const ansPlaceholders = answerIds.map(() => '?').join(',');
    conditions.push(`(e.entity_type = 'ANSWER' AND e.entity_id IN (${ansPlaceholders}))`);
    queryParams.push(...answerIds);
  }

  if (evidenceIds.length > 0) {
    const evPlaceholders = evidenceIds.map(() => '?').join(',');
    conditions.push(`(e.entity_type = 'EVIDENCE' AND e.entity_id IN (${evPlaceholders}))`);
    queryParams.push(...evidenceIds);
  }

  const sql = `
    SELECT 
      e.id, 
      e.entity_type, 
      e.entity_id, 
      e.event_type, 
      e.actor_user_id, 
      u.full_name as actor_name, 
      u.email as actor_email,
      e.reason, 
      e.payload_json, 
      e.request_id, 
      e.created_at
    FROM audit_events e
    LEFT JOIN users u ON e.actor_user_id = u.id
    WHERE ${conditions.join(' OR ')}
    ORDER BY e.created_at ASC
  `;

  const result = await db
    .prepare(sql)
    .bind(...queryParams)
    .all<{
      id: string;
      entity_type: string;
      entity_id: string;
      event_type: string;
      actor_user_id: string | null;
      actor_name: string | null;
      actor_email: string | null;
      reason: string | null;
      payload_json: string | null;
      request_id: string | null;
      created_at: string;
    }>();

  const rawEvents = result.results || [];

  const events: AuditEventRecord[] = rawEvents.map((r) => {
    let payload: Record<string, unknown> | null = null;
    if (r.payload_json) {
      try {
        payload = JSON.parse(r.payload_json);
      } catch {
        payload = { raw: r.payload_json };
      }
    }

    return {
      id: r.id,
      entity_type: r.entity_type,
      entity_id: r.entity_id,
      event_type: r.event_type,
      actor_user_id: r.actor_user_id,
      actor_name: r.actor_name,
      actor_email: r.actor_email,
      reason: r.reason,
      payload,
      request_id: r.request_id,
      created_at: r.created_at,
    };
  });

  return {
    audit_id: auditId,
    audit_type: audit.audit_type,
    depot_id: audit.depot_id,
    status: audit.status,
    total_events: events.length,
    events,
  };
}

/**
 * System-wide audit event explorer for Compliance & Security Review.
 * Restricted to Auditor QAS and Administrator.
 */
export async function listAuditEvents(
  db: D1Database,
  filter: ListAuditEventsFilter,
  user: AuthUser
): Promise<{
  total: number;
  limit: number;
  offset: number;
  events: AuditEventRecord[];
}> {
  const isMasterOrAdmin = user.scopes.some(
    (s) => s.role === 'ADMIN' || s.role === 'AUDITOR_QAS'
  );

  if (!isMasterOrAdmin) {
    throw new AuditTrailError(
      'FORBIDDEN',
      'Hanya Auditor QAS atau Administrator yang dapat mengakses log audit trail sistem.',
      403
    );
  }

  const conditions: string[] = ['1=1'];
  const params: unknown[] = [];

  if (filter.entityType) {
    conditions.push('e.entity_type = ?');
    params.push(filter.entityType);
  }

  if (filter.entityId) {
    conditions.push('e.entity_id = ?');
    params.push(filter.entityId);
  }

  if (filter.eventType) {
    conditions.push('e.event_type = ?');
    params.push(filter.eventType);
  }

  const limit = Math.min(Math.max(filter.limit || 50, 1), 200);
  const offset = Math.max(filter.offset || 0, 0);

  // Count total
  const countSql = `SELECT count(*) as total FROM audit_events e WHERE ${conditions.join(' AND ')}`;
  const countResult = await db.prepare(countSql).bind(...params).first<{ total: number }>();
  const total = countResult?.total || 0;

  // Query paginated
  const selectSql = `
    SELECT 
      e.id, 
      e.entity_type, 
      e.entity_id, 
      e.event_type, 
      e.actor_user_id, 
      u.full_name as actor_name, 
      u.email as actor_email,
      e.reason, 
      e.payload_json, 
      e.request_id, 
      e.created_at
    FROM audit_events e
    LEFT JOIN users u ON e.actor_user_id = u.id
    WHERE ${conditions.join(' AND ')}
    ORDER BY e.created_at DESC
    LIMIT ? OFFSET ?
  `;

  const queryResult = await db
    .prepare(selectSql)
    .bind(...params, limit, offset)
    .all<{
      id: string;
      entity_type: string;
      entity_id: string;
      event_type: string;
      actor_user_id: string | null;
      actor_name: string | null;
      actor_email: string | null;
      reason: string | null;
      payload_json: string | null;
      request_id: string | null;
      created_at: string;
    }>();

  const events: AuditEventRecord[] = (queryResult.results || []).map((r) => {
    let payload: Record<string, unknown> | null = null;
    if (r.payload_json) {
      try {
        payload = JSON.parse(r.payload_json);
      } catch {
        payload = { raw: r.payload_json };
      }
    }

    return {
      id: r.id,
      entity_type: r.entity_type,
      entity_id: r.entity_id,
      event_type: r.event_type,
      actor_user_id: r.actor_user_id,
      actor_name: r.actor_name,
      actor_email: r.actor_email,
      reason: r.reason,
      payload,
      request_id: r.request_id,
      created_at: r.created_at,
    };
  });

  return {
    total,
    limit,
    offset,
    events,
  };
}
