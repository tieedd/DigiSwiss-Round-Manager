import { doc, getDoc, setDoc, updateDoc } from 'firebase/firestore';
import { EmailAuthProvider, reauthenticateWithCredential } from 'firebase/auth';
import { db, auth } from '../firebaseConfig';
import {
  hashPin,
  verifyPinHash,
  isWeakPin,
  isPinFormatValid,
  isPinLocked,
  PIN_PBKDF2_ITERATIONS,
  MAX_PIN_FAILED_ATTEMPTS,
  PIN_LOCKOUT_DURATION_MS
} from '../utils/pinSecurityLogic';
import { recordAuditLog } from './authService';

export interface UserPinDocument {
  algo: 'pbkdf2-sha256';
  iterations: number;
  salt: string;
  hash: string;
  createdAt: number;
  updatedAt: number;
  failedAttempts: number;
  lockedUntil: number | null;
}

/**
 * Mengambil dokumen PIN pengguna dari Firestore
 */
export async function getUserPinDocument(uid: string): Promise<UserPinDocument | null> {
  try {
    const pinDocRef = doc(db, 'userPins', uid);
    const snap = await getDoc(pinDocRef);
    if (snap.exists()) {
      return snap.data() as UserPinDocument;
    }
    return null;
  } catch (err) {
    console.error('Gagal mengambil data PIN:', err);
    return null;
  }
}

/**
 * Memeriksa apakah pengguna sudah memiliki PIN keamanan
 */
export async function checkUserHasPin(uid: string): Promise<boolean> {
  const docData = await getUserPinDocument(uid);
  return docData !== null && Boolean(docData.hash);
}

/**
 * Membuat PIN baru untuk pengguna (pertama kali)
 */
export async function setupUserPin(uid: string, pin: string): Promise<void> {
  const trimmed = pin.trim();
  if (!isPinFormatValid(trimmed)) {
    throw new Error('PIN harus terdiri dari tepat 6 digit angka.');
  }

  const weakCheck = isWeakPin(trimmed);
  if (weakCheck.isWeak) {
    throw new Error(weakCheck.reason || 'Kombinasi PIN terlalu lemah.');
  }

  const { algo, iterations, salt, hash } = await hashPin(trimmed);

  const pinDocRef = doc(db, 'userPins', uid);
  const now = Date.now();
  const pinData: UserPinDocument = {
    algo,
    iterations,
    salt,
    hash,
    createdAt: now,
    updatedAt: now,
    failedAttempts: 0,
    lockedUntil: null
  };

  await setDoc(pinDocRef, pinData);

  // Catat jejak audit
  try {
    await recordAuditLog(
      uid,
      auth.currentUser?.displayName || 'Pengguna',
      'PIN_CREATED',
      `userPins/${uid}`,
      null,
      'PIN keamanan 6 digit berhasil diatur'
    );
  } catch (auditErr) {
    console.warn('Gagal mencatat audit log PIN_CREATED:', auditErr);
  }
}

/**
 * Memverifikasi input PIN pengguna dan menangani penguncian otomatis setelah 5 kali gagal
 */
export async function verifyUserPin(
  uid: string,
  pin: string
): Promise<{
  success: boolean;
  error?: string;
  remainingAttempts?: number;
  lockedUntil?: number;
}> {
  const pinData = await getUserPinDocument(uid);
  if (!pinData) {
    return { success: false, error: 'PIN keamanan belum diatur pada akun ini.' };
  }

  // Cek apakah PIN sedang dalam status terkunci
  const lockStatus = isPinLocked(pinData.lockedUntil);
  if (lockStatus.locked) {
    return {
      success: false,
      error: `PIN terkunci sementara karena 5 kali percobaan gagal. Silakan tunggu ${lockStatus.remainingSeconds} detik lagi.`,
      remainingAttempts: 0,
      lockedUntil: pinData.lockedUntil || undefined
    };
  }

  const isValid = await verifyPinHash(
    pin.trim(),
    pinData.salt,
    pinData.hash,
    pinData.iterations || PIN_PBKDF2_ITERATIONS
  );

  const pinDocRef = doc(db, 'userPins', uid);

  if (!isValid) {
    const currentFailed = (pinData.failedAttempts || 0) + 1;

    if (currentFailed >= MAX_PIN_FAILED_ATTEMPTS) {
      const lockUntil = Date.now() + PIN_LOCKOUT_DURATION_MS;
      await updateDoc(pinDocRef, {
        failedAttempts: 0,
        lockedUntil: lockUntil,
        updatedAt: Date.now()
      });

      try {
        await recordAuditLog(
          uid,
          auth.currentUser?.displayName || 'Pengguna',
          'PIN_LOCKED',
          `userPins/${uid}`,
          String(currentFailed),
          'PIN akun terkunci 15 menit setelah 5 kali gagal berturut-turut'
        );
      } catch (e) {
        console.warn('Gagal mencatat audit log PIN_LOCKED:', e);
      }

      return {
        success: false,
        error: 'PIN salah 5 kali berturut-turut. Demi keamanan, PIN dikunci selama 15 menit.',
        remainingAttempts: 0,
        lockedUntil: lockUntil
      };
    } else {
      await updateDoc(pinDocRef, {
        failedAttempts: currentFailed,
        updatedAt: Date.now()
      });

      const remaining = MAX_PIN_FAILED_ATTEMPTS - currentFailed;
      return {
        success: false,
        error: `PIN yang Anda masukkan salah. Sisa kesempatan: ${remaining} kali.`,
        remainingAttempts: remaining
      };
    }
  }

  // PIN Benar: Reset hitungan gagal jika sebelumnya pernah gagal
  if ((pinData.failedAttempts || 0) > 0 || pinData.lockedUntil !== null) {
    await updateDoc(pinDocRef, {
      failedAttempts: 0,
      lockedUntil: null,
      updatedAt: Date.now()
    });
  }

  return { success: true };
}

