import { AuthUser } from '../types';
import { findUserWithScopesByEmail } from '../repositories/userRepository';

export const APP_SESSION_COOKIE = 'qas_session';
const STANDARD_TTL_SECONDS = 12 * 60 * 60;
const REMEMBER_TTL_SECONDS = 30 * 24 * 60 * 60;

function toBase64Url(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

export async function hashSessionToken(token: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token));
  return toBase64Url(new Uint8Array(digest));
}

export async function createUserSession(
  db: D1Database,
  userId: string,
  rememberMe: boolean,
  userAgent?: string
): Promise<{ id: string; token: string; expiresAt: string; maxAge: number }> {
  const token = toBase64Url(crypto.getRandomValues(new Uint8Array(32)));
  const tokenHash = await hashSessionToken(token);
  const id = `ses-${crypto.randomUUID()}`;
  const now = new Date();
  const maxAge = rememberMe ? REMEMBER_TTL_SECONDS : STANDARD_TTL_SECONDS;
  const expiresAt = new Date(now.getTime() + maxAge * 1000).toISOString();
  await db.prepare(`
    INSERT INTO user_sessions
      (id, user_id, token_hash, remember_me, user_agent, created_at, last_seen_at, expires_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    id,
    userId,
    tokenHash,
    rememberMe ? 1 : 0,
    userAgent?.slice(0, 300) || null,
    now.toISOString(),
    now.toISOString(),
    expiresAt
  ).run();
  return { id, token, expiresAt, maxAge };
}

export async function resolveUserSession(
  db: D1Database,
  token: string
): Promise<{ sessionId: string; user: AuthUser } | null> {
  const tokenHash = await hashSessionToken(token);
  const row = await db.prepare(`
    SELECT s.id, s.user_id, s.expires_at, u.email
    FROM user_sessions s
    JOIN users u ON u.id = s.user_id
    WHERE s.token_hash = ? AND s.revoked_at IS NULL
    LIMIT 1
  `).bind(tokenHash).first<{ id: string; user_id: string; expires_at: string; email: string }>();
  if (!row) return null;
  if (new Date(row.expires_at).getTime() <= Date.now()) {
    await db.prepare('UPDATE user_sessions SET revoked_at = ? WHERE id = ?')
      .bind(new Date().toISOString(), row.id)
      .run();
    return null;
  }
  const user = await findUserWithScopesByEmail(db, row.email);
  if (!user || !user.isActive) return null;
  await db.prepare('UPDATE user_sessions SET last_seen_at = ? WHERE id = ?')
    .bind(new Date().toISOString(), row.id)
    .run();
  return { sessionId: row.id, user };
}

export async function revokeSessionByToken(db: D1Database, token: string): Promise<void> {
  const tokenHash = await hashSessionToken(token);
  await db.prepare('UPDATE user_sessions SET revoked_at = ? WHERE token_hash = ? AND revoked_at IS NULL')
    .bind(new Date().toISOString(), tokenHash)
    .run();
}

export async function revokeOtherUserSessions(
  db: D1Database,
  userId: string,
  currentSessionId?: string
): Promise<void> {
  if (currentSessionId) {
    await db.prepare('UPDATE user_sessions SET revoked_at = ? WHERE user_id = ? AND id <> ? AND revoked_at IS NULL')
      .bind(new Date().toISOString(), userId, currentSessionId)
      .run();
    return;
  }
  await db.prepare('UPDATE user_sessions SET revoked_at = ? WHERE user_id = ? AND revoked_at IS NULL')
    .bind(new Date().toISOString(), userId)
    .run();
}
