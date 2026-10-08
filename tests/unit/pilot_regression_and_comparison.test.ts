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

async function fillAndSubmitFullAudit(
  d1Mock: D1Database,
  db: any,
  auditId: string,
  user: AuthUser,
  pickDifferentFirstQuestion = false
) {
  const auditRow = db.prepare('SELECT version FROM audits WHERE id = ?').get(auditId) as any;
  let currentVersion = auditRow?.version ?? 1;

  const questions = db
    .prepare(
      `SELECT q.id, q.evidence_required 
       FROM audit_questions q 
       JOIN audit_sections s ON q.section_id = s.id 
       WHERE s.version_id = 'ver-qas-log-v1'
       ORDER BY q.display_order ASC`
    )
    .all() as any[];

  for (let i = 0; i < questions.length; i++) {
    const q = questions[i];
    const opts = db
      .prepare('SELECT id, numeric_value FROM answer_options WHERE question_id = ? ORDER BY display_order ASC')
      .all(q.id) as any[];

    let chosenOpt = opts[0];
    if (i === 0 && pickDifferentFirstQuestion && opts.length > 1) {
      chosenOpt = opts[1];
    }

    const ans = await saveAnswer(
      d1Mock,
      auditId,
      q.id,
      {
        option_id: chosenOpt.id,
        note: `Catatan ${user.fullName}`,
        client_version: currentVersion,
        client_updated_at: new Date().toISOString(),
      },
      user,
      `req-fill-${auditId}-${i}`
    );

    const updatedRow = db.prepare('SELECT version FROM audits WHERE id = ?').get(auditId) as any;
    currentVersion = updatedRow?.version ?? (currentVersion + 1);

    if (q.evidence_required === 1) {
      db.prepare(
        `INSERT INTO evidence_files (id, answer_id, object_key, original_name, mime_type, size_bytes, uploaded_by, uploaded_at)
         VALUES (?, ?, ?, 'ev.jpg', 'image/jpeg', 1024, ?, '2026-10-01T00:00:00.000Z')`
      ).run(`ev-${ans.id}`, ans.id, `key-${ans.id}`, user.id);
    }
  }

  return submitAudit(d1Mock, auditId, user, `req-sub-${auditId}`);
}

