import { Hono } from 'hono';
import { Env, Variables } from '../types';

export const healthRouter = new Hono<{ Bindings: Env; Variables: Variables }>();

healthRouter.get('/health', (c) => {
  const requestId = c.get('requestId');
  const env = c.env?.ENVIRONMENT || 'development';
  const version = c.env?.APP_VERSION || '1.0.0';

  return c.json({
    success: true,
    data: {
      status: 'healthy',
      app: 'qas-audit-app',
      environment: env,
      version: version,
      timestamp: new Date().toISOString(),
      requestId,
    },
  });
});
