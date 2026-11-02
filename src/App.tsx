import React, { useState, useEffect } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext';
import { AppToastProvider } from './context/ToastContext';
import { Header } from './components/common/Header';
import { BottomNav, NavTabKey } from './components/common/BottomNav';
import { LoginView } from './views/LoginView';
import { ChangePasswordView } from './views/ChangePasswordView';
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
import { AdminInactivityWarning } from './components/common/AdminInactivityWarning';
import { UpdateNotificationBanner } from './components/common/UpdateNotificationBanner';
import { AccessDeniedView } from './components/common/AccessDeniedView';
import { UserRole } from './types';

const MainAppContent: React.FC = () => {
  const {
    currentUser,
    userProfile,
    loading,
    adminInactivityWarning,
    adminInactivityCountdown,
    dismissAdminInactivityWarning,
  } = useAuth();

  const [activeTab, setActiveTab] = useState<NavTabKey>('tournaments');

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

  // 1. Tampilkan layar loading sampai onAuthStateChanged menjawab
  if (loading) {
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

  // 2. Jika tidak ada pengguna login, WAJIB tampil halaman Login
  if (!currentUser || !userProfile) {
    return <LoginView />;
  }

  // 3. mustChangePassword = true memaksa layar "Ganti Password" sebelum halaman lain bisa dibuka
  if (userProfile.mustChangePassword) {
    return <ChangePasswordView forced={true} />;
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

      {/* Peringatan Inaktivitas Sesi Admin (1 menit sebelum 30 menit) */}
      <AdminInactivityWarning
        isOpen={adminInactivityWarning}
        remainingSeconds={adminInactivityCountdown}
        onStayLoggedIn={dismissAdminInactivityWarning}
      />
    </div>
  );
};

export const App: React.FC = () => {
  return (
    <AuthProvider>
      <AppToastProvider>
        <MainAppContent />
      </AppToastProvider>
    </AuthProvider>
  );
};

export default App;
