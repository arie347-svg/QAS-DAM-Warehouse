import { MiddlewareHandler } from 'hono';

/**
 * Security Headers Middleware for Cloudflare Workers.
 * Enforces defense-in-depth security standards:
 * - Content-Security-Policy (CSP)
 * - X-Content-Type-Options: nosniff
 * - X-Frame-Options: DENY
 * - Referrer-Policy: strict-origin-when-cross-origin
 * - Strict-Transport-Security: max-age=31536000; includeSubDomains
 * - Permissions-Policy: camera=(self), microphone=(), geolocation=()
 * - X-XSS-Protection: 0
 */
export const securityHeadersMiddleware: MiddlewareHandler = async (c, next) => {
  await next();

  // CSP: Allow self, inline styles, Google Fonts, and images from data/blob
  const csp = [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline'",
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' https://fonts.gstatic.com data:",
    "img-src 'self' data: blob:",
    "connect-src 'self'",
    "frame-ancestors 'none'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
  ].join('; ');

  c.res.headers.set('Content-Security-Policy', csp);
  c.res.headers.set('X-Content-Type-Options', 'nosniff');
  c.res.headers.set('X-Frame-Options', 'DENY');
  c.res.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  c.res.headers.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  c.res.headers.set('Permissions-Policy', 'camera=(self), microphone=(), geolocation=()');
  c.res.headers.set('X-XSS-Protection', '0');
};
