import React, { useState } from 'react';
import { 
  AlertCircle, 
  Eye, 
  EyeOff, 
  LockKeyhole, 
  Mail, 
  ShieldCheck, 
  Target, 
  TrendingUp 
} from 'lucide-react';
import { getRememberAccount, loginWithPassword, type DemoUserOption } from '../../lib/api';
import { ForgotPasswordModal } from './ForgotPasswordModal';

interface LoginPageProps { 
  onLoginSuccess?: (user: DemoUserOption) => void; 
}

export const LoginPage: React.FC<LoginPageProps> = ({ onLoginSuccess }) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [remember, setRemember] = useState(getRememberAccount());
  const [showPassword, setShowPassword] = useState(false);
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showForgotModal, setShowForgotModal] = useState(false);

  const handleLogin = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!email.trim() || !password) { 
      setError('Email kantor dan password wajib diisi.'); 
      return; 
    }
    setChecking(true); 
    setError(null);
    const result = await loginWithPassword(email.trim(), password, remember);
    if (result.success && result.user) { 
      onLoginSuccess?.(result.user); 
      return; 
    }
    setChecking(false);
    setError(`${result.error?.message || 'Login gagal.'}${result.error?.requestId ? ` ID: ${result.error.requestId}` : ''}`);
  };

  return (
    <main className="h-[100dvh] max-h-[100dvh] w-full max-w-full bg-[#F4F6F9] flex items-center justify-center p-2 sm:p-4 lg:p-6 overflow-hidden font-sans select-none">
      {/* Seamless Canvas Presentation Window - Strictly fitted to viewport without overflow */}
      <div className="relative w-full max-w-5xl h-full max-h-[100dvh] sm:max-h-[min(640px,calc(100dvh-1rem))] bg-white sm:rounded-3xl shadow-none sm:shadow-xl sm:shadow-slate-200/50 sm:border sm:border-slate-200/80 overflow-hidden flex flex-col justify-between">
        
        {/* Desktop Top Window Header with standard 3 navigation dots */}
        <div className="hidden lg:flex items-center justify-between px-6 py-2.5 border-b border-slate-100/90 bg-white select-none shrink-0">
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-[#FF5F56]"></span>
            <span className="w-2.5 h-2.5 rounded-full bg-[#FFBD2E]"></span>
            <span className="w-2.5 h-2.5 rounded-full bg-[#27C93F]"></span>
          </div>
          <div className="text-[10px] font-semibold text-slate-400 font-mono tracking-wider">
            qas.daya-motora.com
          </div>
          <div className="w-8"></div>
        </div>

        {/* Abstract Corner Geometric Accents (Seamless Background) */}
        <div className="absolute top-0 right-0 pointer-events-none overflow-hidden w-36 h-36 z-0 hidden sm:block">
          <div className="absolute -top-14 -right-14 w-28 h-28 bg-[#D31D24] rotate-45"></div>
          <div className="absolute top-3 right-12 w-12 h-2.5 bg-slate-200 rotate-45"></div>
        </div>
        <div className="absolute bottom-0 left-0 pointer-events-none overflow-hidden w-28 h-28 z-0 hidden sm:block">
          <div className="absolute -bottom-12 -left-12 w-24 h-24 bg-[#D31D24] rotate-45"></div>
        </div>

        {/* ========================================================================= */}
        {/* MAIN SEAMLESS GRID: Desktop Left Hero & Right Login Directly on Canvas     */}
        {/* ========================================================================= */}
        <div className="relative z-10 flex-1 min-h-0 grid grid-cols-1 lg:grid-cols-12 gap-4 lg:gap-8 px-4 py-3 sm:px-8 sm:py-5 lg:px-10 lg:py-5 items-center overflow-hidden">
          
          {/* ==================== LEFT AREA (DESKTOP VIEW) ==================== */}
          <section className="hidden lg:flex lg:col-span-7 flex-col justify-between h-full max-h-full py-1">
            <div className="space-y-4">
              {/* Brand Logo */}
              <div className="flex flex-col">
                <div className="flex items-baseline leading-none">
                  <span className="text-[#D31D24] font-black text-2xl xl:text-3xl tracking-tight">QA</span>
                  <span className="text-slate-800 font-black text-2xl xl:text-3xl tracking-tight">S</span>
                </div>
                <div className="h-0.5 w-6 bg-[#D31D24] rounded-full my-1"></div>
                <span className="text-[10px] font-semibold text-slate-500 tracking-tight">Quality Assurance System</span>
              </div>

              {/* Headline & Subhead */}
              <div>
                <h1 className="text-2xl xl:text-3xl font-extrabold text-slate-900 leading-snug tracking-tight">
                  Selamat Datang di <span className="text-[#D31D24]">QAS</span>
                </h1>
                <p className="mt-1 text-xs font-medium text-slate-500 max-w-sm leading-relaxed">
                  Bersama memastikan kualitas, menuju proses yang lebih baik.
                </p>
              </div>

              {/* 3 Value Proposition Points with Circular Red Badges */}
              <div className="grid grid-cols-3 gap-2.5 max-w-md pt-1">
                <div className="flex flex-col">
                  <div className="w-8 h-8 rounded-full bg-red-50 text-[#D31D24] flex items-center justify-center mb-1.5 shadow-2xs ring-1 ring-red-100">
                    <ShieldCheck className="w-4 h-4" />
                  </div>
                  <p className="text-[11px] font-bold text-slate-900">Akurat</p>
                  <p className="text-[9px] text-slate-500 mt-0.5 leading-tight">Data lebih valid</p>
                </div>

                <div className="flex flex-col">
                  <div className="w-8 h-8 rounded-full bg-red-50 text-[#D31D24] flex items-center justify-center mb-1.5 shadow-2xs ring-1 ring-red-100">
                    <Target className="w-4 h-4" />
                  </div>
                  <p className="text-[11px] font-bold text-slate-900">Tepat</p>
                  <p className="text-[9px] text-slate-500 mt-0.5 leading-tight">Fokus perbaikan</p>
                </div>

                <div className="flex flex-col">
                  <div className="w-8 h-8 rounded-full bg-red-50 text-[#D31D24] flex items-center justify-center mb-1.5 shadow-2xs ring-1 ring-red-100">
                    <TrendingUp className="w-4 h-4" />
                  </div>
                  <p className="text-[11px] font-bold text-slate-900">Berkelanjutan</p>
                  <p className="text-[9px] text-slate-500 mt-0.5 leading-tight">Mutu meningkat</p>
                </div>
              </div>
            </div>

            {/* 3D Illustration directly on canvas - scaled to fit viewport perfectly */}
            <div className="flex items-center justify-center mt-3 shrink min-h-0">
              <img
                src="/images/qas-audit-3d.png"
                alt="Ilustrasi Audit QAS 3D"
                className="w-auto max-h-28 xl:max-h-36 object-contain drop-shadow-md"
              />
            </div>
          </section>

          {/* ========================================================================= */}
          {/* RIGHT AREA / MOBILE (SEAMLESS & FLAT: NO BOXES, NO SHADOW CONTAINERS)     */}
          {/* ========================================================================= */}
          <section className="col-span-1 lg:col-span-5 flex flex-col justify-center w-full max-w-sm sm:max-w-md mx-auto h-full max-h-full py-1">
            
            {/* Header Login */}
            <div className="flex flex-col items-start shrink-0">
              <div className="flex items-baseline leading-none">
                <span className="text-[#D31D24] font-black text-2xl tracking-tight">QA</span>
                <span className="text-slate-800 font-black text-2xl tracking-tight">S</span>
              </div>
              <div className="h-0.5 w-5 bg-[#D31D24] rounded-full my-1"></div>
              <span className="text-[9px] font-semibold text-slate-500 tracking-tight">Quality Assurance System</span>
            </div>

            <div className="mt-3 sm:mt-4 shrink-0">
              <h2 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight">Login</h2>
              <p className="text-xs text-slate-500">Masuk dengan akun e-mail kantor Anda</p>
            </div>

            {/* Flat Form Fields */}
            <form onSubmit={handleLogin} className="mt-3 sm:mt-4 space-y-2.5 sm:space-y-3 shrink-0">
              
              {/* Kolom Input: E-mail Kantor */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  E-mail Kantor
                </label>
                <div className="flex min-h-[44px] items-center gap-2 rounded-xl border border-slate-300 bg-white px-3 focus-within:border-[#D31D24] focus-within:ring-2 focus-within:ring-red-100 transition-all">
                  <Mail className="h-4 w-4 text-slate-400 flex-shrink-0" />
                  <input
                    type="email"
                    autoComplete="email"
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                    placeholder="nama@daya-motora.com"
                    className="min-w-0 flex-1 bg-transparent text-xs sm:text-sm text-slate-900 placeholder:text-slate-400 outline-none"
                  />
                </div>
              </div>

              {/* Kolom Input: Kata Sandi */}
              <div>
                <label htmlFor="password-input" className="block text-xs font-bold text-slate-700 mb-1">
                  Kata Sandi
                </label>
                <div className="flex min-h-[44px] items-center gap-2 rounded-xl border border-slate-300 bg-white px-3 focus-within:border-[#D31D24] focus-within:ring-2 focus-within:ring-red-100 transition-all">
                  <LockKeyhole className="h-4 w-4 text-slate-400 flex-shrink-0" />
                  <input
                    id="password-input"
                    type={showPassword ? 'text' : 'password'}
                    autoComplete="current-password"
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    placeholder="Masukkan kata sandi"
                    className="min-w-0 flex-1 bg-transparent text-xs sm:text-sm text-slate-900 placeholder:text-slate-400 outline-none"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((value) => !value)}
                    aria-label={showPassword ? 'Sembunyikan password' : 'Tampilkan password'}
                    className="grid h-8 w-8 place-items-center rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>

              {/* Baris Opsi: Ingat Saya & Tautan Lupa Kata Sandi */}
              <div className="flex items-center justify-between pt-0.5">
                <label className="inline-flex items-center gap-2 text-xs font-semibold text-slate-700 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={remember}
                    onChange={(event) => setRemember(event.target.checked)}
                    aria-label="Ingat perangkat ini"
                    className="h-4 w-4 rounded accent-[#D31D24] text-[#D31D24] focus:ring-red-400 border-slate-300"
                  />
                  <span>Ingat saya</span>
                </label>
                <button
                  type="button"
                  onClick={() => setShowForgotModal(true)}
                  className="text-[11px] font-semibold text-[#D31D24] hover:underline hover:text-[#B5171D] transition-colors"
                >
                  Lupa kata sandi?
                </button>
              </div>

              {/* Alert Pesan Error */}
              {error && (
                <div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-2.5 text-xs text-red-700 flex gap-2 items-start">
                  <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5 text-[#D31D24]" />
                  <span className="leading-snug">{error}</span>
                </div>
              )}

              {/* Tombol Utama Flat Solid Merah: Masuk */}
              <button
                type="submit"
                disabled={checking}
                className="min-h-[44px] w-full rounded-xl bg-[#D31D24] hover:bg-[#B5171D] px-4 text-xs sm:text-sm font-bold text-white shadow-none active:scale-[0.99] transition-all disabled:opacity-60 flex items-center justify-center gap-2 cursor-pointer"
              >
                {checking ? (
                  <>
                    <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></span>
                    <span>Memeriksa akun...</span>
                  </>
                ) : (
                  'Masuk'
                )}
              </button>
            </form>

          </section>

        </div>
      </div>

      {/* ==================== MODAL: LUPA KATA SANDI (SELF SERVICE) ==================== */}
      {showForgotModal && (
        <ForgotPasswordModal
          initialEmail={email}
          onClose={() => setShowForgotModal(false)}
          onSuccess={(updatedEmail) => {
            setEmail(updatedEmail);
            setPassword('');
            setError(null);
            setShowForgotModal(false);
          }}
        />
      )}
    </main>
  );
};
