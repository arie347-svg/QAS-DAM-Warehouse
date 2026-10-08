import React, { useState, useEffect } from 'react';
import { 
  Mail, 
  KeyRound, 
  LockKeyhole, 
  Eye, 
  EyeOff, 
  CheckCircle2, 
  AlertCircle, 
  ArrowLeft, 
  X, 
  RefreshCw,
  Sparkles
} from 'lucide-react';
import { requestPasswordResetOtp, verifyOtpAndResetPassword } from '../../lib/api';
import { evaluatePasswordStrength } from '../../lib/passwordValidator';
import { PasswordStrengthMeter } from '../../components/PasswordStrengthMeter';

interface ForgotPasswordModalProps {
  initialEmail?: string;
  onClose: () => void;
  onSuccess: (email: string) => void;
}

export const ForgotPasswordModal: React.FC<ForgotPasswordModalProps> = ({
  initialEmail = '',
  onClose,
  onSuccess,
}) => {
  const [step, setStep] = useState<'REQUEST' | 'VERIFY' | 'SUCCESS'>('REQUEST');
  const [email, setEmail] = useState(initialEmail);
  const [otp, setOtp] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [infoMessage, setInfoMessage] = useState<string | null>(null);
  const [simulatedOtp, setSimulatedOtp] = useState<string | null>(null);
  const [cooldown, setCooldown] = useState(0);

  // Timer cooldown effect
  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = setInterval(() => {
      setCooldown((prev) => Math.max(0, prev - 1));
    }, 1000);
    return () => clearInterval(timer);
  }, [cooldown]);

  const handleSendOtp = async (event?: React.FormEvent) => {
    if (event) event.preventDefault();
    const cleanEmail = email.trim().toLowerCase();
    if (!cleanEmail || !cleanEmail.includes('@')) {
      setError('Masukkan alamat e-mail kantor yang valid.');
      return;
    }

    setLoading(true);
    setError(null);
    setInfoMessage(null);

    const result = await requestPasswordResetOtp(cleanEmail);
    setLoading(false);

    if (result.success) {
      setStep('VERIFY');
      setCooldown(60);
      setOtp(''); // Jangan auto-fill: pengguna wajib memasukkan kode yang diterima dari email
      if (result.simulatedOtp) {
        setSimulatedOtp(result.simulatedOtp);
      }
      setInfoMessage(result.message || `Kode OTP 6-digit telah dikirim ke ${cleanEmail}`);
    } else {
      setError(result.error || 'Gagal mengirimkan kode verifikasi.');
    }
  };

  const handleResetPassword = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!otp.trim() || otp.trim().length !== 6) {
      setError('Masukkan 6-digit kode OTP verifikasi.');
      return;
    }
    if (!newPassword) {
      setError('Kata sandi baru wajib diisi.');
      return;
    }
    const validation = evaluatePasswordStrength(newPassword);
    if (!validation.isValid) {
      setError(validation.errorMessage || 'Kata sandi baru belum memenuhi syarat keamanan.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setError('Konfirmasi kata sandi baru tidak cocok.');
      return;
    }

    setLoading(true);
    setError(null);

    const result = await verifyOtpAndResetPassword(
      email.trim().toLowerCase(),
      otp.trim(),
      newPassword,
      confirmPassword
    );
    setLoading(false);

    if (result.success) {
      setStep('SUCCESS');
    } else {
      setError(result.error || 'Gagal mereset kata sandi.');
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 overflow-y-auto font-sans animate-fade-in">
      <div className="bg-white w-full max-w-md rounded-3xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col my-auto transition-all">
        
        {/* Header Modal */}
        <div className="p-4 sm:p-5 border-b border-slate-100 flex items-center justify-between bg-slate-50/70 select-none">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-red-50 text-[#D31D24] flex items-center justify-center font-bold">
              <KeyRound className="w-4 h-4" />
            </div>
            <div>
              <h3 className="font-extrabold text-sm sm:text-base text-slate-900 leading-none">
                {step === 'SUCCESS' ? 'Selesai' : 'Lupa Kata Sandi'}
              </h3>
              <p className="text-[10px] text-slate-500 font-medium mt-0.5">
                Pemulihan Akun Resmi QAS Logistics
              </p>
            </div>
          </div>
          {step !== 'SUCCESS' && (
            <button
              type="button"
              onClick={onClose}
              className="w-8 h-8 rounded-xl hover:bg-slate-200 grid place-items-center text-slate-400 hover:text-slate-600 transition-colors"
              aria-label="Tutup modal"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* Content Body */}
        <div className="p-5 sm:p-6 space-y-4">
          
          {/* STEP 1: REQUEST OTP */}
          {step === 'REQUEST' && (
            <form onSubmit={handleSendOtp} className="space-y-4">
              <p className="text-xs text-slate-600 leading-relaxed">
                Masukkan e-mail kantor yang terdaftar di sistem QAS. Kami akan mengirimkan <strong>kode verifikasi OTP 6-digit</strong> untuk mereset kata sandi Anda secara mandiri.
              </p>

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
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="nama@daya-motora.com"
                    required
                    className="min-w-0 flex-1 bg-transparent text-xs sm:text-sm text-slate-900 placeholder:text-slate-400 outline-none"
                  />
                </div>
              </div>

              {error && (
                <div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-3 text-xs text-red-700 flex gap-2 items-start">
                  <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5 text-[#D31D24]" />
                  <span className="leading-snug">{error}</span>
                </div>
              )}

              <div className="pt-2 flex flex-col sm:flex-row gap-2">
                <button
                  type="submit"
                  disabled={loading}
                  className="min-h-[44px] flex-1 rounded-xl bg-[#D31D24] hover:bg-[#B5171D] px-4 text-xs sm:text-sm font-bold text-white shadow-xs transition-all disabled:opacity-60 flex items-center justify-center gap-2"
                >
                  {loading ? (
                    <>
                      <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></span>
                      <span>Mengirim Kode...</span>
                    </>
                  ) : (
                    'Kirim Kode OTP'
                  )}
                </button>
                <button
                  type="button"
                  onClick={onClose}
                  className="min-h-[44px] px-4 rounded-xl border border-slate-200 bg-slate-50 text-slate-600 font-semibold text-xs sm:text-sm hover:bg-slate-100 transition-colors"
                >
                  Batal
                </button>
              </div>
            </form>
          )}

          {/* STEP 2: VERIFY OTP & SET NEW PASSWORD */}
          {step === 'VERIFY' && (
            <form onSubmit={handleResetPassword} className="space-y-4">
              {infoMessage && (
                <div className="rounded-xl border border-blue-200 bg-blue-50 p-3 text-xs text-blue-900 flex gap-2 items-start">
                  <Sparkles className="w-4 h-4 flex-shrink-0 mt-0.5 text-blue-600" />
                  <span className="leading-snug">{infoMessage}</span>
                </div>
              )}

              {/* Kartu Konfirmasi Pengiriman Email Dinamis */}
              <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-2xl flex items-start gap-3">
                <div className="w-8 h-8 rounded-xl bg-red-50 text-[#D31D24] grid place-items-center shrink-0 mt-0.5">
                  <Mail className="w-4 h-4" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-xs font-bold text-slate-800">
                    E-mail Verifikasi Telah Dikirim
                  </div>
                  <div className="text-[11px] text-[#D31D24] font-mono font-bold truncate mt-0.5">
                    {email.trim().toLowerCase()}
                  </div>
                  <div className="text-[11px] text-slate-500 mt-1 leading-snug">
                    Silakan periksa kotak masuk atau spam e-mail Anda. Masukkan 6-digit kode OTP ke kolom verifikasi di bawah ini (berlaku 10 menit).
                  </div>
                </div>
              </div>

              {/* Bantuan Sandbox / Mode Pengujian Lokal Tersembunyi (Tidak Auto-fill) */}
              {simulatedOtp && (
                <details className="group border border-dashed border-amber-300 bg-amber-50/70 rounded-xl p-2.5 text-[11px] text-amber-900">
                  <summary className="font-bold cursor-pointer select-none text-amber-800 flex items-center justify-between">
                    <span>Simulator Log Email (Mode Pengujian Sandbox)</span>
                    <span className="text-[10px] text-amber-600 font-normal group-open:hidden">Klik untuk melihat log</span>
                  </summary>
                  <div className="mt-2 pt-2 border-t border-amber-200/60 flex items-center justify-between">
                    <div>
                      <span className="text-amber-700">Kode OTP tujuan {email}:</span>{' '}
                      <span className="font-mono font-extrabold tracking-widest bg-amber-200/80 px-2 py-0.5 rounded text-amber-950 ml-1">
                        {simulatedOtp}
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => setOtp(simulatedOtp)}
                      className="text-[10px] font-bold text-[#D31D24] hover:underline"
                    >
                      Salin ke kolom input
                    </button>
                  </div>
                </details>
              )}

              {/* Input OTP */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">
                  Kode OTP 6-Digit
                </label>
                <div className="flex min-h-[46px] items-center gap-2.5 rounded-xl border border-slate-300 bg-white px-3.5 focus-within:border-[#D31D24] focus-within:ring-2 focus-within:ring-red-100 transition-all">
                  <KeyRound className="h-4 w-4 text-slate-400 flex-shrink-0" />
                  <input
                    type="text"
                    inputMode="numeric"
                    maxLength={6}
                    value={otp}
                    onChange={(e) => setOtp(e.target.value.replace(/\D/g, ''))}
                    placeholder="Contoh: 123456"
                    required
                    className="min-w-0 flex-1 bg-transparent text-sm sm:text-base font-mono tracking-widest text-slate-900 placeholder:text-slate-400 outline-none"
                  />
                </div>
              </div>

              {/* Input Kata Sandi Baru */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">
                  Kata Sandi Baru
                </label>
                <div className="flex min-h-[46px] items-center gap-2.5 rounded-xl border border-slate-300 bg-white px-3.5 focus-within:border-[#D31D24] focus-within:ring-2 focus-within:ring-red-100 transition-all">
                  <LockKeyhole className="h-4 w-4 text-slate-400 flex-shrink-0" />
                  <input
                    type={showNewPassword ? 'text' : 'password'}
                    autoComplete="new-password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="Minimal 8 karakter"
                    required
                    className="min-w-0 flex-1 bg-transparent text-xs sm:text-sm text-slate-900 placeholder:text-slate-400 outline-none"
                  />
                  <button
                    type="button"
                    onClick={() => setShowNewPassword(!showNewPassword)}
                    className="grid h-8 w-8 place-items-center text-slate-400 hover:text-slate-600 rounded-lg"
                    aria-label={showNewPassword ? 'Sembunyikan password' : 'Lihat password'}
                  >
                    {showNewPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
                {newPassword.length > 0 && (
                  <div className="bg-slate-50 p-2.5 rounded-xl border border-slate-100 mt-2">
                    <PasswordStrengthMeter password={newPassword} />
                  </div>
                )}
                <p className="text-[11px] text-slate-500 mt-1">
                  Minimal 8 karakter, perpaduan huruf dan angka, serta tidak boleh sama dengan password awal (12345).
                </p>
              </div>

              {/* Input Konfirmasi Kata Sandi Baru */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">
                  Konfirmasi Kata Sandi Baru
                </label>
                <div className="flex min-h-[46px] items-center gap-2.5 rounded-xl border border-slate-300 bg-white px-3.5 focus-within:border-[#D31D24] focus-within:ring-2 focus-within:ring-red-100 transition-all">
                  <LockKeyhole className="h-4 w-4 text-slate-400 flex-shrink-0" />
                  <input
                    type={showConfirmPassword ? 'text' : 'password'}
                    autoComplete="new-password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="Ulangi kata sandi baru"
                    required
                    className="min-w-0 flex-1 bg-transparent text-xs sm:text-sm text-slate-900 placeholder:text-slate-400 outline-none"
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                    className="grid h-8 w-8 place-items-center text-slate-400 hover:text-slate-600 rounded-lg"
                    aria-label={showConfirmPassword ? 'Sembunyikan konfirmasi password' : 'Lihat konfirmasi password'}
                  >
                    {showConfirmPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              {error && (
                <div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-3 text-xs text-red-700 flex gap-2 items-start">
                  <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5 text-[#D31D24]" />
                  <span className="leading-snug">{error}</span>
                </div>
              )}

              {/* Action Buttons */}
              <div className="pt-2 space-y-2">
                <button
                  type="submit"
                  disabled={loading}
                  className="min-h-[46px] w-full rounded-xl bg-[#D31D24] hover:bg-[#B5171D] px-4 text-xs sm:text-sm font-bold text-white shadow-xs transition-all disabled:opacity-60 flex items-center justify-center gap-2"
                >
                  {loading ? (
                    <>
                      <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></span>
                      <span>Menyimpan Password...</span>
                    </>
                  ) : (
                    'Perbarui Kata Sandi'
                  )}
                </button>

                <div className="flex items-center justify-between text-xs pt-1">
                  <button
                    type="button"
                    onClick={() => setStep('REQUEST')}
                    className="text-slate-500 hover:text-slate-800 flex items-center gap-1 font-semibold"
                  >
                    <ArrowLeft className="w-3.5 h-3.5" /> Ganti Email
                  </button>

                  <button
                    type="button"
                    disabled={cooldown > 0 || loading}
                    onClick={() => handleSendOtp()}
                    className="text-[#D31D24] hover:underline disabled:text-slate-400 disabled:no-underline font-semibold flex items-center gap-1"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
                    {cooldown > 0 ? `Kirim ulang (${cooldown}d)` : 'Kirim Ulang OTP'}
                  </button>
                </div>
              </div>
            </form>
          )}

          {/* STEP 3: SUCCESS */}
          {step === 'SUCCESS' && (
            <div className="text-center py-4 space-y-4">
              <div className="w-16 h-16 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center mx-auto shadow-sm ring-8 ring-emerald-50">
                <CheckCircle2 className="w-9 h-9" />
              </div>
              <div className="space-y-1.5">
                <h4 className="text-base sm:text-lg font-black text-slate-900">
                  Kata Sandi Berhasil Diperbarui!
                </h4>
                <p className="text-xs text-slate-600 max-w-xs mx-auto leading-relaxed">
                  Password awal Anda kini telah dinonaktifkan permanen. Silakan masuk menggunakan kata sandi baru Anda.
                </p>
              </div>

              <div className="pt-2">
                <button
                  type="button"
                  onClick={() => onSuccess(email.trim().toLowerCase())}
                  className="min-h-[46px] w-full rounded-xl bg-[#D31D24] hover:bg-[#B5171D] px-4 text-xs sm:text-sm font-bold text-white shadow-xs transition-colors"
                >
                  Masuk Sekarang
                </button>
              </div>
            </div>
          )}

        </div>
      </div>
    </div>
  );
};
