import { initializeApp, deleteApp, getApps, getApp } from 'firebase/app';
import { getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut } from 'firebase/auth';
import { doc, getDoc, writeBatch, getFirestore } from 'firebase/firestore';
import { firebaseConfig, db } from '../firebaseConfig';
import { usernameToEmail } from '../utils/authHelpers';

export interface BootstrapError {
  message: string;
  code?: string;
}

// 1. Variabel tingkat modul: menyimpan promise bootstrap agar hanya berjalan SEKALI saja
// (tidak terpanggil ganda oleh React StrictMode atau render ulang)
let bootstrapPromise: Promise<boolean> | null = null;
let currentBootstrapError: BootstrapError | null = null;

export function getBootstrapError(): BootstrapError | null {
  return currentBootstrapError;
}

/**
 * Memeriksa dan mengeksekusi inisialisasi akun Admin Utama & meta/bootstrap.
 * Dilakukan SEKALI jika meta/bootstrap belum ada.
 */
export function initializeBootstrapAdmin(): Promise<boolean> {
  // Jika sedang berjalan atau sudah selesai dengan sukses, kembalikan promise yang sama
  if (bootstrapPromise) {
    return bootstrapPromise;
  }

  bootstrapPromise = (async () => {
    try {
      // 1. Baca meta/bootstrap sebelum membuat akun. Jika sudah ada, jangan lakukan apa pun.
      const bootstrapRef = doc(db, 'meta', 'bootstrap');
      const bootstrapSnap = await getDoc(bootstrapRef);

      if (bootstrapSnap.exists()) {
        currentBootstrapError = null;
        return false;
      }
    } catch (readErr: any) {
      // Jika pembacaan awal mengembalikan error (misal offline/permission), catat
      console.warn('Cek awal meta/bootstrap:', readErr);
    }

    // 2. Email admin dibuat dari fungsi usernameToEmail yang sama dengan Login
    const adminEmail = usernameToEmail('admindss');
    const adminInitialPass = 'dssadmin';

    // Buat instance Firebase kedua dengan nama "bootstrap"
    let secondaryApp;
    try {
      const existing = getApps().find(a => a.name === 'bootstrap');
      secondaryApp = existing || initializeApp(firebaseConfig, 'bootstrap');
    } catch (e) {
      secondaryApp = getApp('bootstrap');
    }

    const secondaryAuth = getAuth(secondaryApp);
    const secondaryDb = getFirestore(secondaryApp);

    let adminUid: string;

    try {
      const cred = await createUserWithEmailAndPassword(secondaryAuth, adminEmail, adminInitialPass);
      adminUid = cred.user.uid;
    } catch (createErr: any) {
      const errCode = createErr?.code || '';

      if (errCode === 'auth/email-already-in-use') {
        // 3. Coba signInWithEmailAndPassword di instance kedua dengan password awal
        try {
          const cred = await signInWithEmailAndPassword(secondaryAuth, adminEmail, adminInitialPass);
          adminUid = cred.user.uid;
        } catch (signInErr: any) {
          // Gagal masuk dengan password awal
          currentBootstrapError = {
            message: 'Akun admin sudah ada tetapi data belum lengkap. Hapus akun admindss di Firebase Console lalu buka ulang aplikasi.',
            code: signInErr?.code || errCode
          };
          try {
            await signOut(secondaryAuth);
            await deleteApp(secondaryApp);
          } catch (_) {}
          // Jangan tandai bootstrap selesai agar bisa diperbaiki
          bootstrapPromise = null;
          return false;
        }
      } else if (errCode === 'auth/weak-password') {
        // 4. Jika createUser gagal dengan auth/weak-password
        currentBootstrapError = {
          message: 'Kebijakan password Firebase menolak password awal admin',
          code: 'auth/weak-password'
        };
        try {
          await deleteApp(secondaryApp);
        } catch (_) {}
        bootstrapPromise = null;
        return false;
      } else {
        currentBootstrapError = {
          message: createErr?.message || 'Gagal membuat akun admin',
          code: errCode
        };
        try {
          await deleteApp(secondaryApp);
        } catch (_) {}
        bootstrapPromise = null;
        return false;
      }
    }

    // 4. Tulis dokumen users/{uid} dan meta/bootstrap dalam SATU batch di instance kedua
    const batch = writeBatch(secondaryDb);
    const userDocRef = doc(secondaryDb, 'users', adminUid);
    const bootstrapDocRef = doc(secondaryDb, 'meta', 'bootstrap');
    const now = Date.now();

    batch.set(userDocRef, {
      username: 'admindss',
      displayName: 'Admin DSS',
      role: 'admin',
      active: true,
      mustChangePassword: true,
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
      const errCode = batchErr?.code || batchErr?.message || 'unknown';
      currentBootstrapError = {
        message: `Gagal menulis dokumen admin: ${errCode}`,
        code: batchErr?.code || errCode
      };
      try {
        await signOut(secondaryAuth);
        await deleteApp(secondaryApp);
      } catch (_) {}
      // Jangan menandai bootstrap selesai
      bootstrapPromise = null;
      return false;
    }

    // SignOut instance kedua dan hapus aplikasi sekunder
    try {
      await signOut(secondaryAuth);
      await deleteApp(secondaryApp);
    } catch (_) {}

    return true;
  })();

  return bootstrapPromise;
}
