import { Hono, Context } from 'hono';
import { ContentfulStatusCode } from 'hono/utils/http-status';
import { ZodError } from 'zod';
import { Env, Variables } from '../types';
import { requireAuth } from '../middleware/auth';
import {
  saveAnswerSchema,
  reopenAuditSchema,
  attachEvidenceSchema,
} from '../validators/auditSchemas';
import {
  AuditError,
  getAuditDetail,
  startAudit,
  saveAnswer,
  submitAudit,
  reopenAudit,
  attachEvidence,
  resetAuditsData,
  deleteCycleDepotDrafts,
  reconcilePendingEvidenceDeletions,
} from '../services/auditService';

export const auditRouter = new Hono<{ Bindings: Env; Variables: Variables }>();

// All audit routes require authentication
auditRouter.use('/audits/*', requireAuth);
auditRouter.use('/audits', requireAuth);
auditRouter.use('/answers/*', requireAuth);

function handleError(err: unknown, c: Context<{ Bindings: Env; Variables: Variables }>, requestId: string) {
  if (err instanceof AuditError) {
    return c.json(
      {
        success: false,
        error: {
          code: err.code,
          message: err.message,
          details: err.details,
          requestId,
        },
      },
      err.statusCode as ContentfulStatusCode
    );
  }

  if (err instanceof ZodError) {
    return c.json(
      {
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Data yang dikirim tidak valid.',
          details: err.flatten().fieldErrors,
          requestId,
        },
      },
      400
    );
  }

  const message = err instanceof Error ? err.message : String(err);
  return c.json(
    {
      success: false,
      error: {
        code: 'INTERNAL_SERVER_ERROR',
        message: `Terjadi kesalahan pada server: ${message}`,
        requestId,
      },
    },
    500
  );
}

// 0. Reset Audit Data (Cleans active cycle audits back to Draft)
auditRouter.post('/audits/reset', async (c) => {
  const db = c.env.DB;
  const user = c.get('user')!;
  const requestId = c.get('requestId');

  if (!db) {
    return c.json({ success: false, error: { code: 'DATABASE_UNAVAILABLE', message: 'D1 DB tidak tersedia.', requestId } }, 503);
  }

  try {
    const result = await resetAuditsData(db, user, requestId);
    return c.json({ success: true, message: result.message, requestId });
  } catch (err) {
    return handleError(err, c, requestId);
  }
});

// 0b. Reconcile Pending Evidence Deletions (Handles orphaned or stuck DELETE_PENDING items)
auditRouter.post('/audits/reconcile-evidence', async (c) => {
  const db = c.env.DB;
  const user = c.get('user')!;
  const requestId = c.get('requestId');
  const r2 = c.env.EVIDENCE;

  if (!db) {
    return c.json({ success: false, error: { code: 'DATABASE_UNAVAILABLE', message: 'D1 DB tidak tersedia.', requestId } }, 503);
  }

  const isAdmin = user.scopes.some((s) => s.role === 'ADMIN');
  if (!isAdmin) {
    return c.json({ success: false, error: { code: 'FORBIDDEN', message: 'Hanya Admin yang dapat memicu rekonsiliasi.', requestId } }, 403);
  }

  try {
    const result = await reconcilePendingEvidenceDeletions(db, r2);
    return c.json({ success: true, data: result, requestId });
  } catch (err) {
    return handleError(err, c, requestId);
  }
});

// 1. Get Audit Detail (Includes questions tree, existing answers, evidence, progress)
auditRouter.get('/audits/:id', async (c) => {
  const db = c.env.DB;
  const user = c.get('user')!;
  const requestId = c.get('requestId') || 'unknown';
  const auditId = c.req.param('id');

  if (!db) {
    return c.json({ success: false, error: { code: 'DATABASE_BINDING_ERROR', message: 'D1 DB binding tidak tersedia.', requestId } }, 503);
  }

  if (!auditId || auditId === 'undefined' || auditId === 'null') {
    return c.json({ success: false, error: { code: 'AUDIT_ID_MISSING', message: 'Parameter audit ID kosong atau tidak valid.', requestId } }, 400);
  }

  try {
    const data = await getAuditDetail(db, auditId, user);
    return c.json({ success: true, data, requestId });
  } catch (err) {
    return handleError(err, c, requestId);
  }
});

// 1b. Start Audit (Validates role, depot, cycle, assignment, server timestamp, atomic version, AUDIT_STARTED event)
auditRouter.post('/audits/:id/start', async (c) => {
  const db = c.env.DB;
  const user = c.get('user')!;
  const requestId = c.get('requestId') || 'unknown';
  const auditId = c.req.param('id');

  if (!db) {
    return c.json({ success: false, error: { code: 'DATABASE_BINDING_ERROR', message: 'D1 DB binding tidak tersedia.', requestId } }, 503);
  }

  if (!auditId || auditId === 'undefined' || auditId === 'null') {
    return c.json({ success: false, error: { code: 'AUDIT_ID_MISSING', message: 'Parameter audit ID kosong atau tidak valid.', requestId } }, 400);
  }

  try {
    const data = await startAudit(db, auditId, user, requestId);
    return c.json({ success: true, data, requestId });
  } catch (err) {
    return handleError(err, c, requestId);
  }
});

