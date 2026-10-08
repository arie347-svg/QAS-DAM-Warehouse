// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ForgotPasswordModal } from '../../src/features/auth/ForgotPasswordModal';

describe('ForgotPasswordModal - Pengiriman OTP Dinamis & Verifikasi', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
    sessionStorage.clear();
  });

  it('menggunakan alamat email yang diinputkan pengguna, tidak auto-fill OTP, dan memvalidasi kode', async () => {
    const targetEmail = 'fachmi.herdiansyah@daya-motora.com';
    const mockOtp = '849201';

    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes('/api/auth/forgot-password/request')) {
        const body = JSON.parse(String(init?.body || '{}'));
        expect(body.email).toBe(targetEmail);
        return {
          ok: true,
          headers: new Headers({ 'Content-Type': 'application/json' }),
          json: async () => ({
            success: true,
            message: `Kode verifikasi OTP telah dikirimkan ke email ${targetEmail}.`,
            simulatedOtp: mockOtp,
          }),
        } as Response;
      }
      if (url.includes('/api/auth/forgot-password/reset')) {
        const body = JSON.parse(String(init?.body || '{}'));
        expect(body.email).toBe(targetEmail);
        expect(body.otp).toBe(mockOtp);
        return {
          ok: true,
          headers: new Headers({ 'Content-Type': 'application/json' }),
          json: async () => ({
            success: true,
            message: 'Password Anda berhasil diperbarui.',
          }),
        } as Response;
      }
      return { ok: true, json: async () => ({ success: true }) } as Response;
    });

    vi.stubGlobal('fetch', fetchMock);

    const onClose = vi.fn();
    const onSuccess = vi.fn();

    render(
      <ForgotPasswordModal
        initialEmail={targetEmail}
        onClose={onClose}
        onSuccess={onSuccess}
      />
    );

    // 1. Verifikasi input email otomatis terisi dari initialEmail (username yang diketik user)
    const emailInput = screen.getByDisplayValue(targetEmail);
    expect(emailInput).toBeInTheDocument();

    // 2. Klik tombol Kirim Kode OTP
    await userEvent.click(screen.getByRole('button', { name: 'Kirim Kode OTP' }));

    // 3. Masuk ke langkah verifikasi: Pastikan input OTP kosong (TIDAK ter-autofill)
    await waitFor(() => {
      expect(screen.getByText('E-mail Verifikasi Telah Dikirim')).toBeInTheDocument();
    });
    expect(screen.getByText(targetEmail)).toBeInTheDocument();

    const otpInput = screen.getByPlaceholderText('Contoh: 123456');
    expect(otpInput).toHaveValue(''); // Kritis: Harus kosong!

    // 4. Masukkan kode OTP manual dan password baru yang kuat
    await userEvent.type(otpInput, mockOtp);
    await userEvent.type(screen.getByPlaceholderText('Minimal 8 karakter'), 'GudangBaru2026');
    await userEvent.type(screen.getByPlaceholderText('Ulangi kata sandi baru'), 'GudangBaru2026');

    // 5. Submit reset password
    await userEvent.click(screen.getByRole('button', { name: 'Perbarui Kata Sandi' }));

    // 6. Selesai dan kembali ke login
    await waitFor(() => {
      expect(screen.getByText('Kata Sandi Berhasil Diperbarui!')).toBeInTheDocument();
    });

    await userEvent.click(screen.getByRole('button', { name: 'Masuk Sekarang' }));
    expect(onSuccess).toHaveBeenCalledWith(targetEmail);
  });
});
