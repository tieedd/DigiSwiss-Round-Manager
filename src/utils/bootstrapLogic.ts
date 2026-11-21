export interface BootstrapPasswordValidationResult {
  valid: boolean;
  error?: string;
}

/**
 * Validasi password untuk layar "Setup Awal Admin" (admindss).
 * Minimal 8 karakter, tidak memuat username admindss, dan cocok dengan konfirmasi.
 */
export function validateBootstrapAdminPassword(
  password: string,
  confirmPassword: string
): BootstrapPasswordValidationResult {
  if (!password) {
    return { valid: false, error: 'Password admin wajib diisi.' };
  }

  if (password.length < 8) {
    return { valid: false, error: 'Password admin minimal 8 karakter.' };
  }

  if (password.toLowerCase().includes('admindss')) {
    return { valid: false, error: 'Password tidak boleh memuat username admindss.' };
  }

  if (!confirmPassword) {
    return { valid: false, error: 'Konfirmasi password wajib diisi.' };
  }

  if (password !== confirmPassword) {
    return { valid: false, error: 'Konfirmasi password tidak cocok.' };
  }

  return { valid: true };
}
