# Rencana Implementasi Refaktorisasi Pengiriman Email: Google Apps Script (GAS) Web App

Migrasi menyeluruh modul pengiriman email transaksional kode OTP reset kata sandi dari **Resend API** ke **Google Apps Script (GAS) Web App**. Solusi ini mengeliminasi kebutuhan kepemilikan custom domain dan konfigurasi DNS (SPF/DKIM) di Cloudflare, karena email dikirimkan secara legal melalui kuota harian akun Google pengguna (`GmailApp.sendEmail`).

---

## 1. Analisis Kebutuhan & Desain Arsitektur

| Aspek | Implementasi Lama (Resend) | Implementasi Baru (Google Apps Script Web App) |
| :--- | :--- | :--- |
| **Transport Layer** | HTTP POST ke `https://api.resend.com/emails` | HTTP POST ke `GAS_WEBAPP_URL` (`https://script.google.com/macros/s/.../exec`) |
| **Redirect Handling** | Standar HTTP 200/400 (tanpa redirect) | **Wajib `redirect: "follow"`** karena GAS merespons dengan HTTP 302 ke URL eksekusi Google |
| **Autentikasi** | Header `Authorization: Bearer <API_KEY>` | JSON body payload field: `{ token: env.GAS_SECRET_TOKEN }` diverifikasi di `Code.gs` |
| **Format Penerima** | Array string tunggal | Mendukung string tunggal (`"user@domain.com"`) atau array (`["a@domain.com", "b@domain.com"]`) yang digabung menjadi daftar koma |
| **Mesin Email GAS** | Server SMTP Resend | `GmailApp.sendEmail()` dengan opsi `name: "QAS Motorcycle Logistics"` dan `htmlBody` |
| **Fallback & Sandbox** | Jika API Key kosong, simulasikan OTP | Jika `GAS_WEBAPP_URL` belum terpasang atau kuota habis, berikan pesan galat jelas & fallback log simulasi |

---

## 2. Rincian Perubahan File

### A. Google Apps Script: `Code.gs` (Standalone Script)
Membuat file referensi `Code.gs` yang siap disalin ke proyek Google Apps Script (Extensions > Apps Script) dengan fitur:
- Fungsi `doPost(e)` untuk memproses request HTTP POST.
- Pemeriksaan keamanan: validasi token dari body JSON terhadap `SCRIPT_SECRET_TOKEN` (bisa disimpan di Script Properties).
- Normalisasi penerima: string tunggal atau array dikonversi menjadi format koma standar `GmailApp`.
- Validasi sisa kuota email: `MailApp.getRemainingDailyQuota()`.
- Pengiriman email dengan `GmailApp.sendEmail(recipient, subject, plainText, options)` menyertakan `htmlBody` dan `name: 'QAS Motorcycle Logistics'`.
- Respons JSON standar dengan `ContentService.createTextOutput(JSON.stringify(result)).setMimeType(ContentService.MimeType.JSON)`.

### B. Worker Types: `worker/types.ts`
- Menghapus ketergantungan pada `MAIL_API_KEY`.
- Menambahkan binding variabel:
  - `GAS_WEBAPP_URL?: string;`
  - `GAS_SECRET_TOKEN?: string;`
- Mempertahankan `MAIL_FROM_ADDRESS` opsional jika dibutuhkan sebagai fallback display name.

### C. Mail Service: `worker/services/mailService.ts`
- Memperbarui fungsi `sendPasswordResetEmail(env, toEmail, otp, recipientName)`.
- Mengimplementasikan `fetch(env.GAS_WEBAPP_URL, { method: 'POST', redirect: 'follow', ... })`.
- Mengirimkan payload JSON:
  ```json
  {
    "token": env.GAS_SECRET_TOKEN,
    "to": toEmail,
    "subject": "[QAS Logistics] Kode OTP Reset Kata Sandi Akun Anda",
    "otp": otp,
    "recipientName": recipientName,
    "htmlBody": "..."
  }
  ```
- Parsing respons JSON dari GAS Web App (`{ success: true, ... }` atau `{ success: false, error: '...' }`).
- Penanganan galat transparan jika token salah, kuota Google habis, atau terjadi kendala jaringan, dengan fallback ke mode simulasi.

### D. Route Auth: `worker/routes/auth.ts`
- Menyesuaikan penanda `simulatedOtp` agar mengecek `!c.env.GAS_WEBAPP_URL` sebagai pengganti `!c.env.MAIL_API_KEY`.

### E. Konfigurasi Lingkungan: `wrangler.jsonc`, `.dev.vars`, dan `.env.example`
- Memperbarui `wrangler.jsonc` pada section `staging` dan `production`:
  - Mengganti `MAIL_PROVIDER_URL` menjadi `GAS_WEBAPP_URL`.
- Memperbarui `.dev.vars` dan `.env.example` dengan template:
  - `GAS_WEBAPP_URL=https://script.google.com/macros/s/.../exec`
  - `GAS_SECRET_TOKEN=rahasia-token-qas-2026`

### F. Unit Testing: `tests/unit/mail_service.test.ts`
- Menyesuaikan suite pengujian unit:
  1. Pengujian mode sandbox saat `GAS_WEBAPP_URL` belum diisi.
  2. Pengujian pengiriman sukses dengan HTTP 302 follow, payload token, dan format email array/string.
  3. Pengujian penanganan respons galat dari GAS (misal: token tidak valid atau kuota habis).

---

## 3. Rencana Verifikasi

1. **Type Safety & Lint**:
   - `npm run typecheck` (`tsc -b --noEmit`)
   - `npm run lint` (`eslint`)
2. **Pengujian Unit**:
   - `npx vitest run tests/unit/mail_service.test.ts`
   - `npm test` (memastikan seluruh 168+ pengujian tetap hijau)
3. **Kompilasi Akhir**:
   - `compile_applet` (`npm run build`)
