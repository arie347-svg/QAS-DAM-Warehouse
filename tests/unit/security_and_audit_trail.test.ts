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
import { Env, AuthUser } from '../../worker/types';
import {
  startOrGetSelfAudit,
  saveAnswer,
  submitAudit,
} from '../../worker/services/auditService';
import { uploadEvidence } from '../../worker/services/evidenceService';

const TEST_SECRET = 'test-secret-must-be-at-least-32-chars-long!';

describe('Task 10: Security Hardening, Tamper Protection & Audit Trail Matrix', () => {
  let db: any;
  let d1Mock: D1Database;
  let r2Mock: R2Bucket;
  let testEnv: Env;
  let adminToken: string;
  let auditorToken: string;
  let picKrwToken: string;

  const picKrw: AuthUser = {
    id: 'user-pic-krw',
    email: 'pic.karawang@qas.internal',
    fullName: 'PIC QAS Depo Karawang',
    isActive: true,
    scopes: [{ role: 'PIC_QAS', depotId: 'depot-krw', depotCode: 'KRW', canManageMaster: false }],
  };

  const picBrs: AuthUser = {
    id: 'user-pic-brs',
    email: 'pic.baros@qas.internal',
    fullName: 'PIC QAS Depo Baros',
    isActive: true,
    scopes: [{ role: 'PIC_QAS', depotId: 'depot-brs', depotCode: 'BRS', canManageMaster: false }],
  };

  let cycleId: string;
  let selfKrwId: string;
  let selfBrsId: string;
  let sampleQuestionId: string;
  let sampleOptionId: string;
  let sampleAnswerId: string;
  let sampleEvidenceId: string;

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
    auditorToken = await createTestJwt({ email: 'auditor@qas.internal' }, TEST_SECRET);
    picKrwToken = await createTestJwt({ email: 'pic.karawang@qas.internal' }, TEST_SECRET);

    // Scoring config setup
    const scoringConfig = {
      method: 'weighted_average',
      decimalPlaces: 2,
      rounding: 'half_up',
      naPolicy: 'exclude_from_denominator',
      categories: [
        { code: 'BAIK_SEKALI', label: 'Baik Sekali', min: 4.0 },
        { code: 'BAIK', label: 'Baik', min: 3.0 },
        { code: 'CUKUP', label: 'Cukup', min: 2.0 },
        { code: 'KURANG', label: 'Kurang', min: 0.0 },
      ],
    };

    db.prepare("UPDATE answer_options SET numeric_value = 5.0 WHERE code = 'OPT-A'").run();
    db.prepare("UPDATE answer_options SET numeric_value = 3.0 WHERE code = 'OPT-B'").run();
    db.prepare("UPDATE answer_options SET numeric_value = 1.0 WHERE code = 'OPT-C'").run();

    db.prepare(
      'UPDATE audit_template_versions SET status = ?, scoring_config_json = ? WHERE id = ?'
    ).run('PUBLISHED', JSON.stringify(scoringConfig), 'ver-qas-log-v1');

    // Create Cycle
    cycleId = 'cycle-task-10';
    db.prepare(
      `INSERT INTO audit_cycles 
       (id, code, title, period_start, period_end, self_due_at, official_due_at, status, template_version_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'OPEN', 'ver-qas-log-v1')`
    ).run(
      cycleId,
      'CYC-2026-T10',
      'Siklus Task 10 Security Review',
      '2026-10-01',
      '2026-10-31',
      '2026-10-15T23:59:59Z',
      '2026-10-25T23:59:59Z'
    );

    // Initialize Self Audit for Karawang & Baros
    const selfKrw = await startOrGetSelfAudit(d1Mock, cycleId, 'depot-krw', picKrw, 'req-init-1');
    selfKrwId = selfKrw.id;

    const selfBrs = await startOrGetSelfAudit(d1Mock, cycleId, 'depot-brs', picBrs, 'req-init-2');
    selfBrsId = selfBrs.id;

    // Grab question and option
    const qRow = db.prepare('SELECT id FROM audit_questions LIMIT 1').get() as { id: string };
    sampleQuestionId = qRow.id;

    const optRow = db.prepare('SELECT id FROM answer_options WHERE question_id = ? LIMIT 1').get(sampleQuestionId) as { id: string };
    sampleOptionId = optRow.id;

    // Save initial answer on Karawang
    const ans = await saveAnswer(
      d1Mock,
      selfKrwId,
      sampleQuestionId,
      { option_id: sampleOptionId, note: 'Catatan awal pemeriksaan Karawang' },
      picKrw,
      'req-init-ans'
    );
    sampleAnswerId = ans.id;

    // Upload sample evidence
    const ev = await uploadEvidence(
      d1Mock,
      r2Mock,
      sampleAnswerId,
      {
        name: 'bukti_penerimaan.jpg',
        type: 'image/jpeg',
        size: 1024,
        buffer: new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x01, 0x02]).buffer,
      },
      picKrw,
      'req-init-ev'
    );
    sampleEvidenceId = ev.id;
  });

  // 1. Security Response Headers
  it('1. Enforces all standard security response headers on all requests', async () => {
    const res = await app.fetch(
      new Request('http://localhost/api/health', {
        headers: { Authorization: `Bearer ${adminToken}` },
      }),
      testEnv
    );

    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Security-Policy')).toContain("default-src 'self'");
    expect(res.headers.get('X-Content-Type-Options')).toBe('nosniff');
    expect(res.headers.get('X-Frame-Options')).toBe('DENY');
    expect(res.headers.get('Referrer-Policy')).toBe('strict-origin-when-cross-origin');
    expect(res.headers.get('Strict-Transport-Security')).toBe('max-age=31536000; includeSubDomains');
    expect(res.headers.get('Permissions-Policy')).toContain('camera=(self)');
    expect(res.headers.get('Permissions-Policy')).toContain('microphone=()');
    expect(res.headers.get('X-XSS-Protection')).toBe('0');
  });

  // 2. Hard Delete Prevention & Tamper Protection
  it('2. Rejects hard delete attempts on audits with 405 HARD_DELETE_PROHIBITED', async () => {
    const res = await app.fetch(
      new Request(`http://localhost/api/audits/${selfKrwId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${adminToken}` },
      }),
      testEnv
    );

    expect(res.status).toBe(405);
    const json = (await res.json()) as any;
    expect(json.success).toBe(false);
    expect(json.error.code).toBe('HARD_DELETE_PROHIBITED');
  });

  it('3. Rejects modification and evidence deletion when audit is SUBMITTED (AUDIT_LOCKED)', async () => {
    // Fill all remaining required questions so we can submit
    const allQuestions = db.prepare('SELECT id, evidence_required FROM audit_questions').all() as any[];
    for (const q of allQuestions) {
      const opt = db.prepare('SELECT id FROM answer_options WHERE question_id = ? LIMIT 1').get(q.id) as any;
      const ansRes = await saveAnswer(
        d1Mock,
        selfKrwId,
        q.id,
        { option_id: opt.id, note: 'Lengkap' },
        picKrw,
        'req-fill'
      );
      if (q.evidence_required === 1 && ansRes.id !== sampleAnswerId) {
        await uploadEvidence(
          d1Mock,
          r2Mock,
          ansRes.id,
          {
            name: `ev_${q.id}.jpg`,
            type: 'image/jpeg',
            size: 512,
            buffer: new Uint8Array([0xff, 0xd8, 0xff, 0xe0]).buffer,
          },
          picKrw,
          'req-ev'
        );
      }
    }

    // Submit Self Audit
    await submitAudit(d1Mock, selfKrwId, picKrw, 'req-submit-krw');

    // Attempt 1: Edit answer after submitted
    const editRes = await app.fetch(
      new Request(`http://localhost/api/audits/${selfKrwId}/answers/${sampleQuestionId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${picKrwToken}`,
        },
        body: JSON.stringify({
          option_id: sampleOptionId,
          note: 'Mencoba tamper setelah submit',
        }),
      }),
      testEnv
    );

    expect(editRes.status).toBe(400);
    const editJson = (await editRes.json()) as any;
    expect(editJson.error.code).toBe('AUDIT_LOCKED');

    // Attempt 2: Delete evidence after submitted
    const delEvRes = await app.fetch(
      new Request(`http://localhost/api/evidence/${sampleEvidenceId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${picKrwToken}` },
      }),
      testEnv
    );

    expect(delEvRes.status).toBe(400);
    const delJson = (await delEvRes.json()) as any;
    expect(delJson.error.code).toBe('AUDIT_LOCKED');
  });

  // 3. Reopen Control Matrix
  it('4. Enforces strict RBAC and reason validation for audit reopening', async () => {
    // Audit must be in SUBMITTED state to be eligible for reopening
    db.prepare("UPDATE audits SET status = 'SUBMITTED' WHERE id = ?").run(selfKrwId);

    // 1. PIC tries to reopen -> 403 Forbidden
    const picReopenRes = await app.fetch(
      new Request(`http://localhost/api/audits/${selfKrwId}/reopen`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${picKrwToken}`,
        },
        body: JSON.stringify({ reason: 'Mohon izin perbaiki audit kami' }),
      }),
      testEnv
    );
    expect(picReopenRes.status).toBe(403);

    // 2. Auditor tries to reopen without valid reason (< 5 characters) -> 400 REASON_REQUIRED
    const shortReasonRes = await app.fetch(
      new Request(`http://localhost/api/audits/${selfKrwId}/reopen`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${auditorToken}`,
        },
        body: JSON.stringify({ reason: 'edit' }),
      }),
      testEnv
    );
    expect(shortReasonRes.status).toBe(400);

    // 3. Auditor reopens with formal justification -> 200 OK & Status becomes REOPENED
    const validReopenRes = await app.fetch(
      new Request(`http://localhost/api/audits/${selfKrwId}/reopen`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${auditorToken}`,
        },
        body: JSON.stringify({
          reason: 'Ditemukan bukti fisik yang perlu diperjelas pada seksi 2 penyimpanan.',
        }),
      }),
      testEnv
    );
    expect(validReopenRes.status).toBe(200);
    const reopenJson = (await validReopenRes.json()) as any;
    expect(reopenJson.success).toBe(true);
    expect(reopenJson.data.status).toBe('REOPENED');

    // 4. Verify AUDIT_REOPENED event recorded in audit_events
    const reopenEvent = db
      .prepare("SELECT * FROM audit_events WHERE entity_id = ? AND event_type = 'AUDIT_REOPENED'")
      .get(selfKrwId) as any;
    expect(reopenEvent).toBeDefined();
    expect(reopenEvent.reason).toContain('Ditemukan bukti fisik');
  });

  // 4. Audit Trail Completeness & Zero Trust Scope
  it('5. Protects Audit Trail timeline from IDOR and preserves Blind Audit Mode', async () => {
    // A. PIC Karawang can view its own audit events
    const krwEventsRes = await app.fetch(
      new Request(`http://localhost/api/audits/${selfKrwId}/events`, {
        headers: { Authorization: `Bearer ${picKrwToken}` },
      }),
      testEnv
    );
    expect(krwEventsRes.status).toBe(200);
    const krwEventsJson = (await krwEventsRes.json()) as any;
    expect(krwEventsJson.success).toBe(true);
    expect(krwEventsJson.data.events.length).toBeGreaterThan(0);

    // Verify chronological event types include AUDIT_CREATED and ANSWER_CHANGED
    const eventTypes = krwEventsJson.data.events.map((e: any) => e.event_type);
    expect(eventTypes).toContain('AUDIT_CREATED');
    expect(eventTypes).toContain('ANSWER_CHANGED');

    // B. IDOR Pen-test: PIC Karawang attempts to view Baros audit events -> 403 Forbidden
    const idorRes = await app.fetch(
      new Request(`http://localhost/api/audits/${selfBrsId}/events`, {
        headers: { Authorization: `Bearer ${picKrwToken}` },
      }),
      testEnv
    );
    expect(idorRes.status).toBe(403);
    const idorJson = (await idorRes.json()) as any;
    expect(idorJson.error.code).toBe('FORBIDDEN_DEPOT_ACCESS');

    // C. Blind Audit Mode Pen-test: Auditor attempts to view Self Audit events before Official Submit -> 403 Forbidden
    const blindRes = await app.fetch(
      new Request(`http://localhost/api/audits/${selfBrsId}/events`, {
        headers: { Authorization: `Bearer ${auditorToken}` },
      }),
      testEnv
    );
    expect(blindRes.status).toBe(403);
    const blindJson = (await blindRes.json()) as any;
    expect(blindJson.error.code).toBe('BLIND_AUDIT_RESTRICTION');
  });

  // 5. Evidence Viewed Event Logging & System-wide Audit Events
  it('6. Logs EVIDENCE_VIEWED on stream and restricts global audit events to Auditor/Admin', async () => {
    // 1. View evidence via GET stream
    const viewRes = await app.fetch(
      new Request(`http://localhost/api/evidence/${sampleEvidenceId}`, {
        headers: { Authorization: `Bearer ${picKrwToken}` },
      }),
      testEnv
    );
    expect(viewRes.status).toBe(200);

    // Verify EVIDENCE_VIEWED logged in DB
    const viewEvent = db
      .prepare("SELECT * FROM audit_events WHERE entity_id = ? AND event_type = 'EVIDENCE_VIEWED'")
      .get(sampleEvidenceId) as any;
    expect(viewEvent).toBeDefined();
    expect(viewEvent.actor_user_id).toBe(picKrw.id);

    // 2. Global audit events explorer: PIC is rejected with 403
    const picGlobalRes = await app.fetch(
      new Request('http://localhost/api/audit-events', {
        headers: { Authorization: `Bearer ${picKrwToken}` },
      }),
      testEnv
    );
    expect(picGlobalRes.status).toBe(403);

    // 3. Auditor can query global audit events with pagination and filters
    const auditorGlobalRes = await app.fetch(
      new Request('http://localhost/api/audit-events?event_type=EVIDENCE_VIEWED', {
        headers: { Authorization: `Bearer ${auditorToken}` },
      }),
      testEnv
    );
    expect(auditorGlobalRes.status).toBe(200);
    const globalJson = (await auditorGlobalRes.json()) as any;
    expect(globalJson.success).toBe(true);
    expect(globalJson.data.events.length).toBeGreaterThan(0);
    expect(globalJson.data.events[0].event_type).toBe('EVIDENCE_VIEWED');
  });
});
