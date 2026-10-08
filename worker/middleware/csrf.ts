import { MiddlewareHandler } from 'hono';
import { Env, Variables } from '../types';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/** Rejects cross-site state changes when authentication comes from the app cookie. */
export const csrfProtectionMiddleware: MiddlewareHandler<{ Bindings: Env; Variables: Variables }> = async (
  c,
  next
) => {
  if (SAFE_METHODS.has(c.req.method) || c.get('authMethod') !== 'APP_SESSION') {
    await next();
    return;
  }

  const fetchSite = c.req.header('sec-fetch-site');
  const origin = c.req.header('origin');
  const expectedOrigin = new URL(c.req.url).origin;
  const crossSite = fetchSite === 'cross-site' || (origin !== undefined && origin !== expectedOrigin);
  if (crossSite) {
    return c.json(
      {
        success: false,
        error: {
          code: 'CSRF_REJECTED',
          message: 'Permintaan lintas situs ditolak.',
          requestId: c.get('requestId'),
        },
      },
      403
    );
  }

  await next();
};
