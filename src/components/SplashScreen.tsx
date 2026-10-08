import React, { useEffect, useRef, useState } from 'react';

interface SplashScreenProps {
  onFinish?: () => void;
  durationMs?: number;
}

export const SplashScreen: React.FC<SplashScreenProps> = ({ onFinish, durationMs = 650 }) => {
  const [fadingOut, setFadingOut] = useState(false);
  const onFinishRef = useRef(onFinish);
  onFinishRef.current = onFinish;

  useEffect(() => {
    const fadeTimer = setTimeout(() => {
      setFadingOut(true);
    }, Math.max(0, durationMs - 200));

    const finishTimer = setTimeout(() => {
      if (onFinishRef.current) onFinishRef.current();
    }, durationMs);

    return () => {
      clearTimeout(fadeTimer);
      clearTimeout(finishTimer);
    };
  }, [durationMs]);

  return (
    <div
      className={`fixed inset-0 z-50 bg-white flex flex-col items-center justify-between py-12 px-6 transition-opacity duration-300 ease-out select-none ${
        fadingOut ? 'opacity-0 pointer-events-none' : 'opacity-100'
      }`}
    >
      <div className="w-full flex justify-between items-center text-[10px] font-mono tracking-widest text-slate-400 uppercase">
        <span>QAS LOGISTICS</span>
        <span>STANDAR RESMI MUTU</span>
      </div>

      <div className="flex flex-col items-center text-center space-y-4 max-w-sm">
        {/* Monogram Badge */}
        <div className="w-16 h-16 rounded-2xl bg-red-600 text-white flex items-center justify-center shadow-sm ring-4 ring-red-50 animate-pulse">
          <span className="font-extrabold text-2xl tracking-tighter">QAS</span>
        </div>

        <div className="space-y-1">
          <h1 className="text-xl sm:text-2xl font-extrabold text-slate-900 tracking-tight">
            Audit QAS
          </h1>
          <p className="text-xs sm:text-sm font-semibold text-slate-500 tracking-tight">
            Motorcycle Logistic
          </p>
        </div>

        <p className="text-[11px] text-slate-400 max-w-xs leading-relaxed">
          Sistem Pengawasan Standar Gudang Sepeda Motor Tiga Depo Pilot (Karawang, Baros, Cirebon)
        </p>

        {/* World-Class Breathing Progress Indicator */}
        <div className="w-48 h-1 bg-slate-100 rounded-full overflow-hidden mt-6">
          <div className="h-full bg-gradient-to-r from-red-600 via-blue-600 to-red-600 w-full animate-pulse" />
        </div>
      </div>

      <div className="text-[10px] text-slate-400 font-medium">
        Memuat modul & sinkronisasi data...
      </div>
    </div>
  );
};
