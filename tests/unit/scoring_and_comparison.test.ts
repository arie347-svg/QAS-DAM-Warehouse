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
  calculateAuditScore,
  applyRounding,
  DEFAULT_SCORING_CONFIG,
  ScoringConfig,
  computeConfigHash,
} from '../../worker/services/scoringEngine';
import {
  startOrGetSelfAudit,
  startOrGetOfficialAudit,
  saveAnswer,
  submitAudit,
} from '../../worker/services/auditService';

const TEST_SECRET = 'test-secret-must-be-at-least-32-chars-long!';

describe('Task 8: Scoring Engine & Comparison Snapshot Matrix', () => {
  let db: any;
  let d1Mock: D1Database;
  let r2Mock: R2Bucket;
  let testEnv: Env;
  let picKrwToken: string;
  let picBrsToken: string;
  let auditorToken: string;

  const picKrw: AuthUser = {
    id: 'user-pic-krw',
    email: 'pic.karawang@qas.internal',
    fullName: 'PIC QAS Depo Karawang',
    isActive: true,
    scopes: [{ role: 'PIC_QAS', depotId: 'depot-krw', depotCode: 'KRW', canManageMaster: false }],
  };

  const auditorUser: AuthUser = {
    id: 'user-auditor',
    email: 'auditor@qas.internal',
    fullName: 'Auditor QAS Logistik',
    isActive: true,
    scopes: [{ role: 'AUDITOR_QAS', depotId: null, depotCode: null, canManageMaster: false }],
  };

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

    picKrwToken = await createTestJwt({ email: 'pic.karawang@qas.internal' }, TEST_SECRET);
    picBrsToken = await createTestJwt({ email: 'pic.baros@qas.internal' }, TEST_SECRET);
    auditorToken = await createTestJwt({ email: 'auditor@qas.internal' }, TEST_SECRET);
  });

  /* -------------------------------------------------------------
   * 1. Scoring Engine Unit Tests (Golden Cases - PRD Bab 11)
   * ------------------------------------------------------------- */
  describe('Scoring Engine Unit Tests (Golden Cases)', () => {
    const sampleConfig: ScoringConfig = {
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

    const sections = [
      { id: 'sec-1', code: 'J1', title: 'Distribusi', weight: 1.0 },
      { id: 'sec-2', code: 'J2', title: 'Maintenance', weight: 1.0 },
    ];

    const questions = [
      { id: 'q-1', section_id: 'sec-1', code: 'Q1', weight: 1.0, chosen_option_id: 'opt-1-max' },
      { id: 'q-2', section_id: 'sec-1', code: 'Q2', weight: 1.0, chosen_option_id: 'opt-2-max' },
      { id: 'q-3', section_id: 'sec-2', code: 'Q3', weight: 1.0, chosen_option_id: 'opt-3-max' },
    ];

    const options = [
      { id: 'opt-1-max', question_id: 'q-1', code: 'A', label: 'Maksimum', numeric_value: 5.0, is_na: false },
      { id: 'opt-1-min', question_id: 'q-1', code: 'B', label: 'Minimum', numeric_value: 1.0, is_na: false },
      { id: 'opt-2-max', question_id: 'q-2', code: 'A', label: 'Maksimum', numeric_value: 5.0, is_na: false },
      { id: 'opt-2-min', question_id: 'q-2', code: 'B', label: 'Minimum', numeric_value: 1.0, is_na: false },
      { id: 'opt-2-na', question_id: 'q-2', code: 'NA', label: 'Tidak Berlaku', numeric_value: null, is_na: true },
      { id: 'opt-3-max', question_id: 'q-3', code: 'A', label: 'Maksimum', numeric_value: 5.0, is_na: false },
      { id: 'opt-3-min', question_id: 'q-3', code: 'B', label: 'Minimum', numeric_value: 1.0, is_na: false },
    ];

    it('Golden Case 1: All Maximum -> Produces Maximum Score and Top Category', async () => {
      const result = await calculateAuditScore(
        JSON.stringify(sampleConfig),
        sections,
        questions,
        options
      );

      expect(result.score).toBe(5.0);
      expect(result.category.code).toBe('BAIK_SEKALI');
      expect(result.category.label).toBe('Baik Sekali');
      expect(result.sectionScores).toHaveLength(2);
      expect(result.sectionScores[0].roundedScore).toBe(5.0);
      expect(result.sectionScores[1].roundedScore).toBe(5.0);
    });

    it('Golden Case 2: All Minimum -> Produces Minimum Score and Lowest Category', async () => {
      const minQuestions = questions.map((q) => ({
        ...q,
        chosen_option_id: q.id === 'q-1' ? 'opt-1-min' : q.id === 'q-2' ? 'opt-2-min' : 'opt-3-min',
      }));

      const result = await calculateAuditScore(
        JSON.stringify(sampleConfig),
        sections,
        minQuestions,
        options
      );

      expect(result.score).toBe(1.0);
      expect(result.category.code).toBe('KURANG');
      expect(result.category.label).toBe('Kurang');
    });

    it('Golden Case 3: N/A Policy -> Excludes N/A from denominator correctly without NaN', async () => {
      // Q1 has score 5.0, Q2 is N/A, Q3 has score 1.0
      const mixedQuestions = [
        { id: 'q-1', section_id: 'sec-1', code: 'Q1', weight: 1.0, chosen_option_id: 'opt-1-max' }, // 5.0
        { id: 'q-2', section_id: 'sec-1', code: 'Q2', weight: 1.0, chosen_option_id: 'opt-2-na' }, // N/A
        { id: 'q-3', section_id: 'sec-2', code: 'Q3', weight: 1.0, chosen_option_id: 'opt-3-min' }, // 1.0
      ];

      const result = await calculateAuditScore(
        JSON.stringify(sampleConfig),
        sections,
        mixedQuestions,
        options
      );

      // Section 1: Q1=5, Q2=NA. Sum = 5, Weight = 1. Section 1 Score = 5.0
      // Section 2: Q3=1. Sum = 1, Weight = 1. Section 2 Score = 1.0
      // Overall Average = (5.0 + 1.0) / 2 = 3.0
      expect(result.sectionScores[0].roundedScore).toBe(5.0);
      expect(result.sectionScores[0].naQuestions).toBe(1);
      expect(result.sectionScores[1].roundedScore).toBe(1.0);
      expect(result.score).toBe(3.0);
      expect(result.category.code).toBe('BAIK');
    });

    it('Golden Case 4: Rounding Half-Up Precision (4.36666... rounds to 4.37)', async () => {
      const raw = 4.366666666666666;
      const rounded = applyRounding(raw, 2, 'half_up');
      expect(rounded).toBe(4.37);

      const rawTie = 4.355;
      const roundedTie = applyRounding(rawTie, 2, 'half_up');
      expect(roundedTie).toBe(4.36);
    });

    it('Golden Case 5: Threshold Boundaries (Inclusive minimum)', async () => {
      const boundarySections = [{ id: 'sec-1', code: 'J1', title: 'J1', weight: 1.0 }];
      const boundaryQuestions = [
        { id: 'q-1', section_id: 'sec-1', code: 'Q1', weight: 1.0, chosen_option_id: 'opt-exact-4' },
      ];
      const boundaryOptions = [
        { id: 'opt-exact-4', question_id: 'q-1', code: 'A', label: 'Four', numeric_value: 4.0, is_na: false },
      ];

      const result = await calculateAuditScore(
        JSON.stringify(sampleConfig),
        boundarySections,
        boundaryQuestions,
        boundaryOptions
      );

      expect(result.score).toBe(4.0);
      expect(result.category.code).toBe('BAIK_SEKALI');
    });

    it('Config Hash Traceability: Computes consistent SHA-256', async () => {
      const configStr = JSON.stringify(DEFAULT_SCORING_CONFIG);
      const hash1 = await computeConfigHash(configStr);
      const hash2 = await computeConfigHash(configStr);
      expect(hash1).toBe(hash2);
      expect(hash1).toHaveLength(64);
    });
  });

  /* -------------------------------------------------------------
   * 2. End-to-End Audit Submit & Comparison Snapshot Generation
   * ------------------------------------------------------------- */
  describe('Submit Integration & Comparison Snapshot Creation', () => {
    let cycleId: string;
    let selfAuditId: string;
    let officialAuditId: string;

    beforeEach(async () => {
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

      // Set numeric_value to options and update template version to published
      db.prepare("UPDATE answer_options SET numeric_value = 5.0 WHERE code = 'OPT-A'").run();
      db.prepare("UPDATE answer_options SET numeric_value = 3.0 WHERE code = 'OPT-B'").run();
      db.prepare("UPDATE answer_options SET numeric_value = 1.0 WHERE code = 'OPT-C'").run();
      db.prepare("UPDATE answer_options SET numeric_value = 4.0 WHERE code = 'OPT-D'").run();
      db.prepare("UPDATE answer_options SET numeric_value = 5.0 WHERE code = 'OPT-E'").run();
      db.prepare("UPDATE answer_options SET numeric_value = 5.0 WHERE code = 'OPT-F'").run();

      db
        .prepare(
          "UPDATE audit_template_versions SET status = 'PUBLISHED', scoring_config_json = ? WHERE id = 'ver-qas-log-v1'"
        )
        .run(JSON.stringify(scoringConfig));

      // Create an open audit cycle
      cycleId = 'cyc-test-task8';
      db
        .prepare(
          `INSERT INTO audit_cycles (id, code, title, period_start, period_end, self_due_at, official_due_at, status, template_version_id)
           VALUES (?, 'CYC-2026-T8', 'Siklus Test Task 8', '2026-10-01', '2026-12-31', '2026-10-15T23:59:59Z', '2026-10-31T23:59:59Z', 'OPEN', 'ver-qas-log-v1')`
        )
        .run(cycleId);

      // Start Self Audit for Karawang
      const selfAudit = await startOrGetSelfAudit(d1Mock, cycleId, 'depot-krw', picKrw, 'req-t8-1');
      selfAuditId = selfAudit.id;

      // Fill all 17 answers for Self Audit with High Scores (OPT-A = 5.0)
      const questions = db
        .prepare(
          `SELECT q.id, q.evidence_required 
           FROM audit_questions q 
           JOIN audit_sections s ON q.section_id = s.id 
           WHERE s.version_id = 'ver-qas-log-v1'`
        )
        .all();

      for (const q of questions as any[]) {
        const opt = db
          .prepare("SELECT id FROM answer_options WHERE question_id = ? AND code = 'OPT-A'")
          .get(q.id) as any;

        const ans = await saveAnswer(
          d1Mock,
          selfAuditId,
          q.id,
          { option_id: opt.id, note: 'Self note' },
          picKrw,
          'req-t8-fill'
        );

        if (q.evidence_required === 1) {
          db
            .prepare(
              `INSERT INTO evidence_files (id, answer_id, object_key, original_name, mime_type, size_bytes, uploaded_by, uploaded_at)
               VALUES (?, ?, ?, 'evidence.jpg', 'image/jpeg', 1024, ?, '2026-10-01T00:00:00.000Z')`
            )
            .run(`evd-${ans.id}`, ans.id, `key-${ans.id}`, picKrw.id);
        }
      }

      // Submit Self Audit
      const submitSelfResult = await submitAudit(d1Mock, selfAuditId, picKrw, 'req-t8-sub-self');
      expect(submitSelfResult.audit.status).toBe('SUBMITTED');
      expect(submitSelfResult.audit.score).toBe(5.0);
      expect(submitSelfResult.audit.category).toBe('Baik Sekali');

      // Start Official Audit for Karawang
      const officialAudit = await startOrGetOfficialAudit(d1Mock, cycleId, 'depot-krw', auditorUser, 'req-t8-2');
      officialAuditId = officialAudit.id;

      // Fill Official Audit answers with Lower Scores (OPT-B = 3.0)
      for (const q of questions as any[]) {
        const opt = db
          .prepare("SELECT id FROM answer_options WHERE question_id = ? AND code = 'OPT-B'")
          .get(q.id) as any;

        const ans = await saveAnswer(
          d1Mock,
          officialAuditId,
          q.id,
          { option_id: opt?.id || null, note: 'Auditor verification note' },
          auditorUser,
          'req-t8-fill-off'
        );

        if (q.evidence_required === 1) {
          db
            .prepare(
              `INSERT INTO evidence_files (id, answer_id, object_key, original_name, mime_type, size_bytes, uploaded_by, uploaded_at)
               VALUES (?, ?, ?, 'off_evidence.jpg', 'image/jpeg', 2048, ?, '2026-10-01T00:00:00.000Z')`
            )
            .run(`evd-${ans.id}`, ans.id, `key-off-${ans.id}`, auditorUser.id);
        }
      }
    });

    it('Official submit computes scores, locks state, and creates comparison snapshot atomically', async () => {
      // Submit Official Audit
      const submitOffResult = await submitAudit(d1Mock, officialAuditId, auditorUser, 'req-t8-sub-off');
      expect(submitOffResult.audit.status).toBe('SUBMITTED');
      expect(submitOffResult.audit.score).toBe(3.0);
      expect(submitOffResult.audit.category).toBe('Baik');

      // Verify comparison_snapshots table
      const snapshot = db
        .prepare('SELECT * FROM comparison_snapshots WHERE cycle_id = ? AND depot_id = ?')
        .get(cycleId, 'depot-krw') as any;

      expect(snapshot).toBeDefined();
      expect(snapshot.self_audit_id).toBe(selfAuditId);
      expect(snapshot.official_audit_id).toBe(officialAuditId);

      const summary = JSON.parse(snapshot.summary_json);
      expect(summary.self_score).toBe(5.0);
      expect(summary.official_score).toBe(3.0);
      // Gap = Official (3.0) - Self (5.0) = -2.0
      expect(summary.score_gap).toBe(-2.0);
      expect(summary.total_questions).toBe(17);
      expect(summary.mismatch_count).toBe(17);
      expect(summary.self_higher_count).toBe(17);
      expect(summary.official_higher_count).toBe(0);

      // Verify audit_events table logged AUDIT_FINALIZED
      const finalizedEvent = db
        .prepare("SELECT * FROM audit_events WHERE entity_id = ? AND event_type = 'AUDIT_FINALIZED'")
        .get(snapshot.id) as any;
      expect(finalizedEvent).toBeDefined();
    });

    it('GET /api/comparisons/:cycleId/:depotId enforces RBAC properly', async () => {
      // Submit official audit to prepare snapshot
      await submitAudit(d1Mock, officialAuditId, auditorUser, 'req-t8-sub-off');

      // 1. PIC Karawang requesting Karawang -> Allowed (200)
      const resPicKrw = await app.request(
        `/api/comparisons/${cycleId}/depot-krw`,
        {
          headers: {
            'Cf-Access-Jwt-Assertion': picKrwToken,
          },
        },
        testEnv
      );
      expect(resPicKrw.status).toBe(200);
      const jsonPicKrw = (await resPicKrw.json()) as any;
      expect(jsonPicKrw.success).toBe(true);
      expect(jsonPicKrw.data.summary.score_gap).toBe(-2.0);

      // 2. PIC Baros requesting Karawang -> Forbidden (403)
      const resPicBaros = await app.request(
        `/api/comparisons/${cycleId}/depot-krw`,
        {
          headers: {
            'Cf-Access-Jwt-Assertion': picBrsToken,
          },
        },
        testEnv
      );
      expect(resPicBaros.status).toBe(403);
      const jsonPicBaros = (await resPicBaros.json()) as any;
      expect(jsonPicBaros.error.code).toBe('FORBIDDEN');

      // 3. Auditor requesting Karawang -> Allowed (200)
      const resAuditor = await app.request(
        `/api/comparisons/${cycleId}/depot-krw`,
        {
          headers: {
            'Cf-Access-Jwt-Assertion': auditorToken,
          },
        },
        testEnv
      );
      expect(resAuditor.status).toBe(200);
    });

    it('POST /api/audits/:id/acknowledge records PIC sign-off with note', async () => {
      // Submit official audit
      await submitAudit(d1Mock, officialAuditId, auditorUser, 'req-t8-sub-off');

      // PIC Karawang acknowledges
      const ackRes = await app.request(
        `/api/audits/${officialAuditId}/acknowledge`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Cf-Access-Jwt-Assertion': picKrwToken,
          },
          body: JSON.stringify({
            note: 'Catatan komitmen: Semua temuan selisih skor akan ditindaklanjuti dalam 7 hari.',
          }),
        },
        testEnv
      );

      expect(ackRes.status).toBe(200);
      const ackJson = (await ackRes.json()) as any;
      expect(ackJson.success).toBe(true);

      // Verify in DB
      const ackRow = db
        .prepare('SELECT * FROM acknowledgements WHERE official_audit_id = ?')
        .get(officialAuditId) as any;
      expect(ackRow).toBeDefined();
      expect(ackRow.user_id).toBe(picKrw.id);
      expect(ackRow.note).toContain('Semua temuan selisih skor');

      // Verify comparison API now returns the acknowledgement
      const compRes = await app.request(
        `/api/comparisons/${cycleId}/depot-krw`,
        {
          headers: {
            'Cf-Access-Jwt-Assertion': picKrwToken,
          },
        },
        testEnv
      );
      const compJson = (await compRes.json()) as any;
      expect(compJson.data.acknowledgement).toBeDefined();
      expect(compJson.data.acknowledgement.note).toContain('Semua temuan selisih skor');
    });
  });
});
