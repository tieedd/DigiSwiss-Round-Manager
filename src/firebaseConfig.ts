import { initializeApp, getApps, getApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import {
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
  getFirestore,
  Firestore
} from 'firebase/firestore';

export const firebaseConfig = {
  apiKey: "AIzaSyDY0iUVKWFc9fXvUglGwczPuD5D0nkEa6U",
  authDomain: "digiswiss-round.firebaseapp.com",
  projectId: "digiswiss-round",
  storageBucket: "digiswiss-round.firebasestorage.app",
  messagingSenderId: "144706889337",
  appId: "1:144706889337:web:4c5cbf2dca8b00b2f196a8"
};

// Inisialisasi Firebase App
export const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();

// Inisialisasi Firebase Auth
export const auth = getAuth(app);

// Inisialisasi Cloud Firestore dengan persistentLocalCache
let firestoreInstance: Firestore;
try {
  firestoreInstance = initializeFirestore(app, {
    localCache: persistentLocalCache({
      tabManager: persistentMultipleTabManager()
    })
  });
} catch (err) {
  // Jika persistent cache sudah terpasang atau tidak didukung di lingkungan ini, gunakan instance default
  console.warn('Fallback ke default firestore instance:', err);
  firestoreInstance = getFirestore(app);
}

export const db = firestoreInstance;
