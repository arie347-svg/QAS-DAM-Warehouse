-- Migrasi 0002: Dukungan Sinkronisasi Draft Lintas Perangkat, Optimistic Locking, dan Pelacakan KPI
-- Kolom sinkronisasi sudah menjadi bagian dari skema dasar 0001.
-- Migrasi ini dipertahankan untuk indeks integritas pada instalasi baru maupun lama.

-- Pastikan integritas identitas audit: satu slot audit unik per siklus, depo, dan jenis audit
CREATE UNIQUE INDEX IF NOT EXISTS uq_audits_cycle_depot_type ON audits(cycle_id, depot_id, audit_type);