/**
 * Mengubah PIN dengan memverifikasi PIN lama terlebih dahulu
 */
export async function changeUserPin(
  uid: string,
  oldPin: string,
  newPin: string
): Promise<void> {
  const verifyResult = await verifyUserPin(uid, oldPin);
  if (!verifyResult.success) {
    throw new Error(verifyResult.error || 'PIN lama yang Anda masukkan salah.');
  }

  const cleanNew = newPin.trim();
  if (!isPinFormatValid(cleanNew)) {
    throw new Error('PIN baru harus terdiri dari 6 digit angka.');
  }

  const weakCheck = isWeakPin(cleanNew);
  if (weakCheck.isWeak) {
    throw new Error(weakCheck.reason || 'Kombinasi PIN baru terlalu lemah.');
  }

  // Segarkan token otentikasi agar memenuhi syarat waktu auth Firestore rules
  if (auth.currentUser) {
    try {
      await auth.currentUser.getIdToken(true);
    } catch (tokenErr) {
      console.warn('Token refresh warning:', tokenErr);
    }
  }

  const { algo, iterations, salt, hash } = await hashPin(cleanNew);
  const pinDocRef = doc(db, 'userPins', uid);
  const now = Date.now();

  await updateDoc(pinDocRef, {
    algo,
    iterations,
    salt,
    hash,
    updatedAt: now,
    failedAttempts: 0,
    lockedUntil: null
  });

  try {
    await recordAuditLog(
      uid,
      auth.currentUser?.displayName || 'Pengguna',
      'PIN_CHANGED',
      `userPins/${uid}`,
      null,
      'PIN keamanan berhasil diubah'
    );
  } catch (auditErr) {
    console.warn('Gagal mencatat audit log PIN_CHANGED:', auditErr);
  }
}

/**
 * Mengatur ulang (reset) PIN menggunakan re-otentikasi password akun jika pengguna lupa PIN lama
 */
export async function resetUserPinWithPassword(
  uid: string,
  accountPassword: string,
  newPin: string
): Promise<void> {
  const user = auth.currentUser;
  if (!user || !user.email) {
    throw new Error('Sesi pengguna tidak valid untuk re-otentikasi.');
  }

  // Re-autentikasi password akun
  const credential = EmailAuthProvider.credential(user.email, accountPassword);
  await reauthenticateWithCredential(user, credential);

  // Segarkan token setelah re-otentikasi
  await user.getIdToken(true);

  const cleanNew = newPin.trim();
  if (!isPinFormatValid(cleanNew)) {
    throw new Error('PIN baru harus terdiri dari 6 digit angka.');
  }

  const weakCheck = isWeakPin(cleanNew);
  if (weakCheck.isWeak) {
    throw new Error(weakCheck.reason || 'Kombinasi PIN baru terlalu lemah.');
  }

  const { algo, iterations, salt, hash } = await hashPin(cleanNew);
  const pinDocRef = doc(db, 'userPins', uid);
  const now = Date.now();

  await updateDoc(pinDocRef, {
    algo,
    iterations,
    salt,
    hash,
    updatedAt: now,
    failedAttempts: 0,
    lockedUntil: null
  });

  try {
    await recordAuditLog(
      uid,
      user.displayName || 'Pengguna',
      'PIN_CHANGED',
      `userPins/${uid}`,
      'password_reauth',
      'PIN keamanan berhasil direset setelah re-otentikasi sandi akun'
    );
  } catch (auditErr) {
    console.warn('Gagal mencatat audit log PIN_CHANGED:', auditErr);
  }
}
