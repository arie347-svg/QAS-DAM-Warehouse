// @vitest-environment node
import { describe, it, expect, beforeEach } from 'vitest';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { DatabaseSync } = require('node:sqlite');
interface DatabaseSyncInstance {
  exec(sql: string): void;
  prepare(sql: string): {
    run(): void;
    all(): unknown[];
    get(): unknown;
  };
}
import fs from 'fs';
import path from 'path';

describe('D1 Database Schema & Seed Data Integrity (Task 2)', () => {
  let db: DatabaseSyncInstance;

  beforeEach(() => {
    db = new DatabaseSync(':memory:');
    db.exec('PRAGMA foreign_keys = ON;');

    // Load and execute migration 0001
    const schemaSql = fs.readFileSync(
      path.resolve(__dirname, '../../migrations/0001_initial_schema.sql'),
      'utf8'
    );
    db.exec(schemaSql);

    // Load and execute initial seed data
    const seedSql = fs.readFileSync(
      path.resolve(__dirname, '../../seed/seed_data.sql'),
      'utf8'
    );
    db.exec(seedSql);
  });

  it('creates all required relational tables and indexes', () => {
    const tables = db
      .prepare(
        "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name"
      )
      .all() as { name: string }[];

    const expectedTables = [
      'acknowledgements',
      'answer_options',
      'audit_answers',
      'audit_cycles',
      'audit_events',
      'audit_questions',
      'audit_sections',
      'audit_template_versions',
      'audit_templates',
      'audits',
      'comparison_snapshots',
      'depots',
      'evidence_files',
      'user_role_scopes',
      'users',
    ];

    const tableNames = tables.map((t) => t.name);
    for (const expected of expectedTables) {
      expect(tableNames).toContain(expected);
    }
  });

  it('seeds exactly 3 operational pilot depots (Karawang, Baros, Cirebon)', () => {
    const depots = db
      .prepare('SELECT code, name, is_active FROM depots ORDER BY code')
      .all() as { code: string; name: string; is_active: number }[];

    expect(depots).toHaveLength(3);
    expect(depots.map((d) => d.code)).toEqual(['BRS', 'CRB', 'KRW']);
    expect(depots.every((d) => d.is_active === 1)).toBe(true);
  });

  it('seeds initial roles & depot assignments accurately', () => {
    const userScopes = db
      .prepare(
        `SELECT u.email, s.role, d.code as depot_code, s.can_manage_master
         FROM users u
         JOIN user_role_scopes s ON u.id = s.user_id
         LEFT JOIN depots d ON s.depot_id = d.id
         ORDER BY u.email`
      )
      .all() as { email: string; role: string; depot_code: string | null; can_manage_master: number }[];

    expect(userScopes.length).toBeGreaterThanOrEqual(5);

    // 1. Verify Official Users (A. Data Pengguna & Hak Akses)
    const usr001 = userScopes.find((u) => u.email === 'ari.imam@daya-motora.com');
    expect(usr001).toBeDefined();
    expect(usr001?.role).toBe('PIC_QAS');
    expect(usr001?.depot_code).toBe('KRW');
    expect(usr001?.can_manage_master).toBe(1);

    const usr002 = userScopes.find((u) => u.email === 'indra.winata@daya-group.co.id');
    expect(usr002).toBeDefined();
    expect(usr002?.role).toBe('PIC_QAS');
    expect(usr002?.depot_code).toBe('BRS');
    expect(usr002?.can_manage_master).toBe(0);

    const usr003 = userScopes.find((u) => u.email === 'marcelia.krista@daya-motora.com');
    expect(usr003).toBeDefined();
    expect(usr003?.role).toBe('PIC_QAS');
    expect(usr003?.depot_code).toBe('CRB');
    expect(usr003?.can_manage_master).toBe(0);

    const usr004 = userScopes.find((u) => u.email === 'fachmi.herdiansyah@daya-motora.com');
    expect(usr004).toBeDefined();
    expect(usr004?.role).toBe('AUDITOR_QAS');
    expect(usr004?.depot_code).toBe('KRW');
    expect(usr004?.can_manage_master).toBe(1);

    const usr005Scopes = userScopes.filter((u) => u.email === 'antonius.tribayu@daya-motora.com');
    expect(usr005Scopes.length).toBe(2); // Baros & Cirebon
    expect(usr005Scopes.every((s) => s.role === 'AUDITOR_QAS' && s.can_manage_master === 1)).toBe(true);
    expect(usr005Scopes.map((s) => s.depot_code).sort()).toEqual(['BRS', 'CRB']);

    // 2. Verify Internal Test Fixtures
    const admin = userScopes.find((u) => u.email === 'admin@qas.internal');
    expect(admin).toBeDefined();
    expect(admin?.role).toBe('ADMIN');
    expect(admin?.can_manage_master).toBe(1);

    const auditor = userScopes.find((u) => u.email === 'auditor@qas.internal');
    expect(auditor).toBeDefined();
    expect(auditor?.role).toBe('AUDITOR_QAS');

    const picKrw = userScopes.find((u) => u.email === 'pic.karawang@qas.internal');
    expect(picKrw?.role).toBe('PIC_QAS');
    expect(picKrw?.depot_code).toBe('KRW');

    const picBrs = userScopes.find((u) => u.email === 'pic.baros@qas.internal');
    expect(picBrs?.role).toBe('PIC_QAS');
    expect(picBrs?.depot_code).toBe('BRS');

    const picCrb = userScopes.find((u) => u.email === 'pic.cirebon@qas.internal');
    expect(picCrb?.role).toBe('PIC_QAS');
    expect(picCrb?.depot_code).toBe('CRB');
  });

  it('seeds template version 1 in DRAFT status with scoring lock guardrail', () => {
    const versions = db
      .prepare('SELECT version_no, status, scoring_config_json, published_at FROM audit_template_versions')
      .all() as { version_no: number; status: string; scoring_config_json: string | null; published_at: string | null }[];

    expect(versions).toHaveLength(1);
    expect(versions[0].version_no).toBe(1);
    // Guardrail: must remain DRAFT and unpublished without verified scoring engine (Gate 5)
    expect(versions[0].status).toBe('DRAFT');
    expect(versions[0].scoring_config_json).toBeNull();
    expect(versions[0].published_at).toBeNull();
  });

  it('seeds exactly 4 audit sections across J1 and J2', () => {
    const sections = db
      .prepare('SELECT code, title, display_order FROM audit_sections ORDER BY display_order')
      .all() as { code: string; title: string; display_order: number }[];

    expect(sections).toHaveLength(4);
    expect(sections.map((s) => s.code)).toEqual(['J1-DIS', 'J1-NRFS', 'J1-MNT', 'J2-DIS']);
  });

  it('seeds exactly 17 standard questions and associated choices without unverified hardcoded scores', () => {
    const questions = db
      .prepare('SELECT code, prompt, section_id, evidence_required FROM audit_questions ORDER BY display_order')
      .all() as { code: string; prompt: string; section_id: string; evidence_required: number }[];

    expect(questions).toHaveLength(17);

    // Verify J1 vs J2 distribution
    const j1Questions = questions.filter((q) => q.code.startsWith('J1-'));
    const j2Questions = questions.filter((q) => q.code.startsWith('J2-'));
    expect(j1Questions).toHaveLength(12); // 3 DIS + 6 NRFS + 3 MNT
    expect(j2Questions).toHaveLength(5);  // 5 DIS

    // Verify options are populated
    const options = db
      .prepare('SELECT id, question_id, numeric_value FROM answer_options')
      .all() as { id: string; question_id: string; numeric_value: number | null }[];

    expect(options.length).toBeGreaterThan(60); // 74 options total
    // All numeric_values must be NULL until scoring is authorized in Gate 5
    expect(options.every((opt) => opt.numeric_value === null)).toBe(true);
  });

  it('enforces unique constraints on audits (1 SELF and 1 OFFICIAL per cycle per depot)', () => {
    // Insert a cycle
    db.prepare(`
      INSERT INTO audit_cycles (id, code, title, period_start, period_end, self_due_at, official_due_at, status, template_version_id)
      VALUES ('cycle-2026-10', 'CYC-2026-10', 'Audit Oktober 2026', '2026-10-01', '2026-10-31', '2026-10-15', '2026-10-25', 'OPEN', 'ver-qas-log-v1')
    `).run();

    // Insert first SELF audit
    db.prepare(`
      INSERT INTO audits (id, cycle_id, depot_id, audit_type, status, assigned_user_id, template_version_id, created_at, updated_at)
      VALUES ('audit-krw-self', 'cycle-2026-10', 'depot-krw', 'SELF', 'DRAFT', 'user-pic-krw', 'ver-qas-log-v1', '2026-10-01', '2026-10-01')
    `).run();

    // Inserting a duplicate SELF audit for the same cycle and depot must throw UNIQUE constraint failed
    expect(() => {
      db.prepare(`
        INSERT INTO audits (id, cycle_id, depot_id, audit_type, status, assigned_user_id, template_version_id, created_at, updated_at)
        VALUES ('audit-krw-self-duplicate', 'cycle-2026-10', 'depot-krw', 'SELF', 'DRAFT', 'user-pic-krw', 'ver-qas-log-v1', '2026-10-01', '2026-10-01')
      `).run();
    }).toThrow(/UNIQUE constraint failed/);

    // But inserting an OFFICIAL audit for the same cycle and depot succeeds
    db.prepare(`
      INSERT INTO audits (id, cycle_id, depot_id, audit_type, status, assigned_user_id, template_version_id, created_at, updated_at)
      VALUES ('audit-krw-official', 'cycle-2026-10', 'depot-krw', 'OFFICIAL', 'DRAFT', 'user-auditor', 'ver-qas-log-v1', '2026-10-01', '2026-10-01')
    `).run();

    const auditCount = db
      .prepare("SELECT COUNT(*) as count FROM audits WHERE cycle_id = 'cycle-2026-10' AND depot_id = 'depot-krw'")
      .get() as { count: number };
    expect(auditCount.count).toBe(2);
  });

  it('enforces foreign key constraints when inserting related records', () => {
    // Attempting to insert an audit with non-existent depot_id must fail
    expect(() => {
      db.prepare(`
        INSERT INTO audits (id, cycle_id, depot_id, audit_type, status, assigned_user_id, template_version_id, created_at, updated_at)
        VALUES ('audit-invalid', 'cycle-nonexistent', 'depot-nonexistent', 'SELF', 'DRAFT', 'user-pic-krw', 'ver-qas-log-v1', '2026-10-01', '2026-10-01')
      `).run();
    }).toThrow(/FOREIGN KEY constraint failed/);
  });

  it('records audit events in append-only audit trail', () => {
    db.prepare(`
      INSERT INTO audit_events (id, entity_type, entity_id, event_type, actor_user_id, reason, payload_json, request_id, created_at)
      VALUES ('evt-1', 'AUDIT', 'audit-test', 'AUDIT_CREATED', 'user-pic-krw', 'Inisialisasi Self Audit', '{"cycle":"CYC-2026-10"}', 'req-123', '2026-10-01T10:00:00.000Z')
    `).run();

    const event = db
      .prepare("SELECT * FROM audit_events WHERE id = 'evt-1'")
      .get() as { id: string; event_type: string; actor_user_id: string; reason: string };

    expect(event).toBeDefined();
    expect(event.event_type).toBe('AUDIT_CREATED');
    expect(event.actor_user_id).toBe('user-pic-krw');
    expect(event.reason).toBe('Inisialisasi Self Audit');
  });
});
