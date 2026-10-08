import { Context, Hono } from 'hono';
import { deleteCookie, getCookie, setCookie } from 'hono/cookie';
import { z } from 'zod';
import { Env, Variables } from '../types';
import { requireAuth } from '../middleware/auth';
import { INITIAL_PASSWORD, hashPassword, validateNewPassword, verifyPassword } from '../services/passwordService';
import { sendPasswordResetEmail } from '../services/mailService';
import {
  APP_SESSION_COOKIE,
  createUserSession,
  revokeOtherUserSessions,
  revokeSessionByToken,
} from '../services/sessionService';

export const authRouter = new Hono<{ Bindings: Env; Variables: Variables }>();

type AuthContext = Context<{ Bindings: Env; Variables: Variables }>;
type CredentialRow = {
  id: string;
  email: string;
  full_name: string;
  is_active: number;
  password_hash: string | null;
  must_change_password: number;
  failed_login_attempts: number;
  locked_until: string | null;
};

const loginSchema = z.object({
  email: z.string().trim().email().max(254),
  password: z.string().min(1).max(200),
  rememberMe: z.boolean().optional().default(false),
}).strict();

const changePasswordSchema = z.object({
  currentPassword: z.string().min(1).max(200),
  newPassword: z.string().min(1).max(200),
  confirmPassword: z.string().min(1).max(200),
}).strict();

const forgotPasswordRequestSchema = z.object({
  email: z.string().trim().email().max(254),
}).strict();

const forgotPasswordResetSchema = z.object({
  email: z.string().trim().email().max(254),
  otp: z.string().trim().length(6),
  newPassword: z.string().min(8).max(200),
  confirmPassword: z.string().min(8).max(200),
}).strict();

async function recordPasswordEvent(
  db: D1Database,
  userId: string,
  eventType: 'INITIALIZED' | 'CHANGED' | 'RESET' | 'LOGIN_FAILED' | 'LOCKED',
  requestId: string
) {
  await db.prepare(`
    INSERT INTO password_events (id, user_id, event_type, request_id, created_at)
    VALUES (?, ?, ?, ?, ?)
  `).bind(`pwe-${crypto.randomUUID()}`, userId, eventType, requestId, new Date().toISOString()).run();
}

async function recordAuthEvent(
  db: D1Database,
  userId: string,
  eventType: string,
  requestId: string
) {
  await db.prepare(`
    INSERT INTO audit_events
      (id, entity_type, entity_id, event_type, actor_user_id, request_id, created_at)
    VALUES (?, 'USER', ?, ?, ?, ?, ?)
  `).bind(
    `evt-${crypto.randomUUID()}`,
    userId,
    eventType,
    userId,
    requestId,
    new Date().toISOString()
  ).run();
}

function profilePayload(user: NonNullable<Variables['user']>, requestId: string) {
  return {
    id: user.id,
    email: user.email,
    fullName: user.fullName,
    primaryRole: user.scopes[0]?.role || 'VIEWER',
    isGlobalAccess: user.scopes.some((scope) => scope.role === 'ADMIN' || scope.role === 'AUDITOR_QAS'),
    canManageMaster: user.scopes.some((scope) => scope.role === 'ADMIN' || scope.canManageMaster),
    canManageUsers: user.scopes.some((scope) => scope.role === 'ADMIN' || scope.canManageUsers),
    mustChangePassword: user.mustChangePassword,
    scopes: user.scopes,
    requestId,
  };
}

