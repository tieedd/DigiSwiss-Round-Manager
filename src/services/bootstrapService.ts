import { initializeApp, deleteApp, getApps, getApp } from 'firebase/app';
import {
  getAuth,
  createUserWithEmailAndPassword,
  deleteUser,
  signOut,
} from 'firebase/auth';
import { doc, getDoc, writeBatch, getFirestore } from 'firebase/firestore';
import { firebaseConfig, db } from '../firebaseConfig';
import { usernameToEmail } from '../utils/authHelpers';
import { validateBootstrapAdminPassword } from '../utils/bootstrapLogic';
import { loginUser } from './authService';

export interface BootstrapError {
  message: string;
  code?: string;
}

export interface BootstrapCheckResult {
  initialized: boolean;
  checkFailed?: boolean;
  error?: BootstrapError | null;
}

let currentBootstrapError: BootstrapError | null = null;
let bootstrapCheckPromise: Promise<BootstrapCheckResult> | null = null;

export function getBootstrapError(): BootstrapError | null {
  return currentBootstrapError;
}

/**
 * Memeriksa apakah dokumen meta/bootstrap sudah ada di Firestore.
 * Jika belum ada, aplikasi menampilkan layar "Setup Awal Admin".
 */
export async function checkBootstrapExists(forceRefresh = false): Promise<BootstrapCheckResult> {
  if (bootstrapCheckPromise && !forceRefresh) {
    return bootstrapCheckPromise;
  }

  bootstrapCheckPromise = (async () => {
    try {
      const bootstrapRef = doc(db, 'meta', 'bootstrap');
      const bootstrapSnap = await getDoc(bootstrapRef);
      currentBootstrapError = null;
      return {
        initialized: bootstrapSnap.exists(),
        checkFailed: false,
        error: null,
      };
    } catch (readErr: any) {
      const errObj: BootstrapError = {
        message: 'Gagal memeriksa status inisialisasi admin. Periksa koneksi internet Anda.',
        code: readErr?.code || undefined,
      };
      currentBootstrapError = errObj;
      bootstrapCheckPromise = null;
      return {
        initialized: true,
        checkFailed: true,
        error: errObj,
      };
    }
  })();

  return bootstrapCheckPromise;
}

/**
 * Menjalankan setup awal admin utama (admindss) dengan password pilihan pengguna.
 * Membuat akun Auth + batch atomik users/{uid} & meta/bootstrap, lalu masuk ke akun admindss
 * agar pengguna langsung diarahkan ke pembuatan PIN 6 digit.
 */
export async function setupInitialAdmin(
  password: string,
  confirmPassword: string
): Promise<void> {
  const validation = validateBootstrapAdminPassword(password, confirmPassword);
  if (!validation.valid) {
    throw new Error(validation.error || 'Password tidak valid.');
  }

  // Pastikan meta/bootstrap belum ada sebelum membuat akun
  const bootstrapRef = doc(db, 'meta', 'bootstrap');
  const existingBootstrap = await getDoc(bootstrapRef);
  if (existingBootstrap.exists()) {
    bootstrapCheckPromise = Promise.resolve({ initialized: true, checkFailed: false, error: null });
    currentBootstrapError = null;
    throw new Error('Admin utama sudah diinisialisasi sebelumnya. Silakan masuk melalui halaman Login.');
  }

  const adminEmail = usernameToEmail('admindss');

  let secondaryApp;
  try {
    const existing = getApps().find((a) => a.name === 'bootstrap');
    secondaryApp = existing || initializeApp(firebaseConfig, 'bootstrap');
  } catch {
    secondaryApp = getApp('bootstrap');
  }

  const secondaryAuth = getAuth(secondaryApp);
  const secondaryDb = getFirestore(secondaryApp);

  let createdUser: import('firebase/auth').User | null = null;
  let adminUid = '';

  try {
    const cred = await createUserWithEmailAndPassword(secondaryAuth, adminEmail, password);
    createdUser = cred.user;
    adminUid = cred.user.uid;
  } catch (createErr: any) {
    const errCode = createErr?.code || '';
    try {
      await deleteApp(secondaryApp);
    } catch {
      // Abaikan kegagalan cleanup secondary app
    }

    if (errCode === 'auth/email-already-in-use') {
      const errObj: BootstrapError = {
        message:
          'Akun admin sudah ada di Firebase Auth tetapi dokumen meta/bootstrap belum lengkap. Hapus akun admindss di Firebase Console lalu muat ulang aplikasi.',
        code: errCode,
      };
      currentBootstrapError = errObj;
      throw new Error(errObj.message);
    }

    if (errCode === 'auth/weak-password') {
      throw new Error('Kebijakan password Firebase menolak password tersebut. Gunakan kombinasi yang lebih kuat.');
    }

    throw new Error(createErr?.message || 'Gagal membuat akun admin utama.');
  }

  const batch = writeBatch(secondaryDb);
  const userDocRef = doc(secondaryDb, 'users', adminUid);
  const bootstrapDocRef = doc(secondaryDb, 'meta', 'bootstrap');
  const now = Date.now();

  batch.set(userDocRef, {
    username: 'admindss',
    displayName: 'Admin DSS',
    role: 'admin',
    active: true,
    mustChangePassword: false,
    createdAt: now,
    lastLoginAt: now,
  });

  batch.set(bootstrapDocRef, {
    createdAt: now,
    initializedBy: adminUid,
    version: '1.0.0',
  });

  try {
    await batch.commit();
    currentBootstrapError = null;
  } catch (batchErr: any) {
    // Bersihkan akun Auth yatim jika batch Firestore gagal
    if (createdUser) {
      try {
        await deleteUser(createdUser);
      } catch {
        // Abaikan jika gagal menghapus user sekunder
      }
    }
    try {
      await signOut(secondaryAuth);
      await deleteApp(secondaryApp);
    } catch {
      // Abaikan cleanup secondary app
    }

    const errCode = batchErr?.code || batchErr?.message || 'unknown';
    const errObj: BootstrapError = {
      message: `Gagal menyimpan dokumen admin: ${errCode}`,
      code: batchErr?.code || undefined,
    };
    currentBootstrapError = errObj;
    throw new Error(errObj.message);
  }

  try {
    await signOut(secondaryAuth);
    await deleteApp(secondaryApp);
  } catch {
    // Abaikan cleanup secondary app
  }

  bootstrapCheckPromise = Promise.resolve({ initialized: true, checkFailed: false, error: null });

  // Login langsung di instance Auth utama agar AuthContext mengarahkan ke pembuatan PIN 6 digit
  await loginUser('admindss', password);
}
