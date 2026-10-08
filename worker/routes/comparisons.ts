import { Hono, Context } from 'hono';
import { ContentfulStatusCode } from 'hono/utils/http-status';
import { z, ZodError } from 'zod';
import { Env, Variables } from '../types';
import { requireAuth } from '../middleware/auth';
import { AuditError } from '../services/auditService';
import { getComparison, acknowledgeAuditResult } from '../services/comparisonService';

export const comparisonRouter = new Hono<{ Bindings: Env; Variables: Variables }>();

// Authentication required
comparisonRouter.use('/comparisons/*', requireAuth);
comparisonRouter.use('/audits/:id/acknowledge', requireAuth);

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

// 1. Get Comparison Snapshot for cycle and depot
comparisonRouter.get('/comparisons/:cycleId/:depotId', async (c) => {
  const db = c.env.DB;
  const user = c.get('user')!;
  const requestId = c.get('requestId');
  const cycleId = c.req.param('cycleId');
  const depotId = c.req.param('depotId');

  if (!db) {
    return c.json(
      { success: false, error: { code: 'DATABASE_UNAVAILABLE', message: 'D1 DB tidak tersedia.', requestId } },
      503
    );
  }

  try {
    const data = await getComparison(db, cycleId, depotId, user);
    return c.json({ success: true, data, requestId });
  } catch (err) {
    return handleError(err, c, requestId);
  }
});

const acknowledgeSchema = z.object({
  note: z.string().max(500).optional().nullable(),
});

// 2. PIC Acknowledge Official Audit Result
comparisonRouter.post('/audits/:id/acknowledge', async (c) => {
  const db = c.env.DB;
  const user = c.get('user')!;
  const requestId = c.get('requestId');
  const officialAuditId = c.req.param('id');

  if (!db) {
    return c.json(
      { success: false, error: { code: 'DATABASE_UNAVAILABLE', message: 'D1 DB tidak tersedia.', requestId } },
      503
    );
  }

  try {
    let note: string | null = null;
    try {
      const body = await c.req.json();
      const parsed = acknowledgeSchema.parse(body);
      note = parsed.note ?? null;
    } catch {
      // Body is optional
    }

    const data = await acknowledgeAuditResult(db, officialAuditId, note, user, requestId);
    return c.json({
      success: true,
      data,
      message: 'Hasil audit resmi berhasil dikonfirmasi dan ditandatangani.',
      requestId,
    });
  } catch (err) {
    return handleError(err, c, requestId);
  }
});
