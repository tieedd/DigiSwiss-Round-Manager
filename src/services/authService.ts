import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut,
  updatePassword,
  reauthenticateWithCredential,
  EmailAuthProvider,
  User
} from 'firebase/auth';
import {
  doc,
  getDoc,
  setDoc,
  updateDoc,
  serverTimestamp,
  collection,
  addDoc,
  getDocs,
  query,
  orderBy,
  limit
} from 'firebase/firestore';
import { auth, db } from '../firebaseConfig';
import {
  normalizeUsername,
  isValidUsername,
  isReservedUsername,
  usernameToEmail,
  validateNewPassword,
  AuthErrorWithCode,
  mapFirebaseAuthError
} from '../utils/authHelpers';
import { UserProfile } from '../types';

// In-memory clock offset (selisih jam server vs jam perangkat untuk timer)
let memoryClockOffset: number = 0;

export function getClockOffset(): number {
  return memoryClockOffset;
}

export function setClockOffset(offset: number): void {
  memoryClockOffset = offset;
}

// In-memory rate limiting untuk percobaan login gagal
interface RateLimitState {
  failedAttempts: number;
  lockoutUntil: number | null;
}

const rateLimitState: RateLimitState = {
  failedAttempts: 0,
  lockoutUntil: null,
};

export function getRateLimitStatus(): { isLocked: boolean; remainingSeconds: number } {
  if (!rateLimitState.lockoutUntil) {
    return { isLocked: false, remainingSeconds: 0 };
  }
  const now = Date.now();
  if (now >= rateLimitState.lockoutUntil) {
    // Kunci telah berakhir
    rateLimitState.failedAttempts = 0;
    rateLimitState.lockoutUntil = null;
    return { isLocked: false, remainingSeconds: 0 };
  }
  const remainingSeconds = Math.ceil((rateLimitState.lockoutUntil - now) / 1000);
  return { isLocked: true, remainingSeconds };
}

function recordFailedLoginAttempt(): { isLocked: boolean; remainingSeconds: number } {
  rateLimitState.failedAttempts += 1;
  if (rateLimitState.failedAttempts >= 5) {
    // Tunda 5 menit di sisi aplikasi setelah 5 kali gagal
    rateLimitState.lockoutUntil = Date.now() + 5 * 60 * 1000;
    return getRateLimitStatus();
  }
  return { isLocked: false, remainingSeconds: 0 };
}

function clearFailedLoginAttempts(): void {
  rateLimitState.failedAttempts = 0;
  rateLimitState.lockoutUntil = null;
}

/**
 * Mencatat peristiwa ke koleksi auditLogs
 */
export async function recordAuditLog(
  actorId: string,
  actorName: string,
  action: string,
  target: string,
  oldValue: string | null = null,
  newValue: string | null = null,
  tournamentId: string | null = null
): Promise<void> {
  try {
    const logData: Record<string, any> = {
      actorId,
      actorName,
      action,
      target,
      oldValue,
      newValue,
      createdAt: Date.now(),
    };
    if (tournamentId) {
      logData.tournamentId = tournamentId;
    }
    await addDoc(collection(db, 'auditLogs'), logData);
  } catch (err) {
    console.error('Gagal menulis audit log:', err);
  }
}

/**
 * Alur Masuk (Login)
 */
