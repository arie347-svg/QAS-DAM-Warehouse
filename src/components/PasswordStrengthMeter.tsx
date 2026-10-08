import React from 'react';
import { Check, X } from 'lucide-react';
import { evaluatePasswordStrength } from '../lib/passwordValidator';

interface PasswordStrengthMeterProps {
  password: string;
  showChecklist?: boolean;
}

export const PasswordStrengthMeter: React.FC<PasswordStrengthMeterProps> = ({
  password,
  showChecklist = true,
}) => {
  if (!password) {
    return (
      <div className="space-y-1.5 pt-1 text-xs">
        <div className="flex items-center justify-between text-[11px] text-slate-500">
          <span>Kekuatan kata sandi</span>
          <span className="font-semibold text-slate-400">Belum diisi</span>
        </div>
        <div className="grid grid-cols-4 gap-1.5">
          <div className="h-1.5 rounded-full bg-slate-200" />
          <div className="h-1.5 rounded-full bg-slate-200" />
          <div className="h-1.5 rounded-full bg-slate-200" />
          <div className="h-1.5 rounded-full bg-slate-200" />
        </div>
        {showChecklist && (
          <div className="space-y-1 pt-1 text-[11px] text-slate-500">
            <div className="flex items-center gap-1.5 text-slate-400">
              <span className="h-1.5 w-1.5 rounded-full bg-slate-300" />
              <span>Minimal 8 karakter</span>
            </div>
            <div className="flex items-center gap-1.5 text-slate-400">
              <span className="h-1.5 w-1.5 rounded-full bg-slate-300" />
              <span>Perpaduan huruf dan angka</span>
            </div>
            <div className="flex items-center gap-1.5 text-slate-400">
              <span className="h-1.5 w-1.5 rounded-full bg-slate-300" />
              <span>Bukan password awal (12345)</span>
            </div>
          </div>
        )}
      </div>
    );
  }

  const result = evaluatePasswordStrength(password);

  const getBarColor = (index: number) => {
    if (index >= result.score) return 'bg-slate-200';
    if (!result.isValid) {
      return result.score <= 1 ? 'bg-red-500' : 'bg-amber-400';
    }
    if (result.score >= 4) return 'bg-emerald-500';
    if (result.score >= 3) return 'bg-emerald-400';
    return 'bg-amber-400';
  };

  const getLabelColor = () => {
    if (!result.isValid) {
      return result.score <= 1 ? 'text-red-600' : 'text-amber-600';
    }
    if (result.score >= 4) return 'text-emerald-700';
    if (result.score >= 3) return 'text-emerald-600';
    return 'text-amber-600';
  };

  return (
    <div className="space-y-1.5 pt-1 text-xs">
      {/* Bar and Badge */}
      <div className="flex items-center justify-between text-[11px]">
        <span className="text-slate-500 font-medium">Kekuatan kata sandi</span>
        <span className={`font-bold transition-colors ${getLabelColor()}`}>
          {result.label}
        </span>
      </div>

      <div className="grid grid-cols-4 gap-1.5">
        <div className={`h-1.5 rounded-full transition-all duration-300 ${getBarColor(0)}`} />
        <div className={`h-1.5 rounded-full transition-all duration-300 ${getBarColor(1)}`} />
        <div className={`h-1.5 rounded-full transition-all duration-300 ${getBarColor(2)}`} />
        <div className={`h-1.5 rounded-full transition-all duration-300 ${getBarColor(3)}`} />
      </div>

      {/* Checklist */}
      {showChecklist && (
        <div className="space-y-1 pt-1 text-[11px]">
          <div className={`flex items-center gap-1.5 ${result.hasMinLength ? 'text-emerald-600 font-medium' : 'text-slate-400'}`}>
            {result.hasMinLength ? (
              <Check className="w-3.5 h-3.5 text-emerald-500 flex-shrink-0" />
            ) : (
              <X className="w-3.5 h-3.5 text-slate-300 flex-shrink-0" />
            )}
            <span>Minimal 8 karakter</span>
          </div>

          <div className={`flex items-center gap-1.5 ${(result.hasLetter && result.hasNumber) ? 'text-emerald-600 font-medium' : 'text-slate-400'}`}>
            {(result.hasLetter && result.hasNumber) ? (
              <Check className="w-3.5 h-3.5 text-emerald-500 flex-shrink-0" />
            ) : (
              <X className="w-3.5 h-3.5 text-slate-300 flex-shrink-0" />
            )}
            <span>Perpaduan huruf dan angka</span>
          </div>

          <div className={`flex items-center gap-1.5 ${result.isNotInitial ? 'text-emerald-600 font-medium' : 'text-red-500 font-semibold'}`}>
            {result.isNotInitial ? (
              <Check className="w-3.5 h-3.5 text-emerald-500 flex-shrink-0" />
            ) : (
              <X className="w-3.5 h-3.5 text-red-500 flex-shrink-0" />
            )}
            <span>Bukan password awal (12345)</span>
          </div>
        </div>
      )}
    </div>
  );
};
