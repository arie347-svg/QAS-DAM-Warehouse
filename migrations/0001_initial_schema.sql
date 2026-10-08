-- Migrasi 0001: Skema Awal Aplikasi Audit QAS
-- Sesuai Panduan Bab 8 & PRD Bab 12

PRAGMA foreign_keys = ON;

-- 1. Master Depo Gudang (Karawang, Baros, Cirebon)
CREATE TABLE IF NOT EXISTS depots (
  id TEXT PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0,1)),
  created_at TEXT NOT NULL
);

-- 2. Master Pengguna & Identitas
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE COLLATE NOCASE,
  full_name TEXT NOT NULL,
  is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0,1)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

-- 3. RBAC & Cakupan Depo (Role Scope)
CREATE TABLE IF NOT EXISTS user_role_scopes (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('ADMIN', 'PIC_QAS', 'AUDITOR_QAS', 'VIEWER')),
  depot_id TEXT REFERENCES depots(id) ON DELETE SET NULL,
  can_manage_master INTEGER NOT NULL DEFAULT 0 CHECK (can_manage_master IN (0,1)),
  UNIQUE(user_id, role, depot_id)
);

-- 4. Master Template Audit
CREATE TABLE IF NOT EXISTS audit_templates (
  id TEXT PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0,1))
);

-- 5. Versi Template Audit (Immutable saat PUBLISHED)
CREATE TABLE IF NOT EXISTS audit_template_versions (
  id TEXT PRIMARY KEY,
  template_id TEXT NOT NULL REFERENCES audit_templates(id) ON DELETE CASCADE,
  version_no INTEGER NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('DRAFT', 'PUBLISHED', 'RETIRED')),
  scoring_config_json TEXT,
  published_at TEXT,
  published_by TEXT REFERENCES users(id),
  UNIQUE(template_id, version_no)
);

-- 6. Bagian / Seksi Audit (J1, J2, dsb)
CREATE TABLE IF NOT EXISTS audit_sections (
  id TEXT PRIMARY KEY,
  version_id TEXT NOT NULL REFERENCES audit_template_versions(id) ON DELETE CASCADE,
  code TEXT NOT NULL,
  title TEXT NOT NULL,
  display_order INTEGER NOT NULL,
  weight REAL,
  UNIQUE(version_id, code)
);

-- 7. Pertanyaan Audit (17 Pertanyaan Standar)
CREATE TABLE IF NOT EXISTS audit_questions (
  id TEXT PRIMARY KEY,
  section_id TEXT NOT NULL REFERENCES audit_sections(id) ON DELETE CASCADE,
  code TEXT NOT NULL,
  prompt TEXT NOT NULL,
  display_order INTEGER NOT NULL,
  evidence_required INTEGER NOT NULL DEFAULT 0 CHECK (evidence_required IN (0,1)),
  is_required INTEGER NOT NULL DEFAULT 1 CHECK (is_required IN (0,1)),
  weight REAL,
  UNIQUE(section_id, code)
);

-- 8. Pilihan Jawaban per Pertanyaan
CREATE TABLE IF NOT EXISTS answer_options (
  id TEXT PRIMARY KEY,
  question_id TEXT NOT NULL REFERENCES audit_questions(id) ON DELETE CASCADE,
  code TEXT NOT NULL,
  label TEXT NOT NULL,
  numeric_value REAL,
  display_order INTEGER NOT NULL,
  is_na INTEGER NOT NULL DEFAULT 0 CHECK (is_na IN (0,1)),
  UNIQUE(question_id, code)
);

-- 9. Siklus Audit (Periode Audit Berkala)
CREATE TABLE IF NOT EXISTS audit_cycles (
  id TEXT PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  period_start TEXT NOT NULL,
  period_end TEXT NOT NULL,
  self_due_at TEXT NOT NULL,
  official_due_at TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('DRAFT', 'OPEN', 'CLOSED')),
  template_version_id TEXT NOT NULL REFERENCES audit_template_versions(id)
);

