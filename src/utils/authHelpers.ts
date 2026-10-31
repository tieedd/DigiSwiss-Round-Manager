/**
 * Normalisasi username: trim dan ubah ke huruf kecil.
 * Username tidak peka huruf besar/kecil.
 */
export function normalizeUsername(raw: string): string {
  if (!raw) return '';
  return raw.trim().toLowerCase();
}

/**
 * Validasi username sesuai aturan:
 * Hanya a-z, 0-9, titik (.), dan garis bawah (_), 3 sampai 20 karakter.
 */
export function isValidUsername(raw: string): boolean {
  const username = normalizeUsername(raw);
  return /^[a-z0-9._]{3,20}$/.test(username);
}

/**
 * Memeriksa apakah username termasuk dalam daftar yang dicadangkan.
 * Username "admin" dan "admindss" dicadangkan (tidak bisa didaftarkan pengguna biasa).
 */
export function isReservedUsername(raw: string): boolean {
  const username = normalizeUsername(raw);
  const reserved = ['admin', 'admindss'];
  return reserved.includes(username);
}

/**
 * Mengubah username menjadi format email semu Firebase Auth:
 * <username-huruf-kecil>@digiswiss.app
 */
export function usernameToEmail(raw: string): string {
  const username = normalizeUsername(raw);
  return `${username}@digiswiss.app`;
}

/**
 * Mengambil username dari email semu @digiswiss.app
 */
export function emailToUsername(email: string | null | undefined): string {
  if (!email) return '';
  return email.replace(/@digiswiss\.app$/i, '');
}

export type PasswordStrength = 'Lemah' | 'Sedang' | 'Kuat';

export interface PasswordStrengthResult {
  strength: PasswordStrength;
  score: number; // 0 sampai 4
  color: string;
  feedback: string[];
}

/**
 * Indikator kekuatan sandi untuk membantu pengguna membuat sandi yang aman.
 */
export function evaluatePasswordStrength(password: string): PasswordStrengthResult {
  const feedback: string[] = [];
  if (!password) {
    return { strength: 'Lemah', score: 0, color: 'bg-status-red', feedback: ['Masukkan sandi'] };
  }

  let score = 0;
  if (password.length >= 8) score += 1;
  if (password.length >= 12) score += 1;
  if (/[A-Z]/.test(password) && /[a-z]/.test(password)) score += 1;
  if (/\d/.test(password)) score += 1;
  if (/[^A-Za-z0-9]/.test(password)) score += 1;

  if (password.length < 8) {
    feedback.push('Minimal 8 karakter');
  }
  if (!/[A-Z]/.test(password) || !/[a-z]/.test(password)) {
    feedback.push('Campuran huruf besar & kecil');
  }
  if (!/\d/.test(password)) {
    feedback.push('Sertakan angka');
  }

  if (score <= 2) {
    return { strength: 'Lemah', score: Math.max(1, score), color: 'bg-status-red', feedback };
  } else if (score <= 3) {
    return { strength: 'Sedang', score, color: 'bg-status-yellow', feedback };
  } else {
    return { strength: 'Kuat', score: Math.min(4, score), color: 'bg-status-green', feedback: [] };
  }
}

export interface PasswordValidationOptions {
  isAdmin: boolean;
  username: string;
  oldPassword?: string;
}

/**
 * Memvalidasi sandi baru untuk alur Ganti Password:
 * - Minimal 12 karakter untuk admin dan 8 untuk pengguna biasa
 * - Tidak sama dengan sandi lama
 * - Tidak memuat username
 * - Tidak boleh bernilai sandi bawaan bootstrap
 */
export function validateNewPassword(
  newPassword: string,
  options: PasswordValidationOptions
): { valid: boolean; error?: string } {
  if (!newPassword) {
    return { valid: false, error: 'Password baru wajib diisi.' };
  }

  const minLength = options.isAdmin ? 12 : 8;
  if (newPassword.length < minLength) {
    return {
      valid: false,
      error: `Password baru minimal ${minLength} karakter untuk peran ${options.isAdmin ? 'Admin' : 'Pengguna'}.`,
    };
  }

  if (options.oldPassword && newPassword === options.oldPassword) {
    return {
      valid: false,
      error: 'Password baru tidak boleh sama dengan password lama.',
    };
  }

  const cleanUsername = normalizeUsername(options.username);
  if (cleanUsername && newPassword.toLowerCase().includes(cleanUsername)) {
    return {
      valid: false,
      error: 'Password baru tidak boleh memuat username.',
    };
  }

  // Larangan sandi bawaan bootstrap (diuji secara case-insensitive)
  if (newPassword.toLowerCase() === 'dssadmin') {
    return {
      valid: false,
      error: 'Password baru tidak boleh menggunakan password bawaan.',
    };
  }

  return { valid: true };
}

/**
 * Error kustom dengan kode Firebase
 */
export class AuthErrorWithCode extends Error {
  code?: string;
  constructor(message: string, code?: string) {
    super(message);
    this.name = 'AuthErrorWithCode';
    this.code = code;
  }
}

/**
 * Pemetaan pesan kesalahan Firebase Authentication sesuai spesifikasi sistem
 */
export function mapFirebaseAuthError(code: string, fallbackMessage?: string): AuthErrorWithCode {
  if (code === 'auth/too-many-requests') {
    return new AuthErrorWithCode(
      'Terlalu banyak percobaan masuk yang gagal. Silakan coba lagi beberapa saat nanti.',
      code
    );
  }
  if (code === 'auth/operation-not-allowed') {
    return new AuthErrorWithCode(
      'Login email/password belum diaktifkan di Firebase',
      code
    );
  }
  if (code === 'permission-denied') {
    return new AuthErrorWithCode(
      'Aturan database menolak akses',
      'permission-denied'
    );
  }
  if (
    code === 'auth/invalid-credential' ||
    code === 'auth/user-not-found' ||
    code === 'auth/wrong-password' ||
    code === 'auth/invalid-email'
  ) {
    return new AuthErrorWithCode('Username atau password salah.', code);
  }
  return new AuthErrorWithCode(fallbackMessage || 'Username atau password salah.', code || undefined);
}