// 2a. Save or update answer with question_id in request body
auditRouter.put('/audits/:id/answers', async (c) => {
  const db = c.env.DB;
  const user = c.get('user')!;
  const requestId = c.get('requestId');
  const auditId = c.req.param('id');

  if (!db) {
    return c.json({ success: false, error: { code: 'DATABASE_UNAVAILABLE', message: 'D1 DB tidak tersedia.', requestId } }, 503);
  }

  try {
    const body = await c.req.json();
    const validated = saveAnswerSchema.parse(body);
    const questionId = validated.question_id || c.req.query('question_id');
    if (!questionId) {
      return c.json(
        {
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Parameter question_id wajib disertakan.',
            requestId,
          },
        },
        400
      );
    }
    const data = await saveAnswer(db, auditId, questionId, validated, user, requestId);
    return c.json({ success: true, data, requestId });
  } catch (err) {
    return handleError(err, c, requestId);
  }
});

// 2b. Save or update answer for a specific question (Autosave endpoint via URL param)
auditRouter.put('/audits/:id/answers/:questionId', async (c) => {
  const db = c.env.DB;
  const user = c.get('user')!;
  const requestId = c.get('requestId');
  const auditId = c.req.param('id');
  const questionId = c.req.param('questionId');

  if (!db) {
    return c.json({ success: false, error: { code: 'DATABASE_UNAVAILABLE', message: 'D1 DB tidak tersedia.', requestId } }, 503);
  }

  try {
    const body = await c.req.json();
    const validated = saveAnswerSchema.parse(body);
    const data = await saveAnswer(db, auditId, questionId, validated, user, requestId);
    return c.json({ success: true, data, requestId });
  } catch (err) {
    return handleError(err, c, requestId);
  }
});

// 3. Submit Audit (Validation + Lock + Idempotency)
auditRouter.post('/audits/:id/submit', async (c) => {
  const db = c.env.DB;
  const user = c.get('user')!;
  const requestId = c.get('requestId');
  const auditId = c.req.param('id');

  if (!db) {
    return c.json({ success: false, error: { code: 'DATABASE_UNAVAILABLE', message: 'D1 DB tidak tersedia.', requestId } }, 503);
  }

  try {
    const result = await submitAudit(db, auditId, user, requestId);
    return c.json({
      success: true,
      data: result.audit,
      idempotent: result.idempotent,
      message: result.message,
      requestId,
    });
  } catch (err) {
    return handleError(err, c, requestId);
  }
});

// 4. Reopen Audit (Controlled with mandatory reason)
auditRouter.post('/audits/:id/reopen', async (c) => {
  const db = c.env.DB;
  const user = c.get('user')!;
  const requestId = c.get('requestId');
  const auditId = c.req.param('id');

  if (!db) {
    return c.json({ success: false, error: { code: 'DATABASE_UNAVAILABLE', message: 'D1 DB tidak tersedia.', requestId } }, 503);
  }

  try {
    const body = await c.req.json();
    const validated = reopenAuditSchema.parse(body);
    const data = await reopenAudit(db, auditId, validated.reason, user, requestId);
    return c.json({
      success: true,
      data,
      message: 'Audit berhasil dibuka kembali untuk perbaikan.',
      requestId,
    });
  } catch (err) {
    return handleError(err, c, requestId);
  }
});

// 5. Attach Evidence Metadata to Answer
auditRouter.post('/answers/:id/evidence', async (c) => {
  const db = c.env.DB;
  const user = c.get('user')!;
  const requestId = c.get('requestId');
  const answerId = c.req.param('id');

  if (!db) {
    return c.json({ success: false, error: { code: 'DATABASE_UNAVAILABLE', message: 'D1 DB tidak tersedia.', requestId } }, 503);
  }

  try {
    const body = await c.req.json();
    const validated = attachEvidenceSchema.parse(body);
    const data = await attachEvidence(db, answerId, validated, user, requestId);
    return c.json({ success: true, data, requestId }, 201);
  } catch (err) {
    return handleError(err, c, requestId);
  }
});

// 6. Hard-Delete Prevention Guard (Compliance & Tamper Protection)
auditRouter.delete('/audits/:id', async (c) => {
  const requestId = c.get('requestId');
  return c.json(
    {
      success: false,
      error: {
        code: 'HARD_DELETE_PROHIBITED',
        message: 'Hard delete pada data audit dilarang keras demi menjaga integritas data dan kepatuhan compliance mutu QAS.',
        requestId,
      },
    },
    405
  );
});

// 7. Delete Draft Audits by Cycle & Depot (Batch deletion for toolbar action)
auditRouter.delete('/audits', async (c) => {
  const db = c.env.DB;
  const user = c.get('user')!;
  const requestId = c.get('requestId');
  const cycleId = c.req.query('cycle_id');
  const depotId = c.req.query('depot_id');

  if (!db) {
    return c.json({ success: false, error: { code: 'DATABASE_UNAVAILABLE', message: 'D1 DB tidak tersedia.', requestId } }, 503);
  }

  if (!cycleId || !depotId) {
    return c.json(
      {
        success: false,
        error: {
          code: 'PARAMS_REQUIRED',
          message: 'Parameter cycle_id dan depot_id wajib disertakan untuk menghapus draft.',
          requestId,
        },
      },
      400
    );
  }

  try {
    const r2 = c.env.EVIDENCE;
    const result = await deleteCycleDepotDrafts(db, cycleId, depotId, user, requestId, r2);
    return c.json({ ...result, requestId });
  } catch (err) {
    return handleError(err, c, requestId);
  }
});

