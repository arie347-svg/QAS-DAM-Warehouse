export interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
}

/**
 * Mendeteksi apakah aplikasi dibuka dari mode standalone (PWA yang telah terpasang di HP / desktop).
 */
export function isRunningStandalone(): boolean {
  if (typeof window === 'undefined') return false;

  // 1. Evaluasi Media Query display-mode (Android Chrome, Edge, modern WebKit)
  if (typeof window.matchMedia === 'function') {
    try {
      if (
        window.matchMedia('(display-mode: standalone)').matches ||
        window.matchMedia('(display-mode: fullscreen)').matches ||
        window.matchMedia('(display-mode: minimal-ui)').matches
      ) {
        return true;
      }
    } catch {
      // Abaikan kegagalan evaluasi media query di lingkungan tertentu
    }
  }

  // 2. Evaluasi flag navigator.standalone khusus iOS Safari WebKit
  try {
    if ((window.navigator as Navigator & { standalone?: boolean })?.standalone === true) {
      return true;
    }
  } catch {
    // Abaikan kegagalan pembacaan navigator
  }

  // 3. Evaluasi URL parameter yang ditetapkan pada manifest.json start_url (?source=pwa)
  try {
    if (typeof window.location !== 'undefined' && window.location.search) {
      const search = window.location.search;
      if (search.includes('source=pwa') || search.includes('mode=standalone')) {
        return true;
      }
    }
  } catch {
    // Abaikan kegagalan pembacaan query string
  }

  // 4. Evaluasi Referrer TWA (Trusted Web Activity) / Android Intent
  try {
    if (typeof document !== 'undefined' && document.referrer?.includes('android-app://')) {
      return true;
    }
  } catch {
    // Abaikan kegagalan document.referrer
  }

  return false;
}

/**
 * Mendeteksi apakah perangkat pengguna adalah iOS (iPhone / iPad / iPod)
 */
export function isIosDevice(): boolean {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent || '';
  const isIos = /iPad|iPhone|iPod/.test(ua);
  const isIpadOs = navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1;
  return Boolean(isIos || isIpadOs);
}
