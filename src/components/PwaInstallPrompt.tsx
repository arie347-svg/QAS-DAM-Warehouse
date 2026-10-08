import React, { useEffect, useState } from 'react';
import { 
  Download, 
  Globe, 
  Smartphone, 
  CheckCircle2, 
  Share, 
  SquarePlus, 
  X,
  Info
} from 'lucide-react';
import { 
  BeforeInstallPromptEvent, 
  isRunningStandalone, 
  isIosDevice 
} from '../lib/pwaUtils';

export interface PwaInstallPromptProps {
  onContinueInBrowser?: () => void;
  showCompactBannerAfterDismiss?: boolean;
}

export const PwaInstallPrompt: React.FC<PwaInstallPromptProps> = ({
  onContinueInBrowser,
  showCompactBannerAfterDismiss = false,
}) => {
  const [installed, setInstalled] = useState<boolean>(() => isRunningStandalone());
  const [installPrompt, setInstallPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [isIos] = useState<boolean>(() => isIosDevice());
  const [showModal, setShowModal] = useState<boolean>(() => {
    if (isRunningStandalone()) return false;
    if (typeof sessionStorage !== 'undefined') {
      return sessionStorage.getItem('qas_pwa_onboarding_dismissed') !== 'true';
    }
    return true;
  });
  const [bannerDismissed, setBannerDismissed] = useState<boolean>(false);
  const [installError, setInstallError] = useState<string | null>(null);

  useEffect(() => {
    // Jika aplikasi sudah berstatus standalone (terpasang di HP), matikan semua prompt
    if (isRunningStandalone()) {
      setInstalled(true);
      setShowModal(false);
      sessionStorage.setItem('qas_pwa_install_available', 'false');
      window.dispatchEvent(new CustomEvent('qas-pwa-availability', { detail: false }));
      return;
    }

    const publishAvailability = (available: boolean) => {
      sessionStorage.setItem('qas_pwa_install_available', String(available));
      window.dispatchEvent(new CustomEvent('qas-pwa-availability', { detail: available }));
    };

    const handleBeforeInstallPrompt = (event: Event) => {
      event.preventDefault();
      setInstallPrompt(event as BeforeInstallPromptEvent);
      publishAvailability(true);
    };

    const handleAppInstalled = () => {
      // Pengguna baru saja menginstal aplikasi dari browser
      setInstalled(true);
      setInstallPrompt(null);
      setShowModal(false);
      try {
        localStorage.setItem('qas_pwa_installed', 'true');
      } catch {
        // ignore storage error
      }
      publishAvailability(false);
    };

    // Dengarkan perubahan display-mode jika pengguna berpindah ke mode standalone
    const media = typeof window.matchMedia === 'function'
      ? window.matchMedia('(display-mode: standalone)')
      : null;

    const handleModeChange = (event: MediaQueryListEvent) => {
      if (event.matches) {
        setInstalled(true);
        setShowModal(false);
        publishAvailability(false);
      }
    };

    // Dengarkan request eksternal (misal dari menu Lebih Banyak / Profil)
    const handleExternalRequest = async () => {
      if (installPrompt) {
        await installPrompt.prompt();
        const choice = await installPrompt.userChoice;
        if (choice.outcome === 'accepted') {
          handleAppInstalled();
        }
      } else if (isIos) {
        setShowModal(true);
      }
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    window.addEventListener('appinstalled', handleAppInstalled);
    window.addEventListener('qas-request-pwa-install', handleExternalRequest);
    media?.addEventListener?.('change', handleModeChange);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      window.removeEventListener('appinstalled', handleAppInstalled);
      window.removeEventListener('qas-request-pwa-install', handleExternalRequest);
      media?.removeEventListener?.('change', handleModeChange);
    };
  }, [installPrompt, isIos]);

  // KETENTUAN UTAMA: Jika aplikasi diakses dari aplikasi yang diinstal di HP (standalone), HILANGKAN SEMUA PROMPT!
  if (installed || isRunningStandalone()) {
    return null;
  }

  // Aksi Tombol 1: Pasang Aplikasi
  const handleInstallClick = async () => {
    if (installPrompt) {
      try {
        await installPrompt.prompt();
        const choice = await installPrompt.userChoice;
        setInstallPrompt(null);
        if (choice.outcome === 'accepted') {
          setInstalled(true);
          setShowModal(false);
          try {
            localStorage.setItem('qas_pwa_installed', 'true');
          } catch {
            // ignore
          }
          return;
        }
      } catch {
        setInstallError('Gagal memicu pemasangan otomatis. Silakan gunakan menu browser Anda.');
      }
    } else {
      // Jika browser belum melempar beforeinstallprompt (misal desktop/Firefox)
      setInstallError('Pemasangan langsung tidak didukung oleh browser ini. Gunakan menu browser (⋮) lalu pilih "Pasang Aplikasi" atau "Tambah ke Layar Utama".');
    }
  };

  // Aksi Tombol 2: Lanjut di Browser
  const handleContinueInBrowser = () => {
    setShowModal(false);
    try {
      sessionStorage.setItem('qas_pwa_onboarding_dismissed', 'true');
    } catch {
      // ignore
    }
    if (onContinueInBrowser) {
      onContinueInBrowser();
    }
  };

  return (
    <>
      {/* ===================== 1. MODAL PEMBUKA INTERAKTIF (ONBOARDING GATE) ===================== */}
      {showModal && (
        <div 
          role="dialog"
          aria-modal="true"
          aria-labelledby="pwa-modal-title"
          className="fixed inset-0 z-50 bg-slate-900/65 backdrop-blur-xs flex items-center justify-center p-3.5 sm:p-4 overflow-y-auto font-sans animate-fade-in"
        >
          <div className="bg-white w-full max-w-sm sm:max-w-md rounded-3xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col my-auto transition-all">
            
            {/* Header Modal */}
            <div className="p-5 sm:p-6 text-center border-b border-slate-100 bg-linear-to-b from-red-50/60 to-white relative">
              <button
                type="button"
                onClick={handleContinueInBrowser}
                aria-label="Tutup dialog"
                className="absolute top-4 right-4 w-8 h-8 rounded-full grid place-items-center text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>

              <div className="w-14 h-14 rounded-2xl bg-[#D31D24] text-white flex items-center justify-center mx-auto shadow-md shadow-red-200 ring-4 ring-red-50">
                <Smartphone className="w-7 h-7" />
              </div>

              <h2 id="pwa-modal-title" className="text-base sm:text-lg font-black text-slate-900 tracking-tight mt-3">
                Pasang Aplikasi Audit QAS
              </h2>
              <p className="text-xs text-slate-500 font-medium mt-1 max-w-xs mx-auto">
                Sistem Penjaminan Mutu & Logistik Sepeda Motor
              </p>
            </div>

            {/* Content Body */}
            <div className="p-5 sm:p-6 space-y-4">
              
              {/* Value Proposition Points */}
              <div className="bg-slate-50 border border-slate-200/80 rounded-2xl p-3.5 space-y-2.5 text-xs text-slate-700">
                <div className="flex items-center gap-2.5 font-medium">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                  <span>Akses instan 1-ketukan langsung dari layar utama HP</span>
                </div>
                <div className="flex items-center gap-2.5 font-medium">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                  <span>Kinerja audit cepat & draft tersimpan saat offline</span>
                </div>
                <div className="flex items-center gap-2.5 font-medium">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                  <span>Tampilan layar penuh tanpa terganggu bilah peramban</span>
                </div>
              </div>

              {/* Panduan Khusus iOS / Safari */}
              {isIos ? (
                <div className="p-3.5 bg-blue-50 border border-blue-200/80 rounded-2xl space-y-2 text-xs text-blue-950">
                  <div className="font-bold flex items-center gap-1.5 text-blue-900">
                    <Info className="w-4 h-4 text-blue-600 shrink-0" />
                    <span>Petunjuk Pasang di iPhone / iPad (Safari):</span>
                  </div>
                  <ol className="list-decimal list-inside space-y-1.5 text-[11px] leading-relaxed text-blue-900/90 pl-1 font-medium">
                    <li>
                      Ketuk tombol <strong>Bagikan (Share)</strong>{' '}
                      <Share className="w-3.5 h-3.5 text-blue-600 inline-block align-middle mx-1" />{' '}
                      di bilah bawah browser Safari Anda.
                    </li>
                    <li>
                      Gulir ke bawah lalu pilih{' '}
                      <strong>Tambah ke Layar Utama (Add to Home Screen)</strong>{' '}
                      <SquarePlus className="w-3.5 h-3.5 text-slate-700 inline-block align-middle mx-1" />.
                    </li>
                    <li>
                      Ketuk <strong>Tambah (Add)</strong> di pojok kanan atas layar.
                    </li>
                  </ol>
                </div>
              ) : null}

              {installError && (
                <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 text-xs">
                  {installError}
                </div>
              )}

              {/* Action Buttons: 2 Pilihan Jelas */}
              <div className="pt-2 space-y-2.5">
                {!isIos ? (
                  <button
                    type="button"
                    onClick={handleInstallClick}
                    className="min-h-[48px] w-full rounded-xl bg-[#D31D24] hover:bg-[#B5171D] active:scale-[0.99] px-4 text-xs sm:text-sm font-bold text-white shadow-xs transition-all flex items-center justify-center gap-2 cursor-pointer"
                  >
                    <Download className="w-4 h-4" />
                    <span>Pasang Aplikasi</span>
                  </button>
                ) : null}

                <button
                  type="button"
                  onClick={handleContinueInBrowser}
                  className="min-h-[48px] w-full rounded-xl border border-slate-300 bg-white hover:bg-slate-50 active:scale-[0.99] text-slate-700 px-4 text-xs sm:text-sm font-bold transition-colors flex items-center justify-center gap-2 cursor-pointer"
                >
                  <Globe className="w-4 h-4 text-slate-400" />
                  <span>Lanjut di Browser</span>
                </button>
              </div>

            </div>

          </div>
        </div>
      )}

      {/* ===================== 2. BANNER COMPACT OPSIONAL (Hanya jika diminta dan modal sudah ditutup) ===================== */}
      {showCompactBannerAfterDismiss && !showModal && !bannerDismissed && installPrompt && (
        <aside className="shrink-0 bg-slate-900 text-white px-3 py-2 border-b border-white/10">
          <div className="max-w-7xl mx-auto flex items-center justify-between gap-2">
            <span className="text-xs font-bold truncate">Pasang aplikasi Audit QAS</span>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={handleInstallClick}
                className="h-8 px-3 rounded-lg bg-[#D31D24] text-white text-xs font-bold inline-flex items-center gap-1.5 hover:bg-[#B5171D]"
              >
                <Download className="w-3.5 h-3.5" /> Pasang
              </button>
              <button
                type="button"
                onClick={() => setBannerDismissed(true)}
                aria-label="Tutup banner"
                className="w-8 h-8 rounded-lg grid place-items-center text-slate-300 hover:bg-white/10"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>
        </aside>
      )}
    </>
  );
};