describe('Tahap 3 Regression Test: Pilot Findings (OBS-01, OBS-02, OBS-03) & Comparison Validation', () => {
  let db: any;
  let d1Mock: D1Database;
  let r2Mock: R2Bucket;
  let testEnv: Env;
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
    await createTestJwt({ email: 'auditor@qas.internal' }, TEST_SECRET);
  });

  /* -------------------------------------------------------------
   * 1. OBS-01: Submit Modal & Long Notes Layout Regression
   * ------------------------------------------------------------- */
  describe('1. OBS-01: Modal Submit Layout & Mobile 360px Specifications', () => {
    it('verifies SelfAuditPage component includes sticky footer and safe area classes', () => {
      const pageCode = fs.readFileSync(
        path.resolve(__dirname, '../../src/features/audit/SelfAuditPage.tsx'),
        'utf8'
      );

      // 1. Sticky footer at bottom
      expect(pageCode).toContain('sticky bottom-0');
      // 2. Safe area inset support
      expect(pageCode).toContain('pb-[max(0.75rem,env(safe-area-inset-bottom))]');
      // 3. Scrollable modal body with padding
      expect(pageCode).toContain('overflow-y-auto qas-scroll flex-1');
      // 4. Touch-friendly min 44px buttons
      expect(pageCode).toContain('min-h-[44px]');
      // 5. Audit summary in modal
      expect(pageCode).toContain('Pertanyaan Terisi:');
      expect(pageCode).toContain('Bukti Foto Terlampir:');
      expect(pageCode).toContain('Estimasi Skor Sementara:');
    });

    it('verifies long notes on question 17 do not disrupt submit payload or schema', async () => {
      const cycleId = 'cyc-long-notes-test';
      db.exec(
        `INSERT INTO audit_cycles (id, code, title, period_start, period_end, self_due_at, official_due_at, status, template_version_id)
         VALUES ('${cycleId}', 'CYC-LN-1', 'Siklus Long Notes', '2026-10-01', '2026-10-31', '2026-10-15', '2026-10-31', 'OPEN', 'ver-qas-log-v1')`
      );

      const selfAudit = await startOrGetSelfAudit(d1Mock, cycleId, 'depot-krw', picKrw, 'req-ln-self');
      const questions = db.prepare(
        `SELECT q.id FROM audit_questions q 
         JOIN audit_sections s ON q.section_id = s.id 
         WHERE s.version_id = 'ver-qas-log-v1' 
         ORDER BY q.display_order ASC`
      ).all() as any[];
      const q17 = questions[questions.length - 1];
      const opt = db.prepare('SELECT id FROM answer_options WHERE question_id = ? LIMIT 1').get(q17.id) as any;

      // Extremely long note (500+ characters)
      const longNote = 'Pemeriksaan lapangan menunjukkan kondisi rak buffer telah dirapikan. '.repeat(10);
      const savedAns = await saveAnswer(
        d1Mock,
        selfAudit.id,
        q17.id,
        {
          option_id: opt.id,
          note: longNote,
          client_version: 1,
          client_updated_at: new Date().toISOString(),
        },
        picKrw,
        'req-ln-save'
      );

      expect(savedAns.id).toBeDefined();
      const updatedAudit = db.prepare('SELECT version FROM audits WHERE id = ?').get(selfAudit.id) as any;
      expect(updatedAudit.version).toBe(2);

      // Verify stored note in SQLite
      const row = db.prepare('SELECT note FROM audit_answers WHERE id = ?').get(savedAns.id) as any;
      expect(row.note).toBe(longNote);
      expect(row.note.length).toBeGreaterThan(500);
    });
  });

  /* -------------------------------------------------------------
   * 2. OBS-02: Autosave Display & Priority Indicators
   * ------------------------------------------------------------- */
  describe('2. OBS-02: Autosave Status & Priority Hierarchy', () => {
    it('verifies updateSyncStatusWithPriority implementation enforces 1.5s lock and priority overrides', () => {
      const pageCode = fs.readFileSync(
        path.resolve(__dirname, '../../src/features/audit/SelfAuditPage.tsx'),
        'utf8'
      );

      // Verifies the min 1500ms saved duration logic is present
      expect(pageCode).toContain('savedUntilRef.current = Date.now() + 1500');
      // Verifies conflict, offline, unsaved, and saving take immediate priority
      expect(pageCode).toContain(
        "if (newStatus === 'conflict' || newStatus === 'offline' || newStatus === 'unsaved' || newStatus === 'saving')"
      );
    });
  });

  /* -------------------------------------------------------------
   * 3. Tahap 2 & OBS-03: Comparison Summary & Gap Filtering
   * ------------------------------------------------------------- */
  describe('3. Tahap 2 & OBS-03: Comparison Summary, Option Divergence, and Gap Filtering', () => {
    it('distinguishes identical total score (4.38 vs 4.38) from identical answers when answer choices differ', async () => {
      const cycleId = 'cyc-gap-diff-options';
      db.exec(
        `INSERT INTO audit_cycles (id, code, title, period_start, period_end, self_due_at, official_due_at, status, template_version_id)
         VALUES ('${cycleId}', 'CYC-DIFF-1', 'Siklus Tes Opsi Beda', '2026-10-01', '2026-10-31', '2026-10-15', '2026-10-31', 'OPEN', 'ver-qas-log-v1')`
      );

      const selfAudit = await startOrGetSelfAudit(d1Mock, cycleId, 'depot-krw', picKrw, 'req-co-self');
      await fillAndSubmitFullAudit(d1Mock, db, selfAudit.id, picKrw, false);

      const offAudit = await startOrGetOfficialAudit(d1Mock, cycleId, 'depot-krw', auditorUser, 'req-co-off');
      await fillAndSubmitFullAudit(d1Mock, db, offAudit.id, auditorUser, true);

      // Query comparison API
      const compRes = await app.request(
        `/api/comparisons/${cycleId}/depot-krw`,
        {
          headers: {
            'Cf-Access-Jwt-Assertion': picKrwToken,
          },
        },
        testEnv
      );

      expect(compRes.status).toBe(200);
      const compJson = (await compRes.json()) as any;
      const summary = compJson.data.summary;

      // Verify that differing answer options are tracked
      expect(summary.total_questions).toBe(17);
      expect(summary.different_options_count).toBeGreaterThanOrEqual(1);
      expect(summary.questions_with_gap_count).toBeGreaterThanOrEqual(1);

      // Verify QuestionComparisonItem includes is_option_different
      const q0 = summary.question_comparisons[0];
      expect(q0.is_option_different).toBe(true);
    });

    it('validates OBS-03 toggle behavior and code structures in ComparisonPage', () => {
      const pageCode = fs.readFileSync(
        path.resolve(__dirname, '../../src/features/comparison/ComparisonPage.tsx'),
        'utf8'
      );

      // 1. Toggle "Hanya Gap > 0"
      expect(pageCode).toContain('Hanya Gap &gt; 0');
      // 2. Default state is false
      expect(pageCode).toContain('const [onlyGap, setOnlyGap] = useState(false);');
      // 3. Count badge
      expect(pageCode).toContain('{questionsWithGap.length}');
      // 4. Tahap 2 breakdown sections
      expect(pageCode).toContain('Daftar Pertanyaan dengan Pilihan Jawaban Berbeda');
      expect(pageCode).toContain('Gap Positif Terbesar');
      expect(pageCode).toContain('Gap Negatif Terbesar');
      expect(pageCode).toContain('Perhatian Mutu:');
    });
  });

  /* -------------------------------------------------------------
   * 4. RBAC & Depot Isolation (Karawang vs Baros/Cirebon)
   * ------------------------------------------------------------- */
  describe('4. RBAC & Scoping: Karawang Active, Baros/Cirebon Held', () => {
    it('blocks PIC Baros from accessing Karawang audit or comparison (403 Forbidden)', async () => {
      const cycleId = 'cyc-rbac-krw-only';
      db.exec(
        `INSERT INTO audit_cycles (id, code, title, period_start, period_end, self_due_at, official_due_at, status, template_version_id)
         VALUES ('${cycleId}', 'CYC-KRW-ONLY', 'Siklus Karawang Only', '2026-10-01', '2026-10-31', '2026-10-15', '2026-10-31', 'OPEN', 'ver-qas-log-v1')`
      );

      const selfAudit = await startOrGetSelfAudit(d1Mock, cycleId, 'depot-krw', picKrw, 'req-rbac-self');
      await fillAndSubmitFullAudit(d1Mock, db, selfAudit.id, picKrw, false);

      const offAudit = await startOrGetOfficialAudit(d1Mock, cycleId, 'depot-krw', auditorUser, 'req-rbac-off');
      await fillAndSubmitFullAudit(d1Mock, db, offAudit.id, auditorUser, false);

      // PIC Baros tries to view Karawang audit detail
      const resAudit = await app.request(
        `/api/audits/${selfAudit.id}`,
        {
          headers: {
            'Cf-Access-Jwt-Assertion': picBrsToken,
          },
        },
        testEnv
      );
      expect(resAudit.status).toBe(403);

      // PIC Baros tries to view Karawang comparison
      const resComp = await app.request(
        `/api/comparisons/${cycleId}/depot-krw`,
        {
          headers: {
            'Cf-Access-Jwt-Assertion': picBrsToken,
          },
        },
        testEnv
      );
      expect(resComp.status).toBe(403);
    });

    it('prohibits editing submitted audit (locks state)', async () => {
      const cycleId = 'cyc-lock-immutability';
      db.exec(
        `INSERT INTO audit_cycles (id, code, title, period_start, period_end, self_due_at, official_due_at, status, template_version_id)
         VALUES ('${cycleId}', 'CYC-LOCK-1', 'Siklus Lock Test', '2026-10-01', '2026-10-31', '2026-10-15', '2026-10-31', 'OPEN', 'ver-qas-log-v1')`
      );

      const selfAudit = await startOrGetSelfAudit(d1Mock, cycleId, 'depot-krw', picKrw, 'req-lock-self');
      await fillAndSubmitFullAudit(d1Mock, db, selfAudit.id, picKrw, false);

      const q = db.prepare(
        `SELECT q.id FROM audit_questions q 
         JOIN audit_sections s ON q.section_id = s.id 
         WHERE s.version_id = 'ver-qas-log-v1' 
         LIMIT 1`
      ).get() as any;
      const opt = db.prepare('SELECT id FROM answer_options WHERE question_id = ? LIMIT 1').get(q.id) as any;

      // Try editing submitted audit -> Must be rejected
      await expect(
        saveAnswer(
          d1Mock,
          selfAudit.id,
          q.id,
          {
            option_id: opt.id,
            note: 'Percobaan Edit Setelah Submit',
            client_version: 2,
            client_updated_at: new Date().toISOString(),
          },
          picKrw,
          'req-lock-s2'
        )
      ).rejects.toThrow(/terkunci/);
    });
  });
});
