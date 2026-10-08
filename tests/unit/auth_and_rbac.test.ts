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
import { requireDepotScope, requireRole, requireMasterManager } from '../../worker/middleware/auth';
import { Env, Variables } from '../../worker/types';

const TEST_SECRET = 'test-secret-must-be-at-least-32-chars-long!';

interface MeResponseData {
  id: string;
  email: string;
  fullName: string;
  primaryRole: string;
  isGlobalAccess: boolean;
  canManageMaster: boolean;
  scopes: Array<{ role: string; depotId: string | null; depotCode: string | null; canManageMaster: boolean }>;
  requestId: string;
}

interface DepotItem {
  id: string;
  code: string;
  name: string;
  is_active: number;
}

describe('Authentication & RBAC Middleware Matrix (Task 3)', () => {
  let d1Mock: D1Database;
  let testEnv: Env;

  beforeEach(() => {
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
  });

  /* -------------------------------------------------------------
   * Positive Tests: GET /api/me & GET /api/depots
   * ------------------------------------------------------------- */

  it('Admin: returns full admin profile, global access, and all 3 depots', async () => {
    const token = await createTestJwt({ email: 'admin@qas.internal' }, TEST_SECRET);

    // 1. GET /api/me
    const meRes = await app.request('/api/me', {
      headers: { 'Cf-Access-Jwt-Assertion': token },
    }, testEnv);

    expect(meRes.status).toBe(200);
    const meBody = (await meRes.json()) as { success: boolean; data: MeResponseData };
    expect(meBody.success).toBe(true);
    expect(meBody.data.email).toBe('admin@qas.internal');
    expect(meBody.data.primaryRole).toBe('ADMIN');
    expect(meBody.data.isGlobalAccess).toBe(true);
    expect(meBody.data.canManageMaster).toBe(true);

    // 2. GET /api/depots
    const depotsRes = await app.request('/api/depots', {
      headers: { 'Cf-Access-Jwt-Assertion': token },
    }, testEnv);

    expect(depotsRes.status).toBe(200);
    const depotsBody = (await depotsRes.json()) as { success: boolean; data: DepotItem[] };
    expect(depotsBody.data).toHaveLength(3);
    const codes = depotsBody.data.map((d) => d.code);
    expect(codes).toEqual(['BRS', 'CRB', 'KRW']);
  });

  it('Auditor: returns global auditor access and all 3 depots', async () => {
    const token = await createTestJwt({ email: 'auditor@qas.internal' }, TEST_SECRET);

    const meRes = await app.request('/api/me', {
      headers: { 'Cf-Access-Jwt-Assertion': token },
    }, testEnv);

    expect(meRes.status).toBe(200);
    const meBody = (await meRes.json()) as { success: boolean; data: MeResponseData };
    expect(meBody.data.email).toBe('auditor@qas.internal');
    expect(meBody.data.primaryRole).toBe('AUDITOR_QAS');
    expect(meBody.data.isGlobalAccess).toBe(true);

    const depotsRes = await app.request('/api/depots', {
      headers: { 'Cf-Access-Jwt-Assertion': token },
    }, testEnv);

    expect(depotsRes.status).toBe(200);
    const depotsBody = (await depotsRes.json()) as { success: boolean; data: DepotItem[] };
    expect(depotsBody.data).toHaveLength(3);
  });

  it('PIC Karawang: returns scoped profile and ONLY Karawang depot (AC-01)', async () => {
    const token = await createTestJwt({ email: 'pic.karawang@qas.internal' }, TEST_SECRET);

    const meRes = await app.request('/api/me', {
      headers: { 'Cf-Access-Jwt-Assertion': token },
    }, testEnv);

    expect(meRes.status).toBe(200);
    const meBody = (await meRes.json()) as { success: boolean; data: MeResponseData };
    expect(meBody.data.primaryRole).toBe('PIC_QAS');
    expect(meBody.data.isGlobalAccess).toBe(false);
    expect(meBody.data.scopes[0].depotCode).toBe('KRW');

    // GET /api/depots must ONLY return Karawang depot
    const depotsRes = await app.request('/api/depots', {
      headers: { 'Cf-Access-Jwt-Assertion': token },
    }, testEnv);

    expect(depotsRes.status).toBe(200);
    const depotsBody = (await depotsRes.json()) as { success: boolean; data: DepotItem[] };
    expect(depotsBody.data).toHaveLength(1);
    expect(depotsBody.data[0].code).toBe('KRW');
  });

  it('PIC Baros: returns ONLY Baros depot', async () => {
    const token = await createTestJwt({ email: 'pic.baros@qas.internal' }, TEST_SECRET);

    const depotsRes = await app.request('/api/depots', {
      headers: { 'Cf-Access-Jwt-Assertion': token },
    }, testEnv);

    expect(depotsRes.status).toBe(200);
    const depotsBody = (await depotsRes.json()) as { success: boolean; data: DepotItem[] };
    expect(depotsBody.data).toHaveLength(1);
    expect(depotsBody.data[0].code).toBe('BRS');
  });

  /* -------------------------------------------------------------
   * Negative & Security Tests
   * ------------------------------------------------------------- */

  it('rejects unauthenticated request with 401 and requestId', async () => {
    const res = await app.request('/api/me', {
      method: 'GET',
    }, testEnv);

    expect(res.status).toBe(401);
    const body = (await res.json()) as { success: boolean; error: { code: string; requestId: string } };
    expect(body.success).toBe(false);
    expect(['ACCESS_IDENTITY_MISSING', 'UNAUTHORIZED']).toContain(body.error.code);
    expect(body.error.requestId).toBeDefined();
    expect(res.headers.get('X-Request-Id')).toBeDefined();
  });

  it('rejects expired JWT token with 401', async () => {
    const expiredToken = await createTestJwt(
      { email: 'admin@qas.internal', exp: -100 },
      TEST_SECRET
    );

    const res = await app.request('/api/me', {
      headers: { 'Cf-Access-Jwt-Assertion': expiredToken },
    }, testEnv);

    expect(res.status).toBe(401);
  });

  it('rejects valid JWT when email is not registered in D1 with 403', async () => {
    const token = await createTestJwt({ email: 'stranger@external.com' }, TEST_SECRET);

    const res = await app.request('/api/me', {
      headers: { 'Cf-Access-Jwt-Assertion': token },
    }, testEnv);

    expect(res.status).toBe(403);
    const body = (await res.json()) as { success: boolean; error: { code: string } };
    expect(['USER_NOT_MAPPED', 'FORBIDDEN_USER_INACTIVE_OR_UNREGISTERED']).toContain(body.error.code);
  });

  it('rejects valid JWT when user is marked inactive in D1 with 403', async () => {
    // Mark user inactive
    await d1Mock.prepare("UPDATE users SET is_active = 0 WHERE email = 'pic.cirebon@qas.internal'").run();

    const token = await createTestJwt({ email: 'pic.cirebon@qas.internal' }, TEST_SECRET);

    const res = await app.request('/api/me', {
      headers: { 'Cf-Access-Jwt-Assertion': token },
    }, testEnv);

    expect(res.status).toBe(403);
    const body = (await res.json()) as { success: boolean; error: { code: string } };
    expect(body.error.code).toBe('FORBIDDEN_USER_INACTIVE');
  });

  /* -------------------------------------------------------------
   * Guard Middleware Unit Tests (Cross-Depot Isolation & Role Check)
   * ------------------------------------------------------------- */

  it('enforces Cross-Depot Isolation: PIC Karawang cannot access Baros depot', async () => {
    const { Hono } = await import('hono');
    const { requestIdMiddleware } = await import('../../worker/middleware/requestId');
    const { authResolverMiddleware } = await import('../../worker/middleware/auth');

    const testApp = new Hono<{ Bindings: Env; Variables: Variables }>();
    testApp.use('*', requestIdMiddleware);
    testApp.use('*', authResolverMiddleware);
    testApp.get('/api/test-depot/:depotId', requireDepotScope((c) => c.req.param('depotId')), (c) => {
      return c.json({ success: true, message: 'Depot accessed' });
    });

    const picKrwToken = await createTestJwt({ email: 'pic.karawang@qas.internal' }, TEST_SECRET);

    // 1. PIC Karawang accessing Karawang -> Allowed (200)
    const allowedRes = await testApp.request('/api/test-depot/depot-krw', {
      headers: { 'Cf-Access-Jwt-Assertion': picKrwToken },
    }, testEnv);
    expect(allowedRes.status).toBe(200);

    // 2. PIC Karawang accessing Baros -> Forbidden (403)
    const forbiddenRes = await testApp.request('/api/test-depot/depot-brs', {
      headers: { 'Cf-Access-Jwt-Assertion': picKrwToken },
    }, testEnv);
    expect(forbiddenRes.status).toBe(403);
    const forbiddenBody = (await forbiddenRes.json()) as { success: boolean; error: { code: string } };
    expect(forbiddenBody.error.code).toBe('FORBIDDEN_DEPOT_ACCESS');

    // 3. Auditor accessing Baros -> Allowed (200) because Auditor has global authority
    const auditorToken = await createTestJwt({ email: 'auditor@qas.internal' }, TEST_SECRET);
    const auditorRes = await testApp.request('/api/test-depot/depot-brs', {
      headers: { 'Cf-Access-Jwt-Assertion': auditorToken },
    }, testEnv);
    expect(auditorRes.status).toBe(200);
  });

  it('enforces Role Guard: PIC cannot access Admin-only route', async () => {
    const { Hono } = await import('hono');
    const { requestIdMiddleware } = await import('../../worker/middleware/requestId');
    const { authResolverMiddleware } = await import('../../worker/middleware/auth');

    const testApp = new Hono<{ Bindings: Env; Variables: Variables }>();
    testApp.use('*', requestIdMiddleware);
    testApp.use('*', authResolverMiddleware);
    testApp.get('/api/test-admin-only', requireRole(['ADMIN']), (c) => {
      return c.json({ success: true, message: 'Admin ok' });
    });

    const picToken = await createTestJwt({ email: 'pic.karawang@qas.internal' }, TEST_SECRET);
    const adminToken = await createTestJwt({ email: 'admin@qas.internal' }, TEST_SECRET);

    const picRes = await testApp.request('/api/test-admin-only', {
      headers: { 'Cf-Access-Jwt-Assertion': picToken },
    }, testEnv);
    expect(picRes.status).toBe(403);

    const adminRes = await testApp.request('/api/test-admin-only', {
      headers: { 'Cf-Access-Jwt-Assertion': adminToken },
    }, testEnv);
    expect(adminRes.status).toBe(200);
  });

  it('enforces Master Manager Guard: Admin and authorized Auditor pass, PIC fails', async () => {
    const { Hono } = await import('hono');
    const { requestIdMiddleware } = await import('../../worker/middleware/requestId');
    const { authResolverMiddleware } = await import('../../worker/middleware/auth');

    const testApp = new Hono<{ Bindings: Env; Variables: Variables }>();
    testApp.use('*', requestIdMiddleware);
    testApp.use('*', authResolverMiddleware);
    testApp.get('/api/test-master-manage', requireMasterManager, (c) => {
      return c.json({ success: true, message: 'Master ok' });
    });

    const adminToken = await createTestJwt({ email: 'admin@qas.internal' }, TEST_SECRET);
    const auditorToken = await createTestJwt({ email: 'auditor@qas.internal' }, TEST_SECRET);
    const picToken = await createTestJwt({ email: 'pic.karawang@qas.internal' }, TEST_SECRET);

    const adminRes = await testApp.request('/api/test-master-manage', {
      headers: { 'Cf-Access-Jwt-Assertion': adminToken },
    }, testEnv);
    expect(adminRes.status).toBe(200);

    const auditorRes = await testApp.request('/api/test-master-manage', {
      headers: { 'Cf-Access-Jwt-Assertion': auditorToken },
    }, testEnv);
    expect(auditorRes.status).toBe(200);

    const picRes = await testApp.request('/api/test-master-manage', {
      headers: { 'Cf-Access-Jwt-Assertion': picToken },
    }, testEnv);
    expect(picRes.status).toBe(403);
    const body = (await picRes.json()) as { success: boolean; error: { code: string } };
    expect(body.error.code).toBe('FORBIDDEN_MASTER_MANAGEMENT');
  });
});
