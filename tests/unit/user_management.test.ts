// @vitest-environment node
import { describe, it, expect, beforeEach } from 'vitest';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { DatabaseSync } = require('node:sqlite');
import fs from 'fs';
import path from 'path';
import app from '../../worker/index';
import { createTestJwt } from '../../worker/services/jwtService';
import { createD1Mock } from '../helpers/d1Mock';
import { Env } from '../../worker/types';
import { 
  canUserManageUsers, 
  getAllUsers, 
  createUser, 
  updateUser, 
  deleteUser, 
  resetDefaultUsers,
  DEMO_USERS,
  loginUser
} from '../../src/lib/api';

const TEST_SECRET = 'test-secret-must-be-at-least-32-chars-long!';

describe('User Management Access & CRUD Matrix (Ari Imam & Admin)', () => {
  let d1Mock: D1Database;
  let testEnv: Env;

  beforeEach(() => {
    // 1. Reset backend DB fixture
    const db = new DatabaseSync(':memory:');
    db.exec('PRAGMA foreign_keys = ON;');

    const schemaSql = fs.readFileSync(
      path.resolve(__dirname, '../../migrations/0001_initial_schema.sql'),
      'utf8'
    );
    db.exec(schemaSql);

    const seedSql = fs.readFileSync(
      path.resolve(__dirname, '../../seed/seed_data.sql'),
      'utf8'
    );
    db.exec(seedSql);

    d1Mock = createD1Mock(db);
    testEnv = {
      DB: d1Mock,
      ENVIRONMENT: 'test',
      JWT_DEV_SECRET: TEST_SECRET,
    };

    // 2. Reset frontend user state
    resetDefaultUsers();
  });

  /* -------------------------------------------------------------
   * 1. RBAC & Access Guard Tests for canUserManageUsers
   * ------------------------------------------------------------- */
  it('grants user management access specifically to ari.imam@daya-motora.com', () => {
    const ariImam = DEMO_USERS.find((u) => u.profile.email === 'ari.imam@daya-motora.com');
    expect(ariImam).toBeDefined();
    expect(canUserManageUsers(ariImam)).toBe(true);
    expect(ariImam?.profile.canManageUsers).toBe(true);
  });

  it('grants user management access to ADMIN role', () => {
    const adminUser = DEMO_USERS.find((u) => u.profile.primaryRole === 'ADMIN');
    expect(adminUser).toBeDefined();
    expect(canUserManageUsers(adminUser)).toBe(true);
  });

  it('denies user management access to regular PIC QAS and Auditor without flag', () => {
    const indra = DEMO_USERS.find((u) => u.profile.email === 'indra.winata@daya-group.co.id');
    expect(indra).toBeDefined();
    expect(canUserManageUsers(indra)).toBe(false);

    const marcelia = DEMO_USERS.find((u) => u.profile.email === 'marcelia.krista@daya-motora.com');
    expect(marcelia).toBeDefined();
    expect(canUserManageUsers(marcelia)).toBe(false);
  });

  /* -------------------------------------------------------------
   * 2. Frontend User CRUD Operations
   * ------------------------------------------------------------- */
  it('allows adding, updating, and deleting users via client API', () => {
    const initialUsers = getAllUsers();
    const initialCount = initialUsers.length;

    // 1. Create User
    const createRes = createUser({
      fullName: 'Siti Rahmawati',
      email: 'siti.rahmawati@daya-motora.com',
      role: 'PIC_QAS',
      depotId: 'depot-krw',
      canManageMaster: false,
      canManageUsers: false,
    });

    expect(createRes.success).toBe(true);
    expect(createRes.user).toBeDefined();
    expect(createRes.user?.profile.fullName).toBe('Siti Rahmawati');
    expect(getAllUsers()).toHaveLength(initialCount + 1);

    // 2. Prevent duplicate email
    const duplicateRes = createUser({
      fullName: 'Duplicate User',
      email: 'siti.rahmawati@daya-motora.com',
      role: 'PIC_QAS',
      depotId: 'depot-krw',
    });
    expect(duplicateRes.success).toBe(false);
    expect(duplicateRes.error).toContain('sudah terdaftar');

    // 3. Update User
    const userKey = createRes.user!.key;
    const updateRes = updateUser(userKey, {
      fullName: 'Siti Rahmawati M.Sc',
      role: 'AUDITOR_QAS',
      depotId: 'depot-brs',
      canManageMaster: true,
    });

    expect(updateRes.success).toBe(true);
    expect(updateRes.user?.profile.fullName).toBe('Siti Rahmawati M.Sc');
    expect(updateRes.user?.profile.primaryRole).toBe('AUDITOR_QAS');
    expect(updateRes.user?.profile.canManageMaster).toBe(true);

    // 4. Delete User
    const deleteRes = deleteUser(userKey);
    expect(deleteRes.success).toBe(true);
    expect(getAllUsers()).toHaveLength(initialCount);
  });

  it('prevents self-deletion of active user', () => {
    loginUser('usr-001'); // Ari Imam Safari
    const res = deleteUser('usr-001');
    expect(res.success).toBe(false);
    expect(res.error).toContain('tidak dapat menghapus akun Anda sendiri');
  });

  /* -------------------------------------------------------------
   * 3. Worker REST API Endpoints & Zero Trust Middleware
   * ------------------------------------------------------------- */
  it('Worker GET /api/me returns canManageUsers = true for ari.imam@daya-motora.com', async () => {
    const token = await createTestJwt({ email: 'ari.imam@daya-motora.com' }, TEST_SECRET);
    const res = await app.request('/api/me', {
      headers: { 'Cf-Access-Jwt-Assertion': token },
    }, testEnv);

    expect(res.status).toBe(200);
    const body = (await res.json()) as { success: boolean; data: { canManageUsers: boolean } };
    expect(body.success).toBe(true);
    expect(body.data.canManageUsers).toBe(true);
  });

  it('Worker GET /api/users succeeds for ari.imam@daya-motora.com', async () => {
    const token = await createTestJwt({ email: 'ari.imam@daya-motora.com' }, TEST_SECRET);
    const res = await app.request('/api/users', {
      headers: { 'Cf-Access-Jwt-Assertion': token },
    }, testEnv);

    expect(res.status).toBe(200);
    const body = (await res.json()) as { success: boolean; data: unknown[] };
    expect(body.success).toBe(true);
    expect(Array.isArray(body.data)).toBe(true);
    expect(body.data.length).toBeGreaterThanOrEqual(5);
  });

  it('Worker GET /api/users is blocked (403) for unauthorized users', async () => {
    const token = await createTestJwt({ email: 'indra.winata@daya-group.co.id' }, TEST_SECRET);
    const res = await app.request('/api/users', {
      headers: { 'Cf-Access-Jwt-Assertion': token },
    }, testEnv);

    expect(res.status).toBe(403);
    const body = (await res.json()) as { success: boolean; error: { code: string } };
    expect(body.success).toBe(false);
    expect(body.error.code).toBe('FORBIDDEN_USER_MANAGEMENT');
  });

  it('Worker POST /api/users allows ari.imam to create new user', async () => {
    const token = await createTestJwt({ email: 'ari.imam@daya-motora.com' }, TEST_SECRET);
    const res = await app.request('/api/users', {
      method: 'POST',
      headers: { 
        'Cf-Access-Jwt-Assertion': token,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        email: 'agus.salim@daya-motora.com',
        fullName: 'Agus Salim',
        role: 'PIC_QAS',
        depotId: 'depot-krw',
      }),
    }, testEnv);

    expect(res.status).toBe(201);
    const body = (await res.json()) as { success: boolean; data: { email: string; fullName: string } };
    expect(body.success).toBe(true);
    expect(body.data.email).toBe('agus.salim@daya-motora.com');
    expect(body.data.fullName).toBe('Agus Salim');
  });
});
