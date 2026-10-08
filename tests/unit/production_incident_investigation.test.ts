// @vitest-environment node
/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, beforeEach } from 'vitest';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { DatabaseSync } = require('node:sqlite');
import fs from 'fs';
import path from 'path';
import app from '../../worker/index';
import { createTestJwt } from '../../worker/services/jwtService';
import { createD1Mock } from '../helpers/d1Mock';
import { createR2Mock } from '../helpers/r2Mock';
import { Env } from '../../worker/types';

const TEST_SECRET = 'test-secret-must-be-at-least-32-chars-long!';

describe('Production Incident Investigation & Resolution Suite', () => {
  let db: any;
  let d1Mock: D1Database;
  let r2Mock: R2Bucket;
  let testEnv: Env;
  let ariImamToken: string;
  let picInternalToken: string;
  let picBarosToken: string;
  let auditorToken: string;
  let adminToken: string;

  const PROD_CYCLE_ID = 'cyc-prod-krw-202610';
  const PROD_SELF_AUDIT_ID = 'audit-self-krw-prod';
  const PROD_OFF_AUDIT_ID = 'audit-off-krw-prod';

  beforeEach(async () => {
    db = new DatabaseSync(':memory:');
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

    // Seed data already contains USR-001, USR-004, user-pic-krw, user-pic-brs, user-admin
    // Setup production cycle and slot audits matching production state
    db.exec(`
      UPDATE audit_template_versions SET status = 'PUBLISHED', published_at = '2026-10-01T00:00:00Z' WHERE id = 'ver-qas-log-v1';

      INSERT OR REPLACE INTO audit_cycles (id, code, title, period_start, period_end, self_due_at, official_due_at, status, template_version_id)
      VALUES 
        ('${PROD_CYCLE_ID}', 'QAS-PROD-KRW-202610', 'Siklus Audit Karawang Okt 2026', '2026-10-01', '2026-10-31', '2026-10-15T23:59:59Z', '2026-10-31T23:59:59Z', 'OPEN', 'ver-qas-log-v1');

      INSERT OR REPLACE INTO audits (id, cycle_id, depot_id, audit_type, status, assigned_user_id, template_version_id, version, started_at, submitted_at, created_at, updated_at)
      VALUES 
        ('${PROD_SELF_AUDIT_ID}', '${PROD_CYCLE_ID}', 'depot-krw', 'SELF', 'DRAFT', 'USR-001', 'ver-qas-log-v1', 1, NULL, NULL, '2026-10-01T00:00:00Z', '2026-10-01T00:00:00Z'),
        ('${PROD_OFF_AUDIT_ID}', '${PROD_CYCLE_ID}', 'depot-krw', 'OFFICIAL', 'DRAFT', 'USR-004', 'ver-qas-log-v1', 1, NULL, NULL, '2026-10-01T00:00:00Z', '2026-10-01T00:00:00Z');
    `);

    d1Mock = createD1Mock(db);
    r2Mock = createR2Mock();

    testEnv = {
      DB: d1Mock,
      EVIDENCE: r2Mock,
      ENVIRONMENT: 'test',
      JWT_DEV_SECRET: TEST_SECRET,
    };

    ariImamToken = await createTestJwt({ email: 'ari.imam@daya-motora.com' }, TEST_SECRET);
    picInternalToken = await createTestJwt({ email: 'pic.karawang@qas.internal' }, TEST_SECRET);
    picBarosToken = await createTestJwt({ email: 'pic.baros@qas.internal' }, TEST_SECRET);
    auditorToken = await createTestJwt({ email: 'fachmi.herdiansyah@daya-motora.com' }, TEST_SECRET);
    adminToken = await createTestJwt({ email: 'admin@qas.internal' }, TEST_SECRET);
  });

  describe('1. Akar Masalah: DRAFT Slot dengan started_at NULL & 0 answers', () => {
    it('memastikan slot audit DRAFT awal dapat ditemukan melalui getAuditDetail tanpa filter KPI', async () => {
      const res = await app.request(
        `/api/audits/${PROD_SELF_AUDIT_ID}`,
        {
          method: 'GET',
          headers: { 'Cf-Access-Jwt-Assertion': ariImamToken },
        },
        testEnv
      );

      expect(res.status).toBe(200);
      const json = await res.json() as any;
      expect(json.success).toBe(true);
      expect(json.data.audit.id).toBe(PROD_SELF_AUDIT_ID);
      expect(json.data.audit.status).toBe('DRAFT');
      expect(json.data.audit.started_at).toBeNull();
      expect(json.data.sections).toBeDefined();
      expect(json.data.sections.length).toBeGreaterThan(0);
    });

    it('memastikan startAudit via POST /api/audits/:id/start mengisi started_at dan menaikkan version secara atomik', async () => {
      const startRes = await app.request(
        `/api/audits/${PROD_SELF_AUDIT_ID}/start`,
        {
          method: 'POST',
          headers: { 'Cf-Access-Jwt-Assertion': ariImamToken },
        },
        testEnv
      );

      expect(startRes.status).toBe(200);
      const json = await startRes.json() as any;
      expect(json.success).toBe(true);
      expect(json.data.audit.started_at).not.toBeNull();
      expect(json.data.audit.version).toBe(2);

      // Verifikasi event audit trail tercatat
      const events = db.prepare(
        "SELECT * FROM audit_events WHERE entity_id = ? AND event_type = 'AUDIT_STARTED'"
      ).all(PROD_SELF_AUDIT_ID) as any[];
      expect(events.length).toBe(1);
      expect(events[0].actor_user_id).toBe('USR-001');
    });

    it('memastikan panggilan berulang startAudit bersifat idempotent (tidak duplikasi started_at atau event)', async () => {
      // Panggilan pertama
      await app.request(
        `/api/audits/${PROD_SELF_AUDIT_ID}/start`,
        {
          method: 'POST',
          headers: { 'Cf-Access-Jwt-Assertion': ariImamToken },
        },
        testEnv
      );

      const firstRow = db.prepare('SELECT started_at, version FROM audits WHERE id = ?').get(PROD_SELF_AUDIT_ID) as any;

      // Panggilan kedua (idempotent)
      const secondRes = await app.request(
        `/api/audits/${PROD_SELF_AUDIT_ID}/start`,
        {
          method: 'POST',
          headers: { 'Cf-Access-Jwt-Assertion': ariImamToken },
        },
        testEnv
      );

      expect(secondRes.status).toBe(200);
      const secondJson = await secondRes.json() as any;
      expect(secondJson.data.audit.started_at).toBe(firstRow.started_at);
      expect(secondJson.data.audit.version).toBe(firstRow.version);

      const events = db.prepare(
        "SELECT * FROM audit_events WHERE entity_id = ? AND event_type = 'AUDIT_STARTED'"
      ).all(PROD_SELF_AUDIT_ID) as any[];
      expect(events.length).toBe(1);
    });
  });

  describe('2. Verifikasi Pemetaan Akun & Otorisasi Penugasan (RBAC)', () => {
    it('ari.imam@daya-motora.com (USR-001) berhasil karena sesuai assigned_user_id', async () => {
      const res = await app.request(
        `/api/audits/${PROD_SELF_AUDIT_ID}/start`,
        {
          method: 'POST',
          headers: { 'Cf-Access-Jwt-Assertion': ariImamToken },
        },
        testEnv
      );

      expect(res.status).toBe(200);
      const json = await res.json() as any;
      expect(json.success).toBe(true);
    });

    it('pic.karawang@qas.internal (user-pic-krw) ditolak 403 dengan AUDIT_NOT_ASSIGNED, BUKAN 404', async () => {
      const res = await app.request(
        `/api/audits/${PROD_SELF_AUDIT_ID}/start`,
        {
          method: 'POST',
          headers: { 'Cf-Access-Jwt-Assertion': picInternalToken },
        },
        testEnv
      );

      expect(res.status).toBe(403);
      const json = await res.json() as any;
      expect(json.success).toBe(false);
      expect(json.error.code).toBe('AUDIT_NOT_ASSIGNED');
      expect(json.error.message).toContain('ditugaskan kepada PIC resmi');
      expect(json.error.requestId).toBeDefined();

      // Pastikan pada GET juga ditolak dengan AUDIT_NOT_ASSIGNED
      const getRes = await app.request(
        `/api/audits/${PROD_SELF_AUDIT_ID}`,
        {
          method: 'GET',
          headers: { 'Cf-Access-Jwt-Assertion': picInternalToken },
        },
        testEnv
      );
      expect(getRes.status).toBe(403);
      const getJson = await getRes.json() as any;
      expect(getJson.error.code).toBe('AUDIT_NOT_ASSIGNED');
    });

    it('PIC Baros (indra.winata) ditolak 403 dengan DEPOT_ACCESS_DENIED jika mencoba mengakses audit Karawang', async () => {
      const res = await app.request(
        `/api/audits/${PROD_SELF_AUDIT_ID}/start`,
        {
          method: 'POST',
          headers: { 'Cf-Access-Jwt-Assertion': picBarosToken },
        },
        testEnv
      );

      expect(res.status).toBe(403);
      const json = await res.json() as any;
      expect(json.success).toBe(false);
      expect(json.error.code).toBe('DEPOT_ACCESS_DENIED');
    });
  });

  describe('3. Validasi Kontrak Audit ID & Error Handling', () => {
    it('mengembalikan 400 AUDIT_ID_MISSING jika parameter ID audit kosong atau invalid', async () => {
      const res = await app.request(
        '/api/audits/undefined',
        {
          method: 'GET',
          headers: { 'Cf-Access-Jwt-Assertion': ariImamToken },
        },
        testEnv
      );

      expect(res.status).toBe(400);
      const json = await res.json() as any;
      expect(json.success).toBe(false);
      expect(json.error.code).toBe('AUDIT_ID_MISSING');
    });

    it('mengembalikan 404 AUDIT_NOT_FOUND jika audit ID memang tidak ada di database', async () => {
      const res = await app.request(
        '/api/audits/audit-non-existent-999',
        {
          method: 'GET',
          headers: { 'Cf-Access-Jwt-Assertion': adminToken },
        },
        testEnv
      );

      expect(res.status).toBe(404);
      const json = await res.json() as any;
      expect(json.success).toBe(false);
      expect(json.error.code).toBe('AUDIT_NOT_FOUND');
    });

    it('mengembalikan 403 USER_NOT_MAPPED jika pengguna tidak terdaftar di D1', async () => {
      const unknownToken = await createTestJwt({ email: 'orang.asing@daya-motora.com' }, TEST_SECRET);
      const res = await app.request(
        `/api/audits/${PROD_SELF_AUDIT_ID}`,
        {
          method: 'GET',
          headers: { 'Cf-Access-Jwt-Assertion': unknownToken },
        },
        testEnv
      );

      expect(res.status).toBe(403);
      const json = await res.json() as any;
      expect(json.success).toBe(false);
      expect(json.error.code).toBe('USER_NOT_MAPPED');
    });
  });

  describe('4. Official Audit Gating & Assignment', () => {
    it('menolak start Official Audit sebelum Self Audit disubmit (SELF_AUDIT_NOT_SUBMITTED)', async () => {
      const res = await app.request(
        `/api/audits/${PROD_OFF_AUDIT_ID}/start`,
        {
          method: 'POST',
          headers: { 'Cf-Access-Jwt-Assertion': auditorToken },
        },
        testEnv
      );

      expect(res.status).toBe(400);
      const json = await res.json() as any;
      expect(json.success).toBe(false);
      expect(json.error.code).toBe('SELF_AUDIT_NOT_SUBMITTED');
    });

    it('mengizinkan start Official Audit setelah Self Audit SUBMITTED', async () => {
      // Set Self Audit to SUBMITTED
      db.prepare("UPDATE audits SET status = 'SUBMITTED' WHERE id = ?").run(PROD_SELF_AUDIT_ID);

      const res = await app.request(
        `/api/audits/${PROD_OFF_AUDIT_ID}/start`,
        {
          method: 'POST',
          headers: { 'Cf-Access-Jwt-Assertion': auditorToken },
        },
        testEnv
      );

      expect(res.status).toBe(200);
      const json = await res.json() as any;
      expect(json.success).toBe(true);
      expect(json.data.audit.started_at).not.toBeNull();
    });
  });

  describe('5. Cloudflare Access Execution Context & Specific Error Code Contract (11 Test Cases)', () => {
    // 1. ctx.access identity (getIdentity()) berhasil dipetakan ke USR-001 (ari.imam@daya-motora.com)
    it('1. ctx.access identity (getIdentity()) berhasil dipetakan ke USR-001 (ari.imam@daya-motora.com)', async () => {
      const res = await app.request(
        `/api/audits/${PROD_SELF_AUDIT_ID}`,
        { method: 'GET' },
        testEnv,
        {
          access: {
            getIdentity: async () => ({
              email: 'ari.imam@daya-motora.com',
              user_uuid: 'uuid-ari',
              name: 'Ari Imam Pratama',
            }),
          },
        } as any
      );

      expect(res.status).toBe(200);
      const json = await res.json() as any;
      expect(json.success).toBe(true);
      expect(json.data.audit.id).toBe(PROD_SELF_AUDIT_ID);
    });

    // 2. Header JWT fallback dan Cookie fallback tetap berfungsi (200 OK)
    it('2. Header JWT fallback dan Cookie fallback tetap berfungsi (200 OK)', async () => {
      // Test via Header
      const headerRes = await app.request(
        `/api/audits/${PROD_SELF_AUDIT_ID}`,
        {
          method: 'GET',
          headers: { 'Cf-Access-Jwt-Assertion': ariImamToken },
        },
        testEnv
      );
      expect(headerRes.status).toBe(200);

      // Test via Cookie CF_Authorization
      const cookieRes = await app.request(
        `/api/audits/${PROD_SELF_AUDIT_ID}`,
        {
          method: 'GET',
          headers: { Cookie: `CF_Authorization=${ariImamToken}` },
        },
        testEnv
      );
      expect(cookieRes.status).toBe(200);
    });

    // 3. Request tanpa ctx.access dan tanpa JWT ditolak 401 dengan ACCESS_IDENTITY_MISSING
    it('3. Request tanpa ctx.access dan tanpa JWT ditolak 401 dengan ACCESS_IDENTITY_MISSING', async () => {
      const res = await app.request(
        `/api/audits/${PROD_SELF_AUDIT_ID}`,
        { method: 'GET' },
        testEnv
      );

      expect(res.status).toBe(401);
      const json = await res.json() as any;
      expect(json.success).toBe(false);
      expect(json.error.code).toBe('ACCESS_IDENTITY_MISSING');
      expect(json.error.requestId).toBeDefined();
    });

    // 4. JWT invalid ditolak 401 dengan UNAUTHORIZED_INVALID_TOKEN
    it('4. JWT invalid ditolak 401 dengan UNAUTHORIZED_INVALID_TOKEN', async () => {
      const res = await app.request(
        `/api/audits/${PROD_SELF_AUDIT_ID}`,
        {
          method: 'GET',
          headers: { 'Cf-Access-Jwt-Assertion': 'invalid.malformed.jwt.token' },
        },
        testEnv
      );

      expect(res.status).toBe(401);
      const json = await res.json() as any;
      expect(json.success).toBe(false);
      expect(json.error.code).toBe('UNAUTHORIZED_INVALID_TOKEN');
      expect(json.error.requestId).toBeDefined();
    });

    // 5. User yang tidak terdaftar di D1 ditolak 403 USER_NOT_MAPPED
    it('5. User yang tidak terdaftar di D1 ditolak 403 USER_NOT_MAPPED', async () => {
      const res = await app.request(
        `/api/audits/${PROD_SELF_AUDIT_ID}`,
        { method: 'GET' },
        testEnv,
        {
          access: {
            getIdentity: async () => ({
              email: 'pengguna.asing@bukan-karyawan.com',
            }),
          },
        } as any
      );

      expect(res.status).toBe(403);
      const json = await res.json() as any;
      expect(json.success).toBe(false);
      expect(json.error.code).toBe('USER_NOT_MAPPED');
      expect(json.error.requestId).toBeDefined();
    });

    // 6. User nonaktif (is_active = 0) ditolak 403 FORBIDDEN_USER_INACTIVE
    it('6. User nonaktif (is_active = 0) ditolak 403 FORBIDDEN_USER_INACTIVE', async () => {
      // Nonaktifkan user USR-001 sementara
      db.prepare('UPDATE users SET is_active = 0 WHERE id = ?').run('USR-001');

      const res = await app.request(
        `/api/audits/${PROD_SELF_AUDIT_ID}`,
        {
          method: 'GET',
          headers: { 'Cf-Access-Jwt-Assertion': ariImamToken },
        },
        testEnv
      );

      expect(res.status).toBe(403);
      const json = await res.json() as any;
      expect(json.success).toBe(false);
      expect(json.error.code).toBe('FORBIDDEN_USER_INACTIVE');
      expect(json.error.requestId).toBeDefined();

      // Kembalikan ke aktif
      db.prepare('UPDATE users SET is_active = 1 WHERE id = ?').run('USR-001');
    });

    // 7. User dengan depot salah ditolak 403 DEPOT_ACCESS_DENIED
    it('7. User dengan depot salah ditolak 403 DEPOT_ACCESS_DENIED', async () => {
      const res = await app.request(
        `/api/audits/${PROD_SELF_AUDIT_ID}/start`,
        {
          method: 'POST',
          headers: { 'Cf-Access-Jwt-Assertion': picBarosToken },
        },
        testEnv
      );

      expect(res.status).toBe(403);
      const json = await res.json() as any;
      expect(json.success).toBe(false);
      expect(json.error.code).toBe('DEPOT_ACCESS_DENIED');
      expect(json.error.requestId).toBeDefined();
    });

    // 8. ari.imam@daya-motora.com dapat memulai audit-self-krw-prod (200 OK, started_at terisi)
    it('8. ari.imam@daya-motora.com dapat memulai audit-self-krw-prod (200 OK, started_at terisi)', async () => {
      const res = await app.request(
        `/api/audits/${PROD_SELF_AUDIT_ID}/start`,
        { method: 'POST' },
        testEnv,
        {
          access: {
            getIdentity: async () => ({
              email: 'ari.imam@daya-motora.com',
            }),
          },
        } as any
      );

      expect(res.status).toBe(200);
      const json = await res.json() as any;
      expect(json.success).toBe(true);
      expect(json.data.audit.started_at).not.toBeNull();
      expect(json.data.audit.version).toBe(2);
    });

    // 9. pic.karawang@qas.internal tetap ditolak 403 AUDIT_NOT_ASSIGNED
    it('9. pic.karawang@qas.internal tetap ditolak 403 AUDIT_NOT_ASSIGNED', async () => {
      const res = await app.request(
        `/api/audits/${PROD_SELF_AUDIT_ID}/start`,
        {
          method: 'POST',
          headers: { 'Cf-Access-Jwt-Assertion': picInternalToken },
        },
        testEnv
      );

      expect(res.status).toBe(403);
      const json = await res.json() as any;
      expect(json.success).toBe(false);
      expect(json.error.code).toBe('AUDIT_NOT_ASSIGNED');
      expect(json.error.requestId).toBeDefined();
    });

    // 10. Tidak ada audit duplikat (COUNT = 1)
    it('10. Tidak ada audit duplikat (COUNT = 1)', async () => {
      const countRow = db.prepare(`
        SELECT COUNT(*) as count 
        FROM audits 
        WHERE cycle_id = ? AND depot_id = ? AND audit_type = ?
      `).get(PROD_CYCLE_ID, 'depot-krw', 'SELF') as any;

      expect(countRow.count).toBe(1);
    });

    // 11. AUDIT_STARTED hanya tercatat satu kali di audit_events
    it('11. AUDIT_STARTED hanya tercatat satu kali di audit_events', async () => {
      // Panggilan 1
      await app.request(
        `/api/audits/${PROD_SELF_AUDIT_ID}/start`,
        { method: 'POST', headers: { 'Cf-Access-Jwt-Assertion': ariImamToken } },
        testEnv
      );

      // Panggilan 2
      await app.request(
        `/api/audits/${PROD_SELF_AUDIT_ID}/start`,
        { method: 'POST', headers: { 'Cf-Access-Jwt-Assertion': ariImamToken } },
        testEnv
      );

      // Verifikasi event AUDIT_STARTED tepat 1
      const events = db.prepare(
        "SELECT * FROM audit_events WHERE entity_id = ? AND event_type = 'AUDIT_STARTED'"
      ).all(PROD_SELF_AUDIT_ID) as any[];

      expect(events.length).toBe(1);
    });
  });

  describe('6. Hardening autentikasi: jalur identitas tidak terverifikasi ditolak', () => {
    it('menolak login yang hanya mengirim email tanpa password', async () => {
      const res = await app.request(
        '/api/login',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: 'ari.imam@daya-motora.com' }),
        },
        testEnv
      );

      expect(res.status).toBe(400);
      const json = await res.json() as any;
      expect(json.success).toBe(false);
      expect(json.error.code).toBe('VALIDATION_ERROR');
      expect(res.headers.get('set-cookie')).toBeNull();
    });

    it('menolak Bearer token pada endpoint production', async () => {
      const startRes = await app.request(
        `/api/audits/${PROD_SELF_AUDIT_ID}/start`,
        {
          method: 'POST',
          headers: { Authorization: `Bearer ${ariImamToken}` },
        },
        { ...testEnv, ENVIRONMENT: 'production' }
      );

      expect(startRes.status).toBe(401);
      const startJson = await startRes.json() as any;
      expect(startJson.error.code).toBe('ACCESS_IDENTITY_MISSING');
    });

    it('menolak header X-Dev-Email', async () => {
      const res = await app.request(
        `/api/audits/${PROD_SELF_AUDIT_ID}/start`,
        {
          method: 'POST',
          headers: { 'X-Dev-Email': 'ari.imam@daya-motora.com' },
        },
        testEnv
      );

      expect(res.status).toBe(401);
      const json = await res.json() as any;
      expect(json.error.code).toBe('ACCESS_IDENTITY_MISSING');
    });

    it('menolak header email Access yang tidak disertai JWT tervalidasi', async () => {
      const res = await app.request(
        `/api/audits/${PROD_SELF_AUDIT_ID}/start`,
        {
          method: 'POST',
          headers: { 'Cf-Access-Authenticated-User-Email': 'ari.imam@daya-motora.com' },
        },
        testEnv
      );

      expect(res.status).toBe(401);
      const json = await res.json() as any;
      expect(json.error.code).toBe('ACCESS_IDENTITY_MISSING');
    });
  });
});

