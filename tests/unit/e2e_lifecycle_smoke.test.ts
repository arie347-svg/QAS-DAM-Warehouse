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
import { startOrGetSelfAudit } from '../../worker/services/auditService';

const TEST_SECRET = 'test-secret-must-be-at-least-32-chars-long!';

describe('Task 12: Release Candidate - End-to-End Operational Lifecycle Smoke Test', () => {
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

  const cycleId = 'cyc-2026-final';
  let selfAuditId: string;
  let officialAuditId: string;
  let uploadedEvidenceId: string;

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

    // Scoring engine configuration on published template
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

    // Create Audit Cycle
    db.prepare(
      `INSERT INTO audit_cycles 
       (id, code, title, period_start, period_end, self_due_at, official_due_at, status, template_version_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'OPEN', 'ver-qas-log-v1')`
    ).run(
      cycleId,
      'CYC-2026-FINAL',
      'Siklus Audit Mutu Logistik Q4 2026',
      '2026-10-01',
      '2026-10-31',
      '2026-10-15T23:59:59Z',
      '2026-10-25T23:59:59Z'
    );
  });

  it('Executes the entire QAS lifecycle seamlessly: Template -> Self Audit -> Blind Guard -> Official Audit -> Score -> Comparison -> Sign-off -> Dashboard & Export', async () => {
    // -------------------------------------------------------------
    // STEP 1: Verify Master Template Questions & Sections
    // -------------------------------------------------------------
    const tmplRes = await app.fetch(
      new Request('http://localhost/api/admin/template-versions/ver-qas-log-v1', {
        headers: { Authorization: `Bearer ${adminToken}` },
      }),
      testEnv
    );
    expect(tmplRes.status).toBe(200);
    const tmplJson = (await tmplRes.json()) as any;
    expect(tmplJson.success).toBe(true);
    expect(tmplJson.data.status).toBe('PUBLISHED');
    expect(tmplJson.data.sections.length).toBe(4);

    const totalQuestions = tmplJson.data.sections.reduce(
      (sum: number, s: any) => sum + s.questions.length,
      0
    );
    expect(totalQuestions).toBe(17);

    // -------------------------------------------------------------
    // STEP 2: PIC Karawang Initializes & Fills Self Audit
    // -------------------------------------------------------------
    const initAudit = await startOrGetSelfAudit(d1Mock, cycleId, 'depot-krw', picKrw, 'req-init-krw');
    selfAuditId = initAudit.id;
    expect(selfAuditId).toBeDefined();

    // Query questions and answer all 17 items
    const questions = db
      .prepare(
        `SELECT q.id, q.code, q.evidence_required 
         FROM audit_questions q 
         JOIN audit_sections s ON q.section_id = s.id 
         WHERE s.version_id = 'ver-qas-log-v1'
         ORDER BY q.display_order ASC`
      )
      .all() as any[];

    for (const q of questions) {
      // Pick OPT-A (5.0) for self assessment
      const opt = db
        .prepare("SELECT id FROM answer_options WHERE question_id = ? AND code = 'OPT-A'")
        .get(q.id) as any;

      const ansRes = await app.fetch(
        new Request(`http://localhost/api/audits/${selfAuditId}/answers/${q.id}`, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${picKrwToken}`,
          },
          body: JSON.stringify({
            option_id: opt.id,
            note: `Pemeriksaan mandiri ${q.code} berjalan optimal sesuai SOP.`,
          }),
        }),
        testEnv
      );
      expect(ansRes.status).toBe(200);
      const ansJson = (await ansRes.json()) as any;

      // If evidence required, upload mock inspection photo
      if (q.evidence_required === 1) {
        const evRes = await app.fetch(
          new Request(`http://localhost/api/answers/${ansJson.data.id}/evidence`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${picKrwToken}`,
            },
            body: JSON.stringify({
              original_name: `bukti_${q.code}.jpg`,
              mime_type: 'image/jpeg',
              size_bytes: 1024,
            }),
          }),
          testEnv
        );
        expect(evRes.status).toBe(201);
        const evJson = (await evRes.json()) as any;
        uploadedEvidenceId = evJson.data.id;
      }
    }

    // -------------------------------------------------------------
    // STEP 3: PIC Karawang Submits Self Audit (Locked & Scored)
    // -------------------------------------------------------------
    const submitSelfRes = await app.fetch(
      new Request(`http://localhost/api/audits/${selfAuditId}/submit`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${picKrwToken}` },
      }),
      testEnv
    );
    expect(submitSelfRes.status).toBe(200);
    const selfSubmitJson = (await submitSelfRes.json()) as any;
    expect(selfSubmitJson.data.status).toBe('SUBMITTED');
    expect(selfSubmitJson.data.score).toBe(5.0);
    expect(selfSubmitJson.data.category).toBe('Baik Sekali');

    // -------------------------------------------------------------
    // STEP 4: Blind Audit Enforcement - Auditor is strictly blinded
    // -------------------------------------------------------------
    // 4A. Auditor attempts to read Self Audit detail -> 403 BLIND_AUDIT_RESTRICTION
    const blindAuditDetailRes = await app.fetch(
      new Request(`http://localhost/api/audits/${selfAuditId}`, {
        headers: { Authorization: `Bearer ${auditorToken}` },
      }),
      testEnv
    );
    expect(blindAuditDetailRes.status).toBe(403);
    const blindJson = (await blindAuditDetailRes.json()) as any;
    expect(blindJson.error.code).toBe('BLIND_AUDIT_RESTRICTION');

    // 4B. Auditor inspects Self Audit evidence photo (Permitted for review since Self Audit is SUBMITTED)
    const blindEvidenceRes = await app.fetch(
      new Request(`http://localhost/api/evidence/${uploadedEvidenceId}`, {
        headers: { Authorization: `Bearer ${auditorToken}` },
      }),
      testEnv
    );
    expect(blindEvidenceRes.status).toBe(200);

    // 4C. Auditor views cycles list -> Self Audit score & category are sanitized (zero leakage)
    const cyclesListRes = await app.fetch(
      new Request('http://localhost/api/cycles', {
        headers: { Authorization: `Bearer ${auditorToken}` },
      }),
      testEnv
    );
    expect(cyclesListRes.status).toBe(200);
    const cyclesJson = (await cyclesListRes.json()) as any;
    const currentCycle = cyclesJson.data.find((c: any) => c.id === cycleId);
    const sanitizedSelfAudit = currentCycle.audits.find((a: any) => a.id === selfAuditId);
    expect(sanitizedSelfAudit.score).toBeNull();
    expect(sanitizedSelfAudit.category).toBeNull();

    // -------------------------------------------------------------
    // STEP 5: Auditor Performs & Submits Official Blind Audit
    // -------------------------------------------------------------
    // 5A. Start Official Audit slot
    const startOffRes = await app.fetch(
      new Request(`http://localhost/api/cycles/${cycleId}/official`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${auditorToken}`,
        },
        body: JSON.stringify({ depot_id: 'depot-krw' }),
      }),
      testEnv
    );
    expect(startOffRes.status).toBe(200);
    const startOffJson = (await startOffRes.json()) as any;
    officialAuditId = startOffJson.data.id;
    expect(officialAuditId).toBeDefined();

    // 5B. Auditor answers all 17 questions independently
    // Simulate finding: Questions in Section 1 get OPT-B (3.0), Others get OPT-A (5.0)
    for (const q of questions) {
      const isSec1 = q.code.startsWith('P-');
      const targetOptCode = isSec1 ? 'OPT-B' : 'OPT-A';

      const opt = db
        .prepare('SELECT id FROM answer_options WHERE question_id = ? AND code = ?')
        .get(q.id, targetOptCode) as any;

      const ansRes = await app.fetch(
        new Request(`http://localhost/api/audits/${officialAuditId}/answers/${q.id}`, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${auditorToken}`,
          },
          body: JSON.stringify({
            option_id: opt.id,
            note: isSec1 ? 'Temuan verifikasi: Terdapat perapihan minor.' : 'Sesuai standar.',
          }),
        }),
        testEnv
      );
      expect(ansRes.status).toBe(200);
      const offAnsJson = (await ansRes.json()) as any;

      if (q.evidence_required === 1) {
        await app.fetch(
          new Request(`http://localhost/api/answers/${offAnsJson.data.id}/evidence`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${auditorToken}`,
            },
            body: JSON.stringify({
              original_name: `official_proof_${q.code}.jpg`,
              mime_type: 'image/jpeg',
              size_bytes: 2048,
            }),
          }),
          testEnv
        );
      }
    }

    // 5C. Submit Official Audit -> triggers scoring and automatic comparison snapshot
    const submitOffRes = await app.fetch(
      new Request(`http://localhost/api/audits/${officialAuditId}/submit`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${auditorToken}` },
      }),
      testEnv
    );
    expect(submitOffRes.status).toBe(200);
    const offSubmitJson = (await submitOffRes.json()) as any;
    expect(offSubmitJson.data.status).toBe('SUBMITTED');
    expect(offSubmitJson.data.score).toBeGreaterThan(0);

    // -------------------------------------------------------------
    // STEP 6: Comparison Snapshot & PIC Acknowledgement Sign-Off
    // -------------------------------------------------------------
    // 6A. Retrieve Comparison Snapshot
    const compRes = await app.fetch(
      new Request(`http://localhost/api/comparisons/${cycleId}/depot-krw`, {
        headers: { Authorization: `Bearer ${picKrwToken}` },
      }),
      testEnv
    );
    expect(compRes.status).toBe(200);
    const compJson = (await compRes.json()) as any;
    expect(compJson.success).toBe(true);
    expect(compJson.data.summary.self_score).toBe(5.0);
    expect(compJson.data.summary.question_comparisons.length).toBe(17);
    expect(compJson.data.summary.section_comparisons.length).toBe(4);

    // 6B. PIC submits digital acknowledgement sign-off
    const ackRes = await app.fetch(
      new Request(`http://localhost/api/audits/${officialAuditId}/acknowledge`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${picKrwToken}`,
        },
        body: JSON.stringify({
          note: 'Catatan komitmen: Seluruh temuan perapihan seksi penerimaan akan kami tuntaskan dalam 3 hari kerja.',
        }),
      }),
      testEnv
    );
    expect(ackRes.status).toBe(200);
    const ackJson = (await ackRes.json()) as any;
    expect(ackJson.success).toBe(true);
    expect(ackJson.data.official_audit_id).toBe(officialAuditId);

    // -------------------------------------------------------------
    // STEP 7: Executive Dashboard & CSV Report Export
    // -------------------------------------------------------------
    // 7A. Dashboard Metrics
    const dashRes = await app.fetch(
      new Request(`http://localhost/api/dashboard?cycle_id=${cycleId}`, {
        headers: { Authorization: `Bearer ${adminToken}` },
      }),
      testEnv
    );
    expect(dashRes.status).toBe(200);
    const dashJson = (await dashRes.json()) as any;
    expect(dashJson.success).toBe(true);
    expect(dashJson.data.kpis.submitted_audits).toBe(2); // Self + Official
    expect(dashJson.data.depots.length).toBe(3); // 3 pilot depots monitored

    // 7B. CSV Export
    const csvRes = await app.fetch(
      new Request(`http://localhost/api/exports/audits.csv?cycle_id=${cycleId}`, {
        headers: { Authorization: `Bearer ${adminToken}` },
      }),
      testEnv
    );
    expect(csvRes.status).toBe(200);
    expect(csvRes.headers.get('Content-Type')).toContain('text/csv');
    const csvText = await csvRes.text();
    expect(csvText).toContain('Kode Siklus');
    expect(csvText).toContain('Karawang');

    // -------------------------------------------------------------
    // STEP 8: Immutable Audit Trail Completeness
    // -------------------------------------------------------------
    const eventsRes = await app.fetch(
      new Request(`http://localhost/api/audits/${officialAuditId}/events`, {
        headers: { Authorization: `Bearer ${adminToken}` },
      }),
      testEnv
    );
    expect(eventsRes.status).toBe(200);
    const eventsJson = (await eventsRes.json()) as any;
    expect(eventsJson.data.total_events).toBeGreaterThan(0);

    const loggedEventTypes = eventsJson.data.events.map((e: any) => e.event_type);
    expect(loggedEventTypes).toContain('AUDIT_CREATED');
    expect(loggedEventTypes).toContain('ANSWER_CHANGED');
    expect(loggedEventTypes).toContain('AUDIT_SUBMITTED');
  });
});
