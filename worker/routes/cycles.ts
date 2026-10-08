import { Hono, Context } from 'hono';
import { ContentfulStatusCode } from 'hono/utils/http-status';
import { ZodError } from 'zod';
import { Env, Variables } from '../types';
import { requireAuth } from '../middleware/auth';
import {
  createCycleSchema,
  startAuditSchema,
} from '../validators/auditSchemas';
import {
  AuditError,
  listCycles,
  getCycleById,
  createCycle,
  startOrGetSelfAudit,
  startOrGetOfficialAudit,
} from '../services/auditService';

export const cycleRouter = new Hono<{ Bindings: Env; Variables: Variables }>();

// All cycle routes require authentication
cycleRouter.use('/cycles/*', requireAuth);
cycleRouter.use('/cycles', requireAuth);

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

// 1. List Cycles
cycleRouter.get('/cycles', async (c) => {
  const db = c.env.DB;
  const user = c.get('user')!;
  const requestId = c.get('requestId');

  if (!db) {
    return c.json({ success: false, error: { code: 'DATABASE_UNAVAILABLE', message: 'D1 DB tidak tersedia.', requestId } }, 503);
  }

  try {
    const data = await listCycles(db, user);
    return c.json({ success: true, data, requestId });
  } catch (err) {
    return handleError(err, c, requestId);
  }
});

// 2. Create Cycle (Admin / Auditor)
cycleRouter.post('/cycles', async (c) => {
  const db = c.env.DB;
  const user = c.get('user')!;
  const requestId = c.get('requestId');

  if (!db) {
    return c.json({ success: false, error: { code: 'DATABASE_UNAVAILABLE', message: 'D1 DB tidak tersedia.', requestId } }, 503);
  }

  try {
    const body = await c.req.json();
    const validated = createCycleSchema.parse(body);
    const data = await createCycle(db, validated, user, requestId);
    return c.json({ success: true, data, requestId }, 201);
  } catch (err) {
    return handleError(err, c, requestId);
  }
});

// 3. Get Cycle Detail
cycleRouter.get('/cycles/:id', async (c) => {
  const db = c.env.DB;
  const user = c.get('user')!;
  const requestId = c.get('requestId');
  const cycleId = c.req.param('id');

  if (!db) {
    return c.json({ success: false, error: { code: 'DATABASE_UNAVAILABLE', message: 'D1 DB tidak tersedia.', requestId } }, 503);
  }

  try {
    const data = await getCycleById(db, cycleId, user);
    return c.json({ success: true, data, requestId });
  } catch (err) {
    return handleError(err, c, requestId);
  }
});

// 4. Start / Get Self Audit Slot
cycleRouter.post('/cycles/:id/self', async (c) => {
  const db = c.env.DB;
  const user = c.get('user')!;
  const requestId = c.get('requestId');
  const cycleId = c.req.param('id');

  if (!db) {
    return c.json({ success: false, error: { code: 'DATABASE_UNAVAILABLE', message: 'D1 DB tidak tersedia.', requestId } }, 503);
  }

  try {
    let depotId: string | undefined;
    try {
      const body = await c.req.json();
      const parsed = startAuditSchema.parse(body);
      depotId = parsed.depot_id;
    } catch {
      // Body may be empty if PIC triggers self audit for their default assigned depot
    }

    const data = await startOrGetSelfAudit(db, cycleId, depotId, user, requestId);
    return c.json({ success: true, data, requestId });
  } catch (err) {
    return handleError(err, c, requestId);
  }
});

// 5. Start / Get Official Audit Slot (Requires Self Audit SUBMITTED)
cycleRouter.post('/cycles/:id/official', async (c) => {
  const db = c.env.DB;
  const user = c.get('user')!;
  const requestId = c.get('requestId');
  const cycleId = c.req.param('id');

  if (!db) {
    return c.json({ success: false, error: { code: 'DATABASE_UNAVAILABLE', message: 'D1 DB tidak tersedia.', requestId } }, 503);
  }

  try {
    const body = await c.req.json();
    const parsed = startAuditSchema.parse(body);
    if (!parsed.depot_id) {
      throw new AuditError('DEPOT_REQUIRED', 'Depot ID wajib ditentukan untuk audit resmi.', 400);
    }

    const data = await startOrGetOfficialAudit(db, cycleId, parsed.depot_id, user, requestId);
    return c.json({ success: true, data, requestId });
  } catch (err) {
    return handleError(err, c, requestId);
  }
});
