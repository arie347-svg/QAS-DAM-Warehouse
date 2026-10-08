# Aplikasi Audit Mutu QAS (Quality Assurance System) - Motorcycle Logistic

Aplikasi audit mutu operasional logistik unit sepeda motor Honda untuk jaringan Main Dealer dan 3 Depo Gudang Pilot (**Karawang, Baros, Cirebon**). Aplikasi ini mendigitalkan formulir pemeriksaan fisik standar 17 pertanyaan ke dalam alur kerja audit modern berbasis web dan PWA dengan kepatuhan tinggi terhadap integritas data dan independensi penilaian.

---

## 1. Arsitektur & Teknologi

| Lapisan | Teknologi | Keterangan |
|---|---|---|
| **Frontend (PWA)** | React 18, TypeScript (*Strict*), Vite, Tailwind CSS | Desain *mobile-first* (resolusi 360 px), Service Worker offline shell cache, touch-friendly min 48px |
| **Backend (Edge)** | Cloudflare Workers, Hono, Zod, Jose | Komputasi edge serverless dengan latensi minimal, validasi payload ketat, pertahanan *defense-in-depth* |
| **Basis Data** | Cloudflare D1 (SQLite) | Relasional terdistribusi dengan migrasi terkontrol dan pencatatan riwayat *append-only* |
| **Penyimpanan Berkas** | Cloudflare R2 (Private Bucket) | Penyimpanan bukti foto audit privat tanpa bucket publik, streaming aman dengan otorisasi JWT/RBAC |
| **Keamanan & Auth** | Cloudflare Access JWT & D1 RBAC | Validasi token `Cf-Access-Jwt-Assertion`, isolasi multi-depot (*Zero Client Trust*), Blind Audit mode |

---

## 2. Guardrails Keamanan & Kepatuhan Mutu (Wajib)

1. **Zero Client Trust**:
   Browser/klien dilarang menentukan peran (*role*), ID depo yang diakses, status audit, maupun kalkulasi skor. Seluruh izin dan kalkulasi diverifikasi serta dihitung secara deterministik di server.
2. **Blind Audit Mode**:
   Auditor QAS dilarang keras melihat jawaban, skor, catatan, maupun bukti foto *Self Audit* sebelum *Official Audit* pada siklus dan depo bersangkutan berstatus `SUBMITTED`. API secara aktif memblokir akses dan melakukan sanitasi data jika diakses sebelum waktunya.
3. **Immutability (Kekekalan Data)**:
   - Template berstatus `PUBLISHED` bersifat *immutable* (tidak dapat diubah/dihapus). Perubahan dilakukan melalui kloning ke versi `DRAFT`.
   - Audit yang sudah `SUBMITTED` mengunci seluruh snapshot teks pertanyaan, opsi jawaban, nilai numerik, bobot, dan bukti foto.
   - Tidak ada *hard delete* untuk audit yang telah dibuat (`DELETE /api/audits/:id` diblokir dengan HTTP 405 `HARD_DELETE_PROHIBITED`).
4. **Controlled Reopen**:
   Pembukaan kembali audit yang sudah disubmit hanya dapat dilakukan oleh Auditor QAS atau Administrator dengan mencantumkan alasan tertulis eksplisit minimal 5 karakter (`AUDIT_REOPENED`).
5. **Audit Trail Wajib**:
   Setiap mutasi status kritis (`AUDIT_CREATED`, `ANSWER_CHANGED`, `EVIDENCE_UPLOADED`, `EVIDENCE_VIEWED`, `AUDIT_SUBMITTED`, `AUDIT_REOPENED`, `AUDIT_FINALIZED`, `AUDIT_EXPORTED`) otomatis dicatat ke tabel `audit_events` secara *append-only*.
