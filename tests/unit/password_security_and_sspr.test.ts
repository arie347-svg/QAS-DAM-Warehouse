// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { 
  loginWithPassword, 
  changeApplicationPassword, 
  requestPasswordResetOtp, 
  verifyOtpAndResetPassword,
  getStoredUserPassword
} from '../../src/lib/api';

describe('Password Security & Self-Service Password Reset (SSPR) Matrix', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
    sessionStorage.clear();
  });

  it('menolak penggunaan password awal (12345) setelah pengguna memperbarui password', async () => {
    const email = 'ari.imam@daya-motora.com';

    // 1. Login pertama kali dengan password awal 12345 berhasil
    const initialLogin = await loginWithPassword(email, '12345', false);
    expect(initialLogin.success).toBe(true);
    expect(initialLogin.user?.profile.mustChangePassword).toBe(true);

    // 2. Pengguna mengganti password ke 'GudangAman2026'
    const changeResult = await changeApplicationPassword('12345', 'GudangAman2026', 'GudangAman2026');
    expect(changeResult.success).toBe(true);
    expect(getStoredUserPassword(email)).toBe('GudangAman2026');

    // 3. Coba login kembali menggunakan password awal 12345 -> HARUS DITOLAK!
    const failedLoginWithInitial = await loginWithPassword(email, '12345', false);
    expect(failedLoginWithInitial.success).toBe(false);
    expect(failedLoginWithInitial.error?.code).toBe('INITIAL_PASSWORD_EXPIRED');
    expect(failedLoginWithInitial.error?.message).toContain('Password awal (12345) sudah tidak berlaku');

    // 4. Coba login dengan password baru 'GudangAman2026' -> HARUS BERHASIL!
    const successLoginWithNew = await loginWithPassword(email, 'GudangAman2026', false);
    expect(successLoginWithNew.success).toBe(true);
    expect(successLoginWithNew.user?.profile.mustChangePassword).toBe(false);
  });

  it('menolak pergantian password jika password baru sama dengan password awal (12345)', async () => {
    const email = 'tri.wahyudi@daya-motora.com';
    await loginWithPassword(email, '12345', false);

    const changeResult = await changeApplicationPassword('12345', '12345', '12345');
    expect(changeResult.success).toBe(false);
    expect(changeResult.error?.code).toBe('WEAK_PASSWORD');
    expect(changeResult.error?.message).toContain('tidak boleh sama dengan password awal');
  });

  it('alur Lupa Sandi Mandiri: request OTP, verifikasi, dan update password baru', async () => {
    const email = 'fachmi.herdiansyah@daya-motora.com';

    // 1. Request OTP untuk email terdaftar
    const otpReq = await requestPasswordResetOtp(email);
    expect(otpReq.success).toBe(true);
    expect(otpReq.simulatedOtp).toBeDefined();
    expect(otpReq.simulatedOtp?.length).toBe(6);

    const generatedOtp = otpReq.simulatedOtp!;

    // 2. Verifikasi dengan OTP salah -> gagal
    const wrongOtpResult = await verifyOtpAndResetPassword(email, '000000', 'PasswordBaru2026', 'PasswordBaru2026');
    expect(wrongOtpResult.success).toBe(false);
    expect(wrongOtpResult.error).toContain('Kode OTP salah');

    // 3. Verifikasi dengan OTP benar dan password baru valid -> berhasil
    const validResetResult = await verifyOtpAndResetPassword(email, generatedOtp, 'PasswordBaru2026', 'PasswordBaru2026');
    expect(validResetResult.success).toBe(true);
    expect(getStoredUserPassword(email)).toBe('PasswordBaru2026');

    // 4. OTP tidak dapat digunakan ulang (burned)
    const reusedOtpResult = await verifyOtpAndResetPassword(email, generatedOtp, 'LainPassword2026', 'LainPassword2026');
    expect(reusedOtpResult.success).toBe(false);

    // 5. Login dengan password baru yang direset -> berhasil
    const loginWithReset = await loginWithPassword(email, 'PasswordBaru2026', false);
    expect(loginWithReset.success).toBe(true);

    // 6. Login dengan password lama/awal 12345 -> ditolak
    const loginWithInitial = await loginWithPassword(email, '12345', false);
    expect(loginWithInitial.success).toBe(false);
  });

  it('request OTP menolak email yang tidak terdaftar dalam sistem', async () => {
    const otpReq = await requestPasswordResetOtp('stranger@gmail.com');
    expect(otpReq.success).toBe(false);
    expect(otpReq.error).toContain('tidak terdaftar dalam sistem QAS');
  });

  it('validasi password kuat: menolak password yang hanya angka atau hanya huruf', async () => {
    // 1. Kurang dari 8 karakter
    const shortRes = await changeApplicationPassword('12345', 'Abc12', 'Abc12');
    expect(shortRes.success).toBe(false);
    expect(shortRes.error?.code).toBe('WEAK_PASSWORD');
    expect(shortRes.error?.message).toContain('minimal 8 karakter');

    // 2. Hanya huruf (tidak ada angka)
    const letterOnlyRes = await changeApplicationPassword('12345', 'Hanyahurufsaja', 'Hanyahurufsaja');
    expect(letterOnlyRes.success).toBe(false);
    expect(letterOnlyRes.error?.code).toBe('WEAK_PASSWORD');
    expect(letterOnlyRes.error?.message).toContain('perpaduan huruf dan angka');

    // 3. Hanya angka (tidak ada huruf)
    const numberOnlyRes = await changeApplicationPassword('12345', '1234567890', '1234567890');
    expect(numberOnlyRes.success).toBe(false);
    expect(numberOnlyRes.error?.code).toBe('WEAK_PASSWORD');
    expect(numberOnlyRes.error?.message).toContain('perpaduan huruf dan angka');

    // 4. Perpaduan huruf dan angka valid
    const validRes = await changeApplicationPassword('12345', 'Kombinasi2026', 'Kombinasi2026');
    expect(validRes.success).toBe(true);
  });
});
