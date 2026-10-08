-- Seed Production Terbatas Depo Karawang
-- Status Release: Production Limited Release (Depo Karawang Only)
-- Baros & Cirebon: NONAKTIF (is_active = 0, 0 active cycle)

-- 1. Master Depo (Hanya Karawang yang aktif)
INSERT OR IGNORE INTO depots (id, code, name, is_active, created_at) VALUES
('depot-krw', 'KRW', 'Depo Gudang Karawang', 1, '2026-10-01T00:00:00.000Z'),
('depot-brs', 'BRS', 'Depo Gudang Baros', 0, '2026-10-01T00:00:00.000Z'),
('depot-crb', 'CRB', 'Depo Gudang Cirebon', 0, '2026-10-01T00:00:00.000Z');

-- 2. Pengguna Resmi
INSERT OR IGNORE INTO users (id, email, full_name, is_active, created_at, updated_at) VALUES
('USR-001', 'ari.imam@daya-motora.com', 'Ari Imam Safari', 1, '2026-10-01T00:00:00.000Z', '2026-10-01T00:00:00.000Z'),
('USR-004', 'fachmi.herdiansyah@daya-motora.com', 'Fachmi Herdiansyah', 1, '2026-10-01T00:00:00.000Z', '2026-10-01T00:00:00.000Z'),
('user-admin', 'admin@qas.internal', 'Administrator QAS Pusat', 1, '2026-10-01T00:00:00.000Z', '2026-10-01T00:00:00.000Z'),
('user-auditor', 'auditor@qas.internal', 'Auditor QAS Logistik', 1, '2026-10-01T00:00:00.000Z', '2026-10-01T00:00:00.000Z'),
('user-pic-krw', 'pic.karawang@qas.internal', 'PIC QAS Depo Karawang', 1, '2026-10-01T00:00:00.000Z', '2026-10-01T00:00:00.000Z');

-- 3. Scope Peran & Akses Master (Scoping Depo Karawang Saja)
INSERT OR IGNORE INTO user_role_scopes (id, user_id, role, depot_id, can_manage_master) VALUES
('scope-usr-001', 'USR-001', 'PIC_QAS', 'depot-krw', 0),
('scope-usr-004', 'USR-004', 'AUDITOR_QAS', NULL, 1),
('scope-admin', 'user-admin', 'ADMIN', NULL, 1),
('scope-auditor', 'user-auditor', 'AUDITOR_QAS', NULL, 1),
('scope-pic-krw', 'user-pic-krw', 'PIC_QAS', 'depot-krw', 0);

