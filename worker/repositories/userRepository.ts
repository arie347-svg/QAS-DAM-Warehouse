import { AuthUser, AuthScope, UserRole } from '../types';

export async function findUserWithScopesByEmail(
  db: D1Database,
  email: string
): Promise<AuthUser | null> {
  const normalizedEmail = email.toLowerCase().trim();

  // 1. Query user record
  type UserRow = {
    id: string;
    email: string;
    full_name: string;
    is_active: number;
    must_change_password: number;
  };
  let userRow: UserRow | null = null;
  try {
    userRow = await db
      .prepare('SELECT id, email, full_name, is_active, must_change_password FROM users WHERE LOWER(email) = ?')
      .bind(normalizedEmail)
      .first<UserRow>();
  } catch {
    const legacy = await db
      .prepare('SELECT id, email, full_name, is_active FROM users WHERE LOWER(email) = ?')
      .bind(normalizedEmail)
      .first<Omit<UserRow, 'must_change_password'>>();
    userRow = legacy ? { ...legacy, must_change_password: 0 } : null;
  }

  if (!userRow) {
    return null;
  }

  // 2. Query user role scopes
  type ScopeRow = { role: string; depot_id: string | null; depot_code: string | null; can_manage_master: number; can_manage_users: number };
  let scopeResults: ScopeRow[] = [];
  try {
    const scopeRows = await db
      .prepare(
        `SELECT s.role, s.depot_id, d.code as depot_code, s.can_manage_master,
                COALESCE(p.can_manage_users, 0) AS can_manage_users
         FROM user_role_scopes s
         LEFT JOIN depots d ON s.depot_id = d.id
         LEFT JOIN user_permissions p ON p.user_id = s.user_id
         WHERE s.user_id = ?`
      )
      .bind(userRow.id)
      .all<ScopeRow>();
    scopeResults = scopeRows.results || [];
  } catch {
    // Compatibility for databases awaiting migration 0003.
    const legacyRows = await db
      .prepare(
        `SELECT s.role, s.depot_id, d.code as depot_code, s.can_manage_master,
                CASE WHEN s.role = 'ADMIN' OR s.user_id = 'USR-001' THEN 1 ELSE 0 END AS can_manage_users
         FROM user_role_scopes s
         LEFT JOIN depots d ON s.depot_id = d.id
         WHERE s.user_id = ?`
      )
      .bind(userRow.id)
      .all<ScopeRow>();
    scopeResults = legacyRows.results || [];
  }

  const scopes: AuthScope[] = scopeResults.map((row) => ({
    role: row.role as UserRole,
    depotId: row.depot_id,
    depotCode: row.depot_code,
    canManageMaster: row.can_manage_master === 1,
    canManageUsers: row.role === 'ADMIN' || row.can_manage_users === 1,
  }));

  return {
    id: userRow.id,
    email: userRow.email,
    fullName: userRow.full_name,
    isActive: userRow.is_active === 1,
    mustChangePassword: userRow.must_change_password === 1,
    scopes,
  };
}
