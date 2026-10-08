// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { LoginPage } from '../../src/features/auth/LoginPage';
import { PasswordChangeModal } from '../../src/features/auth/PasswordChangeModal';

const profile = {
  id: 'USR-001',
  email: 'ari.imam@daya-motora.com',
  fullName: 'Ari Imam Safari',
  primaryRole: 'PIC_QAS' as const,
  isGlobalAccess: false,
  canManageMaster: true,
  canManageUsers: true,
  mustChangePassword: true,
  scopes: [{ role: 'PIC_QAS' as const, depotId: 'depot-krw', depotCode: 'KRW', canManageMaster: true, canManageUsers: true }],
};

describe('Tahap 1 - Login UI dan wajib ganti password', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
    sessionStorage.clear();
  });

  it('login memakai email, password awal, dan Remember Me', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      if (String(input).includes('/api/auth/login')) {
        return { ok: true, json: async () => ({ success: true }) } as Response;
      }
      return { ok: true, json: async () => ({ success: true, data: profile }) } as Response;
    });
    vi.stubGlobal('fetch', fetchMock);
    const onSuccess = vi.fn();
    render(<LoginPage onLoginSuccess={onSuccess} />);
    expect(screen.queryByText(/Password awal:\s*12345/i)).not.toBeInTheDocument();
    expect(screen.getByPlaceholderText('Masukkan kata sandi')).toBeInTheDocument();

    await userEvent.type(screen.getByPlaceholderText('nama@daya-motora.com'), profile.email);
    await userEvent.type(screen.getByPlaceholderText('Masukkan kata sandi'), '12345');
    await userEvent.click(screen.getByLabelText('Ingat perangkat ini'));
    await userEvent.click(screen.getByRole('button', { name: 'Masuk' }));

    expect(fetchMock).toHaveBeenCalledWith('/api/auth/login', expect.objectContaining({ method: 'POST', credentials: 'include' }));
    expect(onSuccess).toHaveBeenCalledTimes(1);
    expect(localStorage.getItem('qas_remember_account')).toBe('true');
  });

  it('modal ganti password tidak memiliki tombol tutup dan menyelesaikan pergantian', async () => {
    const changedProfile = { ...profile, mustChangePassword: false };
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      if (String(input).includes('/api/auth/change-password')) {
        return { ok: true, json: async () => ({ success: true }) } as Response;
      }
      return { ok: true, json: async () => ({ success: true, data: changedProfile }) } as Response;
    }));
    const onSuccess = vi.fn();
    render(<PasswordChangeModal onSuccess={onSuccess} />);

    expect(screen.queryByRole('button', { name: /tutup/i })).not.toBeInTheDocument();
    await userEvent.type(screen.getByLabelText('Password awal'), '12345');
    await userEvent.type(screen.getByLabelText('Password baru'), 'GudangAman2026');
    await userEvent.type(screen.getByLabelText('Konfirmasi password'), 'GudangAman2026');
    await userEvent.click(screen.getByRole('button', { name: 'Simpan Password Baru' }));

    expect(onSuccess).toHaveBeenCalledTimes(1);
    expect(onSuccess.mock.calls[0][0].profile.mustChangePassword).toBe(false);
  });
});
