export type UserRole = 'admin' | 'organizer' | 'player';

/**
 * Memeriksa apakah suatu peran memiliki izin untuk mengakses halaman Kelola Pengguna.
 * Hanya peran 'admin' yang diperbolehkan.
 */
export function canAccessAdminUsers(role: UserRole | string | undefined | null): boolean {
  return role === 'admin';
}

export interface RoleChangeValidationParams {
  adminRole: UserRole | string | undefined | null;
  targetUsername: string;
  currentRole: string;
  newRole: string;
  adminPassword?: string;
}

/**
 * Validasi otorisasi dan parameter perubahan peran pengguna oleh admin.
 */
export function validateRoleChange(params: RoleChangeValidationParams): {
  allowed: boolean;
  reason?: string;
} {
  if (params.adminRole !== 'admin') {
    return {
      allowed: false,
      reason: 'Hanya pengguna dengan peran admin yang berhak mengubah peran.',
    };
  }

  if (params.targetUsername === 'admindss') {
    return {
      allowed: false,
      reason: 'Peran Admin Utama dilindungi dan tidak dapat diubah.',
    };
  }

  if (!['player', 'organizer'].includes(params.newRole)) {
    return {
      allowed: false,
      reason: 'Peran baru yang diizinkan hanya player atau organizer.',
    };
  }

  if (!params.adminPassword || params.adminPassword.trim() === '') {
    return {
      allowed: false,
      reason: 'Password admin wajib diisi untuk mengonfirmasi aksi ini.',
    };
  }

  return { allowed: true };
}

export interface StatusToggleValidationParams {
  adminRole: UserRole | string | undefined | null;
  targetUsername: string;
  adminPassword?: string;
}

/**
 * Validasi otorisasi dan parameter perubahan status aktif/nonaktif akun.
 */
export function validateStatusToggle(params: StatusToggleValidationParams): {
  allowed: boolean;
  reason?: string;
} {
  if (params.adminRole !== 'admin') {
    return {
      allowed: false,
      reason: 'Hanya pengguna dengan peran admin yang berhak mengubah status akun.',
    };
  }

  if (params.targetUsername === 'admindss') {
    return {
      allowed: false,
      reason: 'Akun Admin Utama dilindungi dan tidak dapat dinonaktifkan.',
    };
  }

  if (!params.adminPassword || params.adminPassword.trim() === '') {
    return {
      allowed: false,
      reason: 'Password admin wajib diisi untuk mengonfirmasi aksi ini.',
    };
  }

  return { allowed: true };
}