6. **Pure Scoring Engine**:
   Kalkulasi skor menerapkan rumus rata-rata berbobot murni (*weighted average*), pembulatan *half-up* 2 desimal, pengecualian opsi N/A dari pembagi (*denominator*), dan pengelompokan kategori mutu (Baik Sekali \(\ge 4.00\), Baik \(\ge 3.00\), Cukup \(\ge 2.00\), Kurang \(< 2.00\)).

---

## 3. Struktur Repositori

```text
qas-audit-app/
├── index.html                   # Entry point HTML dengan PWA metadata & viewport 360px
├── public/
│   ├── favicon.svg              # Ikon aplikasi
│   ├── manifest.json            # PWA Web App Manifest
│   └── sw.js                    # PWA Service Worker (offline shell cache & network fallback)
├── migrations/
│   └── 0001_initial_schema.sql  # Skema tabel D1 (15 tabel + indeks relasional)
├── seed/
│   └── seed_data.sql            # Seed idempotent 3 depo, 17 soal standar, & template v1
├── src/
│   ├── app/                     # App router, layout, & entry point
│   ├── components/              # Layout, navigasi bawah mobile, error boundary
│   ├── features/
│   │   ├── audit/               # Form Self & Official Audit, autosave, evidence uploader
│   │   ├── comparison/          # Matriks komparasi Self vs Official & PIC sign-off
│   │   ├── home/                # Executive Quality Dashboard & ekspor CSV
│   │   ├── master/              # Manajemen master template berversi & simulasi draft
│   │   └── status/              # Pemantauan kesehatan sistem & konektivitas
│   ├── serviceWorkerRegistration.ts # Registrasi Service Worker & hook status jaringan
│   └── styles/                  # Tailwind CSS
├── worker/
│   ├── index.ts                 # Hono worker application & routing
│   ├── middleware/              # Auth Access JWT, RBAC, Request ID, Security Headers
│   ├── routes/                  # REST API endpoints (Audits, Cycles, Evidence, dll.)
│   ├── services/                # Scoring engine, Comparison, Dashboard, Audit Trail
│   └── validators/              # Zod request payload schemas
└── tests/
    └── unit/                    # 13 test files (73 tests lulus 100%)
```

---

## 4. Panduan Menjalankan Secara Lokal

### Prasyarat
- Node.js versi 20+ (LTS)
- npm 10+
- Wrangler CLI 3+

### Langkah Instalasi & Menjalankan

1. **Pasang Dependensi**:
   ```bash
   npm install
   ```

2. **Jalankan Frontend Dev Server**:
   ```bash
   npm run dev
   ```
   Aplikasi dapat diakses pada browser di `http://localhost:5173`.

3. **Jalankan Worker API Dev Server (Lokal)**:
   ```bash
   npm run worker:dev
   ```
   Server Edge Worker berjalan di `http://localhost:8787`.

4. **Pemeriksaan Kualitas Wajib (Quality Gates)**:
   ```bash
   npm run lint        # Pemeriksaan ESLint (Wajib 0 error, 0 warning)
   npm run typecheck   # Validasi tipe data TypeScript Strict Mode
   npm run test        # Menjalankan 73 pengujian unit dengan Vitest
   npm run build       # Membangun bundle produksi Vite & Worker
   ```

---

## 5. Ringkasan Endpoint REST API

Semua endpoint dilindungi oleh *Security Response Headers* (CSP, X-Content-Type-Options, X-Frame-Options, STS) dan verifikasi identitas `Cf-Access-Jwt-Assertion` / `Authorization: Bearer <token>`.

### Autentikasi & Profil
- `GET /api/me` — Mengambil data profil, role, dan cakupan depo user aktif.

### Master Template Berversi (Khusus Master Manager / Admin)
- `GET /api/admin/templates` — Daftar template master audit.
- `GET /api/admin/template-versions/:id` — Rincian pohon seksi, 17 pertanyaan, dan opsi.
- `POST /api/admin/template-versions/:id/clone` — Kloning versi `PUBLISHED` ke `DRAFT` baru.
- `POST /api/admin/template-versions/:id/publish` — Memvalidasi dan mempublikasikan template `DRAFT` menjadi `PUBLISHED` (*immutable*).