-- 4. Template Audit & Versi 1 (PUBLISHED & IMMUTABLE)
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
('opt-j1-dis-01-1', 'q-j1-dis-01', 'OPT-A', 'Dilakukan review ekspedisi rutin tiap periodik', 4.0, 1, 0),
('opt-j1-dis-01-2', 'q-j1-dis-01', 'OPT-B', 'Ekspedisi hanya direview setiap kali ada masalah, seperti NRFS tinggi, keterlambatan, dan sebagainya', 3.0, 2, 0),
('opt-j1-dis-01-3', 'q-j1-dis-01', 'OPT-C', 'Ekspedisi dikontrol oleh Head Office; Main Dealer tidak mengetahui proses kontrol', 2.0, 3, 0),
('opt-j1-dis-01-4', 'q-j1-dis-01', 'OPT-D', 'Tidak ada kontrol dari Main Dealer', 1.0, 4, 0),
('opt-j1-dis-02-1', 'q-j1-dis-02', 'OPT-A', 'Proses unloading dilakukan sesuai prosedur lengkap dengan shipping list dan list accessory', 4.0, 1, 0),
('opt-j1-dis-02-2', 'q-j1-dis-02', 'OPT-B', 'Unit diturunkan sesuai prosedur tetapi dokumen shipping list dan accessory tidak lengkap', 3.0, 2, 0),
('opt-j1-dis-02-3', 'q-j1-dis-02', 'OPT-C', 'Unit diturunkan dengan proses yang berpotensi membahayakan unit dan dokumen lengkap', 2.0, 3, 0),
('opt-j1-dis-02-4', 'q-j1-dis-02', 'OPT-D', 'Ada improvement terkait proses unloading atau bongkar muat', 5.0, 4, 0),
('opt-j1-dis-03-1', 'q-j1-dis-03', 'OPT-A', 'Dilakukan pengecekan visual dan kelengkapan ACC serta didokumentasikan', 4.0, 1, 0),
('opt-j1-dis-03-2', 'q-j1-dis-03', 'OPT-B', 'Dilakukan pengecekan unit secara visual dan kelengkapan ACC', 3.0, 2, 0),
('opt-j1-dis-03-3', 'q-j1-dis-03', 'OPT-C', 'Dilakukan pengecekan unit secara visual saja', 2.0, 3, 0),
('opt-j1-dis-03-4', 'q-j1-dis-03', 'OPT-D', 'Tidak dilakukan pengecekan', 1.0, 4, 0),
('opt-j1-nrfs-01-1', 'q-j1-nrfs-01', 'OPT-A', 'Ada improvement terkait penanganan unit cacat atau lecet akibat transportasi', 5.0, 1, 0),
('opt-j1-nrfs-01-2', 'q-j1-nrfs-01', 'OPT-B', 'Lapor ke sopir atau deliveryman dan admin; unit ditempatkan di area khusus NRFS, diberi identifikasi, dicatat kerusakannya, dan dilaporkan ke Main Dealer', 4.0, 2, 0),
('opt-j1-nrfs-01-3', 'q-j1-nrfs-01', 'OPT-C', 'Lapor ke sopir atau deliveryman dan admin; unit cacat atau lecet disimpan di gudang sesuai tipe dan warna', 3.0, 3, 0),
('opt-j1-nrfs-01-4', 'q-j1-nrfs-01', 'OPT-D', 'Lapor ke sopir atau deliveryman dan admin; unit dikembalikan ke gudang Main Dealer untuk ditukar', 2.0, 4, 0),
('opt-j1-nrfs-01-5', 'q-j1-nrfs-01', 'OPT-E', 'Lapor ke sopir atau deliveryman dan admin; lanjut memeriksa unit lain tanpa tindakan pada unit cacat atau lecet', 1.0, 5, 0),
('opt-j1-nrfs-02-1', 'q-j1-nrfs-02', 'OPT-A', 'Ada lokasi khusus NRFS yang memiliki tanda atau identifikasi', 4.0, 1, 0),
('opt-j1-nrfs-02-2', 'q-j1-nrfs-02', 'OPT-B', 'Ada lokasi NRFS tetapi tidak ada tanda atau identifikasi', 3.0, 2, 0),
('opt-j1-nrfs-02-3', 'q-j1-nrfs-02', 'OPT-C', 'Tidak ada lokasi khusus NRFS atau bergabung dengan unit lain', 1.0, 3, 0),
('opt-j1-nrfs-03-1', 'q-j1-nrfs-03', 'OPT-A', 'Ada PIC repair yang sudah training TTL 3', 5.0, 1, 0),
('opt-j1-nrfs-03-2', 'q-j1-nrfs-03', 'OPT-B', 'Ada PIC repair yang sudah training minimal TTL 2', 4.0, 2, 0),
('opt-j1-nrfs-03-3', 'q-j1-nrfs-03', 'OPT-C', 'Ada PIC repair yang sudah training minimal TTL 1', 3.0, 3, 0),
('opt-j1-nrfs-03-4', 'q-j1-nrfs-03', 'OPT-D', 'Ada PIC repair tetapi belum training', 2.0, 4, 0),
('opt-j1-nrfs-03-5', 'q-j1-nrfs-03', 'OPT-E', 'Tidak ada PIC yang melakukan repair', 1.0, 5, 0),
('opt-j1-nrfs-04-1', 'q-j1-nrfs-04', 'OPT-A', 'Urgent order ke AHM', 5.0, 1, 0),
('opt-j1-nrfs-04-2', 'q-j1-nrfs-04', 'OPT-B', 'Beli di H3 terdekat, part shop satelit, HEPS, atau AHASS terdekat', 4.0, 2, 0),
('opt-j1-nrfs-04-3', 'q-j1-nrfs-04', 'OPT-C', 'Membeli part di bengkel umum atau toko spare part umum', 1.0, 3, 0),
('opt-j1-nrfs-05-1', 'q-j1-nrfs-05', 'OPT-A', 'Mekanik lain dengan kompetensi setara atau lebih tinggi dari mekanik yang melakukan perbaikan', 4.0, 1, 0),
('opt-j1-nrfs-05-2', 'q-j1-nrfs-05', 'OPT-B', 'Mekanik yang memperbaiki unit itu sendiri dan sudah lulus minimal TTL 1', 3.0, 2, 0),
('opt-j1-nrfs-05-3', 'q-j1-nrfs-05', 'OPT-C', 'Kepala gudang yang sedang dalam pengajuan training TTL', 2.0, 3, 0),
('opt-j1-nrfs-05-4', 'q-j1-nrfs-05', 'OPT-D', 'Tidak ada; setelah diperbaiki unit otomatis masuk stok unit OK', 1.0, 4, 0),
('opt-j1-nrfs-06-1', 'q-j1-nrfs-06', 'OPT-A', 'Ada improvement terkait monitoring penyelesaian unit NRFS', 5.0, 1, 0),
('opt-j1-nrfs-06-2', 'q-j1-nrfs-06', 'OPT-B', 'Monitoring order part ke AHM secara berkala dan terdata', 4.0, 2, 0),
('opt-j1-nrfs-06-3', 'q-j1-nrfs-06', 'OPT-C', 'Menanyakan status kedatangan part ke AHM secara berkala tetapi tidak terdata', 2.0, 3, 0),
('opt-j1-nrfs-06-4', 'q-j1-nrfs-06', 'OPT-D', 'Tidak melakukan tindakan', 1.0, 4, 0),
('opt-j1-mnt-01-1', 'q-j1-mnt-01', 'OPT-A', 'Ada improvement terhadap aktivitas perawatan unit SMH di gudang', 5.0, 1, 0),
('opt-j1-mnt-01-2', 'q-j1-mnt-01', 'OPT-B', 'Ada; pengecekan dan perawatan dilakukan rutin, terjadwal, dan terdokumentasi', 4.0, 2, 0),
('opt-j1-mnt-01-3', 'q-j1-mnt-01', 'OPT-C', 'Tidak ada unit SMH di gudang yang berumur lebih dari satu bulan', 4.0, 3, 0),
('opt-j1-mnt-01-4', 'q-j1-mnt-01', 'OPT-D', 'Ada; unit dibersihkan setiap hari tetapi tidak didokumentasikan', 3.0, 4, 0),
('opt-j1-mnt-01-5', 'q-j1-mnt-01', 'OPT-E', 'Ada; pengecekan dan perawatan dilakukan tetapi tidak konsisten dan tidak terjadwal', 2.0, 5, 0),
('opt-j1-mnt-01-6', 'q-j1-mnt-01', 'OPT-F', 'Ada tetapi tidak dilakukan pengecekan dan perawatan', 1.0, 6, 0),
('opt-j1-mnt-02-1', 'q-j1-mnt-02', 'OPT-A', 'Ada improvement terhadap aktivitas penanganan unit cacat akibat penyimpanan', 5.0, 1, 0),
('opt-j1-mnt-02-2', 'q-j1-mnt-02', 'OPT-B', 'Dipindahkan ke lokasi khusus, diberi identifikasi NRFS, dibuatkan laporan, dan dilaporkan kepada pihak berwenang', 4.0, 2, 0),
('opt-j1-mnt-02-3', 'q-j1-mnt-02', 'OPT-C', 'Tidak pernah ditemukan unit NG di gudang unit dealer atau display', 4.0, 3, 0),
('opt-j1-mnt-02-4', 'q-j1-mnt-02', 'OPT-D', 'Dipindahkan ke lokasi NRFS dan diberi identifikasi bagian yang cacat', 3.5, 4, 0),
('opt-j1-mnt-02-5', 'q-j1-mnt-02', 'OPT-E', 'Langsung dilaporkan kepada pihak berwenang; unit tetap di lokasi semula', 3.0, 5, 0),
('opt-j1-mnt-02-6', 'q-j1-mnt-02', 'OPT-F', 'Langsung diperbaiki sendiri oleh orang yang menemukan', 2.0, 6, 0),
('opt-j1-mnt-03-1', 'q-j1-mnt-03', 'OPT-A', 'Selalu ada tindakan perbaikan terhadap penyebab unit NG akibat simpan', 4.0, 1, 0),
('opt-j1-mnt-03-2', 'q-j1-mnt-03', 'OPT-B', 'Tidak pernah ada kasus unit NG akibat simpan', 4.0, 2, 0),
('opt-j1-mnt-03-3', 'q-j1-mnt-03', 'OPT-C', 'Ada rencana perbaikan tetapi belum dilaksanakan karena menunggu persetujuan', 2.0, 3, 0),
('opt-j1-mnt-03-4', 'q-j1-mnt-03', 'OPT-D', 'Tidak ada tindakan karena penyebab unit NG tidak diketahui', 1.0, 4, 0),
('opt-j2-dis-01-1', 'q-j2-dis-01', 'OPT-A', 'Ada improvement terhadap proses untuk memastikan battery yang diterima selalu dalam kondisi bagus', 5.0, 1, 0),
('opt-j2-dis-01-2', 'q-j2-dis-01', 'OPT-B', 'Melakukan pemeriksaan umur semua battery pada setiap penerimaan dari AHM', 4.0, 2, 0),
('opt-j2-dis-01-3', 'q-j2-dis-01', 'OPT-C', 'Mengirimkan memo, WhatsApp, atau pemberitahuan lisan kepada AHM agar mengirim battery terbaru', 2.0, 3, 0),
('opt-j2-dis-01-4', 'q-j2-dis-01', 'OPT-D', 'Tidak melakukan tindakan', 1.0, 4, 0),
('opt-j2-dis-02-1', 'q-j2-dis-02', 'OPT-A', 'Ada improvement yang dilakukan terkait implementasi FIFO', 5.0, 1, 0),
('opt-j2-dis-02-2', 'q-j2-dis-02', 'OPT-B', 'Pengambilan sesuai database unit ready for sale', 4.0, 2, 0),
('opt-j2-dis-02-3', 'q-j2-dis-02', 'OPT-C', 'Pengambilan berdasarkan tag FIFO bulanan', 3.5, 3, 0),
('opt-j2-dis-02-4', 'q-j2-dis-02', 'OPT-D', 'Pengambilan berdasarkan posisi paling depan, belakang, kanan, atau kiri', 1.0, 4, 0),
('opt-j2-dis-03-1', 'q-j2-dis-03', 'OPT-A', 'Ada improvement penggunaan peralatan pengikatan yang lebih baik dari prosedur', 5.0, 1, 0),
('opt-j2-dis-03-2', 'q-j2-dis-03', 'OPT-B', 'Bentuk, ukuran, dan jumlah peralatan pengikatan sesuai prosedur untuk setiap unit SMH', 4.0, 2, 0),
('opt-j2-dis-03-3', 'q-j2-dis-03', 'OPT-C', 'Hanya sebagian perlengkapan pengikatan yang sesuai prosedur', 3.0, 3, 0),
('opt-j2-dis-03-4', 'q-j2-dis-03', 'OPT-D', 'Bentuk, ukuran, dan jumlah peralatan pengikatan tidak sesuai prosedur untuk setiap unit SMH', 2.0, 4, 0),
('opt-j2-dis-03-5', 'q-j2-dis-03', 'OPT-E', 'Tidak memiliki perlengkapan pengikatan unit SMH', 1.0, 5, 0),
('opt-j2-dis-04-1', 'q-j2-dis-04', 'OPT-A', 'Ada improvement terhadap Quality Point pengikatan', 5.0, 1, 0),
('opt-j2-dis-04-2', 'q-j2-dis-04', 'OPT-B', 'Semua Quality Point telah sesuai prosedur atau instruksi kerja', 4.0, 2, 0),
('opt-j2-dis-04-3', 'q-j2-dis-04', 'OPT-C', 'Hanya sebagian Quality Point yang sesuai', 3.0, 3, 0),
('opt-j2-dis-04-4', 'q-j2-dis-04', 'OPT-D', 'Sebagian titik pengikatan tidak sesuai prosedur tetapi unit dijamin tidak mengalami penurunan kualitas saat diantar', 2.0, 4, 0),
('opt-j2-dis-04-5', 'q-j2-dis-04', 'OPT-E', 'Pengikatan dilakukan tetapi tidak sesuai Quality Point', 1.0, 5, 0),
('opt-j2-dis-05-1', 'q-j2-dis-05', 'OPT-A', 'Menyediakan PIC kompeten yang bertugas khusus melakukan pengecekan fisik dan dokumen 100 persen', 5.0, 1, 0),
('opt-j2-dis-05-2', 'q-j2-dis-05', 'OPT-B', 'Menyediakan PIC kompeten untuk melakukan pengecekan fisik dan dokumen 100 persen', 4.0, 2, 0),
('opt-j2-dis-05-3', 'q-j2-dis-05', 'OPT-C', 'Menyediakan PIC kompeten untuk pengecekan fisik dan dokumen secara sampling', 3.0, 3, 0),
('opt-j2-dis-05-4', 'q-j2-dis-05', 'OPT-D', 'Setelah loading, unit langsung dikirim tanpa pemeriksaan', 1.0, 4, 0);

