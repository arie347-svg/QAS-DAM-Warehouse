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
    <main className="min-h-[100dvh] w-full bg-[#F4F6F9] flex items-center justify-center p-3 sm:p-6 lg:p-8 font-sans select-none">
      {/* Clean, Proportional Presentation Card - Plain Top and Bottom without distracting shapes */}
      <div className="w-full max-w-4xl bg-white rounded-2xl sm:rounded-3xl shadow-xl shadow-slate-200/50 border border-slate-200/80 overflow-hidden my-auto">
        <div className="grid grid-cols-1 lg:grid-cols-12 min-h-[500px]">
          
          {/* ==================== LEFT AREA (DESKTOP BRANDING & PILARS) ==================== */}
          <section className="hidden lg:flex lg:col-span-6 bg-slate-50/70 p-8 xl:p-10 flex-col justify-between border-r border-slate-100">
            <div>
              {/* Brand Logo */}
              <div className="flex flex-col">
                <div className="flex items-baseline leading-none">
                  <span className="text-[#D31D24] font-black text-2xl xl:text-3xl tracking-tight">QA</span>
                  <span className="text-slate-800 font-black text-2xl xl:text-3xl tracking-tight">S</span>
                </div>
                <div className="h-0.5 w-6 bg-[#D31D24] rounded-full my-1"></div>
                <span className="text-[10px] font-semibold text-slate-500 tracking-tight">Quality Assurance System</span>
              </div>

              {/* Headline & Description */}
              <div className="mt-6">
                <h1 className="text-2xl font-black text-slate-900 tracking-tight leading-snug">
                  Selamat Datang di <span className="text-[#D31D24]">QAS</span>
                </h1>
                <p className="mt-2 text-xs text-slate-500 leading-relaxed max-w-sm">
                  Sistem kendali mutu dan audit logistik sepeda motor Honda. Bersama memastikan kualitas prima di setiap proses pergudangan.
                </p>
              </div>

              {/* 3 Value Proposition Points */}
              <div className="grid grid-cols-3 gap-2.5 mt-6">
                <div className="bg-white p-3 rounded-xl border border-slate-200/80 shadow-2xs">
                  <div className="w-7 h-7 rounded-lg bg-red-50 text-[#D31D24] flex items-center justify-center mb-1.5 ring-1 ring-red-100">
                    <ShieldCheck className="w-4 h-4" />
                  </div>
                  <p className="text-[11px] font-bold text-slate-900">Akurat</p>
                  <p className="text-[9px] text-slate-500 mt-0.5 leading-tight">Data lebih valid</p>
                </div>

                <div className="bg-white p-3 rounded-xl border border-slate-200/80 shadow-2xs">
                  <div className="w-7 h-7 rounded-lg bg-red-50 text-[#D31D24] flex items-center justify-center mb-1.5 ring-1 ring-red-100">
                    <Target className="w-4 h-4" />
                  </div>
                  <p className="text-[11px] font-bold text-slate-900">Tepat</p>
                  <p className="text-[9px] text-slate-500 mt-0.5 leading-tight">Fokus perbaikan</p>
                </div>

                <div className="bg-white p-3 rounded-xl border border-slate-200/80 shadow-2xs">
                  <div className="w-7 h-7 rounded-lg bg-red-50 text-[#D31D24] flex items-center justify-center mb-1.5 ring-1 ring-red-100">
                    <TrendingUp className="w-4 h-4" />
                  </div>
                  <p className="text-[11px] font-bold text-slate-900">Berkelanjutan</p>
                  <p className="text-[9px] text-slate-500 mt-0.5 leading-tight">Mutu meningkat</p>
                </div>
              </div>
            </div>

            {/* 3D Illustration centered with proportional scale */}
            <div className="flex items-center justify-center pt-6">
              <img
                src="/images/qas-audit-3d.png"
                alt="Ilustrasi Audit QAS 3D"
                className="w-auto max-h-32 xl:max-h-36 object-contain drop-shadow-sm select-none"
              />
            </div>
          </section>

          {/* ==================== RIGHT AREA (PROPORTIONAL LOGIN FORM) ==================== */}
          <section className="col-span-1 lg:col-span-6 p-6 sm:p-8 xl:p-10 flex flex-col justify-center">
            
            {/* Header Login on Mobile */}
            <div className="lg:hidden flex flex-col items-start mb-6">
              <div className="flex items-baseline leading-none">
                <span className="text-[#D31D24] font-black text-2xl tracking-tight">QA</span>
                <span className="text-slate-800 font-black text-2xl tracking-tight">S</span>
              </div>
              <div className="h-0.5 w-6 bg-[#D31D24] rounded-full my-1"></div>
              <span className="text-[10px] font-semibold text-slate-500 tracking-tight">Quality Assurance System</span>
            </div>

            <div>
              <h2 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight">Masuk ke Akun</h2>
              <p className="mt-1 text-xs text-slate-500">Gunakan alamat e-mail kantor dan kata sandi Anda</p>
            </div>

            {/* Proportional Form Fields */}
            <form onSubmit={handleLogin} className="mt-6 space-y-4">
              
              {/* Kolom Input: E-mail Kantor */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">
                  E-mail Kantor
                </label>
                <div className="flex min-h-[46px] items-center gap-2.5 rounded-xl border border-slate-300 bg-white px-3.5 focus-within:border-[#D31D24] focus-within:ring-2 focus-within:ring-red-100 transition-all">
                  <Mail className="h-4 w-4 text-slate-400 flex-shrink-0" />
                  <input
                    type="email"
                    autoComplete="email"
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                    placeholder="nama@daya-motora.com"
                    required
                    className="min-w-0 flex-1 bg-transparent text-xs sm:text-sm text-slate-900 placeholder:text-slate-400 outline-none"
                  />
                </div>
              </div>

              {/* Kolom Input: Kata Sandi */}
              <div>
                <label htmlFor="password-input" className="block text-xs font-bold text-slate-700 mb-1.5">
                  Kata Sandi
                </label>
                <div className="flex min-h-[46px] items-center gap-2.5 rounded-xl border border-slate-300 bg-white px-3.5 focus-within:border-[#D31D24] focus-within:ring-2 focus-within:ring-red-100 transition-all">
                  <LockKeyhole className="h-4 w-4 text-slate-400 flex-shrink-0" />
                  <input
                    id="password-input"
                    type={showPassword ? 'text' : 'password'}
                    autoComplete="current-password"
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    placeholder="Masukkan kata sandi"
                    required
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
              <div className="flex items-center justify-between pt-1">
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
                  className="text-xs font-semibold text-[#D31D24] hover:underline hover:text-[#B5171D] transition-colors"
                >
                  Lupa kata sandi?
                </button>
              </div>

              {/* Alert Pesan Error */}
              {error && (
                <div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-3 text-xs text-red-700 flex gap-2 items-start">
                  <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5 text-[#D31D24]" />
                  <span className="leading-snug">{error}</span>
                </div>
              )}

              {/* Tombol Masuk */}
              <div className="pt-2">
                <button
                  type="submit"
                  disabled={checking}
                  className="min-h-[46px] w-full rounded-xl bg-[#D31D24] hover:bg-[#B5171D] px-4 text-xs sm:text-sm font-bold text-white shadow-sm active:scale-[0.99] transition-all disabled:opacity-60 flex items-center justify-center gap-2 cursor-pointer"
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
              </div>
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
