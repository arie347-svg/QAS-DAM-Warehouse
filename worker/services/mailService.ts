import { Env } from '../types';

export interface EmailDeliveryResult {
  delivered: boolean;
  mode: 'LIVE_API' | 'MOCK_LOG';
  provider?: string;
  error?: string;
  remainingQuota?: number;
}

/**
 * Mengirimkan email transaksional kode OTP reset kata sandi ke alamat e-mail
 * menggunakan Google Apps Script (GAS) Web App Endpoint melalui HTTP POST.
 *
 * @param env Cloudflare Worker Environment
 * @param toEmail Alamat e-mail tujuan (string tunggal atau array string penerima)
 * @param otp Kode OTP 6-digit numerik
 * @param recipientName Nama penerima opsional
 */
export async function sendPasswordResetEmail(
  env: Env,
  toEmail: string | string[],
  otp: string,
  recipientName?: string
): Promise<EmailDeliveryResult> {
  // Normalisasi penerima (string atau array)
  let cleanRecipients: string | string[];
  let displayRecipient: string;

  if (Array.isArray(toEmail)) {
    cleanRecipients = toEmail.map((item) => item.trim().toLowerCase()).filter(Boolean);
    displayRecipient = cleanRecipients.join(', ');
  } else {
    cleanRecipients = toEmail.trim().toLowerCase();
    displayRecipient = cleanRecipients;
  }

  const subject = '[QAS Logistics] Kode OTP Reset Kata Sandi Akun Anda';
  const senderName = 'QAS Motorcycle Logistics';

  const htmlBody = `
    <!DOCTYPE html>
    <html lang="id">
    <head>
      <meta charset="utf-8">
      <title>${subject}</title>
      <style>
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f8fafc; margin: 0; padding: 24px; color: #1e293b; }
        .card { max-width: 520px; margin: 0 auto; background: #ffffff; border-radius: 16px; border: 1px solid #e2e8f0; overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05); }
        .header { background-color: #D31D24; padding: 20px 24px; text-align: left; }
        .header h1 { color: #ffffff; font-size: 18px; margin: 0; font-weight: 800; letter-spacing: -0.025em; }
        .header p { color: #fecaca; font-size: 11px; margin: 4px 0 0; font-weight: 500; }
        .content { padding: 28px 24px; }
        .greeting { font-size: 14px; font-weight: 600; margin-bottom: 12px; }
        .desc { font-size: 13px; line-height: 1.6; color: #475569; margin-bottom: 24px; }
        .otp-box { background-color: #f1f5f9; border: 2px dashed #cbd5e1; border-radius: 12px; padding: 18px; text-align: center; margin-bottom: 24px; }
        .otp-code { font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace; font-size: 32px; font-weight: 900; letter-spacing: 8px; color: #0f172a; }
        .validity { font-size: 11px; color: #64748b; margin-top: 8px; font-weight: 600; }
        .warning-box { background-color: #fffbeb; border: 1px solid #fef3c7; border-radius: 8px; padding: 12px; font-size: 11px; color: #92400e; line-height: 1.5; margin-bottom: 20px; }
        .footer { border-top: 1px solid #f1f5f9; padding: 16px 24px; font-size: 10px; color: #94a3b8; text-align: center; background-color: #fafafa; }
      </style>
    </head>
    <body>
      <div class="card">
        <div class="header">
          <h1>QAS MOTORCYCLE LOGISTICS</h1>
          <p>Sistem Pengendalian Mutu & Audit Logistik Sepeda Motor</p>
        </div>
        <div class="content">
          <div class="greeting">Halo ${recipientName || displayRecipient},</div>
          <div class="desc">
            Kami menerima permintaan pemulihan kata sandi mandiri untuk akun QAS Logistics Anda. Masukkan 6-digit kode OTP berikut pada layar verifikasi:
          </div>
          <div class="otp-box">
            <div class="otp-code">${otp}</div>
            <div class="validity">Kode berlaku selama 10 menit (Kedaluwarsa otomatis)</div>
          </div>
          <div class="warning-box">
            <strong>Peringatan Keamanan:</strong> Jangan berikan kode OTP ini kepada siapa pun, termasuk staf operasional, auditor, atau administrator sistem QAS. Jika Anda tidak pernah meminta reset kata sandi, abaikan email ini dan laporkan ke Lead Auditor.
          </div>
        </div>
        <div class="footer">
          Email otomatis dari Server QAS Motorcycle Logistics via Google Apps Script Mailer. Jangan membalas email ini.
        </div>
      </div>
    </body>
    </html>
  `.trim();

  // 1. Integrasi Google Apps Script (GAS) Web App Endpoint
  if (env.GAS_WEBAPP_URL) {
    try {
      const payload = {
        token: env.GAS_SECRET_TOKEN || 'qas-secret-token-2026',
        to: cleanRecipients,
        subject,
        html: htmlBody,
        htmlBody,
        otp,
        recipientName: recipientName || displayRecipient,
        senderName,
      };

      // Wajib sertakan redirect: "follow" karena GAS Web App selalu melakukan HTTP 302 redirect
      const response = await fetch(env.GAS_WEBAPP_URL, {
        method: 'POST',
        redirect: 'follow',
        headers: {
          'Content-Type': 'text/plain;charset=utf-8',
        },
        body: JSON.stringify(payload),
      });

      const responseText = await response.text();
      let responseJson: {
        success?: boolean;
        message?: string;
        error?: string;
        remainingQuota?: number;
      } | null = null;

      try {
        responseJson = JSON.parse(responseText);
      } catch {
        // Respons bukan JSON terstruktur (misal halaman HTML error bawaan Google)
      }

      if (response.ok && responseJson && responseJson.success === true) {
        return {
          delivered: true,
          mode: 'LIVE_API',
          provider: 'Google Apps Script (GmailApp)',
          remainingQuota: responseJson.remainingQuota,
        };
      }

      const errorMessage = responseJson?.error || (responseText.length < 200 ? responseText : `HTTP ${response.status}`);
      return {
        delivered: false,
        mode: 'LIVE_API',
        provider: 'Google Apps Script (GmailApp)',
        error: `GAS Web App Gagal (${response.status}): ${errorMessage}`,
        remainingQuota: responseJson?.remainingQuota,
      };
    } catch (err) {
      return {
        delivered: false,
        mode: 'LIVE_API',
        provider: 'Google Apps Script (GmailApp)',
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }

  // 2. Mode Simulasi / Sandboxing / Local Dev (ketika GAS_WEBAPP_URL belum dikonfigurasi)
  // Menjaga agar alur operasional dev tetap dapat diuji tanpa memblokir developer.
  return {
    delivered: true,
    mode: 'MOCK_LOG',
    provider: 'Local/Dev Sandbox Simulator (GAS_WEBAPP_URL Not Configured)',
  };
}
