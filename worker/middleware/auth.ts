import { MiddlewareHandler, Context } from 'hono';
import { Env, Variables, UserRole } from '../types';
import { verifyAccessJwt } from '../services/jwtService';
import { findUserWithScopesByEmail } from '../repositories/userRepository';
import { APP_SESSION_COOKIE, resolveUserSession } from '../services/sessionService';

/**
 * Global authentication resolver middleware.
 * Verifies JWT token and resolves user + scopes from D1 without blocking public endpoints.
 */
interface CloudflareAccessContext {
  getIdentity?: () => Promise<{ email?: string; [key: string]: unknown } | null | undefined>;
  getUser?: () => Promise<{ email?: string; [key: string]: unknown } | null | undefined>;
  email?: string;
}

function getContextAccess(c: Context<{ Bindings: Env; Variables: Variables }>): CloudflareAccessContext | undefined {
  try {
    const execCtx = c.executionCtx as { access?: CloudflareAccessContext } | undefined;
    if (execCtx?.access) return execCtx.access;
  } catch {
    // Hono throws 'This context has no ExecutionContext' if execution context is omitted
  }
  try {
    const reqRaw = c.req.raw as { cf?: { access?: CloudflareAccessContext }; access?: CloudflareAccessContext } | undefined;
    if (reqRaw?.cf?.access) return reqRaw.cf.access;
    if (reqRaw?.access) return reqRaw.access;
  } catch {
    // ignore
  }
  const contextObj = c as unknown as { access?: CloudflareAccessContext };
  if (contextObj.access) return contextObj.access;
  const envObj = c.env as unknown as { access?: CloudflareAccessContext } | undefined;
  if (envObj?.access) return envObj.access;
  return undefined;
}

function getCookieValue(cookieHeader: string | undefined, name: string): string | undefined {
  if (!cookieHeader) return undefined;
  const match = cookieHeader.match(new RegExp(`(?:^|;\\s*)${name}=([^;]+)`));
  return match ? decodeURIComponent(match[1]) : undefined;
}

/**
 * Global authentication resolver middleware.
 * Verifies ctx.access identity or JWT token / cookie and resolves user + scopes from D1.
 */
