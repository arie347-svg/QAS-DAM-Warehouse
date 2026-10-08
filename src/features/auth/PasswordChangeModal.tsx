import React, { useState } from 'react';
import { AlertCircle, Eye, EyeOff, LockKeyhole, ShieldCheck, X } from 'lucide-react';
import { changeApplicationPassword, type DemoUserOption } from '../../lib/api';
import { evaluatePasswordStrength } from '../../lib/passwordValidator';
import { PasswordStrengthMeter } from '../../components/PasswordStrengthMeter';

interface PasswordChangeModalProps { 
  onSuccess: (user: DemoUserOption) => void; 
  userEmail?: string;
  onClose?: () => void;
}

export const PasswordChangeModal: React.FC<PasswordChangeModalProps> = ({ onSuccess, userEmail, onClose }) => {
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!currentPassword) {
      setError('Password awal wajib diisi.');
      return;
    }
    const validation = evaluatePasswordStrength(newPassword);
    if (!validation.isValid) {
      setError(validation.errorMessage || 'Password baru belum memenuhi syarat keamanan.');
      return;
    }
    if (newPassword !== confirmPassword) { 
      setError('Konfirmasi password baru tidak sesuai.'); 
      return; 
    }

    setSaving(true); 
    setError(null);
    const result = await changeApplicationPassword(currentPassword, newPassword, confirmPassword, userEmail);
    if (result.success && result.user) { 
      onSuccess(result.user); 
      return; 
    }
    setSaving(false);
    setError(`${result.error?.message || 'Password tidak dapat diubah.'}${result.error?.requestId ? ` ID: ${result.error.requestId}` : ''}`);
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-xs overflow-y-auto">
      <section role="dialog" aria-modal="true" aria-labelledby="change-password-title" className="relative w-full max-w-sm rounded-3xl bg-white p-6 shadow-2xl my-auto">
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            aria-label="Tutup dan kembali ke halaman login"
            className="absolute top-4 right-4 p-2 text-slate-400 hover:text-slate-600 rounded-full hover:bg-slate-100 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        )}

        <div className="flex items-center gap-3 pr-8">
          <div className="grid h-11 w-11 place-items-center rounded-2xl bg-red-50 text-red-600 flex-shrink-0">
            <ShieldCheck className="h-6 w-6" />
          </div>
          <div className="min-w-0">
            <h1 id="change-password-title" className="text-lg font-extrabold text-slate-900 leading-tight truncate">
              Ganti Password
            </h1>
            <p className="text-xs text-slate-500 truncate">
              Wajib dilakukan untuk keamanan akun Anda.
            </p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="mt-5 space-y-3.5">
          {/* Field 1: Password awal */}
          <label className="block">
            <span className="text-xs font-bold text-slate-700">Password awal</span>
            <span className="mt-1 flex min-h-[44px] items-center gap-2 rounded-xl border border-slate-200 px-3 bg-white focus-within:border-red-500 focus-within:ring-2 focus-within:ring-red-100 transition-all">
              <LockKeyhole className="h-4 w-4 text-slate-400 shrink-0" />
              <input 
                type={showCurrent ? 'text' : 'password'} 
                autoComplete="current-password" 
                value={currentPassword} 
                onChange={(event) => setCurrentPassword(event.target.value)} 
                className="min-w-0 flex-1 bg-transparent text-sm outline-none" 
              />
              <button
                type="button"
                onClick={() => setShowCurrent(!showCurrent)}
                aria-label={showCurrent ? 'Sembunyikan password awal' : 'Tampilkan password awal'}
                className="text-slate-400 hover:text-slate-600 p-1"
              >
                {showCurrent ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </span>
          </label>

          {/* Field 2: Password baru */}
          <label className="block">
            <span className="text-xs font-bold text-slate-700">Password baru</span>
            <span className="mt-1 flex min-h-[44px] items-center gap-2 rounded-xl border border-slate-200 px-3 bg-white focus-within:border-red-500 focus-within:ring-2 focus-within:ring-red-100 transition-all">
              <LockKeyhole className="h-4 w-4 text-slate-400 shrink-0" />
              <input 
                type={showNew ? 'text' : 'password'} 
                autoComplete="new-password" 
                value={newPassword} 
                onChange={(event) => setNewPassword(event.target.value)} 
                className="min-w-0 flex-1 bg-transparent text-sm outline-none" 
              />
              <button
                type="button"
                onClick={() => setShowNew(!showNew)}
                aria-label={showNew ? 'Sembunyikan password baru' : 'Tampilkan password baru'}
                className="text-slate-400 hover:text-slate-600 p-1"
              >
                {showNew ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </span>
          </label>

          {/* Real-time Password Strength Meter & Checklist */}
          {newPassword.length > 0 && (
            <div className="bg-slate-50 p-2.5 rounded-xl border border-slate-100">
              <PasswordStrengthMeter password={newPassword} />
            </div>
          )}

          {/* Field 3: Konfirmasi password */}
          <label className="block">
            <span className="text-xs font-bold text-slate-700">Konfirmasi password</span>
            <span className="mt-1 flex min-h-[44px] items-center gap-2 rounded-xl border border-slate-200 px-3 bg-white focus-within:border-red-500 focus-within:ring-2 focus-within:ring-red-100 transition-all">
              <LockKeyhole className="h-4 w-4 text-slate-400 shrink-0" />
              <input 
                type={showConfirm ? 'text' : 'password'} 
                autoComplete="new-password" 
                value={confirmPassword} 
                onChange={(event) => setConfirmPassword(event.target.value)} 
                className="min-w-0 flex-1 bg-transparent text-sm outline-none" 
              />
              <button
                type="button"
                onClick={() => setShowConfirm(!showConfirm)}
                aria-label={showConfirm ? 'Sembunyikan konfirmasi password' : 'Tampilkan konfirmasi password'}
                className="text-slate-400 hover:text-slate-600 p-1"
              >
                {showConfirm ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </span>
          </label>

          <p className="text-[11px] leading-relaxed text-slate-500">
            Minimal 8 karakter, perpaduan huruf dan angka, serta tidak boleh menggunakan 12345.
          </p>

          {error && (
            <div role="alert" className="flex gap-2 rounded-xl border border-red-200 bg-red-50 p-3 text-xs text-red-700">
              <AlertCircle className="h-4 w-4 flex-shrink-0 mt-0.5" />
              <span className="leading-snug">{error}</span>
            </div>
          )}

          <div className="pt-2">
            <button
              type="submit"
              disabled={saving}
              className="w-full flex items-center justify-center min-h-[44px] px-4 rounded-xl bg-brand-red text-white text-xs font-bold hover:bg-red-700 transition-colors shadow-sm disabled:opacity-50"
            >
              {saving ? 'Menyimpan...' : 'Simpan Password Baru'}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
};