async function handleLogin(c: AuthContext) {
  const requestId = c.get('requestId');
  const db = c.env.DB;
  if (!db) {
    return c.json({ success: false, error: { code: 'DATABASE_UNAVAILABLE', message: 'Database tidak tersedia.', requestId } }, 500);
  }
  const body = await c.req.json().catch(() => null);
  const parsed = loginSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Email atau password tidak valid.', requestId } }, 400);
  }
  const email = parsed.data.email.toLowerCase();
  let credential: CredentialRow | null;
  try {
    credential = await db.prepare(`
      SELECT id, email, full_name, is_active, password_hash, must_change_password,
        failed_login_attempts, locked_until
      FROM users WHERE LOWER(email) = ? LIMIT 1
    `).bind(email).first<CredentialRow>();
  } catch (error) {
    console.error(`[AUTH_LOGIN] Skema autentikasi belum siap [${requestId}]`, error);
    return c.json({ success: false, error: { code: 'AUTH_SCHEMA_NOT_READY', message: 'Layanan login sedang disiapkan.', requestId } }, 503);
  }

  if (!credential) {
    await hashPassword(parsed.data.password);
    return c.json({ success: false, error: { code: 'INVALID_CREDENTIALS', message: 'Email atau password salah.', requestId } }, 401);
  }
  if (credential.is_active !== 1) {
    return c.json({ success: false, error: { code: 'ACCOUNT_INACTIVE', message: 'Akun tidak aktif.', requestId } }, 403);
  }
  if (credential.locked_until && new Date(credential.locked_until).getTime() > Date.now()) {
    return c.json({ success: false, error: { code: 'ACCOUNT_TEMPORARILY_LOCKED', message: 'Akun dikunci sementara. Coba kembali beberapa saat lagi.', requestId } }, 429);
  }

  const validPassword = credential.password_hash
    ? await verifyPassword(parsed.data.password, credential.password_hash)
    : parsed.data.password === INITIAL_PASSWORD;
  if (!validPassword) {
    const failedAttempts = credential.failed_login_attempts + 1;
    const lockedUntil = failedAttempts >= 5
      ? new Date(Date.now() + 15 * 60 * 1000).toISOString()
      : null;
    await db.prepare('UPDATE users SET failed_login_attempts = ?, locked_until = ?, updated_at = ? WHERE id = ?')
      .bind(failedAttempts, lockedUntil, new Date().toISOString(), credential.id)
      .run();
    await recordPasswordEvent(db, credential.id, lockedUntil ? 'LOCKED' : 'LOGIN_FAILED', requestId);
    return c.json({
      success: false,
      error: {
        code: lockedUntil ? 'ACCOUNT_TEMPORARILY_LOCKED' : 'INVALID_CREDENTIALS',
        message: lockedUntil ? 'Akun dikunci sementara. Coba kembali 15 menit lagi.' : 'Email atau password salah.',
        requestId,
      },
    }, lockedUntil ? 429 : 401);
  }

  let storedHash = credential.password_hash;
  if (!storedHash) {
    storedHash = await hashPassword(parsed.data.password);
    await recordPasswordEvent(db, credential.id, 'INITIALIZED', requestId);
  }
  const now = new Date().toISOString();
  await db.prepare(`
    UPDATE users SET password_hash = ?, failed_login_attempts = 0, locked_until = NULL,
      last_login_at = ?, updated_at = ? WHERE id = ?
  `).bind(storedHash, now, now, credential.id).run();

  const session = await createUserSession(db, credential.id, parsed.data.rememberMe, c.req.header('user-agent'));
  setCookie(c, APP_SESSION_COOKIE, session.token, {
    httpOnly: true,
    secure: true,
    sameSite: 'Lax',
    path: '/',
    maxAge: session.maxAge,
  });
  c.header('Cache-Control', 'no-store');
  await recordAuthEvent(db, credential.id, 'AUTH_LOGIN', requestId);
  return c.json({
    success: true,
    data: {
      id: credential.id,
      email: credential.email,
      fullName: credential.full_name,
      mustChangePassword: credential.must_change_password === 1,
      expiresAt: session.expiresAt,
    },
    requestId,
  });
}

authRouter.post('/login', handleLogin);
authRouter.post('/auth/login', handleLogin);

