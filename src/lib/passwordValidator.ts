/**
 * Password Security & Validation Utilities for QAS
 * Enforces strong password rules:
 * - Minimal 8 karakter
 * - Perpaduan huruf dan angka
 * - Tidak sama dengan password awal (12345)
 */

export interface PasswordStrengthResult {
  score: number; // 0 to 4
  level: 'EMPTY' | 'WEAK' | 'FAIR' | 'GOOD' | 'STRONG';
  label: string;
  hasMinLength: boolean;
  hasLetter: boolean;
  hasNumber: boolean;
  isNotInitial: boolean;
  isValid: boolean;
  errorMessage: string | null;
}

export function evaluatePasswordStrength(password: string): PasswordStrengthResult {
  const cleanPass = password || '';
  if (!cleanPass) {
    return {
      score: 0,
      level: 'EMPTY',
      label: 'Belum diisi',
      hasMinLength: false,
      hasLetter: false,
      hasNumber: false,
      isNotInitial: true,
      isValid: false,
      errorMessage: 'Kata sandi baru wajib diisi.',
    };
  }

  const hasMinLength = cleanPass.length >= 8;
  const hasLetter = /[A-Za-z]/.test(cleanPass);
  const hasNumber = /\d/.test(cleanPass);
  const isNotInitial = cleanPass !== '12345';
  const hasUpperAndLower = /[a-z]/.test(cleanPass) && /[A-Z]/.test(cleanPass);
  const hasSpecial = /[^A-Za-z0-9]/.test(cleanPass);

  let score = 0;
  if (hasMinLength) score += 1;
  if (hasLetter) score += 1;
  if (hasNumber) score += 1;
  if (cleanPass.length >= 10 || hasUpperAndLower || hasSpecial) score += 1;

  const isValid = hasMinLength && hasLetter && hasNumber && isNotInitial;

  let level: 'EMPTY' | 'WEAK' | 'FAIR' | 'GOOD' | 'STRONG' = 'WEAK';
  let label = 'Sangat Lemah';

  if (!isValid) {
    if (score <= 1) {
      level = 'WEAK';
      label = 'Lemah';
    } else {
      level = 'FAIR';
      label = 'Belum Memenuhi Syarat';
    }
  } else {
    if (score >= 4) {
      level = 'STRONG';
      label = 'Sangat Kuat';
    } else if (score >= 3) {
      level = 'GOOD';
      label = 'Kuat';
    } else {
      level = 'FAIR';
      label = 'Cukup';
    }
  }

  let errorMessage: string | null = null;
  if (!isNotInitial) {
    errorMessage = 'Kata sandi baru tidak boleh sama dengan password awal (12345).';
  } else if (!hasMinLength) {
    errorMessage = 'Kata sandi baru minimal 8 karakter.';
  } else if (!hasLetter || !hasNumber) {
    errorMessage = 'Kata sandi baru harus perpaduan huruf dan angka.';
  }

  return {
    score,
    level,
    label,
    hasMinLength,
    hasLetter,
    hasNumber,
    isNotInitial,
    isValid,
    errorMessage,
  };
}
