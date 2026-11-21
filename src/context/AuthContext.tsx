import React, { createContext, useContext, useEffect, useState, useRef, useCallback } from 'react';
import { User, onAuthStateChanged, signOut } from 'firebase/auth';
import { doc, getDoc, onSnapshot } from 'firebase/firestore';
import { auth, db } from '../firebaseConfig';
import { UserProfile } from '../types';
import { checkBootstrapExists } from '../services/bootstrapService';
import { getClockOffset } from '../services/authService';
import { unregisterCurrentDevice } from '../services/pushService';

interface AuthContextType {
  currentUser: User | null;
  userProfile: UserProfile | null;
  hasPin: boolean | null;
  loading: boolean;
  needsAdminBootstrap: boolean;
  clockOffset: number;
  refreshProfile: () => Promise<void>;
  refreshPinStatus: () => Promise<void>;
  markBootstrapCompleted: () => void;
  recheckBootstrap: () => Promise<void>;
  logout: () => Promise<void>;
  adminInactivityWarning: boolean;
  adminInactivityCountdown: number;
  dismissAdminInactivityWarning: () => void;
}

const AuthContext = createContext<AuthContextType>({
  currentUser: null,
  userProfile: null,
  hasPin: null,
  loading: true,
  needsAdminBootstrap: false,
  clockOffset: 0,
  refreshProfile: async () => {},
  refreshPinStatus: async () => {},
  markBootstrapCompleted: () => {},
  recheckBootstrap: async () => {},
  logout: async () => {},
  adminInactivityWarning: false,
  adminInactivityCountdown: 60,
  dismissAdminInactivityWarning: () => {},
});

