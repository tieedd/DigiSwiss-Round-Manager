import React, { useState, useEffect } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext';
import { AppToastProvider, useToast } from './context/ToastContext';
import { Header } from './components/common/Header';
import { BottomNav, NavTabKey } from './components/common/BottomNav';
import { ConfirmSheet } from './components/common/ConfirmSheet';
import { LoginView } from './views/LoginView';
import { AdminBootstrapSetupView } from './views/AdminBootstrapSetupView';
import { ChangePasswordView } from './views/ChangePasswordView';
import { CreatePinView } from './views/CreatePinView';
import { TournamentsView } from './views/TournamentsView';
import { StandingsView } from './views/StandingsView';
import { ProfileView } from './views/ProfileView';
import { AdminUsersView } from './views/admin/AdminUsersView';
import { AdminSettingsView } from './views/admin/AdminSettingsView';
import { MyMatchesView } from './views/placeholders/MyMatchesView';
import { HistoryView } from './views/HistoryView';
import { StatsView } from './views/StatsView';
import { RoundsView } from './views/placeholders/RoundsView';
import { OrganizerTournamentsView } from './views/placeholders/OrganizerTournamentsView';
import { TournamentDetailModal } from './views/tournaments/TournamentDetailModal';
import { AdminInactivityWarning } from './components/common/AdminInactivityWarning';
import { UpdateNotificationBanner } from './components/common/UpdateNotificationBanner';
import { UpdateModal } from './components/common/UpdateModal';
import { UpdateProvider, useUpdate } from './context/UpdateContext';
import { AccessDeniedView } from './components/common/AccessDeniedView';
import { Tournament, UserRole } from './types';
import { doc, getDoc } from 'firebase/firestore';
import { db } from './firebaseConfig';
import { setSessionTournament } from './utils/sessionStore';
import {
  resolveNotificationTarget,
  shouldPromptNotificationPermission,
} from './utils/pushLogic';
import {
  addNativeEventListener,
  getFcmTokenNative,
  getNotificationPermissionStateNative,
  isPushNotificationSupportedNative,
  markPushWebReadyNative,
  requestNotificationPermissionNative,
} from './services/nativeBridge';
import {
  isNotifPromptDismissed,
  registerDeviceToken,
  setNotifPromptDismissed,
} from './services/pushService';