authRouter.post('/auth/change-password', requireAuth, async (c) => {
  const requestId = c.get('requestId');
  const db = c.env.DB;
  const user = c.get('user');
  if (!db || !user) {
    return c.json({ success: false, error: { code: 'DATABASE_UNAVAILABLE', message: 'Database tidak tersedia.', requestId } }, 500);
  }
  const parsed = changePasswordSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success || parsed.data.newPassword !== parsed.data.confirmPassword) {
    return c.json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Konfirmasi password tidak sesuai.', requestId } }, 400);
  }
  const passwordError = validateNewPassword(parsed.data.newPassword);
  if (passwordError) {
    return c.json({ success: false, error: { code: 'WEAK_PASSWORD', message: passwordError, requestId } }, 400);
  }
  const row = await db.prepare('SELECT password_hash FROM users WHERE id = ?')
    .bind(user.id)
    .first<{ password_hash: string | null }>();
  const currentValid = row?.password_hash
    ? await verifyPassword(parsed.data.currentPassword, row.password_hash)
    : parsed.data.currentPassword === INITIAL_PASSWORD;
  if (!currentValid) {
    return c.json({ success: false, error: { code: 'CURRENT_PASSWORD_INVALID', message: 'Password lama tidak sesuai.', requestId } }, 401);
  }
  const newHash = await hashPassword(parsed.data.newPassword);
  const now = new Date().toISOString();
  await db.prepare(`
    UPDATE users SET password_hash = ?, must_change_password = 0, password_changed_at = ?,
      failed_login_attempts = 0, locked_until = NULL, updated_at = ? WHERE id = ?
  `).bind(newHash, now, now, user.id).run();
  await revokeOtherUserSessions(db, user.id, c.get('sessionId'));
  await recordPasswordEvent(db, user.id, 'CHANGED', requestId);
  await recordAuthEvent(db, user.id, 'PASSWORD_CHANGED', requestId);
  c.header('Cache-Control', 'no-store');
  return c.json({ success: true, data: { mustChangePassword: false }, requestId });
});

authRouter.post('/auth/forgot-password/request', async (c) => {
  const requestId = c.get('requestId');
  const db = c.env.DB;
  if (!db) {
    return c.json({ success: false, error: { code: 'DATABASE_UNAVAILABLE', message: 'Database tidak tersedia.', requestId } }, 500);
  }
  const body = await c.req.json().catch(() => null);
  const parsed = forgotPasswordRequestSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Format email tidak valid.', requestId } }, 400);
  }
  const email = parsed.data.email.toLowerCase();
  const user = await db.prepare('SELECT id, email, full_name, is_active FROM users WHERE LOWER(email) = ? LIMIT 1')
    .bind(email).first<{ id: string; email: string; full_name?: string; is_active: number }>();
  if (!user || user.is_active !== 1) {
    return c.json({ success: false, error: { code: 'USER_NOT_FOUND', message: 'Email kantor tidak terdaftar dalam sistem.', requestId } }, 404);
  }

  const otpArray = new Uint32Array(1);
  crypto.getRandomValues(otpArray);
  const otp = String(100000 + (otpArray[0] % 900000));

  // Mengirimkan email transaksional langsung ke email yang diinputkan pengguna
  const mailResult = await sendPasswordResetEmail(c.env, email, otp, user.full_name);
  if (!mailResult.delivered) {
    return c.json({
      success: false,
      error: { code: 'MAIL_DELIVERY_FAILED', message: `Gagal mengirim email ke ${email}. ${mailResult.error || ''}`, requestId },
    }, 500);
  }

  await recordPasswordEvent(db, user.id, 'RESET', requestId);
  return c.json({
    success: true,
    message: `Kode verifikasi OTP 6-digit telah dikirimkan ke email ${email}. Silakan periksa kotak masuk Anda.`,
    simulatedOtp: c.env.ENVIRONMENT === 'test' || !c.env.MAIL_API_KEY ? otp : undefined,
    requestId,
  });
});