export const useAuth = () => useContext(AuthContext);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [hasPin, setHasPin] = useState<boolean | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [needsAdminBootstrap, setNeedsAdminBootstrap] = useState<boolean>(false);
  const [clockOffset, setClockOffsetState] = useState<number>(0);

  // Status timer inaktivitas admin (30 menit total, peringatan pada menit ke-29)
  const [adminInactivityWarning, setAdminInactivityWarning] = useState<boolean>(false);
  const [adminInactivityCountdown, setAdminInactivityCountdown] = useState<number>(60);
  const lastActivityTimeRef = useRef<number>(Date.now());
  const inactivityCheckTimerRef = useRef<any>(null);
  const warningCountdownTimerRef = useRef<any>(null);

  const logout = useCallback(async () => {
    try {
      const uid = auth.currentUser?.uid;
      if (uid) {
        await unregisterCurrentDevice(uid);
      }
      await signOut(auth);
      setCurrentUser(null);
      setUserProfile(null);
      setHasPin(null);
      setAdminInactivityWarning(false);
    } catch (err) {
      console.error('Galat saat keluar:', err);
    }
  }, []);

  const markBootstrapCompleted = useCallback(() => {
    setNeedsAdminBootstrap(false);
  }, []);

  const recheckBootstrap = useCallback(async () => {
    const check = await checkBootstrapExists(true);
    setNeedsAdminBootstrap(!check.initialized && !check.checkFailed);
  }, []);

  const refreshPinStatus = useCallback(async () => {
    if (!auth.currentUser) {
      setHasPin(null);
      return;
    }
    try {
      const snap = await getDoc(doc(db, 'userPins', auth.currentUser.uid));
      setHasPin(snap.exists() && Boolean(snap.data()?.hash));
    } catch (e) {
      console.warn('Gagal memverifikasi status PIN:', e);
    }
  }, []);

  const refreshProfile = useCallback(async () => {
    if (!auth.currentUser) {
      setUserProfile(null);
      return;
    }
    try {
      const snap = await getDoc(doc(db, 'users', auth.currentUser.uid));
      if (snap.exists()) {
        const data = snap.data() as UserProfile;
        if (!data.active) {
          await logout();
        } else {
          setUserProfile(data);
        }
      } else {
        await logout();
      }
    } catch (err) {
      console.error('Gagal menyegarkan profil:', err);
    }
  }, [logout]);

  // Listener aktivitas pengguna untuk Admin (reset timer inaktivitas)
  const handleUserActivity = useCallback(() => {
    lastActivityTimeRef.current = Date.now();
  }, []);

  const dismissAdminInactivityWarning = useCallback(() => {
    lastActivityTimeRef.current = Date.now();
    setAdminInactivityWarning(false);
    setAdminInactivityCountdown(60);
  }, []);

  // Pasang listener aktivitas saat pengguna berperan admin
  useEffect(() => {
    if (userProfile?.role === 'admin') {
      const events = ['mousedown', 'mousemove', 'keydown', 'scroll', 'touchstart', 'click'];
      events.forEach((ev) => window.addEventListener(ev, handleUserActivity, { passive: true }));

      // Cek inaktivitas setiap 5 detik
      inactivityCheckTimerRef.current = setInterval(() => {
        const inactiveMs = Date.now() - lastActivityTimeRef.current;
        const totalTimeoutMs = 30 * 60 * 1000; // 30 menit
        const warningStartMs = 29 * 60 * 1000; // 29 menit (1 menit sebelum)

        if (inactiveMs >= totalTimeoutMs) {
          // Waktu habis, logout otomatis
          logout();
          alert('Sesi admin berakhir otomatis setelah 30 menit tanpa aktivitas.');
        } else if (inactiveMs >= warningStartMs) {
          const remainingSec = Math.max(0, Math.ceil((totalTimeoutMs - inactiveMs) / 1000));
          setAdminInactivityCountdown(remainingSec);
          setAdminInactivityWarning(true);
        } else {
          setAdminInactivityWarning(false);
        }
      }, 5000);

      return () => {
        events.forEach((ev) => window.removeEventListener(ev, handleUserActivity));
        if (inactivityCheckTimerRef.current) clearInterval(inactivityCheckTimerRef.current);
        if (warningCountdownTimerRef.current) clearInterval(warningCountdownTimerRef.current);
      };
    } else {
      setAdminInactivityWarning(false);
    }
  }, [userProfile?.role, handleUserActivity, logout]);

  // Inisialisasi awal Auth State & Cek Keberadaan Bootstrap Admin Utama
  useEffect(() => {
    let isMounted = true;
    let unsubscribeAuth: (() => void) | null = null;
    let unsubscribeProfileSnapshot: (() => void) | null = null;
    let unsubscribePinSnapshot: (() => void) | null = null;

    const initAuth = async () => {
      try {
        const bootstrapResult = await checkBootstrapExists();
        if (isMounted) {
          setNeedsAdminBootstrap(!bootstrapResult.initialized && !bootstrapResult.checkFailed);
        }
      } catch (e) {
        console.warn('Bootstrap check skipped:', e);
      }

      if (!isMounted) return;

      unsubscribeAuth = onAuthStateChanged(auth, async (user) => {
        if (unsubscribeProfileSnapshot) {
          unsubscribeProfileSnapshot();
          unsubscribeProfileSnapshot = null;
        }
        if (unsubscribePinSnapshot) {
          unsubscribePinSnapshot();
          unsubscribePinSnapshot = null;
        }

        if (user) {
          setCurrentUser(user);
          // Pantau dokumen pengguna secara real-time untuk mendeteksi deaktivasi atau perubahan role
          const userDocRef = doc(db, 'users', user.uid);
          unsubscribeProfileSnapshot = onSnapshot(
            userDocRef,
            (snap) => {
              if (snap.exists()) {
                const profile = snap.data() as UserProfile;
                if (!profile.active) {
                  // Jika active == false, otomatis keluar
                  logout();
                } else {
                  setUserProfile(profile);
                  setNeedsAdminBootstrap(false);
                  setClockOffsetState(getClockOffset());
                }
              } else {
                // Dokumen tidak ada, otomatis keluar
                logout();
              }
              setLoading(false);
            },
            (error) => {
              console.error('Snapshot profil gagal:', error);
              setLoading(false);
            }
          );

          // Pantau keberadaan PIN secara real-time
          const pinDocRef = doc(db, 'userPins', user.uid);
          unsubscribePinSnapshot = onSnapshot(
            pinDocRef,
            (pinSnap) => {
              setHasPin(pinSnap.exists() && Boolean(pinSnap.data()?.hash));
            },
            (pinError) => {
              console.warn('Snapshot PIN warning:', pinError);
              setHasPin(false);
            }
          );
        } else {
          setCurrentUser(null);
          setUserProfile(null);
          setHasPin(null);
          setLoading(false);
        }
      });
    };

    initAuth();

    return () => {
      isMounted = false;
      if (unsubscribeAuth) unsubscribeAuth();
      if (unsubscribeProfileSnapshot) unsubscribeProfileSnapshot();
      if (unsubscribePinSnapshot) unsubscribePinSnapshot();
    };
  }, [logout]);

  return (
    <AuthContext.Provider
      value={{
        currentUser,
        userProfile,
        hasPin,
        loading,
        needsAdminBootstrap,
        clockOffset,
        refreshProfile,
        refreshPinStatus,
        markBootstrapCompleted,
        recheckBootstrap,
        logout,
        adminInactivityWarning,
        adminInactivityCountdown,
        dismissAdminInactivityWarning,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};
