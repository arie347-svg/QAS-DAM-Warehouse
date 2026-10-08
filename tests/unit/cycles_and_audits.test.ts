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

describe('Audit Cycles & Self Audit Transaction Matrix (Task 5)', () => {
  let db: any;
  let d1Mock: D1Database;
  let r2Mock: R2Bucket;
  let testEnv: Env;
  let adminToken: string;
  let auditorToken: string;
  let picKrwToken: string;
  let picBrsToken: string;

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
    picBrsToken = await createTestJwt({ email: 'pic.baros@qas.internal' }, TEST_SECRET);
  });

  it('1. Cycle Creation: allows Admin, rejects PIC with 403', async () => {
    // PIC attempts to create cycle -> 403
    const picRes = await app.request(
      '/api/cycles',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Cf-Access-Jwt-Assertion': picKrwToken,
        },
        body: JSON.stringify({
          code: 'CYC-2026-Q4',
          title: 'Siklus Q4 2026',
          period_start: '2026-10-01',
          period_end: '2026-12-31',
          self_due_at: '2026-10-15T23:59:59Z',
          official_due_at: '2026-10-31T23:59:59Z',
          template_version_id: 'ver-qas-log-v1',
        }),
      },
      testEnv
    );
    expect(picRes.status).toBe(403);

    // Admin creates cycle -> 201
    const adminRes = await app.request(
      '/api/cycles',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Cf-Access-Jwt-Assertion': adminToken,
        },
        body: JSON.stringify({
          code: 'CYC-2026-Q4',
          title: 'Siklus Q4 2026',
          period_start: '2026-10-01',
          period_end: '2026-12-31',
          self_due_at: '2026-10-15T23:59:59Z',
          official_due_at: '2026-10-31T23:59:59Z',
          template_version_id: 'ver-qas-log-v1',
        }),
      },
      testEnv
    );
    expect(adminRes.status).toBe(201);
    const body = (await adminRes.json()) as any;
    expect(body.success).toBe(true);
    expect(body.data.code).toBe('CYC-2026-Q4');
  });

  it('2. Zero Trust Scope: PIC Karawang is forbidden from accessing Baros audit', async () => {
    // Create cycle as admin
    const cycleRes = await app.request(
      '/api/cycles',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Cf-Access-Jwt-Assertion': adminToken,
        },
        body: JSON.stringify({
          code: 'CYC-2026-Q4',
          title: 'Siklus Q4 2026',
          period_start: '2026-10-01',
          period_end: '2026-12-31',
          self_due_at: '2026-10-15T23:59:59Z',
          official_due_at: '2026-10-31T23:59:59Z',
          template_version_id: 'ver-qas-log-v1',
        }),
      },
      testEnv
    );
    const cycle = (await cycleRes.json()) as any;
    const cycleId = cycle.data.id;

    // PIC Karawang attempts to start self audit for Baros -> 403
    const crossStartRes = await app.request(
      `/api/cycles/${cycleId}/self`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Cf-Access-Jwt-Assertion': picKrwToken,
        },
        body: JSON.stringify({ depot_id: 'depot-brs' }),
      },
      testEnv
    );
    expect(crossStartRes.status).toBe(403);

    // PIC Baros starts Baros self audit -> 200
    const brsAuditRes = await app.request(
      `/api/cycles/${cycleId}/self`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Cf-Access-Jwt-Assertion': picBrsToken,
        },
        body: JSON.stringify({ depot_id: 'depot-brs' }),
      },
      testEnv
    );
    expect(brsAuditRes.status).toBe(200);
    const brsAudit = (await brsAuditRes.json()) as any;
    const brsAuditId = brsAudit.data.id;

    // PIC Karawang attempts to GET Baros audit detail -> 403
    const crossGetRes = await app.request(
      `/api/audits/${brsAuditId}`,
      {
        headers: { 'Cf-Access-Jwt-Assertion': picKrwToken },
      },
      testEnv
    );
    expect(crossGetRes.status).toBe(403);
  });

  it('3. Blind Audit & Sequence: Auditor cannot view self audit or start official before self is SUBMITTED', async () => {
    // 1. Setup cycle
    const cycleRes = await app.request(
      '/api/cycles',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Cf-Access-Jwt-Assertion': adminToken,
        },
        body: JSON.stringify({
          code: 'CYC-2026-Q4',
          title: 'Siklus Q4 2026',
          period_start: '2026-10-01',
          period_end: '2026-12-31',
          self_due_at: '2026-10-15T23:59:59Z',
          official_due_at: '2026-10-31T23:59:59Z',
          template_version_id: 'ver-qas-log-v1',
        }),
      },
      testEnv
    );
    const cycleId = ((await cycleRes.json()) as any).data.id;

    // 2. PIC Karawang starts self audit (status: DRAFT)
    const selfRes = await app.request(
      `/api/cycles/${cycleId}/self`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Cf-Access-Jwt-Assertion': picKrwToken,
        },
        body: JSON.stringify({ depot_id: 'depot-krw' }),
      },
      testEnv
    );
    const selfAuditId = ((await selfRes.json()) as any).data.id;

    // 3. Auditor attempts to start Official Audit before Self Audit is SUBMITTED -> 400 SELF_AUDIT_NOT_SUBMITTED
    const startOfficialRes = await app.request(
      `/api/cycles/${cycleId}/official`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Cf-Access-Jwt-Assertion': auditorToken,
        },
        body: JSON.stringify({ depot_id: 'depot-krw' }),
      },
      testEnv
    );
    expect(startOfficialRes.status).toBe(400);
    const errOfficial = (await startOfficialRes.json()) as any;
    expect(errOfficial.error.code).toBe('SELF_AUDIT_NOT_SUBMITTED');

    // 4. Auditor attempts to read Self Audit before Official is SUBMITTED -> 403 BLIND_AUDIT_RESTRICTION
    const blindRes = await app.request(
      `/api/audits/${selfAuditId}`,
      {
        headers: { 'Cf-Access-Jwt-Assertion': auditorToken },
      },
      testEnv
    );
    expect(blindRes.status).toBe(403);
    const errBlind = (await blindRes.json()) as any;
    expect(errBlind.error.code).toBe('BLIND_AUDIT_RESTRICTION');
  });

  it('4. Autosave & Completeness Validation: rejects incomplete submission, accepts complete and locks', async () => {
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
          code: 'CYC-2026-Q4',
          title: 'Siklus Q4 2026',
          period_start: '2026-10-01',
          period_end: '2026-12-31',
          self_due_at: '2026-10-15T23:59:59Z',
          official_due_at: '2026-10-31T23:59:59Z',
          template_version_id: 'ver-qas-log-v1',
        }),
      },
      testEnv
    );
    const cycleId = ((await cycleRes.json()) as any).data.id;

    const selfRes = await app.request(
      `/api/cycles/${cycleId}/self`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Cf-Access-Jwt-Assertion': picKrwToken,
        },
      },
      testEnv
    );
    const selfAuditId = ((await selfRes.json()) as any).data.id;

    // 2. Fetch questions and options from detail
    const detailRes = await app.request(
      `/api/audits/${selfAuditId}`,
      {
        headers: { 'Cf-Access-Jwt-Assertion': picKrwToken },
      },
      testEnv
    );
    expect(detailRes.status).toBe(200);
    const detail = (await detailRes.json()) as any;
    expect(detail.data.progress.total_questions).toBe(17);
    expect(detail.data.progress.answered_questions).toBe(0);

    // 3. Attempt submit when 0 questions are answered -> 400 INCOMPLETE_AUDIT
    const prematureSubmit = await app.request(
      `/api/audits/${selfAuditId}/submit`,
      {
        method: 'POST',
        headers: { 'Cf-Access-Jwt-Assertion': picKrwToken },
      },
      testEnv
    );
    expect(prematureSubmit.status).toBe(400);
    const submitErr = (await prematureSubmit.json()) as any;
    expect(submitErr.error.code).toBe('INCOMPLETE_AUDIT');
    expect(submitErr.error.details.missing_answers.length).toBe(17);

    // 4. Fill answers for all 17 questions and attach evidence where required
    for (const section of detail.data.sections) {
      for (const question of section.questions) {
        const optionId = question.options[0].id;
        const saveRes = await app.request(
          `/api/audits/${selfAuditId}/answers/${question.id}`,
          {
            method: 'PUT',
            headers: {
              'Content-Type': 'application/json',
              'Cf-Access-Jwt-Assertion': picKrwToken,
            },
            body: JSON.stringify({
              option_id: optionId,
              note: `Catatan pemeriksaan untuk ${question.code}`,
            }),
          },
          testEnv
        );
        expect(saveRes.status).toBe(200);
        const savedAnswer = (await saveRes.json()) as any;

        // If evidence is required, attach evidence metadata
        if (question.evidence_required) {
          const evRes = await app.request(
            `/api/answers/${savedAnswer.data.id}/evidence`,
            {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Cf-Access-Jwt-Assertion': picKrwToken,
              },
              body: JSON.stringify({
                original_name: `bukti-${question.code}.jpg`,
                mime_type: 'image/jpeg',
                size_bytes: 102400,
              }),
            },
            testEnv
          );
          expect(evRes.status).toBe(201);
        }
      }
    }

    // 5. Submit complete audit -> 200 SUBMITTED
    const validSubmitRes = await app.request(
      `/api/audits/${selfAuditId}/submit`,
      {
        method: 'POST',
        headers: { 'Cf-Access-Jwt-Assertion': picKrwToken },
      },
      testEnv
    );
    expect(validSubmitRes.status).toBe(200);
    const submitResult = (await validSubmitRes.json()) as any;
    expect(submitResult.data.status).toBe('SUBMITTED');
    expect(submitResult.data.submitted_at).not.toBeNull();

    // 6. Idempotency Check: Submitting again returns 200 with idempotent: true
    const reSubmitRes = await app.request(
      `/api/audits/${selfAuditId}/submit`,
      {
        method: 'POST',
        headers: { 'Cf-Access-Jwt-Assertion': picKrwToken },
      },
      testEnv
    );
    expect(reSubmitRes.status).toBe(200);
    const reSubmitResult = (await reSubmitRes.json()) as any;
    expect(reSubmitResult.idempotent).toBe(true);

    // 7. Modification Lock: Editing an answer on a SUBMITTED audit is rejected with 400 AUDIT_LOCKED
    const lockEditRes = await app.request(
      `/api/audits/${selfAuditId}/answers/q-j1-dis-01`,
      {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Cf-Access-Jwt-Assertion': picKrwToken,
        },
        body: JSON.stringify({
          option_id: 'opt-j1-dis-01-2',
          note: 'Mencoba mengedit audit yang terkunci',
        }),
      },
      testEnv
    );
    expect(lockEditRes.status).toBe(400);
    const lockErr = (await lockEditRes.json()) as any;
    expect(lockErr.error.code).toBe('AUDIT_LOCKED');
  });

  it('5. Controlled Reopen: requires Auditor/Admin with mandatory reason and logs audit event', async () => {
    // 1. Setup and submit self audit
    const cycleRes = await app.request(
      '/api/cycles',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Cf-Access-Jwt-Assertion': adminToken,
        },
        body: JSON.stringify({
          code: 'CYC-2026-Q4',
          title: 'Siklus Q4 2026',
          period_start: '2026-10-01',
          period_end: '2026-12-31',
          self_due_at: '2026-10-15T23:59:59Z',
          official_due_at: '2026-10-31T23:59:59Z',
          template_version_id: 'ver-qas-log-v1',
        }),
      },
      testEnv
    );
    const cycleId = ((await cycleRes.json()) as any).data.id;

    const selfRes = await app.request(
      `/api/cycles/${cycleId}/self`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Cf-Access-Jwt-Assertion': picKrwToken,
        },
      },
      testEnv
    );
    const selfAuditId = ((await selfRes.json()) as any).data.id;

    // Fill all answers and evidence
    const detailRes = await app.request(
      `/api/audits/${selfAuditId}`,
      { headers: { 'Cf-Access-Jwt-Assertion': picKrwToken } },
      testEnv
    );
    const detail = (await detailRes.json()) as any;

    for (const section of detail.data.sections) {
      for (const question of section.questions) {
        const saveRes = await app.request(
          `/api/audits/${selfAuditId}/answers/${question.id}`,
          {
            method: 'PUT',
            headers: {
              'Content-Type': 'application/json',
              'Cf-Access-Jwt-Assertion': picKrwToken,
            },
            body: JSON.stringify({ option_id: question.options[0].id }),
          },
          testEnv
        );
        const ans = (await saveRes.json()) as any;
        if (question.evidence_required) {
          await app.request(
            `/api/answers/${ans.data.id}/evidence`,
            {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Cf-Access-Jwt-Assertion': picKrwToken,
              },
              body: JSON.stringify({
                original_name: 'test.jpg',
                mime_type: 'image/jpeg',
                size_bytes: 1000,
              }),
            },
            testEnv
          );
        }
      }
    }

    // Submit audit
    await app.request(
      `/api/audits/${selfAuditId}/submit`,
      {
        method: 'POST',
        headers: { 'Cf-Access-Jwt-Assertion': picKrwToken },
      },
      testEnv
    );

    // 2. PIC attempts to reopen -> 403 Forbidden
    const picReopenRes = await app.request(
      `/api/audits/${selfAuditId}/reopen`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Cf-Access-Jwt-Assertion': picKrwToken,
        },
        body: JSON.stringify({ reason: 'PIC ingin merevisi jawaban' }),
      },
      testEnv
    );
    expect(picReopenRes.status).toBe(403);

    // 3. Auditor reopens with empty reason -> 400 VALIDATION_ERROR
    const emptyReasonRes = await app.request(
      `/api/audits/${selfAuditId}/reopen`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Cf-Access-Jwt-Assertion': auditorToken,
        },
        body: JSON.stringify({ reason: '   ' }),
      },
      testEnv
    );
    expect(emptyReasonRes.status).toBe(400);

    // 4. Auditor reopens with valid reason -> 200 REOPENED
    const validReopenRes = await app.request(
      `/api/audits/${selfAuditId}/reopen`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Cf-Access-Jwt-Assertion': auditorToken,
        },
        body: JSON.stringify({
          reason: 'Ditemukan bukti foto yang buram pada bagian unloading, perlu foto ulang',
        }),
      },
      testEnv
    );
    expect(validReopenRes.status).toBe(200);
    const reopenData = (await validReopenRes.json()) as any;
    expect(reopenData.data.status).toBe('REOPENED');

    // 5. PIC can now edit answers again
    const postReopenEdit = await app.request(
      `/api/audits/${selfAuditId}/answers/q-j1-dis-01`,
      {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Cf-Access-Jwt-Assertion': picKrwToken,
        },
        body: JSON.stringify({
          option_id: 'opt-j1-dis-01-2',
          note: 'Diperbarui setelah audit dibuka kembali',
        }),
      },
      testEnv
    );
    expect(postReopenEdit.status).toBe(200);

    // 6. Check audit trail in audit_events table
    const events = db
      .prepare("SELECT event_type, reason FROM audit_events WHERE entity_id = ? AND event_type = 'AUDIT_REOPENED'")
      .all(selfAuditId);
    expect(events.length).toBe(1);
    expect(events[0].reason).toContain('bukti foto yang buram');
  });
});
