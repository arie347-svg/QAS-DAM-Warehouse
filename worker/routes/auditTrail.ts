import { Hono, Context } from 'hono';
import { ContentfulStatusCode } from 'hono/utils/http-status';
import { Env, Variables } from '../types';
import { requireAuth } from '../middleware/auth';
import {
  AuditTrailError,
  getAuditTimeline,
  listAuditEvents,
} from '../services/auditTrailService';

export const auditTrailRouter = new Hono<{ Bindings: Env; Variables: Variables }>();

// All audit trail routes require authentication
auditTrailRouter.use('/audits/:id/events', requireAuth);
auditTrailRouter.use('/audit-events', requireAuth);

function handleError(
  err: unknown,
  c: Context<{ Bindings: Env; Variables: Variables }>,
  requestId: string
) {
  if (err instanceof AuditTrailError) {
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

  const message = err instanceof Error ? err.message : String(err);
  return c.json(
    {
      success: false,
      error: {
        code: 'INTERNAL_SERVER_ERROR',
        message: `Terjadi kesalahan saat memproses log audit trail: ${message}`,
        requestId,
      },
    },
    500
  );
}

// 1. Get Audit Timeline (Specific to an audit with scope and blind protection)
auditTrailRouter.get('/audits/:id/events', async (c) => {
  const db = c.env.DB;
  const user = c.get('user')!;
  const requestId = c.get('requestId');
  const auditId = c.req.param('id');

  if (!db) {
    return c.json(
      {
        success: false,
        error: { code: 'DATABASE_UNAVAILABLE', message: 'D1 DB tidak tersedia.', requestId },
      },
      503
    );
  }

  try {
    const data = await getAuditTimeline(db, auditId, user);
    return c.json({ success: true, data, requestId });
  } catch (err) {
    return handleError(err, c, requestId);
  }
});

// 2. Query System-wide Audit Events (Restricted to Auditor QAS and Administrator)
auditTrailRouter.get('/audit-events', async (c) => {
  const db = c.env.DB;
  const user = c.get('user')!;
  const requestId = c.get('requestId');

  if (!db) {
    return c.json(
      {
        success: false,
        error: { code: 'DATABASE_UNAVAILABLE', message: 'D1 DB tidak tersedia.', requestId },
      },
      503
    );
  }

  try {
    const entityType = c.req.query('entity_type');
    const entityId = c.req.query('entity_id');
    const eventType = c.req.query('event_type');
    const limit = c.req.query('limit') ? parseInt(c.req.query('limit')!, 10) : 50;
    const offset = c.req.query('offset') ? parseInt(c.req.query('offset')!, 10) : 0;

    const data = await listAuditEvents(
      db,
      {
        entityType,
        entityId,
        eventType,
        limit,
        offset,
      },
      user
    );

    return c.json({ success: true, data, requestId });
  } catch (err) {
    return handleError(err, c, requestId);
  }
});
