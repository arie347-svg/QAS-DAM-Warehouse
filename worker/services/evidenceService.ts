import { ContentfulStatusCode } from 'hono/utils/http-status';
import { AuthUser } from '../types';
import { recordAuditEvent } from './auditService';

export class EvidenceError extends Error {
  constructor(
    public code: string,
    message: string,
    public statusCode: ContentfulStatusCode = 400,
    public details?: unknown
  ) {
    super(message);
    this.name = 'EvidenceError';
  }
}

export const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
export const MAX_EVIDENCE_SIZE_BYTES = 5 * 1024 * 1024; // 5 MB

export interface EvidenceRecord {
  id: string;
  answer_id: string;
  object_key: string;
  original_name: string;
  mime_type: string;
  size_bytes: number;
  sha256: string | null;
  uploaded_by: string;
  uploaded_at: string;
  deleted_at: string | null;
}

interface EvidenceDetailRow extends EvidenceRecord {
  audit_id: string;
  depot_id: string;
  audit_type: 'SELF' | 'OFFICIAL';
  cycle_id: string;
  audit_status: 'DRAFT' | 'SUBMITTED' | 'REOPENED' | 'VOID';
}

/**
 * Computes SHA-256 hex string from ArrayBuffer.
 */
export async function computeSha256(buffer: ArrayBuffer): Promise<string> {
  const hashBuffer = await crypto.subtle.digest('SHA-256', buffer);
  return Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Uploads an evidence file to private R2 bucket and stores metadata in D1.
 * Enforces Zero Trust cross-depot, MIME validation, max file size, and SHA-256 deduplication.
 */
export async function uploadEvidence(
  db: D1Database,
  r2: R2Bucket,
  answerId: string,
  file: {
    name: string;
    type: string;
    size: number;
    buffer: ArrayBuffer;
  },
  user: AuthUser,
  requestId: string
): Promise<EvidenceRecord & { is_duplicate?: boolean }> {
  // 1. Verify answer exists and load audit context
  const context = await db
    .prepare(
      `SELECT a.id as answer_id, a.audit_id, au.status as audit_status, 
              au.depot_id, au.audit_type, au.cycle_id 
       FROM audit_answers a 
       JOIN audits au ON a.audit_id = au.id 
       WHERE a.id = ?`
    )
    .bind(answerId)
    .first<{
      answer_id: string;
      audit_id: string;
      audit_status: string;
      depot_id: string;
      audit_type: string;
      cycle_id: string;
    }>();

  if (!context) {
    throw new EvidenceError('ANSWER_NOT_FOUND', 'Jawaban audit tidak ditemukan.', 404);
  }

  // 2. Audit Lock Check
  if (context.audit_status === 'SUBMITTED') {
    throw new EvidenceError(
      'AUDIT_LOCKED',
      'Audit telah disubmit dan terkunci. Bukti tidak dapat ditambahkan.',
      400
    );
  }
  if (context.audit_status === 'VOID') {
    throw new EvidenceError('AUDIT_VOID', 'Audit telah dibatalkan.', 400);
  }

  // 3. User Authorization & Cross-Depot Isolation
  const isGlobalUser = user.scopes.some(
    (s) => s.role === 'ADMIN' || s.role === 'AUDITOR_QAS'
  );
  if (!isGlobalUser) {
    const hasDepotAccess = user.scopes.some(
      (s) => s.role === 'PIC_QAS' && s.depotId === context.depot_id
    );
    if (!hasDepotAccess || context.audit_type !== 'SELF') {
      throw new EvidenceError(
        'FORBIDDEN_DEPOT_ACCESS',
        'Anda tidak memiliki wewenang untuk mengunggah bukti pada depo ini.',
        403
      );
    }
  }

  // 4. Validate MIME Type
  const normalizedMime = file.type.toLowerCase().trim();
  if (!ALLOWED_MIME_TYPES.includes(normalizedMime)) {
    throw new EvidenceError(
      'INVALID_MIME_TYPE',
      `Format file "${file.type}" tidak didukung. Hanya format foto (JPEG, PNG, WebP) yang diizinkan.`,
      400
    );
  }

  // 5. Validate File Size
  const actualSize = file.buffer.byteLength || file.size;
  if (actualSize > MAX_EVIDENCE_SIZE_BYTES) {
    throw new EvidenceError(
      'FILE_TOO_LARGE',
      `Ukuran file (${(actualSize / 1024 / 1024).toFixed(2)} MB) melebihi batas maksimal 5 MB.`,
      400
    );
  }
  if (actualSize === 0) {
    throw new EvidenceError('FILE_EMPTY', 'File yang diunggah kosong (0 byte).', 400);
  }

  // 6. Compute SHA-256 Hash
  const hashHex = await computeSha256(file.buffer);

  // 7. Deduplication Check (Idempotent Retry Guard)
  const existingDup = await db
    .prepare(
      `SELECT * FROM evidence_files 
       WHERE answer_id = ? AND sha256 = ? AND deleted_at IS NULL`
    )
    .bind(answerId, hashHex)
    .first<EvidenceRecord>();

  if (existingDup) {
    // Return existing record idempotently
    return {
      ...existingDup,
      is_duplicate: true,
    };
  }

  // 8. Generate Random Object Key and Upload to R2 Private Bucket
  const safeFilename = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
  const objectKey = `evidence/${context.audit_id}/${crypto.randomUUID()}-${safeFilename}`;

  await r2.put(objectKey, file.buffer, {
    httpMetadata: {
      contentType: normalizedMime,
    },
    customMetadata: {
      auditId: context.audit_id,
      answerId,
      uploadedBy: user.id,
      sha256: hashHex,
    },
  });

  // 9. Store Metadata in D1
  const evidenceId = `evd-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
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
      file.name,
      normalizedMime,
      actualSize,
      hashHex,
      user.id,
      now
    )
    .run();

  // 10. Record Audit Event
  await recordAuditEvent(
    db,
    'EVIDENCE',
    evidenceId,
    'EVIDENCE_UPLOADED',
    user.id,
    requestId,
    null,
    {
      answerId,
      objectKey,
      filename: file.name,
      mimeType: normalizedMime,
      sizeBytes: actualSize,
      sha256: hashHex,
    }
  );

  return {
    id: evidenceId,
    answer_id: answerId,
    object_key: objectKey,
    original_name: file.name,
    mime_type: normalizedMime,
    size_bytes: actualSize,
    sha256: hashHex,
    uploaded_by: user.id,
    uploaded_at: now,
    deleted_at: null,
  };
}

/**
 * Retrieves an evidence stream from R2 private bucket.
 * Enforces Zero Trust cross-depot check and Blind Audit mode.
 */
export async function getEvidenceStream(
  db: D1Database,
  r2: R2Bucket,
  evidenceId: string,
  user: AuthUser,
  requestId?: string
): Promise<{ r2Object: R2ObjectBody; metadata: EvidenceRecord }> {
  const row = await db
    .prepare(
      `SELECT e.id, e.answer_id, e.object_key, e.original_name, e.mime_type, e.size_bytes, e.sha256,
              e.uploaded_by, e.uploaded_at, e.deleted_at,
              a.audit_id, au.depot_id, au.audit_type, au.cycle_id, au.status as audit_status
       FROM evidence_files e
       JOIN audit_answers a ON e.answer_id = a.id
       JOIN audits au ON a.audit_id = au.id
       WHERE e.id = ? AND e.deleted_at IS NULL`
    )
    .bind(evidenceId)
    .first<EvidenceDetailRow>();

  if (!row) {
    throw new EvidenceError('EVIDENCE_NOT_FOUND', 'Bukti foto tidak ditemukan.', 404);
  }

  const isGlobalUser = user.scopes.some(
    (s) => s.role === 'ADMIN' || s.role === 'AUDITOR_QAS'
  );

  // 1. Cross-depot protection for PIC QAS
  if (!isGlobalUser) {
    const hasDepotAccess = user.scopes.some(
      (s) => s.role === 'PIC_QAS' && s.depotId === row.depot_id
    );
    if (!hasDepotAccess) {
      throw new EvidenceError(
        'FORBIDDEN_DEPOT_ACCESS',
        'Anda tidak memiliki izin untuk melihat bukti foto depo ini.',
        403
      );
    }
  }

  // 2. Self Audit Evidence Access Guard:
  // If an Auditor QAS (non-admin) attempts to access Self Audit evidence before Self Audit is SUBMITTED:
  if (row.audit_type === 'SELF' && !user.scopes.some((s) => s.role === 'ADMIN')) {
    const isAuditorOnly = user.scopes.some((s) => s.role === 'AUDITOR_QAS');
    if (isAuditorOnly) {
      if (row.audit_status !== 'SUBMITTED') {
        throw new EvidenceError(
          'BLIND_AUDIT_RESTRICTION',
          'Auditor dilarang melihat bukti foto Self Audit sebelum Self Audit berstatus SUBMITTED.',
          403
        );
      }
    }
  }

  // 3. Retrieve from R2 Private Bucket
  const r2Object = await r2.get(row.object_key);
  if (!r2Object) {
    throw new EvidenceError(
      'R2_OBJECT_NOT_FOUND',
      'Objek bukti foto tidak ditemukan pada penyimpanan R2.',
      404
    );
  }

  // 4. Record EVIDENCE_VIEWED audit event
  try {
    const eventId = `evt-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
    await db
      .prepare(
        `INSERT INTO audit_events 
         (id, entity_type, entity_id, event_type, actor_user_id, reason, payload_json, request_id, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .bind(
        eventId,
        'EVIDENCE',
        row.id,
        'EVIDENCE_VIEWED',
        user.id,
        null,
        JSON.stringify({ object_key: row.object_key, mime_type: row.mime_type }),
        requestId || null,
        new Date().toISOString()
      )
      .run();
  } catch (err) {
    // Non-blocking log
    console.warn('Gagal mencatat audit event EVIDENCE_VIEWED:', err);
  }

  return {
    r2Object,
    metadata: {
      id: row.id,
      answer_id: row.answer_id,
      object_key: row.object_key,
      original_name: row.original_name,
      mime_type: row.mime_type,
      size_bytes: row.size_bytes,
      sha256: row.sha256,
      uploaded_by: row.uploaded_by,
      uploaded_at: row.uploaded_at,
      deleted_at: row.deleted_at,
    },
  };
}

/**
 * Soft deletes an evidence record in D1 and logs the event.
 */
export async function deleteEvidence(
  db: D1Database,
  _r2: R2Bucket,
  evidenceId: string,
  user: AuthUser,
  requestId: string
): Promise<{ success: boolean; deleted_id: string }> {
  const row = await db
    .prepare(
      `SELECT e.id, e.answer_id, e.object_key, e.uploaded_by,
              au.status as audit_status, au.depot_id
       FROM evidence_files e
       JOIN audit_answers a ON e.answer_id = a.id
       JOIN audits au ON a.audit_id = au.id
       WHERE e.id = ? AND e.deleted_at IS NULL`
    )
    .bind(evidenceId)
    .first<{
      id: string;
      answer_id: string;
      object_key: string;
      uploaded_by: string;
      audit_status: string;
      depot_id: string;
    }>();

  if (!row) {
    throw new EvidenceError('EVIDENCE_NOT_FOUND', 'Bukti foto tidak ditemukan.', 404);
  }

  if (row.audit_status === 'SUBMITTED') {
    throw new EvidenceError(
      'AUDIT_LOCKED',
      'Audit telah disubmit dan terkunci. Bukti tidak dapat dihapus.',
      400
    );
  }

  // Ownership or Admin check
  const isAdmin = user.scopes.some((s) => s.role === 'ADMIN');
  const isOwner = row.uploaded_by === user.id;

  if (!isAdmin && !isOwner) {
    throw new EvidenceError(
      'FORBIDDEN',
      'Anda tidak memiliki wewenang untuk menghapus berkas bukti ini.',
      403
    );
  }

  const now = new Date().toISOString();
  await db
    .prepare('UPDATE evidence_files SET deleted_at = ? WHERE id = ?')
    .bind(now, evidenceId)
    .run();

  await recordAuditEvent(
    db,
    'EVIDENCE',
    evidenceId,
    'EVIDENCE_DELETED',
    user.id,
    requestId,
    null,
    { objectKey: row.object_key }
  );

  return { success: true, deleted_id: evidenceId };
}