-- 8. Siklus Produksi Depo Karawang (Hanya Depo Karawang)
INSERT OR REPLACE INTO audit_cycles (id, code, title, period_start, period_end, self_due_at, official_due_at, status, template_version_id) VALUES
('cyc-prod-krw-202610', 'QAS-PROD-KRW-202610', 'Siklus Audit Mutu Depo Karawang Periode Oktober 2026', '2026-10-01', '2026-10-31', '2026-10-15T23:59:59Z', '2026-10-31T23:59:59Z', 'OPEN', 'ver-qas-log-v1');

-- 9. Slot Audit Karawang (Kondisi Awal Produksi Bersih: DRAFT, KPI = 0, Tanpa Data Dummy)
INSERT OR REPLACE INTO audits (id, cycle_id, depot_id, audit_type, status, assigned_user_id, template_version_id, score, category, started_at, version, submitted_at, created_at, updated_at) VALUES
('audit-self-krw-prod', 'cyc-prod-krw-202610', 'depot-krw', 'SELF', 'DRAFT', 'USR-001', 'ver-qas-log-v1', NULL, NULL, NULL, 1, NULL, '2026-10-01T08:00:00.000Z', '2026-10-01T08:00:00.000Z'),
('audit-off-krw-prod', 'cyc-prod-krw-202610', 'depot-krw', 'OFFICIAL', 'DRAFT', 'USR-004', 'ver-qas-log-v1', NULL, NULL, NULL, 1, NULL, '2026-10-01T08:00:00.000Z', '2026-10-01T08:00:00.000Z');

-- Bersihkan seluruh data jawaban atau perbandingan agar kondisi awal murni bersih
DELETE FROM audit_answers WHERE audit_id IN ('audit-self-krw-prod', 'audit-off-krw-prod');
DELETE FROM comparison_snapshots WHERE cycle_id = 'cyc-prod-krw-202610';
DELETE FROM audit_events WHERE entity_type = 'audit' AND entity_id IN ('audit-self-krw-prod', 'audit-off-krw-prod');
