// @vitest-environment jsdom
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { HomePage } from '../../src/features/home/HomePage';

describe('HomePage Dashboard UI & Interactions', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('renders fixed header, KPIs, and empty state with full-width Mulai Audit button', async () => {
    render(
      <MemoryRouter>
        <HomePage />
      </MemoryRouter>
    );

    // 1. Verifikasi Header dan KPI Tetap
    expect(screen.getByText('Selamat datang')).toBeInTheDocument();
    expect(screen.getByText('Aktivitas Audit')).toBeInTheDocument();
    expect(screen.getByText('Dalam Proses')).toBeInTheDocument();
    expect(screen.getByText('Selesai')).toBeInTheDocument();
    expect(screen.getByText('Kepatuhan')).toBeInTheDocument();

    // 2. Verifikasi Baris Periode 1 Baris Awalnya Tertutup
    const periodButton = screen.getByRole('button', { name: /Periode •/i });
    expect(periodButton).toBeInTheDocument();
    expect(screen.queryByText('Depo Karawang')).not.toBeInTheDocument();
    expect(screen.queryByText('Depo Baros')).not.toBeInTheDocument();
    expect(screen.queryByText('Depo Cirebon')).not.toBeInTheDocument();

    // 3. Verifikasi Tombol Mulai Audit di Empty State
    expect(screen.getByText('Belum ada riwayat audit yang disubmit')).toBeInTheDocument();
    const mulaiAuditBtn = screen.getByRole('link', { name: /Mulai Audit/i });
    expect(mulaiAuditBtn).toBeInTheDocument();
    expect(mulaiAuditBtn).toHaveAttribute('href', '/audits');
    expect(mulaiAuditBtn.className).toContain('min-h-[44px]');
    expect(mulaiAuditBtn.className).toContain('w-full');
  });

  it('toggles collapsible period card to show Karawang, Baros, Cirebon when clicked', async () => {
    render(
      <MemoryRouter>
        <HomePage />
      </MemoryRouter>
    );

    const periodButton = screen.getByRole('button', { name: /Periode •/i });
    expect(screen.queryByText('Depo Karawang')).not.toBeInTheDocument();

    // Klik untuk membuka
    fireEvent.click(periodButton);
    expect(screen.getByText('Depo Karawang')).toBeInTheDocument();
    expect(screen.getByText('Depo Baros')).toBeInTheDocument();
    expect(screen.getByText('Depo Cirebon')).toBeInTheDocument();

    // Klik lagi untuk menutup
    fireEvent.click(periodButton);
    expect(screen.queryByText('Depo Karawang')).not.toBeInTheDocument();
  });
});
