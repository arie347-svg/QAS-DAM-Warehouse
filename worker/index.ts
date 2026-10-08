import { Hono } from 'hono';
import { Env, Variables } from './types';
import { requestIdMiddleware } from './middleware/requestId';
import { securityHeadersMiddleware } from './middleware/securityHeaders';
import { authResolverMiddleware } from './middleware/auth';
import { csrfProtectionMiddleware } from './middleware/csrf';
import { errorHandler } from './middleware/errorHandler';
import { healthRouter } from './routes/health';
import { authRouter } from './routes/auth';
import { templateRouter } from './routes/templates';
import { cycleRouter } from './routes/cycles';
import { auditRouter } from './routes/audits';
import { evidenceRouter } from './routes/evidence';
import { comparisonRouter } from './routes/comparisons';
import { dashboardRouter } from './routes/dashboard';
import { auditTrailRouter } from './routes/auditTrail';
import { usersRouter } from './routes/users';
import { notificationRouter } from './routes/notifications';
import { systemRouter } from './routes/system';

const app = new Hono<{ Bindings: Env; Variables: Variables }>();

// Global Middlewares
app.use('*', requestIdMiddleware);
app.use('*', securityHeadersMiddleware);
app.use('/api/*', authResolverMiddleware);
app.use('/api/*', csrfProtectionMiddleware);

// Error Handler
app.onError(errorHandler);

// API Route Registration
app.route('/api', healthRouter);
app.route('/api', authRouter);
app.route('/api', templateRouter);
app.route('/api', cycleRouter);
app.route('/api', evidenceRouter);
app.route('/api', auditRouter);
app.route('/api', comparisonRouter);
app.route('/api', dashboardRouter);
app.route('/api', auditTrailRouter);
app.route('/api', usersRouter);
app.route('/api', notificationRouter);
app.route('/api', systemRouter);

// Fallback for unmatched API routes
app.all('/api/*', (c) => {
  return c.json(
    {
      success: false,
      error: {
        code: 'NOT_FOUND',
        message: 'Endpoint API tidak ditemukan.',
        requestId: c.get('requestId'),
      },
    },
    404
  );
});

// Fallback for non-API routes: delegate to Cloudflare Worker Static Assets (SPA)
app.all('*', async (c) => {
  if (c.env.ASSETS) {
    return c.env.ASSETS.fetch(c.req.raw);
  }
  return c.text('Not Found', 404);
});

export default app;
