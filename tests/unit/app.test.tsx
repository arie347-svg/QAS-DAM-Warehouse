import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import { App } from '../../src/app/App';

describe('Frontend App - Smoke and Structure', () => {
  beforeEach(() => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          success: true,
          data: {
            status: 'healthy',
            app: 'qas-audit-app',
            environment: 'test',
            version: '0.1.0',
            timestamp: new Date().toISOString(),
            requestId: 'test-req-id',
          },
        }),
      })
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });
  it('renders application branding and header elements', async () => {
    await act(async () => {
      render(<App />);
    });

    expect(screen.getAllByText('QAS')[0]).toBeInTheDocument();
    expect(screen.getAllByText('Quality Assurance System')[0]).toBeInTheDocument();
    expect(screen.getByText('Selamat datang')).toBeInTheDocument();
    expect(screen.getAllByText('Dashboard')[0]).toBeInTheDocument();
    expect(screen.getAllByText('Master Soal')[0]).toBeInTheDocument();
  });

  it('renders home page cards and pilot depo badges', async () => {
    await act(async () => {
      render(<App />);
    });

    expect(screen.getByText('Aktivitas Audit')).toBeInTheDocument();
    expect(screen.getAllByText('Selesai')[0]).toBeInTheDocument();
    expect(screen.getAllByText('Dalam Proses')[0]).toBeInTheDocument();
    expect(screen.getByText('Progres Audit Terbaru')).toBeInTheDocument();
  });
});
