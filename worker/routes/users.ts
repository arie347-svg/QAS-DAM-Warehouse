import { Hono } from 'hono';
import { Env, Variables } from '../types';
import { requireAuth, requireUserManager } from '../middleware/auth';

export const usersRouter = new Hono<{ Bindings: Env; Variables: Variables }>();

/**
 * GET /api/users
 * Returns list of all registered users with their role scopes and depot details.
 */
usersRouter.get('/users', requireAuth, requireUserManager, async (c) => {
  const db = c.env.DB;
  const requestId = c.get('requestId');

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

  const query = `
    SELECT 
      u.id, 
      u.email, 
      u.full_name, 
      u.is_active, 
      u.created_at, 
      u.updated_at,
      s.role, 
      s.depot_id, 
      d.name as depot_name, 
      d.code as depot_code, 
      s.can_manage_master,
      CASE WHEN s.role = 'ADMIN' OR COALESCE(p.can_manage_users, 0) = 1 THEN 1 ELSE 0 END as can_manage_users
    FROM users u
    LEFT JOIN user_role_scopes s ON u.id = s.user_id
    LEFT JOIN depots d ON s.depot_id = d.id
    LEFT JOIN user_permissions p ON p.user_id = u.id
    ORDER BY u.created_at ASC
  `;

  let results;
  try {
    results = await db.prepare(query).all();
  } catch {
    results = await db.prepare(`
      SELECT u.id, u.email, u.full_name, u.is_active, u.created_at, u.updated_at,
        s.role, s.depot_id, d.name AS depot_name, d.code AS depot_code,
        s.can_manage_master,
        CASE WHEN s.role = 'ADMIN' OR u.id = 'USR-001' THEN 1 ELSE 0 END AS can_manage_users
      FROM users u
      LEFT JOIN user_role_scopes s ON u.id = s.user_id
      LEFT JOIN depots d ON s.depot_id = d.id
      ORDER BY u.created_at ASC
    `).all();
  }
  return c.json({
    success: true,
    data: results.results || [],
    requestId,
  });
});

/**
 * POST /api/users
 * Creates a new user and assigns role and depot scope.
 */
usersRouter.post('/users', requireAuth, requireUserManager, async (c) => {
  const db = c.env.DB;
  const requestId = c.get('requestId');

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

  const body = await c.req.json<{
    email: string;
    fullName: string;
    role: string;
    depotId?: string | null;
    canManageMaster?: boolean;
    canManageUsers?: boolean;
  }>();

  if (!body.email || !body.fullName || !body.role) {
    return c.json(
      {
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Email, nama lengkap, dan peran wajib diisi.',
          requestId,
        },
      },
      400
    );
  }

  const normalizedEmail = body.email.trim().toLowerCase();

  // Check unique email
  const existing = await db
    .prepare('SELECT id FROM users WHERE LOWER(email) = ?')
    .bind(normalizedEmail)
    .first();

  if (existing) {
    return c.json(
      {
        success: false,
        error: {
          code: 'EMAIL_ALREADY_EXISTS',
          message: 'Email sudah terdaftar dalam sistem.',
          requestId,
        },
      },
      409
    );
  }

  const userId = `USR-${Date.now().toString().slice(-4)}`;
  const now = new Date().toISOString();

  await db
    .prepare('INSERT INTO users (id, email, full_name, is_active, created_at, updated_at) VALUES (?, ?, ?, 1, ?, ?)')
    .bind(userId, normalizedEmail, body.fullName.trim(), now, now)
    .run();

  if (body.canManageUsers) {
    try {
      await db.prepare(`
        INSERT INTO user_permissions (user_id, can_manage_users, updated_at)
        VALUES (?, 1, ?)
        ON CONFLICT(user_id) DO UPDATE SET can_manage_users = 1, updated_at = excluded.updated_at
      `).bind(userId, now).run();
    } catch {
      // Database is awaiting migration 0003; account creation itself remains valid.
    }
  }

  const scopeId = `scope-${Date.now().toString(36)}`;
  await db
    .prepare('INSERT INTO user_role_scopes (id, user_id, role, depot_id, can_manage_master) VALUES (?, ?, ?, ?, ?)')
    .bind(scopeId, userId, body.role, body.depotId || null, body.canManageMaster ? 1 : 0)
    .run();

  return c.json(
    {
      success: true,
      data: {
        id: userId,
        email: normalizedEmail,
        fullName: body.fullName.trim(),
        role: body.role,
        depotId: body.depotId || null,
        canManageMaster: Boolean(body.canManageMaster),
        canManageUsers: Boolean(body.canManageUsers),
        isActive: true,
      },
      requestId,
    },
    201
  );
});