### Siklus & Form Audit
- `GET /api/cycles` — Daftar siklus audit dengan isolasi cakupan depo dan sanitasi *Blind Audit*.
- `POST /api/cycles` — Membuka siklus audit baru (Admin/Auditor).
- `GET /api/audits/:id` — Rincian formulir audit (dengan proteksi *Blind Audit*).
- `PUT /api/audits/:id/answers/:questionId` — Menyimpan jawaban dan catatan pertanyaan (*autosave*).
- `POST /api/audits/:id/submit` — Men-submit audit secara permanen, mengunci status, dan menghitung skor.
- `POST /api/audits/:id/reopen` — Membuka kembali audit berstatus `SUBMITTED` dengan alasan tertulis resmi.
- `DELETE /api/audits/:id` — Ditolak permanen (HTTP 405 `HARD_DELETE_PROHIBITED`).

### Berkas Bukti Foto (Private R2)
- `POST /api/answers/:id/evidence` — Mengunggah foto bukti ke bucket privat R2 (maks 5MB, format JPEG/PNG/WebP, deduplikasi hash SHA-256).
- `GET /api/evidence/:id` — Streaming aman berkas bukti foto (dengan proteksi *Blind Audit* dan pencatatan log `EVIDENCE_VIEWED`).
- `DELETE /api/evidence/:id` — *Soft delete* berkas bukti (dilarang jika audit telah `SUBMITTED`).

### Komparasi & Tanda Tangan Digital (Sign-Off)
- `GET /api/comparisons/:cycleId/:depotId` — Snapshot komparasi skor Self vs Official, analisis \(\Delta\) Gap per pertanyaan, dan status acknowledgement.
- `POST /api/audits/:id/acknowledge` — Tanda tangan digital konfirmasi hasil audit oleh PIC Gudang beserta catatan komitmen perbaikan.

### Dashboard Eksekutif & Ekspor Laporan
- `GET /api/dashboard` — Metrik KPI mutu, kepatuhan submit, pemantauan 3 depo, gap per seksi standar, dan temuan prioritas.
- `GET /api/exports/audits.csv` — Unduh laporan rekapitulasi audit berstandar RFC 4180.

### Jejak Audit Trail (Append-Only)
- `GET /api/audits/:id/events` — Linimasa kronologis seluruh aktivitas pada audit tertentu.
- `GET /api/audit-events` — Pencarian log aktivitas sistem global (khusus Auditor/Admin).

---

## 6. Panduan Deployment ke Cloudflare

1. **Login ke Cloudflare**:
   ```bash
   npx wrangler login
   ```

2. **Buat Database D1 dan Bucket R2**:
   ```bash
   npx wrangler d1 create qas-audit-db
   npx wrangler r2 bucket create qas-audit-evidence
   ```

3. **Terapkan Migrasi & Seed Data**:
   ```bash
   npx wrangler d1 execute qas-audit-db --remote --file=./migrations/0001_initial_schema.sql
   npx wrangler d1 execute qas-audit-db --remote --file=./seed/seed_data.sql
   ```

4. **Konfigurasi `wrangler.toml`**:
   Sesuaikan `database_id` D1 dan `bucket_name` R2 pada file `wrangler.toml`.

5. **Deploy Aplikasi**:
   ```bash
   npm run build
   npx wrangler deploy
   ```

---

## 7. Status Rilis

- **Versi**: `1.0.0-rc1` (Release Candidate 1)
- **Cakupan Pilot**: Depo Gudang Karawang, Baros, Cirebon
- **Kepatuhan Quality Gates**:
  - `ESLint`: **0 error, 0 warning**
  - `TypeCheck`: **TypeScript Strict Mode (0 error)**
  - `Unit Tests`: **13 Test Suites / 73 Tests Lulus 100%**
  - `Production Build`: **Vite + Cloudflare Worker Build Sukses**
