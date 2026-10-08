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
  startOrGetOfficialAudit,
  saveAnswer,
  submitAudit,
} from '../../worker/services/auditService';

const TEST_SECRET = 'test-secret-must-be-at-least-32-chars-long!';

describe('Task 9: Dashboard Aggregations & CSV Export Matrix', () => {
  let db: any;
  let d1Mock: D1Database;
  let r2Mock: R2Bucket;
  let testEnv: Env;
  let adminToken: string;
  let auditorToken: string;
  let picKrwToken: string;
  let picBrsToken: string;

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

  let cycleId: string;
  let selfKrwId: string;
  let officialKrwId: string;

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

    // 1. Setup Scoring on Template
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
    db.prepare("UPDATE answer_options SET numeric_value = 4.0 WHERE code = 'OPT-D'").run();
    db.prepare("UPDATE answer_options SET numeric_value = 5.0 WHERE code = 'OPT-E'").run();
    db.prepare("UPDATE answer_options SET numeric_value = 5.0 WHERE code = 'OPT-F'").run();

    db
      .prepare(
        "UPDATE audit_template_versions SET status = 'PUBLISHED', scoring_config_json = ? WHERE id = 'ver-qas-log-v1'"
      )
      .run(JSON.stringify(scoringConfig));

    // 2. Setup Cycle
    cycleId = 'cyc-dash-test';
    db
      .prepare(
        `INSERT INTO audit_cycles (id, code, title, period_start, period_end, self_due_at, official_due_at, status, template_version_id)
         VALUES (?, 'CYC-DASH-1', 'Siklus Dashboard Uji', '2026-10-01', '2026-12-31', '2026-10-15T23:59:59Z', '2026-10-31T23:59:59Z', 'OPEN', 'ver-qas-log-v1')`
      )
      .run(cycleId);

    // 3. Complete and submit Self Audit for Karawang (Score: 5.0)
    const selfAudit = await startOrGetSelfAudit(d1Mock, cycleId, 'depot-krw', picKrw, 'req-d-1');
    selfKrwId = selfAudit.id;

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
        selfKrwId,
        q.id,
        { option_id: opt.id, note: 'Self ok' },
        picKrw,
        'req-d-fill'
      );

      if (q.evidence_required === 1) {
        db
          .prepare(
            `INSERT INTO evidence_files (id, answer_id, object_key, original_name, mime_type, size_bytes, uploaded_by, uploaded_at)
             VALUES (?, ?, ?, 'self_ev.jpg', 'image/jpeg', 1024, ?, '2026-10-01T00:00:00.000Z')`
          )
          .run(`evd-${ans.id}`, ans.id, `k-${ans.id}`, picKrw.id);
      }
    }
    await submitAudit(d1Mock, selfKrwId, picKrw, 'req-d-sub-s');

    // 4. Complete and submit Official Audit for Karawang (Score: 3.0)
    const officialAudit = await startOrGetOfficialAudit(d1Mock, cycleId, 'depot-krw', auditorUser, 'req-d-2');
    officialKrwId = officialAudit.id;

    for (const q of questions as any[]) {
      const opt = db
        .prepare("SELECT id FROM answer_options WHERE question_id = ? AND code = 'OPT-B'")
        .get(q.id) as any;

      const ans = await saveAnswer(
        d1Mock,
        officialKrwId,
        q.id,
        { option_id: opt?.id || null, note: 'Official verify' },
        auditorUser,
        'req-d-fill-o'
      );

      if (q.evidence_required === 1) {
        db
          .prepare(
            `INSERT INTO evidence_files (id, answer_id, object_key, original_name, mime_type, size_bytes, uploaded_by, uploaded_at)
             VALUES (?, ?, ?, 'off_ev.jpg', 'image/jpeg', 2048, ?, '2026-10-01T00:00:00.000Z')`
          )
          .run(`evd-${ans.id}`, ans.id, `ko-${ans.id}`, auditorUser.id);
      }
    }
    await submitAudit(d1Mock, officialKrwId, auditorUser, 'req-d-sub-o');
  });

  describe('GET /api/dashboard', () => {
    it('Auditor receives aggregated KPIs, 3 depots summary, and gap metrics', async () => {
      const res = await app.request(
        `/api/dashboard?cycle_id=${cycleId}`,
        {
          headers: {
            'Cf-Access-Jwt-Assertion': auditorToken,
          },
        },
        testEnv
      );

      expect(res.status).toBe(200);
      const json = (await res.json()) as any;
      expect(json.success).toBe(true);

      const { data } = json;
      expect(data.kpis).toBeDefined();
      expect(data.kpis.avg_self_score).toBe(5.0);
      expect(data.kpis.avg_official_score).toBe(3.0);
      expect(data.kpis.overall_gap).toBe(-2.0);

      // Depots summary should include Karawang, Baros, Cirebon
      expect(data.depots).toHaveLength(3);
      const krwDepot = data.depots.find((d: any) => d.depot_code === 'KRW');
      expect(krwDepot.self_score).toBe(5.0);
      expect(krwDepot.official_score).toBe(3.0);
      expect(krwDepot.gap).toBe(-2.0);

      // Section gaps
      expect(data.section_gaps.length).toBeGreaterThan(0);

      // Priority findings (top mismatch questions)
      expect(data.priority_findings.length).toBeGreaterThan(0);
      expect(data.priority_findings[0].gap).toBeLessThan(0);
    });

    it('PIC Karawang receives dashboard strictly scoped to Karawang only', async () => {
      const res = await app.request(
        `/api/dashboard?cycle_id=${cycleId}`,
        {
          headers: {
            'Cf-Access-Jwt-Assertion': picKrwToken,
          },
        },
        testEnv
      );

      expect(res.status).toBe(200);
      const json = (await res.json()) as any;
      expect(json.success).toBe(true);

      // PIC should only receive 1 depot (their assigned depot)
      expect(json.data.depots).toHaveLength(1);
      expect(json.data.depots[0].depot_code).toBe('KRW');
      expect(json.data.available_depots).toHaveLength(1);
      expect(json.data.available_depots[0].code).toBe('KRW');
    });

    it('PIC Baros attempting to filter Karawang is forced to Baros only (IDOR Guard)', async () => {
      const res = await app.request(
        `/api/dashboard?cycle_id=${cycleId}&depot_id=depot-krw`,
        {
          headers: {
            'Cf-Access-Jwt-Assertion': picBrsToken,
          },
        },
        testEnv
      );

      expect(res.status).toBe(200);
      const json = (await res.json()) as any;
      expect(json.success).toBe(true);

      // Server forcefully clamped depotId to depot-brs
      expect(json.data.depots).toHaveLength(1);
      expect(json.data.depots[0].depot_code).toBe('BRS');
    });
  });

  describe('GET /api/exports/audits.csv', () => {
    it('Exports audits into CSV format with correct headers and escape safety', async () => {
      const res = await app.request(
        `/api/exports/audits.csv?cycle_id=${cycleId}`,
        {
          headers: {
            'Cf-Access-Jwt-Assertion': adminToken,
          },
        },
        testEnv
      );

      expect(res.status).toBe(200);
      expect(res.headers.get('Content-Type')).toContain('text/csv');
      expect(res.headers.get('Content-Disposition')).toContain('attachment; filename=');

      const csvText = await res.text();
      const lines = csvText.split('\r\n');

      // Verify header row
      expect(lines[0]).toContain('"Kode Siklus","Nama Siklus","Kode Depo"');
      expect(lines[0]).toContain('"Skor Akhir","Kategori"');

      // Verify data rows exist
      expect(lines.length).toBeGreaterThan(1);
      expect(csvText).toContain('"KRW"');
      expect(csvText).toContain('"5.00"'); // Self score
      expect(csvText).toContain('"3.00"'); // Official score

      // Verify audit_events logged EXPORT_CREATED
      const exportEvent = db
        .prepare("SELECT * FROM audit_events WHERE event_type = 'EXPORT_CREATED'")
        .get() as any;
      expect(exportEvent).toBeDefined();
    });

    it('PIC export only contains audits for their assigned depot', async () => {
      const res = await app.request(
        `/api/exports/audits.csv?cycle_id=${cycleId}`,
        {
          headers: {
            'Cf-Access-Jwt-Assertion': picKrwToken,
          },
        },
        testEnv
      );

      expect(res.status).toBe(200);
      const csvText = await res.text();

      // Should contain Karawang audits but NO Baros or Cirebon
      expect(csvText).toContain('"KRW"');
      expect(csvText).not.toContain('"BRS"');
      expect(csvText).not.toContain('"CRB"');
    });

    it('Auditor/Admin can export full structured report data for all depots', async () => {
      const res = await app.request(
        `/api/exports/audits-report-data?cycle_id=${cycleId}&depot_id=all&audit_type=RECONCILIATION`,
        {
          headers: {
            'Cf-Access-Jwt-Assertion': auditorToken,
          },
        },
        testEnv
      );

      expect(res.status).toBe(200);
      const json = await res.json() as any;
      expect(json.success).toBe(true);
      expect(Array.isArray(json.data)).toBe(true);
      expect(json.data.length).toBeGreaterThan(0);
      const firstReport = json.data[0];
      expect(firstReport.sections).toBeDefined();
      expect(firstReport.sections.length).toBeGreaterThan(0);
      expect(firstReport.sections[0].questions).toBeDefined();
    });

    it('PIC attempting to export data from another depot is BLOCKED with HTTP 403 FORBIDDEN_DEPOT_ACCESS', async () => {
      const res = await app.request(
        `/api/exports/audits-report-data?cycle_id=${cycleId}&depot_id=depot-brs&audit_type=RECONCILIATION`,
        {
          headers: {
            'Cf-Access-Jwt-Assertion': picKrwToken,
          },
        },
        testEnv
      );

      expect(res.status).toBe(403);
      const json = await res.json() as any;
      expect(json.success).toBe(false);
      expect(json.error.code).toBe('FORBIDDEN_DEPOT_ACCESS');
    });

    it('PIC exporting their own depot succeeds with HTTP 200', async () => {
      const res = await app.request(
        `/api/exports/audits-report-data?cycle_id=${cycleId}&depot_id=depot-krw&audit_type=RECONCILIATION`,
        {
          headers: {
            'Cf-Access-Jwt-Assertion': picKrwToken,
          },
        },
        testEnv
      );

      expect(res.status).toBe(200);
      const json = await res.json() as any;
      expect(json.success).toBe(true);
      expect(json.data.length).toBe(1);
      expect(json.data[0].depot_code).toBe('KRW');
    });
  });
});

