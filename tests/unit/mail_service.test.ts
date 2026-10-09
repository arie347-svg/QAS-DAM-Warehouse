import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { sendPasswordResetEmail } from '../../worker/services/mailService';
import { Env } from '../../worker/types';

describe('Mail Service - Password Reset OTP Delivery', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('delivers via mock sandbox when MAIL_API_KEY is missing', async () => {
    const env: Env = {};
    const result = await sendPasswordResetEmail(env, 'user@daya-motora.com', '123456', 'User Test');
    expect(result.delivered).toBe(true);
    expect(result.mode).toBe('MOCK_LOG');
  });

  it('calls Resend API when MAIL_API_KEY is configured', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ id: 'resend-test-id-123' }),
    });
    global.fetch = mockFetch;

    const env: Env = {
      MAIL_API_KEY: 're_test_key_123',
    };

    const result = await sendPasswordResetEmail(env, 'ari.imam@daya-motora.com', '654321', 'Ari Imam');
    expect(mockFetch).toHaveBeenCalledTimes(1);
    const [url, options] = mockFetch.mock.calls[0];
    expect(url).toBe('https://api.resend.com/emails');
    expect(options.headers.Authorization).toBe('Bearer re_test_key_123');

    const body = JSON.parse(options.body);
    expect(body.from).toBe('QAS Logistics <onboarding@resend.dev>');
    expect(body.to).toEqual(['ari.imam@daya-motora.com']);
    expect(body.html).toContain('654321');

    expect(result.delivered).toBe(true);
    expect(result.mode).toBe('LIVE_API');
  });

  it('handles Resend 403 sandbox restriction gracefully and formats error message', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 403,
      text: async () => JSON.stringify({
        message: 'You can only send testing emails to your own email address (ari.imam@daya-motora.com).',
        statusCode: 403,
      }),
    });
    global.fetch = mockFetch;

    const env: Env = {
      MAIL_API_KEY: 're_test_key_123',
    };

    const result = await sendPasswordResetEmail(env, 'other@gmail.com', '999888', 'Other User');
    expect(result.delivered).toBe(false);
    expect(result.error).toContain('You can only send testing emails to your own email address');
  });
});
