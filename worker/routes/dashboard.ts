import { Hono, Context } from 'hono';
import { ContentfulStatusCode } from 'hono/utils/http-status';
import { Env, Variables } from '../types';
import { requireAuth } from '../middleware/auth';
import { AuditError } from '../services/auditService';
import { getDashboardMetrics, exportAuditsCsv, getAuditExportReportData } from '../services/dashboardService';

export const dashboardRouter = new Hono<{ Bindings: Env; Variables: Variables }>();

dashboardRouter.use('/dashboard', requireAuth);
dashboardRouter.use('/exports/*', requireAuth);

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

// 1. Get Aggregated Dashboard Metrics
dashboardRouter.get('/dashboard', async (c) => {
  const db = c.env.DB;
  const user = c.get('user')!;
  const requestId = c.get('requestId');

  if (!db) {
    return c.json(
      { success: false, error: { code: 'DATABASE_UNAVAILABLE', message: 'D1 DB tidak tersedia.', requestId } },
      503
    );
  }

  const cycleId = c.req.query('cycle_id') || undefined;
  const depotId = c.req.query('depot_id') || undefined;
  const status = c.req.query('status') || undefined;

  try {
    const data = await getDashboardMetrics(db, { cycleId, depotId, status }, user);
    return c.json({ success: true, data, requestId });
  } catch (err) {
    return handleError(err, c, requestId);
  }
});

// 2. Export Audits to CSV
dashboardRouter.get('/exports/audits.csv', async (c) => {
  const db = c.env.DB;
  const user = c.get('user')!;
  const requestId = c.get('requestId');

  if (!db) {
    return c.json(
      { success: false, error: { code: 'DATABASE_UNAVAILABLE', message: 'D1 DB tidak tersedia.', requestId } },
      503
    );
  }

  const cycleId = c.req.query('cycle_id') || undefined;
  const depotId = c.req.query('depot_id') || undefined;
  const status = c.req.query('status') || undefined;

  try {
    const csvContent = await exportAuditsCsv(db, { cycleId, depotId, status }, user, requestId);
    const filename = `qas_audits_${new Date().toISOString().slice(0, 10)}.csv`;

    return new Response(csvContent, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Cache-Control': 'no-store',
      },
    });
  } catch (err) {
    return handleError(err, c, requestId);
  }
});

// 3. Export Audits Structured Report Data (JSON for Excel Generation & Offline / Client Processing)
dashboardRouter.get('/exports/audits-report-data', async (c) => {
  const db = c.env.DB;
  const user = c.get('user')!;
  const requestId = c.get('requestId');

  if (!db) {
    return c.json(
      { success: false, error: { code: 'DATABASE_UNAVAILABLE', message: 'D1 DB tidak tersedia.', requestId } },
      503
    );
  }

  const cycleId = c.req.query('cycle_id') || undefined;
  const year = c.req.query('year') || undefined;
  const month = c.req.query('month') || undefined;
  const depotId = c.req.query('depot_id') || undefined;
  const auditType = (c.req.query('audit_type') as 'RECONCILIATION' | 'SELF' | 'OFFICIAL') || 'RECONCILIATION';

  try {
    const data = await getAuditExportReportData(db, { cycleId, year, month, depotId, auditType }, user, requestId);
    return c.json({ success: true, data, requestId });
  } catch (err) {
    return handleError(err, c, requestId);
  }
});