export async function loginUser(rawUsername: string, rawPassword: string): Promise<UserProfile> {
  // Cek batas laju percobaan gagal
  const rateLimit = getRateLimitStatus();
  if (rateLimit.isLocked) {
    const minutes = Math.ceil(rateLimit.remainingSeconds / 60);
    throw new Error(
      `Terlalu banyak percobaan gagal. Silakan tunggu ${minutes} menit sebelum mencoba lagi.`
    );
  }

  const cleanUsername = normalizeUsername(rawUsername);
  if (!cleanUsername || !rawPassword) {
    throw new Error('Username atau password salah.');
  }

  const email = usernameToEmail(cleanUsername);

  try {
    const cred = await signInWithEmailAndPassword(auth, email, rawPassword);
    const uid = cred.user.uid;

    // Baca profil dari users/{uid}
    const userRef = doc(db, 'users', uid);
    const userSnap = await getDoc(userRef);

    if (!userSnap.exists()) {
      await signOut(auth);
      recordFailedLoginAttempt();
      throw new Error('Username atau password salah.');
    }

    const profile = userSnap.data() as UserProfile;

    // Periksa status aktif
    if (!profile.active) {
      await signOut(auth);
      throw new Error('Akun Anda telah dinonaktifkan. Silakan hubungi admin.');
    }

    // Login berhasil: reset counter kegagalan
    clearFailedLoginAttempts();

    // Catat serverTimestamp untuk lastLoginAt dan hitung clockOffset
    try {
      await updateDoc(userRef, { lastLoginAt: serverTimestamp() });
      const refreshedSnap = await getDoc(userRef);
      const serverData = refreshedSnap.data();
      if (serverData?.lastLoginAt?.toMillis) {
        const serverMillis = serverData.lastLoginAt.toMillis();
        const clientMillis = Date.now();
        setClockOffset(serverMillis - clientMillis);
      }
    } catch (e) {
      console.warn('Gagal memperbarui lastLoginAt server timestamp:', e);
    }

    // Jika admin login, catat ke audit log
    if (profile.role === 'admin') {
      await recordAuditLog(uid, profile.displayName || profile.username, 'ADMIN_LOGIN', `users/${uid}`);
    }

    return profile;
  } catch (err: any) {
    const code = err?.code || '';
    if (code === 'auth/too-many-requests') {
      throw new AuthErrorWithCode(
        'Terlalu banyak percobaan masuk yang gagal. Silakan coba lagi beberapa saat nanti.',
        code
      );
    }
    if (code === 'auth/operation-not-allowed') {
      throw new AuthErrorWithCode(
        'Login email/password belum diaktifkan di Firebase',
        code
      );
    }
    if (code === 'permission-denied' || (err?.message && err.message.includes('permission-denied'))) {
      throw new AuthErrorWithCode(
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
      recordFailedLoginAttempt();
      throw new AuthErrorWithCode('Username atau password salah.', code);
    }
    if (err instanceof AuthErrorWithCode) {
      throw err;
    }
    if (err?.message && !code) {
      throw new AuthErrorWithCode(err.message);
    }
    recordFailedLoginAttempt();
    throw new AuthErrorWithCode('Username atau password salah.', code || undefined);
  }
}

/**
 * Alur Registrasi Pengguna Baru
 */
export async function registerUser(
  rawUsername: string,
  rawDisplayName: string,
  rawPassword: string
): Promise<UserProfile> {
  const cleanUsername = normalizeUsername(rawUsername);

  if (!cleanUsername) {
    throw new Error('Username wajib diisi.');
  }

  if (isReservedUsername(cleanUsername)) {
    throw new Error('Username telah dicadangkan dan tidak dapat digunakan.');
  }

  if (!isValidUsername(cleanUsername)) {
    throw new Error('Username hanya boleh memuat huruf kecil a-z, angka 0-9, titik (.), dan garis bawah (_) antara 3 hingga 20 karakter.');
  }

  if (!rawPassword || rawPassword.length < 8) {
    throw new Error('Password minimal 8 karakter.');
  }

  const cleanDisplayName = rawDisplayName.trim() || cleanUsername;
  const email = usernameToEmail(cleanUsername);

  try {
    const cred = await createUserWithEmailAndPassword(auth, email, rawPassword);
    const uid = cred.user.uid;
    const now = Date.now();

    const profileData: UserProfile = {
      username: cleanUsername,
      displayName: cleanDisplayName,
      role: 'player',
      active: true,
      mustChangePassword: false,
      createdAt: now,
      lastLoginAt: now,
    };

    await setDoc(doc(db, 'users', uid), profileData);

    return profileData;
  } catch (err: any) {
    if (err?.code === 'auth/email-already-in-use') {
      throw new Error('Username sudah digunakan. Silakan pilih username lain.');
    }
    throw new Error(err?.message || 'Gagal mendaftar. Silakan coba kembali.');
  }
}

/**
 * Melakukan re-otentikasi pengguna saat menjalankan aksi sensitif
 */
export async function reauthenticateCurrentUser(password: string): Promise<boolean> {
  const user = auth.currentUser;
  if (!user || !user.email) {
    throw new Error('Sesi pengguna tidak valid.');
  }
  const credential = EmailAuthProvider.credential(user.email, password);
  try {
    await reauthenticateWithCredential(user, credential);
    return true;
  } catch (err: any) {
    throw new Error('Password konfirmasi tidak sesuai.');
  }
}

/**
 * Alur Ganti Password
 */
export async function changeUserPassword(
  oldPassword: string,
  newPassword: string,
  profile: UserProfile
): Promise<void> {
  const user = auth.currentUser;
  if (!user || !user.email) {
    throw new Error('Sesi pengguna tidak valid.');
  }

  // 1. Validasi password baru terhadap aturan
  const validation = validateNewPassword(newPassword, {
    isAdmin: profile.role === 'admin',
    username: profile.username,
    oldPassword,
  });

  if (!validation.valid) {
    throw new Error(validation.error || 'Password baru tidak memenuhi persyaratan.');
  }

  // 2. Re-otentikasi dengan password lama
  await reauthenticateCurrentUser(oldPassword);

  // 3. Ubah password di Firebase Auth
  await updatePassword(user, newPassword);

  // 4. Update status mustChangePassword di Firestore
  const userRef = doc(db, 'users', user.uid);
  await updateDoc(userRef, { mustChangePassword: false });

  // 5. Catat ke audit log
  await recordAuditLog(
    user.uid,
    profile.displayName || profile.username,
    'PASSWORD_CHANGED',
    `users/${user.uid}`
  );
}

/**
 * Logout
 */
export async function logoutUser(): Promise<void> {
  await signOut(auth);
}

/**
 * Mengambil daftar seluruh pengguna (khusus Admin untuk keperluan statistik dan manajemen)
 */
export async function getAllUsers(): Promise<UserProfile[]> {
  const usersCol = collection(db, 'users');
  const snap = await getDocs(query(usersCol, orderBy('createdAt', 'desc'), limit(100)));
  return snap.docs.map((d) => d.data() as UserProfile);
}