-- 10. Transaksi Audit (SELF & OFFICIAL)
CREATE TABLE IF NOT EXISTS audits (
  id TEXT PRIMARY KEY,
  cycle_id TEXT NOT NULL REFERENCES audit_cycles(id) ON DELETE CASCADE,
  depot_id TEXT NOT NULL REFERENCES depots(id),
  audit_type TEXT NOT NULL CHECK (audit_type IN ('SELF', 'OFFICIAL')),
  status TEXT NOT NULL CHECK (status IN ('DRAFT', 'SUBMITTED', 'REOPENED', 'VOID')),
  assigned_user_id TEXT NOT NULL REFERENCES users(id),
  template_version_id TEXT NOT NULL REFERENCES audit_template_versions(id),
  score REAL,
  category TEXT,
  started_at TEXT,
  version INTEGER NOT NULL DEFAULT 1,
  submitted_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(cycle_id, depot_id, audit_type)
);

-- 11. Jawaban Audit (dengan Snapshot Historis)
CREATE TABLE IF NOT EXISTS audit_answers (
  id TEXT PRIMARY KEY,
  audit_id TEXT NOT NULL REFERENCES audits(id) ON DELETE CASCADE,
  question_id TEXT NOT NULL REFERENCES audit_questions(id),
  option_id TEXT REFERENCES answer_options(id),
  note TEXT,
  improvement_title TEXT,
  numeric_value_snapshot REAL,
  client_version INTEGER DEFAULT 1,
  updated_at TEXT NOT NULL,
  UNIQUE(audit_id, question_id)
);

-- 12. Berkas Bukti Foto / Dokumen Private R2
CREATE TABLE IF NOT EXISTS evidence_files (
  id TEXT PRIMARY KEY,
  answer_id TEXT NOT NULL REFERENCES audit_answers(id) ON DELETE CASCADE,
  object_key TEXT NOT NULL UNIQUE,
  original_name TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  size_bytes INTEGER NOT NULL,
  sha256 TEXT,
  uploaded_by TEXT NOT NULL REFERENCES users(id),
  uploaded_at TEXT NOT NULL,
  deleted_at TEXT
);

-- 13. Snapshot Perbandingan (Self vs Official saat Official Submit)
CREATE TABLE IF NOT EXISTS comparison_snapshots (
  id TEXT PRIMARY KEY,
  cycle_id TEXT NOT NULL REFERENCES audit_cycles(id) ON DELETE CASCADE,
  depot_id TEXT NOT NULL REFERENCES depots(id),
  self_audit_id TEXT NOT NULL REFERENCES audits(id),
  official_audit_id TEXT NOT NULL REFERENCES audits(id),
  summary_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  UNIQUE(cycle_id, depot_id)
);

-- 14. Audit Events (Audit Trail Wajib, Append-Only)
CREATE TABLE IF NOT EXISTS audit_events (
  id TEXT PRIMARY KEY,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  actor_user_id TEXT REFERENCES users(id),
  reason TEXT,
  payload_json TEXT,
  request_id TEXT,
  created_at TEXT NOT NULL
);

-- 15. Pengakuan Hasil Audit oleh PIC (Acknowledgement)
CREATE TABLE IF NOT EXISTS acknowledgements (
  id TEXT PRIMARY KEY,
  official_audit_id TEXT NOT NULL REFERENCES audits(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id),
  note TEXT,
  acknowledged_at TEXT NOT NULL,
  UNIQUE(official_audit_id, user_id)
);

-- Indeks Minimum untuk Kinerja & Query
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_user_roles ON user_role_scopes(user_id, depot_id);
CREATE INDEX IF NOT EXISTS idx_questions_section ON audit_questions(section_id, display_order);
CREATE INDEX IF NOT EXISTS idx_audits_cycle_depot ON audits(cycle_id, depot_id);
CREATE INDEX IF NOT EXISTS idx_answers_audit ON audit_answers(audit_id);
CREATE INDEX IF NOT EXISTS idx_events_entity ON audit_events(entity_type, entity_id, created_at);
CREATE INDEX IF NOT EXISTS idx_evidence_answer ON evidence_files(answer_id, deleted_at);