const MainAppContent: React.FC = () => {
  const {
    currentUser,
    userProfile,
    hasPin,
    loading,
    needsAdminBootstrap,
    adminInactivityWarning,
    adminInactivityCountdown,
    dismissAdminInactivityWarning,
  } = useAuth();
  const { checkForUpdate, resetPopupOnNewLogin } = useUpdate();
  const toast = useToast();

  const [activeTab, setActiveTab] = useState<NavTabKey>('tournaments');
  const lastUidCheckedRef = React.useRef<string | null>(null);
  const lastPushCheckedUidRef = React.useRef<string | null>(null);
  const [isNotifPromptOpen, setIsNotifPromptOpen] = useState(false);
  const [isRequestingNotifPerm, setIsRequestingNotifPerm] = useState(false);
  const [notifTournamentDetail, setNotifTournamentDetail] = useState<Tournament | null>(null);

  const isAuthenticatedReady = Boolean(
    currentUser?.uid && userProfile && !userProfile.mustChangePassword && hasPin === true
  );

  const openTournamentFromNotification = React.useCallback(
    async (tournamentId?: string, pushType?: string) => {
      const cleanTid = String(tournamentId || '').trim();
      if (!cleanTid || !userProfile) return;
      try {
        const snap = await getDoc(doc(db, 'tournaments', cleanTid));
        if (!snap.exists()) {
          toast.info('Turnamen Tidak Ditemukan', 'Data turnamen mungkin sudah dihapus.');
          return;
        }
        const tourney = { ...(snap.data() as Tournament), id: snap.id };
        setSessionTournament(tourney);
        const role: UserRole = userProfile.role || 'player';
        const target = resolveNotificationTarget({
          role,
          pushType,
          tournamentStatus: tourney.status,
        });
        setActiveTab(target.tab);
        if (target.openDetailModal) {
          setNotifTournamentDetail(tourney);
        } else {
          setNotifTournamentDetail(null);
        }
      } catch {
        toast.error('Notifikasi', 'Gagal membuka data turnamen terkait.');
      }
    },
    [userProfile, toast]
  );

  // Pengecekan versi wajib berjalan segera setelah login berhasil dengan forceRefresh (lewati cache)
  useEffect(() => {
    if (isAuthenticatedReady && currentUser?.uid) {
      if (lastUidCheckedRef.current !== currentUser.uid) {
        lastUidCheckedRef.current = currentUser.uid;
        resetPopupOnNewLogin();
        checkForUpdate(true);
      }
    } else if (!currentUser) {
      lastUidCheckedRef.current = null;
      lastPushCheckedUidRef.current = null;
      setIsNotifPromptOpen(false);
      setNotifTournamentDetail(null);
    }
  }, [isAuthenticatedReady, currentUser, checkForUpdate, resetPopupOnNewLogin]);

  // Registrasi token FCM & dialog penjelasan izin notifikasi (hanya setelah login + PIN selesai)
  useEffect(() => {
    if (!isAuthenticatedReady || !currentUser?.uid) return;
    if (!isPushNotificationSupportedNative()) return;

    const uid = currentUser.uid;
    if (lastPushCheckedUidRef.current === uid) return;
    lastPushCheckedUidRef.current = uid;

    let cancelled = false;
    (async () => {
      const perm = await getNotificationPermissionStateNative();
      if (cancelled) return;
      if (perm.granted) {
        const tokenRes = await getFcmTokenNative();
        if (!cancelled && tokenRes.ok && tokenRes.token) {
          await registerDeviceToken(uid, tokenRes.token);
        }
      } else if (
        shouldPromptNotificationPermission({
          isNativeSupported: true,
          permissionState: perm.state,
          dismissedPrompt: isNotifPromptDismissed(uid),
        })
      ) {
        setIsNotifPromptOpen(true);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [isAuthenticatedReady, currentUser?.uid]);

  // Dengarkan event push native: refresh token, notifikasi foreground -> toast, dan tap notifikasi
  useEffect(() => {
    if (!isAuthenticatedReady || !currentUser?.uid) return;
    const uid = currentUser.uid;

    const removeListener = addNativeEventListener((detail) => {
      if (detail.type === 'fcm-token-refreshed' && detail.token) {
        void registerDeviceToken(uid, detail.token);
      } else if (detail.type === 'push-received') {
        const title = detail.title || 'DigiSwiss-Round';
        const body = detail.body || '';
        const tid = detail.tournamentId;
        const pType = detail.pushType;
        toast.info(
          title,
          body,
          tid
            ? {
                label: 'Buka',
                onClick: () => {
                  void openTournamentFromNotification(tid, pType);
                },
              }
            : undefined
        );
      } else if (detail.type === 'notification-opened' && detail.tournamentId) {
        void openTournamentFromNotification(detail.tournamentId, detail.pushType);
      }
    });

    markPushWebReadyNative();
    return removeListener;
  }, [isAuthenticatedReady, currentUser?.uid, toast, openTournamentFromNotification]);

  const handleConfirmNotifPrompt = async () => {
    if (!currentUser?.uid || isRequestingNotifPerm) return;
    setIsRequestingNotifPerm(true);
    try {
      const res = await requestNotificationPermissionNative();
      setNotifPromptDismissed(currentUser.uid);
      setIsNotifPromptOpen(false);
      if (res.granted) {
        const tokenRes = await getFcmTokenNative();
        if (tokenRes.ok && tokenRes.token) {
          await registerDeviceToken(currentUser.uid, tokenRes.token);
        }
        toast.success('Notifikasi Aktif', 'Anda akan menerima pemberitahuan turnamen penting.');
      }
    } finally {
      setIsRequestingNotifPerm(false);
    }
  };

  const handleDismissNotifPrompt = () => {
    if (currentUser?.uid) {
      setNotifPromptDismissed(currentUser.uid);
    }
    setIsNotifPromptOpen(false);
  };

  // Reset tab default saat peran (role) berubah
  useEffect(() => {
    if (userProfile?.role === 'admin') {
      setActiveTab('users');
    } else if (userProfile?.role === 'organizer') {
      setActiveTab('my_tournaments');
    } else {
      setActiveTab('tournaments');
    }
  }, [userProfile?.role]);

  // 1. Tampilkan layar loading sampai auth dan pemeriksaan PIN selesai
  if (loading || (currentUser && userProfile && hasPin === null)) {
    return (
      <div className="min-h-screen bg-dark-bg text-dark-text flex flex-col items-center justify-center p-4">
        <div className="w-12 h-12 rounded-2xl bg-dark-surface border border-dark-border flex items-center justify-center text-accent font-bold text-xl mb-3 animate-pulse">
          DS
        </div>
        <p className="text-body font-medium text-dark-text">Memuat DigiSwiss-Round...</p>
        <p className="text-caption text-dark-muted mt-1">Menghubungkan ke layanan backend...</p>
      </div>
    );
  }

  // 2. Jika belum bootstrap admin utama, tampilkan Setup Awal Admin; jika sudah, tampilkan Login
  if (!currentUser || !userProfile) {
    if (needsAdminBootstrap) {
      return <AdminBootstrapSetupView />;
    }
    return <LoginView />;
  }

  // 3. mustChangePassword = true memaksa layar "Ganti Password" sebelum halaman lain bisa dibuka
  if (userProfile.mustChangePassword) {
    return <ChangePasswordView forced={true} />;
  }

  // 4. Pengguna tanpa PIN keamanan wajib diarahkan ke layar pembuatan PIN 6-digit
  if (hasPin === false) {
    return <CreatePinView />;
  }

  const role: UserRole = userProfile.role || 'player';

  const getPageTitle = (tab: NavTabKey): string => {
    switch (tab) {
      case 'tournaments':
      case 'my_tournaments':
        return 'Turnamen';
      case 'my_matches':
        return 'Pertandingan Saya';
      case 'rounds':
        return 'Manajemen Ronde';
      case 'standings':
        return 'Klasemen Turnamen';
      case 'stats':
        return 'Statistik';
      case 'history':
        return 'Riwayat Turnamen';
      case 'profile':
        return 'Profil';
      case 'users':
        return 'Pengguna';
      case 'settings':
        return 'Pengaturan Admin';
      default:
        return 'DigiSwiss-Round';
    }
  };

  const renderContent = () => {
    switch (activeTab) {
      case 'tournaments':
        return <TournamentsView />;
      case 'my_tournaments':
        return <OrganizerTournamentsView onNavigateToRounds={() => setActiveTab('rounds')} />;
      case 'my_matches':
        return <MyMatchesView />;
      case 'rounds':
        return <RoundsView />;
      case 'standings':
        return <StandingsView />;
      case 'history':
        return <HistoryView />;
      case 'stats':
        return <StatsView />;
      case 'profile':
        return <ProfileView />;
      case 'users':
        if (role !== 'admin') {
          return <AccessDeniedView onReturn={() => setActiveTab('tournaments')} />;
        }
        return <AdminUsersView onNavigateHome={() => setActiveTab('tournaments')} />;
      case 'settings':
        if (role !== 'admin') {
          return <AccessDeniedView onReturn={() => setActiveTab('tournaments')} />;
        }
        return <AdminSettingsView />;
      default:
        return <TournamentsView />;
    }
  };

  return (
    <div className="min-h-screen bg-dark-bg text-dark-text flex flex-col font-sans">
      <Header title={getPageTitle(activeTab)} />
      <UpdateNotificationBanner />

      <main
        className="flex-1 w-full max-w-md mx-auto px-4 pt-4"
        style={{ paddingBottom: 'calc(4rem + env(safe-area-inset-bottom, 0px) + 1.5rem)' }}
      >
        {renderContent()}
      </main>

      <BottomNav role={role} activeTab={activeTab} onTabChange={setActiveTab} />

      {/* Popup Modal Pemberitahuan Versi Baru Setelah Login */}
      <UpdateModal />

      {/* Peringatan Inaktivitas Sesi Admin (1 menit sebelum 30 menit) */}
      <AdminInactivityWarning
        isOpen={adminInactivityWarning}
        remainingSeconds={adminInactivityCountdown}
        onStayLoggedIn={dismissAdminInactivityWarning}
      />

      {/* Dialog Penjelasan Izin Notifikasi (Pasca-login + PIN selesai) */}
      <ConfirmSheet
        isOpen={isNotifPromptOpen}
        title="Aktifkan Notifikasi Turnamen?"
        message="Izinkan notifikasi agar Anda langsung mendapat info pengumuman organizer, ronde baru beserta nomor meja, konfirmasi skor, serta status pendaftaran turnamen."
        confirmLabel="Aktifkan Notifikasi"
        cancelLabel="Nanti Saja"
        isLoading={isRequestingNotifPerm}
        onConfirm={handleConfirmNotifPrompt}
        onCancel={handleDismissNotifPrompt}
      />

      {/* Detail Turnamen saat membuka dari ketukan notifikasi */}
      <TournamentDetailModal
        tournament={notifTournamentDetail}
        isOpen={Boolean(notifTournamentDetail)}
        onClose={() => setNotifTournamentDetail(null)}
      />
    </div>
  );
};

export const App: React.FC = () => {
  return (
    <AuthProvider>
      <AppToastProvider>
        <UpdateProvider>
          <MainAppContent />
        </UpdateProvider>
      </AppToastProvider>
    </AuthProvider>
  );
};

export default App;
