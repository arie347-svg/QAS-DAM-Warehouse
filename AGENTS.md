# Aturan Kerja Agen (AGENTS.md) - Aplikasi Audit QAS

Panduan ini wajib dipatuhi oleh seluruh coding agent (Antigravity) selama pembangunan aplikasi Audit QAS (Quality Assurance System) Motorcycle Logistic.

## 1. Arsitektur & Teknologi
- **Frontend**: React + TypeScript + Vite + Tailwind CSS (PWA).
- **Backend**: Cloudflare Worker + Hono.
- **Database**: Cloudflare D1 (SQLite relasional dengan migrasi terkontrol).
- **Media / Bukti**: Cloudflare R2 private bucket (tidak ada public bucket untuk bukti audit).
- **Autentikasi**: Cloudflare Access JWT validation (`Cf-Access-Jwt-Assertion` dengan library `jose`).
- **Otorisasi**: RBAC server-side di D1 (role: PIC QAS Gudang, Auditor QAS, Admin/Lead).

## 2. Guardrails Keamanan & Integritas Data
- **Zero Client Trust**: Jangan pernah mempercayai `role`, `depot_id`, status audit, atau skor yang dikirimkan oleh browser/client. Seluruh hak akses dan izin transisi wajib diverifikasi ulang di server.
- **Blind Audit Mode**: Auditor QAS dilarang keras melihat jawaban, skor, catatan, atau bukti *Self Audit* sebelum *Official Audit* pada siklus tersebut berstatus `SUBMITTED`. API tidak boleh membocorkan data ini sebelum status resmi tercapai.
- **Immutability Template & Audit**:
  - Template berstatus `PUBLISHED` bersifat *immutable* (tidak dapat diubah/dihapus). Perubahan dilakukan melalui clone ke versi `DRAFT`.
  - Jawaban audit dan skor yang sudah disubmit harus mengunci *snapshot* teks pertanyaan, opsi jawaban, nilai skor, dan bobot.
  - Tidak ada *hard delete* untuk audit yang sudah `SUBMITTED` atau `FINALIZED`.
- **Audit Trail Wajib**: Seluruh perubahan status kritis (`AUDIT_CREATED`, `ANSWER_CHANGED`, `EVIDENCE_UPLOADED`, `AUDIT_SUBMITTED`, `AUDIT_REOPENED`, `AUDIT_FINALIZED`) wajib dicatat ke tabel `audit_events`.
- **Reopen Terkontrol**: Pembukaan kembali audit yang sudah disubmit membutuhkan alasan tertulis eksplisit.

## 3. Aturan Mesin Penilaian (Scoring Engine)
- **Dilarang Menebak Rumus Skor**: Jangan men-hardcode rumus skor produksi dari asumsi atau tebakan.
- Modul penilaian produksi hanya boleh dikunci setelah keputusan resmi **D-01 s/d D-04** disahkan dan diverifikasi melalui *Golden Cases* (Gate 5).

## 4. Standar UI/UX
- **Mobile First**: Wajib diuji dan berfungsi sempurna pada lebar viewport 360 px (tanpa scroll horizontal pada alur utama).
- **Bahasa**: Gunakan Bahasa Indonesia untuk antarmuka pengguna (UI).
- **Aksesibilitas**: Kontras warna jelas, elemen form ramah sentuhan (touch-friendly min 44x44px untuk mobile).

## 5. Standar Kode & Disiplin Milestone
- Gunakan TypeScript *strict mode*, hindari penggunaan `any`.
- Validasi semua payload request API di server menggunakan Zod.
- Setiap milestone/task wajib lulus pemeriksaan:
  - `npm run lint`
  - `npm run typecheck`
  - `npm run test`
  - `npm run build`
- Jangan commit file kredensial, `.dev.vars`, secret, token, atau data audit nyata ke dalam repositori.