/**
 * PUT /api/users/:id
 * Updates user information and role scopes.
 */
usersRouter.put('/users/:id', requireAuth, requireUserManager, async (c) => {
  const db = c.env.DB;
  const requestId = c.get('requestId');
  const userId = c.req.param('id');

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

  const body = await c.req.json<{
    fullName?: string;
    role?: string;
    depotId?: string | null;
    canManageMaster?: boolean;
    canManageUsers?: boolean;
    isActive?: boolean;
  }>();

  const user = await db.prepare('SELECT id FROM users WHERE id = ?').bind(userId).first();
  if (!user) {
    return c.json(
      {
        success: false,
        error: {
          code: 'NOT_FOUND',
          message: 'Pengguna tidak ditemukan.',
          requestId,
        },
      },
      404
    );
  }

  const now = new Date().toISOString();
  if (body.fullName !== undefined || body.isActive !== undefined) {
    await db
      .prepare('UPDATE users SET full_name = COALESCE(?, full_name), is_active = COALESCE(?, is_active), updated_at = ? WHERE id = ?')
      .bind(body.fullName || null, body.isActive !== undefined ? (body.isActive ? 1 : 0) : null, now, userId)
      .run();
  }

  if (body.role !== undefined || body.depotId !== undefined || body.canManageMaster !== undefined || body.canManageUsers !== undefined) {
    await db
      .prepare('UPDATE user_role_scopes SET role = COALESCE(?, role), depot_id = ?, can_manage_master = COALESCE(?, can_manage_master) WHERE user_id = ?')
      .bind(body.role || null, body.depotId || null, body.canManageMaster !== undefined ? (body.canManageMaster ? 1 : 0) : null, userId)
      .run();
  }

  if (body.canManageUsers !== undefined) {
    try {
      await db.prepare(`
        INSERT INTO user_permissions (user_id, can_manage_users, updated_at)
        VALUES (?, ?, ?)
        ON CONFLICT(user_id) DO UPDATE SET can_manage_users = excluded.can_manage_users, updated_at = excluded.updated_at
      `).bind(userId, body.canManageUsers ? 1 : 0, now).run();
    } catch {
      // Database is awaiting migration 0003.
    }
  }

  return c.json({
    success: true,
    message: 'Data pengguna berhasil diperbarui.',
    requestId,
  });
});

/**
 * DELETE /api/users/:id
 * Deactivates a user while preserving audit history and ownership references.
 */
usersRouter.delete('/users/:id', requireAuth, requireUserManager, async (c) => {
  const db = c.env.DB;
  const requestId = c.get('requestId');
  const userId = c.req.param('id');
  const currentUser = c.get('user');

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

  if (currentUser && currentUser.id === userId) {
    return c.json(
      {
        success: false,
        error: {
          code: 'CANNOT_DELETE_SELF',
          message: 'Anda tidak dapat menghapus akun Anda sendiri.',
          requestId,
        },
      },
      400
    );
  }

  const target = await db
    .prepare('SELECT id, is_active FROM users WHERE id = ?')
    .bind(userId)
    .first<{ id: string; is_active: number }>();

  if (!target) {
    return c.json(
      { success: false, error: { code: 'USER_NOT_FOUND', message: 'Pengguna tidak ditemukan.', requestId } },
      404
    );
  }

  await db
    .prepare('UPDATE users SET is_active = 0, updated_at = ? WHERE id = ?')
    .bind(new Date().toISOString(), userId)
    .run();

  return c.json({
    success: true,
    message: 'Pengguna berhasil dinonaktifkan.',
    requestId,
  });
});
