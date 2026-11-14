import { auth } from '../firebaseConfig';
import { reauthenticateCurrentUser } from './authService';
import {
  createResetCodeWithAuth,
  CreateResetCodeResponse,
  normalizeResetCode,
  normalizeResetPin,
  normalizeResetUsername,
  PasswordResetError,
  resetPasswordWithCode,
  resetPasswordWithPin,
  ResetWithCodeResponse,
  ResetWithPinResponse,
} from './passwordResetClient.ts';

export {
  normalizeResetCode,
  normalizeResetPin,
  normalizeResetUsername,
  PasswordResetError,
  resetPasswordWithCode,
  resetPasswordWithPin,
};

export type {
  CreateResetCodeResponse,
  ResetWithCodeResponse,
  ResetWithPinResponse,
};

/**
 * Membuat kode reset password darurat untuk pengguna tertentu (khusus Admin).
 * Selalu memverifikasi ulang password Admin terlebih dahulu sebelum mengambil ID token.
 */
export async function createResetCodeAsAdmin(
  username: string,
  minutes: number,
  adminPassword: string
): Promise<CreateResetCodeResponse> {
  return createResetCodeWithAuth(username, minutes, adminPassword, {
    reauthenticate: reauthenticateCurrentUser,
    getIdToken: async () => {
      const user = auth.currentUser;
      if (!user) {
        throw new Error('Sesi admin tidak valid. Silakan login kembali.');
      }
      return user.getIdToken(true);
    },
  });
}
