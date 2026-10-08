import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const masterDataPath = path.resolve(__dirname, '../src/lib/masterQuestionsData.ts');
const content = fs.readFileSync(masterDataPath, 'utf8');

const optRegex = /{\s*id:\s*'(opt-[^']+)',\s*code:\s*'([^']+)',\s*label:\s*'([^']+)',\s*numeric_value:\s*([0-9.]+|null),\s*display_order:\s*(\d+),\s*is_na:\s*(true|false)\s*}/g;
let m;
const optionsSql = [];
while ((m = optRegex.exec(content)) !== null) {
  const [_, id, code, label, numVal, order, isNa] = m;
  const qId = id.replace(/opt-/, 'q-').replace(/-\d+$/, '');
  const escapedLabel = label.replace(/'/g, "''");
  const naInt = isNa === 'true' ? 1 : 0;
  optionsSql.push(`('${id}', '${qId}', '${code}', '${escapedLabel}', ${numVal}, ${order}, ${naInt})`);
}

console.log('Successfully extracted', optionsSql.length, 'options');

const pilotSql = `-- Seed Pilot Terbatas Depo Karawang
-- Data Minimum: 1 Template PUBLISHED, 17 Soal Aktif, 74 Opsi dengan Bobot Resmi, 1 Siklus Pilot Karawang Bersih

-- 1. Master Depo
INSERT OR IGNORE INTO depots (id, code, name, is_active, created_at) VALUES
('depot-krw', 'KRW', 'Depo Gudang Karawang', 1, '2026-10-01T00:00:00.000Z'),
('depot-brs', 'BRS', 'Depo Gudang Baros', 1, '2026-10-01T00:00:00.000Z'),
('depot-crb', 'CRB', 'Depo Gudang Cirebon', 1, '2026-10-01T00:00:00.000Z');

-- 2. Pengguna Resmi
INSERT OR IGNORE INTO users (id, email, full_name, is_active, created_at, updated_at) VALUES
('USR-001', 'ari.imam@daya-motora.com', 'Ari Imam Safari', 1, '2026-10-01T00:00:00.000Z', '2026-10-01T00:00:00.000Z'),
('USR-002', 'indra.winata@daya-group.co.id', 'Indra Winata', 1, '2026-10-01T00:00:00.000Z', '2026-10-01T00:00:00.000Z'),
('USR-004', 'fachmi.herdiansyah@daya-motora.com', 'Fachmi Herdiansyah', 1, '2026-10-01T00:00:00.000Z', '2026-10-01T00:00:00.000Z'),
('user-admin', 'admin@qas.internal', 'Administrator QAS Pusat', 1, '2026-10-01T00:00:00.000Z', '2026-10-01T00:00:00.000Z'),
('user-auditor', 'auditor@qas.internal', 'Auditor QAS Logistik', 1, '2026-10-01T00:00:00.000Z', '2026-10-01T00:00:00.000Z'),
('user-pic-krw', 'pic.karawang@qas.internal', 'PIC QAS Depo Karawang', 1, '2026-10-01T00:00:00.000Z', '2026-10-01T00:00:00.000Z'),
('user-pic-brs', 'pic.baros@qas.internal', 'PIC QAS Depo Baros (Akun Negatif)', 1, '2026-10-01T00:00:00.000Z', '2026-10-01T00:00:00.000Z');

-- 3. Scope Peran & Akses Master
INSERT OR IGNORE INTO user_role_scopes (id, user_id, role, depot_id, can_manage_master) VALUES
('scope-usr-001', 'USR-001', 'PIC_QAS', 'depot-krw', 0),
('scope-usr-002', 'USR-002', 'PIC_QAS', 'depot-brs', 0),
('scope-usr-004', 'USR-004', 'AUDITOR_QAS', NULL, 1),
('scope-admin', 'user-admin', 'ADMIN', NULL, 1),
('scope-auditor', 'user-auditor', 'AUDITOR_QAS', NULL, 1),
('scope-pic-krw', 'user-pic-krw', 'PIC_QAS', 'depot-krw', 0),
('scope-pic-brs', 'user-pic-brs', 'PIC_QAS', 'depot-brs', 0);

-- 4. Template Audit & Versi 1 (PUBLISHED)
INSERT OR IGNORE INTO audit_templates (id, code, name, is_active) VALUES
('tpl-qas-log', 'QAS-LOG-SMH', 'Audit Standar Mutu Logistik Sepeda Motor Honda', 1);

INSERT OR REPLACE INTO audit_template_versions (id, template_id, version_no, status, scoring_config_json, published_at, published_by) VALUES
('ver-qas-log-v1', 'tpl-qas-log', 1, 'PUBLISHED', '{"method":"weighted_average","decimalPlaces":2,"rounding":"half_up","naPolicy":"exclude_from_denominator","categories":[{"code":"ISTIMEWA","label":"Istimewa","min":4.61},{"code":"BAIK_SEKALI","label":"Baik Sekali","min":4.36},{"code":"BAIK","label":"Baik","min":4.00},{"code":"BURUK","label":"Buruk","min":2.00},{"code":"BURUK_SEKALI","label":"Buruk Sekali","min":0.00}]}', '2026-10-01T00:00:00.000Z', 'USR-004');

-- 5. Bagian Audit dengan Bobot Resmi Hierarkis
INSERT OR REPLACE INTO audit_sections (id, version_id, code, title, display_order, weight) VALUES
('sec-j1-dis', 'ver-qas-log-v1', 'J1-DIS', 'J1 - AHM to MD (Distribusi)', 1, 1.0),
('sec-j1-nrfs', 'ver-qas-log-v1', 'J1-NRFS', 'J1 - AHM to MD (NRFS)', 2, 1.0),
('sec-j1-mnt', 'ver-qas-log-v1', 'J1-MNT', 'J1 - AHM to MD (Maintenance)', 3, 1.0),
('sec-j2-dis', 'ver-qas-log-v1', 'J2-DIS', 'J2 - MD to Dealer', 4, 3.0);

-- 6. 17 Pertanyaan Standar Audit
INSERT OR REPLACE INTO audit_questions (id, section_id, code, prompt, display_order, evidence_required, is_required, weight) VALUES
('q-j1-dis-01', 'sec-j1-dis', 'J1-01', 'Kontrol proses transportasi dari AHM ke Main Dealer', 1, 1, 1, 1.0),
('q-j1-dis-02', 'sec-j1-dis', 'J1-02', 'Prosedur unloading dan kelengkapan dokumen shipping list', 2, 1, 1, 1.0),
('q-j1-dis-03', 'sec-j1-dis', 'J1-03', 'Pemeriksaan unit motor (visual & kelengkapan part) saat masuk gudang', 3, 1, 1, 1.0),
('q-j1-nrfs-01', 'sec-j1-nrfs', 'J1-04', 'Penanganan penemuan unit cacat/lecet akibat transportasi', 4, 1, 1, 1.0),
('q-j1-nrfs-02', 'sec-j1-nrfs', 'J1-05', 'Ketersediaan lokasi khusus unit lecet/cacat (NRFS) beridentifikasi', 5, 1, 1, 1.0),
('q-j1-nrfs-03', 'sec-j1-nrfs', 'J1-06', 'Ketersediaan dan kualifikasi training PIC repair unit NRFS (TTL 1-3)', 6, 1, 1, 1.0),
('q-j1-nrfs-04', 'sec-j1-nrfs', 'J1-07', 'Prosedur penggantian part unit NRFS bila stock kosong', 7, 1, 1, 1.0),
('q-j1-nrfs-05', 'sec-j1-nrfs', 'J1-08', 'Personel verifikator penyelesaian perbaikan unit NRFS', 8, 1, 1, 1.0),
('q-j1-nrfs-06', 'sec-j1-nrfs', 'J1-09', 'Monitoring penyelesaian dan order part unit NRFS ke AHM', 9, 1, 1, 1.0),
('q-j1-mnt-01', 'sec-j1-mnt', 'J1-10', 'Perawatan dan pengecekan unit di gudang berumur > 1 bulan', 10, 1, 1, 1.0),
('q-j1-mnt-02', 'sec-j1-mnt', 'J1-11', 'Prosedur penanganan unit NG akibat penyimpanan/pemindahan gudang', 11, 1, 1, 1.0),
('q-j1-mnt-03', 'sec-j1-mnt', 'J1-12', 'Tindakan perbaikan terhadap akar penyebab unit NG akibat simpan', 12, 1, 1, 1.0),
('q-j2-dis-01', 'sec-j2-dis', 'J2-01', 'Pemeriksaan kondisi dan umur battery penerimaan dari AHM', 13, 1, 1, 1.0),
('q-j2-dis-02', 'sec-j2-dis', 'J2-02', 'Implementasi sistem FIFO pengiriman unit SMH ke dealer', 14, 1, 1, 1.0),
('q-j2-dis-03', 'sec-j2-dis', 'J2-03', 'Ketersediaan & kelayakan peralatan pengikat unit armada (IK-LOG)', 15, 1, 1, 1.0),
('q-j2-dis-04', 'sec-j2-dis', 'J2-04', 'Kesesuaian titik pengikatan unit dengan Quality Point IK-LOG', 16, 1, 1, 1.0),
('q-j2-dis-05', 'sec-j2-dis', 'J2-05', 'Ketersediaan PIC kompeten untuk inspeksi unit sebelum dikirim ke dealer', 17, 1, 1, 1.0);

-- 7. 74 Opsi Jawaban dengan Nilai Skoring Resmi
INSERT OR REPLACE INTO answer_options (id, question_id, code, label, numeric_value, display_order, is_na) VALUES
${optionsSql.join(',\n')};

-- 8. Siklus Pilot Terbatas Depo Karawang (Hanya Karawang yang aktif)
INSERT OR REPLACE INTO audit_cycles (id, code, title, period_start, period_end, self_due_at, official_due_at, status, template_version_id) VALUES
('cyc-pilot-krw-2026', 'QAS-PILOT-KRW-2026', 'Siklus Pilot Terbatas Depo Karawang 2026', '2026-10-01', '2026-10-31', '2026-10-15T23:59:59Z', '2026-10-31T23:59:59Z', 'OPEN', 'ver-qas-log-v1');

-- 9. Slot Audit Karawang (Kondisi Awal: Belum Dimulai, Tanpa Aktivitas, KPI = 0)
INSERT OR REPLACE INTO audits (id, cycle_id, depot_id, audit_type, status, assigned_user_id, template_version_id, score, category, started_at, version, submitted_at, created_at, updated_at) VALUES
('audit-self-krw-pilot', 'cyc-pilot-krw-2026', 'depot-krw', 'SELF', 'DRAFT', 'USR-001', 'ver-qas-log-v1', NULL, NULL, NULL, 1, NULL, '2026-10-01T08:00:00.000Z', '2026-10-01T08:00:00.000Z'),
('audit-off-krw-pilot', 'cyc-pilot-krw-2026', 'depot-krw', 'OFFICIAL', 'DRAFT', 'USR-004', 'ver-qas-log-v1', NULL, NULL, NULL, 1, NULL, '2026-10-01T08:00:00.000Z', '2026-10-01T08:00:00.000Z');

-- Bersihkan seluruh jawaban dummy atau riwayat bukti lama
DELETE FROM audit_answers WHERE audit_id IN ('audit-self-krw-pilot', 'audit-off-krw-pilot');
DELETE FROM comparison_snapshots WHERE cycle_id = 'cyc-pilot-krw-2026';
`;

fs.writeFileSync(path.resolve(__dirname, '../seed/seed_pilot_karawang.sql'), pilotSql, 'utf8');
console.log('Successfully wrote seed/seed_pilot_karawang.sql');
