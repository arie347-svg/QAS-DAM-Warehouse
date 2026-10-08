// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { CycleListPage } from '../../src/features/audit/CycleListPage';

describe('CycleListPage: Audit Start and AUDIT_ID_MISSING Prevention', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it('renders CycleListPage and ensures Start Self Audit has valid fallback without throwing AUDIT_ID_MISSING', async () => {
    render(
      <MemoryRouter initialEntries={['/audits']}>
        <Routes>
          <Route path="/audits" element={<CycleListPage />} />
          <Route path="/audits/:auditId" element={<div data-testid="audit-fill-page">Halaman Audit</div>} />
        </Routes>
      </MemoryRouter>
    );

    // Pastikan tombol atau kartu self audit muncul
    await waitFor(() => {
      expect(screen.getByText('Self Audit (PIC)')).toBeInTheDocument();
    });

    const startBtn = screen.getByRole('button', { name: /Mulai Self Audit/i });
    expect(startBtn).toBeInTheDocument();

    // Klik tombol Mulai Self Audit
    fireEvent.click(startBtn);

    // Pastikan tidak ada pesan error AUDIT_ID_MISSING
    await waitFor(() => {
      expect(screen.queryByText(/AUDIT_ID_MISSING/i)).not.toBeInTheDocument();
      expect(screen.queryByText(/Slot Self Audit tidak ditemukan/i)).not.toBeInTheDocument();
    });
  });
});