export const authResolverMiddleware: MiddlewareHandler<{ Bindings: Env; Variables: Variables }> = async (
  c,
  next
) => {
  const requestId = c.get('requestId') || 'unknown';
  let resolvedEmail: string | undefined;
  const cookieHeader = c.req.header('cookie');
  const appSessionCookie = getCookieValue(cookieHeader, APP_SESSION_COOKIE);

  // 1. Application session. During migration Cloudflare Access remains a
  // trusted fallback, so an expired application cookie never blocks Access.
  if (appSessionCookie && c.env.DB) {
    try {
      const resolvedSession = await resolveUserSession(c.env.DB, appSessionCookie);
      if (resolvedSession) {
        c.set('user', resolvedSession.user);
        c.set('sessionId', resolvedSession.sessionId);
        c.set('authMethod', 'APP_SESSION');
      }
    } catch (err: unknown) {
      console.warn(`[AUTH] Gagal membaca application session [${requestId}]:`, err);
    }
  }

  // 2. Cloudflare Access execution context, retained during the staged migration.
  const ctxAccess = getContextAccess(c);
  if (!c.get('user') && ctxAccess) {
    try {
      if (typeof ctxAccess.getIdentity === 'function') {
        const identity = await ctxAccess.getIdentity();
        if (identity && typeof identity.email === 'string') {
          resolvedEmail = identity.email;
        }
      } else if (typeof ctxAccess.getUser === 'function') {
        const user = await ctxAccess.getUser();
        if (user && typeof user.email === 'string') {
          resolvedEmail = user.email;
        }
      } else if (typeof ctxAccess.email === 'string') {
        resolvedEmail = ctxAccess.email;
      }
    } catch (err: unknown) {
      console.warn('[AUTH] Gagal membaca ctx.access identity:', err);
    }
  }

  // 3. Cloudflare Access assertion/cookie fallback. Every token is validated
  // against the configured Access issuer, audience and JWKS in production.
  const accessHeader = c.req.header('cf-access-jwt-assertion');
  const testBearer = c.env?.ENVIRONMENT === 'test'
    ? c.req.header('authorization')?.replace(/^Bearer\s+/i, '')
    : undefined;
  const cfAuthCookie = getCookieValue(cookieHeader, 'CF_Authorization');
  const jwtAssertion = accessHeader || cfAuthCookie || testBearer;

  if (!c.get('user') && !resolvedEmail && jwtAssertion) {
    try {
      const verified = await verifyAccessJwt(jwtAssertion, c.env);
      if (verified && verified.email) {
        resolvedEmail = verified.email;
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      console.warn(`[AUTH] Verifikasi JWT fallback gagal: ${message}`);
      c.set('authError', message);
    }
  }

  // Unverified identity headers and application-provided email are deliberately
  // ignored. X-Dev-Email is never an authentication mechanism, including dev.

  // 4. Resolve a verified Access identity from D1.
  if (!c.get('user') && resolvedEmail && c.env.DB) {
    const cleanEmail = resolvedEmail.trim().toLowerCase();
    const user = await findUserWithScopesByEmail(c.env.DB, cleanEmail);
    if (user) {
      c.set('user', user);
      c.set('authMethod', 'CLOUDFLARE_ACCESS');
    } else {
      c.set('unmappedEmail', cleanEmail);
    }
  }

  // 5. Safe logging (booleans only, zero token/cookie leak)
  const safeLog = {
    ctxAccessPresent: Boolean(ctxAccess && (typeof ctxAccess.getIdentity === 'function' || typeof ctxAccess.getUser === 'function' || typeof ctxAccess.email === 'string')),
    accessHeaderPresent: Boolean(accessHeader),
    authorizationCookiePresent: Boolean(cfAuthCookie),
    appSessionPresent: Boolean(appSessionCookie),
    authMethod: c.get('authMethod') || 'NONE',
    identityResolved: Boolean(c.get('user')),
    requestOrigin: c.req.header('origin') || c.req.header('referer') || 'same-origin',
    requestPath: c.req.path,
    requestId,
  };
  console.log('[AUTH_AUDIT]', JSON.stringify(safeLog));

  await next();
};

/**
 * Guard: Requires valid authentication and active user status.
 */
export const requireAuth: MiddlewareHandler<{ Bindings: Env; Variables: Variables }> = async (c, next) => {
  const requestId = c.get('requestId') || 'unknown';
  const user = c.get('user');
  const authError = c.get('authError');

  if (authError) {
    return c.json(
      {
        success: false,
        error: {
          code: 'UNAUTHORIZED_INVALID_TOKEN',
          message: 'Token autentikasi tidak valid atau sudah kedaluwarsa.',
          requestId,
        },
      },
      401
    );
  }

  if (!user) {
    const unmappedEmail = c.get('unmappedEmail');
    if (unmappedEmail) {
      return c.json(
        {
          success: false,
          error: {
            code: 'USER_NOT_MAPPED',
            message: 'Akun Anda tidak aktif atau belum terdaftar dalam sistem Audit QAS.',
            requestId,
          },
        },
        403
      );
    }

    return c.json(
      {
        success: false,
        error: {
          code: 'ACCESS_IDENTITY_MISSING',
          message: 'Identitas Cloudflare Access tidak ditemukan. Autentikasi diperlukan.',
          requestId,
        },
      },
      401
    );
  }

  if (!user.isActive) {
    return c.json(
      {
        success: false,
        error: {
          code: 'FORBIDDEN_USER_INACTIVE',
          message: 'Akun pengguna Anda telah dinonaktifkan oleh Administrator.',
          requestId,
        },
      },
      403
    );
  }

  const passwordChangeAllowed = new Set([
    '/api/me',
    '/api/auth/me',
    '/api/auth/change-password',
    '/api/auth/logout',
  ]);
  if (
    c.get('authMethod') === 'APP_SESSION' &&
    user.mustChangePassword &&
    !passwordChangeAllowed.has(c.req.path)
  ) {
    return c.json(
      {
        success: false,
        error: {
          code: 'PASSWORD_CHANGE_REQUIRED',
          message: 'Password awal wajib diganti sebelum menggunakan aplikasi.',
          requestId,
        },
      },
      403
    );
  }

  await next();
};

/**
 * Guard: Enforces user role RBAC.
 */
export function requireRole(allowedRoles: UserRole[]): MiddlewareHandler<{ Bindings: Env; Variables: Variables }> {
  return async (c, next) => {
    const user = c.get('user');
    const requestId = c.get('requestId') || 'unknown';

    if (!user) {
      return c.json(
        {
          success: false,
          error: {
            code: 'ACCESS_IDENTITY_MISSING',
            message: 'Autentikasi diperlukan.',
            requestId,
          },
        },
        401
      );
    }

    const hasRole = user.scopes.some((s) => allowedRoles.includes(s.role));
    if (!hasRole) {
      return c.json(
        {
          success: false,
          error: {
            code: 'FORBIDDEN_INSUFFICIENT_ROLE',
            message: `Hak akses ditolak. Diperlukan peran: ${allowedRoles.join(', ')}.`,
            requestId,
          },
        },
        403
      );
    }

    await next();
  };
}

/**
 * Guard: Enforces depot scope isolation (Zero Trust Cross-Depot Protection).
 * Admin and Auditor have access to all depots; PIC QAS is restricted strictly to their assigned depot.
 */
export function requireDepotScope(
  depotIdSource: (c: Context<{ Bindings: Env; Variables: Variables }>) => string | undefined
): MiddlewareHandler<{ Bindings: Env; Variables: Variables }> {
  return async (c, next) => {
    const user = c.get('user');
    const requestId = c.get('requestId') || 'unknown';
    const targetDepotId = depotIdSource(c);

    if (!user) {
      return c.json({ success: false, error: { code: 'ACCESS_IDENTITY_MISSING', message: 'Autentikasi diperlukan.', requestId } }, 401);
    }

    // Admins and Auditors have cross-depot authority
    const hasGlobalAuthority = user.scopes.some((s) => s.role === 'ADMIN' || s.role === 'AUDITOR_QAS');
    if (hasGlobalAuthority) {
      await next();
      return;
    }

    // For PIC QAS, check if targetDepotId matches their assigned depot
    const hasDepotAccess = user.scopes.some(
      (s) => s.role === 'PIC_QAS' && s.depotId && s.depotId === targetDepotId
    );

    if (!hasDepotAccess) {
      return c.json(
        {
          success: false,
          error: {
            code: 'FORBIDDEN_DEPOT_ACCESS',
            message: 'Akses ditolak: Anda tidak memiliki izin untuk mengelola atau melihat data depo ini.',
            requestId,
          },
        },
        403
      );
    }

    await next();
  };
}

/**
 * Guard: Enforces master management authority (Admin or Auditor with can_manage_master).
 */
export const requireMasterManager: MiddlewareHandler<{ Bindings: Env; Variables: Variables }> = async (
  c,
  next
) => {
  const user = c.get('user');
  const requestId = c.get('requestId') || 'unknown';

  if (!user) {
    return c.json({ success: false, error: { code: 'ACCESS_IDENTITY_MISSING', message: 'Autentikasi diperlukan.', requestId } }, 401);
  }

  const canManage = user.scopes.some((s) => s.role === 'ADMIN' || s.canManageMaster);
  if (!canManage) {
    return c.json(
      {
        success: false,
        error: {
          code: 'FORBIDDEN_MASTER_MANAGEMENT',
          message: 'Hanya Administrator atau Auditor yang memiliki wewenang khusus yang dapat mengelola master template.',
          requestId,
        },
      },
      403
    );
  }

  await next();
};

/**
 * Guard: Enforces user management authority from database-backed role scopes.
 */
export const requireUserManager: MiddlewareHandler<{ Bindings: Env; Variables: Variables }> = async (
  c,
  next
) => {
  const user = c.get('user');
  const requestId = c.get('requestId') || 'unknown';

  if (!user) {
    return c.json({ success: false, error: { code: 'ACCESS_IDENTITY_MISSING', message: 'Autentikasi diperlukan.', requestId } }, 401);
  }

  const isAdminOrAuthorized = user.scopes.some((s) => s.role === 'ADMIN' || s.canManageUsers);

  if (!isAdminOrAuthorized) {
    return c.json(
      {
        success: false,
        error: {
          code: 'FORBIDDEN_USER_MANAGEMENT',
          message: 'Hanya Administrator atau akun dengan wewenang kelola pengguna yang dapat mengelola akun.',
          requestId,
        },
      },
      403
    );
  }

  await next();
};

