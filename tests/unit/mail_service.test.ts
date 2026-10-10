import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { sendPasswordResetEmail } from '../../worker/services/mailService';
import { Env } from '../../worker/types';

describe('Mail Service - Google Apps Script (GAS) Web App Dispatcher', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('delivers via mock sandbox when GAS_WEBAPP_URL is missing', async () => {
    const env: Env = {};
    const result = await sendPasswordResetEmail(env, 'user@daya-motora.com', '123456', 'User Test');
    expect(result.delivered).toBe(true);
    expect(result.mode).toBe('MOCK_LOG');
  });

  it('calls GAS Web App endpoint with redirect: follow and secret token', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => JSON.stringify({
        success: true,
        message: 'Email berhasil dikirimkan',
        remainingQuota: 98,
      }),
    });
    global.fetch = mockFetch;

    const env: Env = {
      GAS_WEBAPP_URL: 'https://script.google.com/macros/s/AKfycbTest123/exec',
      GAS_SECRET_TOKEN: 'secret-token-test',
    };

    const result = await sendPasswordResetEmail(env, 'ari.imam@daya-motora.com', '654321', 'Ari Imam');
    expect(mockFetch).toHaveBeenCalledTimes(1);

    const [url, options] = mockFetch.mock.calls[0];
    expect(url).toBe('https://script.google.com/macros/s/AKfycbTest123/exec');
    expect(options.method).toBe('POST');
    // Verifikasi opsi redirect: "follow" wajib ada untuk menangani HTTP 302 dari Google
    expect(options.redirect).toBe('follow');

    const body = JSON.parse(options.body);
    expect(body.token).toBe('secret-token-test');
    expect(body.to).toBe('ari.imam@daya-motora.com');
    expect(body.otp).toBe('654321');
    expect(body.html).toContain('654321');
    expect(body.senderName).toBe('QAS Motorcycle Logistics');

    expect(result.delivered).toBe(true);
    expect(result.mode).toBe('LIVE_API');
    expect(result.provider).toBe('Google Apps Script (GmailApp)');
    expect(result.remainingQuota).toBe(98);
  });

  it('supports array of recipients seamlessly', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => JSON.stringify({
        success: true,
        message: 'Email berhasil dikirimkan ke 2 penerima',
        remainingQuota: 95,
      }),
    });
    global.fetch = mockFetch;

    const env: Env = {
      GAS_WEBAPP_URL: 'https://script.google.com/macros/s/AKfycbTest123/exec',
      GAS_SECRET_TOKEN: 'secret-token-test',
    };

    const recipients = ['auditor1@daya-motora.com', 'auditor2@daya-motora.com'];
    const result = await sendPasswordResetEmail(env, recipients, '888999', 'Tim Auditor');

    expect(mockFetch).toHaveBeenCalledTimes(1);
    const [, options] = mockFetch.mock.calls[0];
    const body = JSON.parse(options.body);
    expect(body.to).toEqual(['auditor1@daya-motora.com', 'auditor2@daya-motora.com']);
    expect(result.delivered).toBe(true);
  });

  it('handles GAS token rejection (HTTP 403) cleanly', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 403,
      text: async () => JSON.stringify({
        success: false,
        error: 'Akses ditolak: Token autentikasi tidak valid atau tidak disertakan.',
      }),
    });
    global.fetch = mockFetch;

    const env: Env = {
      GAS_WEBAPP_URL: 'https://script.google.com/macros/s/AKfycbTest123/exec',
      GAS_SECRET_TOKEN: 'wrong-token',
    };

    const result = await sendPasswordResetEmail(env, 'user@daya-motora.com', '112233');
    expect(result.delivered).toBe(false);
    expect(result.error).toContain('Token autentikasi tidak valid');
  });

  it('handles GAS daily quota exhaustion (HTTP 429) with remainingQuota info', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 429,
      text: async () => JSON.stringify({
        success: false,
        error: 'Kuota harian pengiriman email Google Apps Script telah habis (Sisa kuota: 0).',
        remainingQuota: 0,
      }),
    });
    global.fetch = mockFetch;

    const env: Env = {
      GAS_WEBAPP_URL: 'https://script.google.com/macros/s/AKfycbTest123/exec',
      GAS_SECRET_TOKEN: 'valid-token',
    };

    const result = await sendPasswordResetEmail(env, 'user@daya-motora.com', '112233');
    expect(result.delivered).toBe(false);
    expect(result.error).toContain('Kuota harian pengiriman email');
    expect(result.remainingQuota).toBe(0);
  });
});
