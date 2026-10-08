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

describe('Hardening: Atomic Concurrency, Audit Identity, & R2 Consistent Cleanup', () => {
  let db: any;
  let d1Mock: D1Database;
  let r2Mock: R2Bucket;
  let testEnv: Env;
  let adminToken: string;
  let picKrwToken: string;

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

    d1Mock = createD1Mock(db);
    r2Mock = createR2Mock();

    testEnv = {
      DB: d1Mock,
      EVIDENCE: r2Mock,
      ENVIRONMENT: 'test',
      JWT_DEV_SECRET: TEST_SECRET,
    };

    adminToken = await createTestJwt({ email: 'admin@qas.internal' }, TEST_SECRET);
    picKrwToken = await createTestJwt({ email: 'pic.karawang@qas.internal' }, TEST_SECRET);
  });

  describe('1. Atomic Optimistic Concurrency Control', () => {
    it('rejects parallel request with same client_version and returns 409 CONFLICT', async () => {
      // 1. Create cycle
      const cycleRes = await app.request(
        '/api/cycles',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Cf-Access-Jwt-Assertion': adminToken,
          },
          body: JSON.stringify({
            code: 'CYC-CONCURRENCY-1',
            title: 'Siklus Pengujian Konkurensi',
            period_start: '2026-10-01',
            period_end: '2026-12-31',
            self_due_at: '2026-10-15T23:59:59Z',
            official_due_at: '2026-10-31T23:59:59Z',
            template_version_id: 'ver-qas-log-v1',
          }),
        },
        testEnv
      );
      const cycle = ((await cycleRes.json()) as any).data;

      // 2. Start Self Audit
      const selfRes = await app.request(
        `/api/cycles/${cycle.id}/self`,
        {
          method: 'POST',
          headers: { 'Cf-Access-Jwt-Assertion': picKrwToken },
        },
        testEnv
      );
      const selfAudit = ((await selfRes.json()) as any).data;
      expect(selfAudit.version).toBe(1);

      // 3. Send two parallel requests with client_version: 1
      const qId = 'q-j1-dis-01';
      const [res1, res2] = await Promise.all([
        app.request(
          `/api/audits/${selfAudit.id}/answers/${qId}`,
          {
            method: 'PUT',
            headers: {
              'Content-Type': 'application/json',
              'Cf-Access-Jwt-Assertion': picKrwToken,
            },
            body: JSON.stringify({
              option_id: 'opt-j1-dis-01-1',
              note: 'Perubahan dari Perangkat A',
              client_version: 1,
            }),
          },
          testEnv
        ),
        app.request(
          `/api/audits/${selfAudit.id}/answers/${qId}`,
          {
            method: 'PUT',
            headers: {
              'Content-Type': 'application/json',
              'Cf-Access-Jwt-Assertion': picKrwToken,
            },
            body: JSON.stringify({
              option_id: 'opt-j1-dis-01-2',
              note: 'Perubahan dari Perangkat B',
              client_version: 1,
            }),
          },
          testEnv
        ),
      ]);

      const statuses = [res1.status, res2.status];
      // Exactly one request must succeed (200), and exactly one request must be rejected (409)
      expect(statuses).toContain(200);
      expect(statuses).toContain(409);

      const conflictRes = res1.status === 409 ? res1 : res2;
      const conflictBody = (await conflictRes.json()) as any;
      expect(conflictBody.error.code).toBe('CONFLICT');
      expect(conflictBody.error.message).toBe('Draft telah diperbarui dari perangkat lain.');

      // Verify audit version in database is now 2
      const auditInDb = db.prepare('SELECT version FROM audits WHERE id = ?').get(selfAudit.id) as any;
      expect(auditInDb.version).toBe(2);
    });
  });

  describe('2. Audit Identity & Unique Constraint Verification', () => {
    it('guarantees unique audit ID per (cycle_id, depot_id, audit_type) across cycles', async () => {
      // Create Cycle 1
      const c1Res = await app.request(
        '/api/cycles',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Cf-Access-Jwt-Assertion': adminToken,
          },
          body: JSON.stringify({
            code: 'CYC-PERIOD-1',
            title: 'Siklus Periode 1',
            period_start: '2026-01-01',
            period_end: '2026-03-31',
            self_due_at: '2026-01-15T23:59:59Z',
            official_due_at: '2026-01-31T23:59:59Z',
            template_version_id: 'ver-qas-log-v1',
          }),
        },
        testEnv
      );
      const cycle1 = ((await c1Res.json()) as any).data;

      // Create Cycle 2
      const c2Res = await app.request(
        '/api/cycles',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Cf-Access-Jwt-Assertion': adminToken,
          },
          body: JSON.stringify({
            code: 'CYC-PERIOD-2',
            title: 'Siklus Periode 2',
            period_start: '2026-04-01',
            period_end: '2026-06-30',
            self_due_at: '2026-04-15T23:59:59Z',
            official_due_at: '2026-04-30T23:59:59Z',
            template_version_id: 'ver-qas-log-v1',
          }),
        },
        testEnv
      );
      const cycle2 = ((await c2Res.json()) as any).data;

      // Start Self Audit for Depot KRW in Cycle 1
      const self1Res = await app.request(
        `/api/cycles/${cycle1.id}/self`,
        { method: 'POST', headers: { 'Cf-Access-Jwt-Assertion': picKrwToken } },
        testEnv
      );
      const self1 = ((await self1Res.json()) as any).data;

      // Start Self Audit for Depot KRW in Cycle 2
      const self2Res = await app.request(
        `/api/cycles/${cycle2.id}/self`,
        { method: 'POST', headers: { 'Cf-Access-Jwt-Assertion': picKrwToken } },
        testEnv
      );
      const self2 = ((await self2Res.json()) as any).data;

      // RULE VERIFICATION:
      // a. Both audit IDs must be distinct and non-static
      expect(self1.id).not.toBe(self2.id);
      expect(self1.id).not.toBe('aud-self-depot-krw');
      expect(self2.id).not.toBe('aud-self-depot-krw');

      // b. Answer questions in both audits
      await app.request(
        `/api/audits/${self1.id}/answers/q-j1-dis-01`,
        {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            'Cf-Access-Jwt-Assertion': picKrwToken,
          },
          body: JSON.stringify({
            option_id: 'opt-j1-dis-01-1',
            note: 'Jawaban Siklus 1',
          }),
        },
        testEnv
      );

      await app.request(
        `/api/audits/${self2.id}/answers/q-j1-dis-01`,
        {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            'Cf-Access-Jwt-Assertion': picKrwToken,
          },
          body: JSON.stringify({
            option_id: 'opt-j1-dis-01-2',
            note: 'Jawaban Siklus 2',
          }),
        },
        testEnv
      );

      // Verify answers are completely isolated
      const ans1 = db.prepare('SELECT note, option_id FROM audit_answers WHERE audit_id = ?').get(self1.id) as any;
      const ans2 = db.prepare('SELECT note, option_id FROM audit_answers WHERE audit_id = ?').get(self2.id) as any;
      expect(ans1.note).toBe('Jawaban Siklus 1');
      expect(ans2.note).toBe('Jawaban Siklus 2');
      expect(ans1.option_id).toBe('opt-j1-dis-01-1');
      expect(ans2.option_id).toBe('opt-j1-dis-01-2');

      // c. Unique constraint check: attempting to insert a duplicate (cycle_id, depot_id, audit_type) must fail
      expect(() => {
        db.prepare(`
          INSERT INTO audits (id, cycle_id, depot_id, audit_type, assigned_user_id, template_version_id, status, created_at, updated_at)
          VALUES ('aud-duplicate-test', ?, 'depot-krw', 'SELF', 'user-pic-krw', 'ver-qas-log-v1', 'DRAFT', datetime('now'), datetime('now'))
        `).run(cycle1.id);
      }).toThrow(/UNIQUE constraint failed/i);
    });
  });

  describe('3. R2 Storage Consistent Cleanup on Draft Deletion', () => {
    it('deletes R2 object, cleans D1 metadata, resets audit, and logs DRAFT_DELETED', async () => {
      // 1. Create cycle and self audit
      const cycleRes = await app.request(
        '/api/cycles',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Cf-Access-Jwt-Assertion': adminToken,
          },
          body: JSON.stringify({
            code: 'CYC-R2-CLEAN',
            title: 'Siklus Pengujian Pembersihan R2',
            period_start: '2026-10-01',
            period_end: '2026-12-31',
            self_due_at: '2026-10-15T23:59:59Z',
            official_due_at: '2026-10-31T23:59:59Z',
            template_version_id: 'ver-qas-log-v1',
          }),
        },
        testEnv
      );
      const cycle = ((await cycleRes.json()) as any).data;

      const selfRes = await app.request(
        `/api/cycles/${cycle.id}/self`,
        { method: 'POST', headers: { 'Cf-Access-Jwt-Assertion': picKrwToken } },
        testEnv
      );
      const selfAudit = ((await selfRes.json()) as any).data;

      // 2. Answer question and attach evidence file
      const ansRes = await app.request(
        `/api/audits/${selfAudit.id}/answers/q-j1-dis-01`,
        {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            'Cf-Access-Jwt-Assertion': picKrwToken,
          },
          body: JSON.stringify({
            option_id: 'opt-j1-dis-01-1',
            note: 'Catatan dengan bukti foto',
          }),
        },
        testEnv
      );
      const ans = ((await ansRes.json()) as any).data;

      const evRes = await app.request(
        `/api/answers/${ans.id}/evidence`,
        {
          method: 'POST',
          headers: { 'Cf-Access-Jwt-Assertion': picKrwToken },
          body: JSON.stringify({
            original_name: 'test-evidence-1.jpg',
            mime_type: 'image/jpeg',
            size_bytes: 2048,
          }),
        },
        testEnv
      );
      expect(evRes.status).toBe(201);
      const evData = ((await evRes.json()) as any).data;
      const evidenceId = evData.id;
      const objectKey = evData.object_key;

      // Manually put bytes into r2Mock to simulate uploaded file
      await r2Mock.put(objectKey, new Uint8Array([1, 2, 3, 4]));
      const r2Before = await r2Mock.get(objectKey);
      expect(r2Before).not.toBeNull();

      // 3. Call deleteCycleDepotDrafts via API endpoint
      const delRes = await app.request(
        `/api/audits?cycle_id=${cycle.id}&depot_id=depot-krw`,
        {
          method: 'DELETE',
          headers: { 'Cf-Access-Jwt-Assertion': picKrwToken },
        },
        testEnv
      );
      expect(delRes.status).toBe(200);
      const delData = (await delRes.json()) as any;
      expect(delData.success).toBe(true);

      // RULE VERIFICATION:
      // a. Objek R2 tidak ditemukan (terhapus dari R2)
      const r2After = await r2Mock.get(objectKey);
      expect(r2After).toBeNull();

      // b. Metadata di D1 terhapus
      const metaInDb = db.prepare('SELECT * FROM evidence_files WHERE id = ?').get(evidenceId);
      expect(metaInDb).toBeUndefined();

      // c. Endpoint bukti mengembalikan 404
      const getEvRes = await app.request(
        `/api/evidence/${evidenceId}`,
        { headers: { 'Cf-Access-Jwt-Assertion': picKrwToken } },
        testEnv
      );
      expect(getEvRes.status).toBe(404);

      // d. Jawaban draft terhapus
      const answersRemaining = db
        .prepare('SELECT * FROM audit_answers WHERE audit_id = ?')
        .all(selfAudit.id);
      expect(answersRemaining.length).toBe(0);

      // e. Status audit direset
      const auditReset = db.prepare('SELECT status, started_at, version FROM audits WHERE id = ?').get(selfAudit.id) as any;
      expect(auditReset.status).toBe('DRAFT');
      expect(auditReset.started_at).toBeNull();
      expect(auditReset.version).toBe(1);

      // f. Event audit DRAFT_DELETED tercatat di audit_events
      const eventRow = db
        .prepare("SELECT * FROM audit_events WHERE entity_id = ? AND event_type = 'DRAFT_DELETED'")
        .get(selfAudit.id) as any;
      expect(eventRow).toBeDefined();
      expect(eventRow.event_type).toBe('DRAFT_DELETED');
    });

    it('records R2_DELETE_FAILED and fails gracefully when R2 deletion encounters an error', async () => {
      // 1. Create cycle & self audit
      const cycleRes = await app.request(
        '/api/cycles',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Cf-Access-Jwt-Assertion': adminToken,
          },
          body: JSON.stringify({
            code: 'CYC-R2-FAIL',
            title: 'Siklus Pengujian Kegagalan R2',
            period_start: '2026-10-01',
            period_end: '2026-12-31',
            self_due_at: '2026-10-15T23:59:59Z',
            official_due_at: '2026-10-31T23:59:59Z',
            template_version_id: 'ver-qas-log-v1',
          }),
        },
        testEnv
      );
      const cycle = ((await cycleRes.json()) as any).data;

      const selfRes = await app.request(
        `/api/cycles/${cycle.id}/self`,
        { method: 'POST', headers: { 'Cf-Access-Jwt-Assertion': picKrwToken } },
        testEnv
      );
      const selfAudit = ((await selfRes.json()) as any).data;

      const ansRes = await app.request(
        `/api/audits/${selfAudit.id}/answers/q-j1-dis-01`,
        {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            'Cf-Access-Jwt-Assertion': picKrwToken,
          },
          body: JSON.stringify({ option_id: 'opt-j1-dis-01-1' }),
        },
        testEnv
      );
      const ans = ((await ansRes.json()) as any).data;

      const evRes = await app.request(
        `/api/answers/${ans.id}/evidence`,
        {
          method: 'POST',
          headers: { 'Cf-Access-Jwt-Assertion': picKrwToken },
          body: JSON.stringify({
            original_name: 'test-fail.jpg',
            mime_type: 'image/jpeg',
            size_bytes: 1024,
          }),
        },
        testEnv
      );
      const evData = ((await evRes.json()) as any).data;

      // Mock r2.delete to throw an error
      r2Mock.delete = async () => {
        throw new Error('R2 Network Connection Refused');
      };

      const delRes = await app.request(
        `/api/audits?cycle_id=${cycle.id}&depot_id=depot-krw`,
        {
          method: 'DELETE',
          headers: { 'Cf-Access-Jwt-Assertion': picKrwToken },
        },
        testEnv
      );

      // Operation MUST NOT report success
      expect(delRes.status).toBe(500);
      const delBody = (await delRes.json()) as any;
      expect(delBody.error.code).toBe('R2_DELETE_FAILED');

      // Verify failure event was logged to audit_events
      const failEvent = db
        .prepare("SELECT * FROM audit_events WHERE entity_id = ? AND event_type = 'R2_DELETE_FAILED'")
        .get(evData.id) as any;
      expect(failEvent).toBeDefined();

      // Verify metadata is preserved for reconciliation (not quietly wiped out)
      const metaStillExists = db.prepare('SELECT * FROM evidence_files WHERE id = ?').get(evData.id);
      expect(metaStillExists).toBeDefined();
    });

    it('reconciles orphaned evidence records marked in DELETE_PENDING state', async () => {
      // Simulasi berkas bukti yang berada pada status DELETE_PENDING (deleted_at IS NOT NULL)
      // di mana objek R2 terhapus namun transaksi D1 sempat terhenti
      const orphanKey = 'orphans/test-stuck.jpg';
      await r2Mock.put(orphanKey, new Uint8Array([9, 9]));

      // Sisipkan jawaban valid terlebih dahulu untuk memenuhi foreign key constraint
      db.prepare(`
        INSERT INTO audit_answers (id, audit_id, question_id, updated_at)
        VALUES ('ans-recon-1', 'audit-self-krw-202610', 'q-j1-dis-01', datetime('now'))
      `).run();

      db.prepare(`
        INSERT INTO evidence_files (id, answer_id, object_key, original_name, mime_type, size_bytes, uploaded_by, uploaded_at, deleted_at)
        VALUES ('ev-stuck-1', 'ans-recon-1', ?, 'stuck.jpg', 'image/jpeg', 100, 'user-pic-krw', datetime('now'), datetime('now'))
      `).run(orphanKey);

      const { reconcilePendingEvidenceDeletions } = await import('../../worker/services/auditService');
      const reconResult = await reconcilePendingEvidenceDeletions(d1Mock, r2Mock);
      expect(reconResult.checked_count).toBe(1);
      expect(reconResult.cleaned_count).toBe(1);

      // Verifikasi metadata D1 telah bersih
      const checkDb = db.prepare('SELECT * FROM evidence_files WHERE id = ?').get('ev-stuck-1');
      expect(checkDb).toBeUndefined();

      // Verifikasi objek R2 telah bersih
      const checkR2 = await r2Mock.get(orphanKey);
      expect(checkR2).toBeNull();
    });
  });
});