authRouter.post('/auth/forgot-password/reset', async (c) => {
  const requestId = c.get('requestId');
  const db = c.env.DB;
  if (!db) {
    return c.json({ success: false, error: { code: 'DATABASE_UNAVAILABLE', message: 'Database tidak tersedia.', requestId } }, 500);
  }
  const body = await c.req.json().catch(() => null);
  const parsed = forgotPasswordResetSchema.safeParse(body);
  if (!parsed.success || parsed.data.newPassword !== parsed.data.confirmPassword) {
    return c.json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Konfirmasi password baru tidak sesuai.', requestId } }, 400);
  }
  if (parsed.data.newPassword === INITIAL_PASSWORD) {
    return c.json({ success: false, error: { code: 'WEAK_PASSWORD', message: 'Password baru tidak boleh sama dengan password awal (12345).', requestId } }, 400);
  }
  const passwordError = validateNewPassword(parsed.data.newPassword);
  if (passwordError) {
    return c.json({ success: false, error: { code: 'WEAK_PASSWORD', message: passwordError, requestId } }, 400);
  }

  const email = parsed.data.email.toLowerCase();
  const user = await db.prepare('SELECT id, is_active FROM users WHERE LOWER(email) = ? LIMIT 1')
    .bind(email).first<{ id: string; is_active: number }>();
  if (!user || user.is_active !== 1) {
    return c.json({ success: false, error: { code: 'USER_NOT_FOUND', message: 'Email tidak ditemukan.', requestId } }, 404);
  }

  const newHash = await hashPassword(parsed.data.newPassword);
  const now = new Date().toISOString();
  await db.prepare(`
    UPDATE users SET password_hash = ?, must_change_password = 0, password_changed_at = ?,
      failed_login_attempts = 0, locked_until = NULL, updated_at = ? WHERE id = ?
  `).bind(newHash, now, now, user.id).run();

  await recordPasswordEvent(db, user.id, 'CHANGED', requestId);
  await recordAuthEvent(db, user.id, 'PASSWORD_RESET_SELF_SERVICE', requestId);
  return c.json({ success: true, message: 'Password berhasil diperbarui.', requestId });
});

authRouter.post('/auth/logout', async (c) => {
  const requestId = c.get('requestId');
  const token = getCookie(c, APP_SESSION_COOKIE);
  const user = c.get('user');
  if (token && c.env.DB) await revokeSessionByToken(c.env.DB, token);
  if (user && c.env.DB) await recordAuthEvent(c.env.DB, user.id, 'AUTH_LOGOUT', requestId);
  deleteCookie(c, APP_SESSION_COOKIE, { path: '/', secure: true });
  c.header('Cache-Control', 'no-store');
  return c.json({ success: true, requestId });
});

/**
 * GET /api/me
 * Mengembalikan profil pengguna yang diautentikasi beserta seluruh cakupan peran & depo
 */
authRouter.get('/me', requireAuth, (c) => {
  const user = c.get('user')!;
  const requestId = c.get('requestId');

  return c.json({
    success: true,
    data: profilePayload(user, requestId),
  });
});

// Canonical identity endpoint used by the SPA during bootstrap.
authRouter.get('/auth/me', requireAuth, (c) => {
  const user = c.get('user')!;
  return c.json({
    success: true,
    data: profilePayload(user, c.get('requestId')),
  });
});

/**
 * GET /api/depots
 * Mengembalikan daftar depo yang berhak diakses oleh pengguna saat ini
 */
authRouter.get('/depots', requireAuth, async (c) => {
  const user = c.get('user')!;
  const requestId = c.get('requestId');
  const db = c.env.DB;

  if (!db) {
    return c.json(
      {
        success: false,
        error: {
          code: 'DATABASE_UNAVAILABLE',
          message: 'Koneksi database D1 tidak tersedia.',
          requestId,
        },
      },
      500
    );
  }

  const isGlobal = user.scopes.some((s) => s.role === 'ADMIN' || s.role === 'AUDITOR_QAS');

  if (isGlobal) {
    // Admin dan Auditor dapat melihat seluruh depo aktif
    const result = await db
      .prepare('SELECT id, code, name, is_active FROM depots WHERE is_active = 1 ORDER BY code')
      .all<{ id: string; code: string; name: string; is_active: number }>();

    return c.json({
      success: true,
      data: result.results || [],
      requestId,
    });
  }

  // PIC QAS hanya dapat melihat depo yang ditugaskan kepadanya
  const result = await db
    .prepare(
      `SELECT DISTINCT d.id, d.code, d.name, d.is_active
       FROM depots d
       JOIN user_role_scopes s ON d.id = s.depot_id
       WHERE s.user_id = ? AND d.is_active = 1
       ORDER BY d.code`
    )
    .bind(user.id)
    .all<{ id: string; code: string; name: string; is_active: number }>();

  return c.json({
    success: true,
    data: result.results || [],
    requestId,
  });
});
