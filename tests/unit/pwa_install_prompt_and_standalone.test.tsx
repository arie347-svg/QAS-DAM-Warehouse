// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PwaInstallPrompt } from '../../src/components/PwaInstallPrompt';
import { 
  isRunningStandalone, 
  isIosDevice, 
  BeforeInstallPromptEvent 
} from '../../src/lib/pwaUtils';

describe('PWA Onboarding Modal & Standalone Lifecycle Matrix', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    vi.restoreAllMocks();
    Object.defineProperty(window.navigator, 'standalone', {
      value: false,
      configurable: true,
    });
    window.matchMedia = vi.fn().mockImplementation(() => ({
      matches: false,
      media: '',
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }));
  });

  afterEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    vi.restoreAllMocks();
    Object.defineProperty(window.navigator, 'standalone', {
      value: false,
      configurable: true,
    });
  });

  it('1. HILANG TOTAL saat diakses dari aplikasi yang diinstal di HP (standalone display-mode)', () => {
    // Simulasi lingkungan standalone (PWA terpasang di HP)
    window.matchMedia = vi.fn().mockImplementation((query: string) => ({
      matches: query.includes('display-mode: standalone'),
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }));

    expect(isRunningStandalone()).toBe(true);

    const { container } = render(<PwaInstallPrompt />);
    // Tidak ada modal, dialog, ataupun banner yang dirender
    expect(container.firstChild).toBeNull();
    expect(screen.queryByText(/Pasang Aplikasi Audit QAS/i)).not.toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('2. HILANG TOTAL saat diakses dengan parameter ?source=pwa atau iOS standalone', () => {
    // Simulasi navigator.standalone = true (iOS PWA)
    Object.defineProperty(window.navigator, 'standalone', {
      value: true,
      configurable: true,
    });

    expect(isRunningStandalone()).toBe(true);

    const { container } = render(<PwaInstallPrompt />);
    expect(container.firstChild).toBeNull();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('3. Menampilkan modal dialog interaktif dengan 2 pilihan di browser Android/Desktop', async () => {
    // Simulasi browser biasa (bukan standalone, bukan iOS)
    window.matchMedia = vi.fn().mockImplementation(() => ({
      matches: false,
      media: '',
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }));

    Object.defineProperty(window.navigator, 'userAgent', {
      value: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Mobile Safari/537.36',
      configurable: true,
    });

    const onContinueInBrowser = vi.fn();
    render(<PwaInstallPrompt onContinueInBrowser={onContinueInBrowser} />);

    // Verifikasi Modal Pembuka muncul
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByText('Pasang Aplikasi Audit QAS')).toBeInTheDocument();

    // Verifikasi 2 pilihan jelas: "Pasang Aplikasi" dan "Lanjut di Browser"
    const installBtn = screen.getByRole('button', { name: /Pasang Aplikasi/i });
    const continueBtn = screen.getByRole('button', { name: /Lanjut di Browser/i });

    expect(installBtn).toBeInTheDocument();
    expect(continueBtn).toBeInTheDocument();

    // Klik "Lanjut di Browser" -> Modal menutup dan trigger callback
    await userEvent.click(continueBtn);

    expect(onContinueInBrowser).toHaveBeenCalledTimes(1);
    expect(sessionStorage.getItem('qas_pwa_onboarding_dismissed')).toBe('true');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('4. Memicu beforeinstallprompt.prompt() saat tombol "Pasang Aplikasi" diklik', async () => {
    sessionStorage.clear();
    localStorage.clear();
    window.matchMedia = vi.fn().mockImplementation(() => ({
      matches: false,
      media: '',
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }));

    Object.defineProperty(window.navigator, 'userAgent', {
      value: 'Mozilla/5.0 (Linux; Android 14) Chrome/120.0',
      configurable: true,
    });

    render(<PwaInstallPrompt />);

    const promptMock = vi.fn().mockResolvedValue(undefined);
    const mockEvent = new Event('beforeinstallprompt') as BeforeInstallPromptEvent;
    mockEvent.prompt = promptMock;
    mockEvent.userChoice = Promise.resolve({ outcome: 'accepted', platform: 'web' });

    // Simulasikan browser memicu beforeinstallprompt
    fireEvent(window, mockEvent);

    const installBtn = screen.getByRole('button', { name: 'Pasang Aplikasi' });
    await userEvent.click(installBtn);

    expect(promptMock).toHaveBeenCalledTimes(1);
  });

  it('5. Menampilkan panduan langkah Safari khusus iOS / iPadOS', () => {
    sessionStorage.clear();
    localStorage.clear();
    window.matchMedia = vi.fn().mockImplementation(() => ({
      matches: false,
      media: '',
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }));

    // Simulasi perangkat iPhone / iOS
    Object.defineProperty(window.navigator, 'userAgent', {
      value: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
      configurable: true,
    });

    expect(isIosDevice()).toBe(true);

    render(<PwaInstallPrompt />);

    // Di iOS tidak ada tombol "Pasang Aplikasi" otomatis (karena tidak didukung WebKit)
    expect(screen.queryByRole('button', { name: 'Pasang Aplikasi' })).not.toBeInTheDocument();

    // Muncul petunjuk Add to Home Screen (Share -> Tambah ke Layar Utama)
    expect(screen.getByText(/Petunjuk Pasang di iPhone \/ iPad \(Safari\):/i)).toBeInTheDocument();
    expect(screen.getByText(/Bagikan \(Share\)/i)).toBeInTheDocument();
    expect(screen.getByText(/Tambah ke Layar Utama/i)).toBeInTheDocument();

    // Tombol "Lanjut di Browser" tetap ada untuk meneruskan ke Login
    const continueBtn = screen.getByRole('button', { name: 'Lanjut di Browser' });
    expect(continueBtn).toBeInTheDocument();
  });
});
