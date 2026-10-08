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

describe('Official Audit Self-Reference & Segregation Suite (official_self_reference.test.ts)', () => {
  let db: any;
  let d1Mock: D1Database;
  let r2Mock: R2Bucket;
  let testEnv: Env;
  let adminToken: string;
  let auditorToken: string;
  let picKrwToken: string;
  let picBksToken: string;

  let cycleId: string;

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
    picBksToken = await createTestJwt({ email: 'pic.baros@qas.internal' }, TEST_SECRET);

    // Setup cycle
    const cycleRes = await app.request(
      '/api/cycles',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Cf-Access-Jwt-Assertion': adminToken,
        },
        body: JSON.stringify({
          code: 'CYC-2026-REF',
          title: 'Siklus Pengujian Referensi Self Audit',
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
    cycleId = cycle.data.id;
  });

  async function completeAndSubmitSelfAudit(auditId: string, token: string) {
    const detailRes = await app.request(
      `/api/audits/${auditId}`,
      { headers: { 'Cf-Access-Jwt-Assertion': token } },
      testEnv
    );
    const detail = ((await detailRes.json()) as any).data;
    let firstEvidenceId = '';

    for (const sec of detail.sections) {
      for (const q of sec.questions) {
        const opt = q.options[0];
        const saveRes = await app.request(
          `/api/audits/${auditId}/answers/${q.id}`,
          {
            method: 'PUT',
            headers: {
              'Content-Type': 'application/json',
              'Cf-Access-Jwt-Assertion': token,
            },
            body: JSON.stringify({
              option_id: opt.id,
              note: `Catatan PIC Self Audit ${q.code}`,
            }),
          },
          testEnv
        );
        const ans = ((await saveRes.json()) as any).data;

        if (q.evidence_required) {
          const evRes = await app.request(
            `/api/answers/${ans.id}/evidence`,
            {
              method: 'POST',
              headers: { 'Cf-Access-Jwt-Assertion': token },
              body: JSON.stringify({
                original_name: `bukti-self-${q.code}.jpg`,
                mime_type: 'image/jpeg',
                size_bytes: 1024,
              }),
            },
            testEnv
          );
          const evData = ((await evRes.json()) as any).data;
          if (!firstEvidenceId) firstEvidenceId = evData.id;
        }
      }
    }

    const submitRes = await app.request(
      `/api/audits/${auditId}/submit`,
      {
        method: 'POST',
        headers: { 'Cf-Access-Jwt-Assertion': token },
      },
      testEnv
    );
    expect(submitRes.status).toBe(200);
    return { detail, firstEvidenceId };
  }

  it('1. Prerequisite Guard: Ringkasan Self hanya muncul setelah Self Audit SUBMITTED', async () => {
    // 1. Official Audit cannot be started when Self Audit is not created
    const resNoSelf = await app.request(
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
    expect(resNoSelf.status).toBe(400);
    const errNoSelf = (await resNoSelf.json()) as any;
    expect(errNoSelf.error.code).toBe('SELF_AUDIT_NOT_SUBMITTED');

    // 2. Start Self Audit as DRAFT
    const selfRes = await app.request(
      `/api/cycles/${cycleId}/self`,
      {
        method: 'POST',
        headers: { 'Cf-Access-Jwt-Assertion': picKrwToken },
      },
      testEnv
    );
    expect(selfRes.status).toBe(200);

    // 3. Official Audit cannot be started when Self Audit is still DRAFT
    const resDraftSelf = await app.request(
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
    expect(resDraftSelf.status).toBe(400);
    const errDraftSelf = (await resDraftSelf.json()) as any;
    expect(errDraftSelf.error.code).toBe('SELF_AUDIT_NOT_SUBMITTED');
  });

  it('2. Segregation & Reference: Jawaban Official tidak otomatis terisi, tetapi menyediakan ringkasan Self', async () => {
    // 1. PIC Karawang fills Self Audit completely and submits
    const selfRes = await app.request(
      `/api/cycles/${cycleId}/self`,
      {
        method: 'POST',
        headers: { 'Cf-Access-Jwt-Assertion': picKrwToken },
      },
      testEnv
    );
    const selfAuditId = ((await selfRes.json()) as any).data.id;
    await completeAndSubmitSelfAudit(selfAuditId, picKrwToken);

    // 2. Auditor starts Official Audit (Now allowed because Self Audit is SUBMITTED)
    const officialRes = await app.request(
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
    expect(officialRes.status).toBe(200);
    const officialAuditId = ((await officialRes.json()) as any).data.id;

    // 3. Verify Official Audit detail
    const officialDetailRes = await app.request(
      `/api/audits/${officialAuditId}`,
      { headers: { 'Cf-Access-Jwt-Assertion': auditorToken } },
      testEnv
    );
    expect(officialDetailRes.status).toBe(200);
    const officialDetail = (await officialDetailRes.json()) as any;

    // RULE VERIFICATION:
    // a. Jawaban Official TIDAK otomatis terisi
    expect(officialDetail.data.progress.answered_questions).toBe(0);
    for (const sec of officialDetail.data.sections) {
      for (const q of sec.questions) {
        expect(q.current_answer).toBeUndefined();
      }
    }

    // b. Ringkasan Self Audit muncul per pertanyaan sebagai referensi
    const firstQ = officialDetail.data.sections[0].questions[0];
    expect(firstQ.self_answer).toBeDefined();
    expect(firstQ.self_answer.note).toContain('Catatan PIC Self Audit');
    expect(firstQ.self_answer.option_id).toBeTruthy();
  });

  it('3. Perubahan Official tidak mengubah Self & Bukti kedua audit terpisah', async () => {
    // 1. Submit Self Audit
    const selfRes = await app.request(
      `/api/cycles/${cycleId}/self`,
      {
        method: 'POST',
        headers: { 'Cf-Access-Jwt-Assertion': picKrwToken },
      },
      testEnv
    );
    const selfAuditId = ((await selfRes.json()) as any).data.id;
    const { detail, firstEvidenceId: selfEvidenceId } = await completeAndSubmitSelfAudit(selfAuditId, picKrwToken);

    // 2. Start Official Audit
    const officialRes = await app.request(
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
    expect(officialRes.status).toBe(200);
    const officialAuditId = ((await officialRes.json()) as any).data.id;

    // 3. Auditor fills question 1 with a DIFFERENT option and note
    const q1 = detail.sections[0].questions[0];
    const auditorOpt = q1.options[1] || q1.options[0];

    const saveOfficialQ1 = await app.request(
      `/api/audits/${officialAuditId}/answers/${q1.id}`,
      {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Cf-Access-Jwt-Assertion': auditorToken,
        },
        body: JSON.stringify({
          option_id: auditorOpt.id,
          note: 'Catatan Resmi Auditor Independen',
        }),
      },
      testEnv
    );
    expect(saveOfficialQ1.status).toBe(200);
    const officialAns = (await saveOfficialQ1.json()) as any;

    // Attach Official evidence
    const offEvRes = await app.request(
      `/api/answers/${officialAns.data.id}/evidence`,
      {
        method: 'POST',
        headers: { 'Cf-Access-Jwt-Assertion': auditorToken },
        body: JSON.stringify({
          original_name: 'official-auditor-proof.jpg',
          mime_type: 'image/jpeg',
          size_bytes: 3000,
        }),
      },
      testEnv
    );
    expect(offEvRes.status).toBe(201);
    const offEvData = (await offEvRes.json()) as any;
    const officialEvidenceId = offEvData.data.id;

    // RULE VERIFICATION:
    // a. Bukti kedua audit terpisah (ID berbeda, answer_id berbeda)
    expect(officialEvidenceId).not.toBe(selfEvidenceId);
    expect(offEvData.data.answer_id).toBe(officialAns.data.id);

    // b. Perubahan Official tidak mengubah data Self Audit di database
    const selfAnsRow = db
      .prepare('SELECT * FROM audit_answers WHERE audit_id = ? AND question_id = ?')
      .get(selfAuditId, q1.id) as any;
    expect(selfAnsRow.option_id).toBe(q1.options[0].id);
    expect(selfAnsRow.note).toBe(`Catatan PIC Self Audit ${q1.code}`);
    expect(selfAnsRow.note).not.toContain('Catatan Resmi Auditor');
  });

  it('4. Otorisasi & Scope: Pengguna di luar scope tetap ditolak', async () => {
    // 1. Submit Self Audit and start Official Audit
    const selfRes = await app.request(
      `/api/cycles/${cycleId}/self`,
      {
        method: 'POST',
        headers: { 'Cf-Access-Jwt-Assertion': picKrwToken },
      },
      testEnv
    );
    const selfAuditId = ((await selfRes.json()) as any).data.id;
    await completeAndSubmitSelfAudit(selfAuditId, picKrwToken);

    const officialRes = await app.request(
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
    expect(officialRes.status).toBe(200);
    const officialAuditId = ((await officialRes.json()) as any).data.id;

    // 2. PIC Karawang mencoba edit Official Audit -> Ditolak 403
    const picEditOfficial = await app.request(
      `/api/audits/${officialAuditId}/answers/q-j1-dis-01`,
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
    expect(picEditOfficial.status).toBe(403);
    const errPicEdit = (await picEditOfficial.json()) as any;
    expect(errPicEdit.error.code).toBe('FORBIDDEN_OFFICIAL_AUDIT_EDIT');

    // 3. PIC depo lain (Bekasi) mencoba akses audit Karawang -> Ditolak 403
    const foreignPicView = await app.request(
      `/api/audits/${selfAuditId}`,
      { headers: { 'Cf-Access-Jwt-Assertion': picBksToken } },
      testEnv
    );
    expect(foreignPicView.status).toBe(403);
    const errForeign = (await foreignPicView.json()) as any;
    expect(errForeign.error.code).toBe('FORBIDDEN_DEPOT_ACCESS');
  });
});
