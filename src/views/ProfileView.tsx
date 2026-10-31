import React, { useState } from 'react';
import { doc, updateDoc } from 'firebase/firestore';
import { db } from '../firebaseConfig';
import { Card } from '../components/common/Card';
import { Button } from '../components/common/Button';
import { Input } from '../components/common/Input';
import { StatusBadge } from '../components/common/StatusBadge';
import { BottomSheet } from '../components/common/BottomSheet';
import { useAuth } from '../context/AuthContext';
import { ChangePasswordView } from './ChangePasswordView';
import { formatIndonesianDateTime } from '../utils/dateHelpers';
import { recordAuditLog } from '../services/authService';
import {
  User,
  Shield,
  Mail,
  KeyRound,
  LogOut,
  Clock,
  Edit3,
  CheckCircle2,
  Calendar
} from 'lucide-react';

export const ProfileView: React.FC = () => {
  const { userProfile, currentUser, logout, clockOffset, refreshProfile } = useAuth();
  const [isChangePassOpen, setIsChangePassOpen] = useState(false);
  const [isLogoutConfirmOpen, setIsLogoutConfirmOpen] = useState(false);

  // Modal Ubah Nama Tampilan
  const [isEditNameOpen, setIsEditNameOpen] = useState(false);
  const [newDisplayName, setNewDisplayName] = useState(userProfile?.displayName || '');
  const [nameError, setNameError] = useState('');
  const [nameLoading, setNameLoading] = useState(false);
  const [nameSuccess, setNameSuccess] = useState('');

  const getRoleLabel = (role?: string) => {
    switch (role) {
      case 'admin':
        return 'Admin Utama';
      case 'organizer':
        return 'Penyelenggara (Organizer)';
      case 'player':
      default:
        return 'Pemain (Player)';
    }
  };

  const roleColor = {
    admin: 'text-accent border-accent/30 bg-accent/10',
    organizer: 'text-info border-info/30 bg-info/10',
    player: 'text-status-green border-status-green/30 bg-status-green/10',
  }[userProfile?.role || 'player'];

  const handleOpenEditName = () => {
    setNewDisplayName(userProfile?.displayName || '');
    setNameError('');
    setNameSuccess('');
    setIsEditNameOpen(true);
  };

  const handleSaveDisplayName = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = newDisplayName.trim();
    if (!trimmed) {
      setNameError('Nama tampilan tidak boleh kosong.');
      return;
    }
    if (trimmed.length > 30) {
      setNameError('Nama tampilan maksimal 30 karakter.');
      return;
    }
    if (!currentUser) return;

    setNameLoading(true);
    setNameError('');
    try {
      const userRef = doc(db, 'users', currentUser.uid);
      const oldName = userProfile?.displayName || userProfile?.username || '-';
      await updateDoc(userRef, { displayName: trimmed });

      // Catat ke audit log
      await recordAuditLog(
        currentUser.uid,
        trimmed,
        'USER_DISPLAY_NAME_UPDATED',
        `users/${currentUser.uid}`,
        oldName,
        trimmed
      );

      await refreshProfile();
      setNameSuccess('Nama tampilan berhasil disimpan.');
      setTimeout(() => {
        setIsEditNameOpen(false);
        setNameSuccess('');
      }, 1000);
    } catch (err: any) {
      setNameError(err?.message || 'Gagal memperbarui nama tampilan.');
    } finally {
      setNameLoading(false);
    }
  };

  return (
    <div className="flex flex-col gap-4 pb-20">
      <div>
        <h2 className="text-section-title text-dark-text font-semibold">
          Profil Saya
        </h2>
        <p className="text-caption text-dark-muted">
          Informasi akun dan keamanan kredensial
        </p>
      </div>

      {/* Kartu Profil Utama */}
      <Card variant="surface" className="flex flex-col gap-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3.5 min-w-0">
            <div className="w-14 h-14 rounded-full bg-dark-surface-high border border-dark-border flex items-center justify-center text-accent font-bold text-xl flex-shrink-0">
              {userProfile?.displayName ? userProfile.displayName.charAt(0).toUpperCase() : 'U'}
            </div>
            <div className="min-w-0">
              <h3 className="text-body font-semibold text-dark-text truncate">
                {userProfile?.displayName || userProfile?.username}
              </h3>
              <p className="text-caption font-mono text-dark-muted truncate">
                @{userProfile?.username}
              </p>
              <div className="flex items-center gap-2 mt-1">
                <span className={`inline-block px-2 py-0.5 rounded text-[11px] font-medium border ${roleColor}`}>
                  {getRoleLabel(userProfile?.role)}
                </span>
                <StatusBadge
                  label={userProfile?.active ? 'Aktif' : 'Nonaktif'}
                  variant={userProfile?.active ? 'green' : 'red'}
                />
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={handleOpenEditName}
            className="p-2 text-dark-muted hover:text-accent rounded-btn bg-dark-surface-high border border-dark-border transition-colors flex-shrink-0"
            title="Ubah Nama Tampilan"
            aria-label="Ubah Nama Tampilan"
          >
            <Edit3 size={16} className="stroke-[1.5]" />
          </button>
        </div>

        {/* Informasi Detail Akun & Waktu Login Terakhir */}
        <div className="pt-3 border-t border-dark-border flex flex-col gap-2.5 text-caption">
          <div className="flex items-center justify-between text-dark-muted">
            <span className="flex items-center gap-1.5">
              <Mail size={15} />
              <span>Email Sistem:</span>
            </span>
            <span className="font-mono text-dark-text">{currentUser?.email || '-'}</span>
          </div>

          <div className="flex items-center justify-between text-dark-muted">
            <span className="flex items-center gap-1.5">
              <Calendar size={15} />
              <span>Login Terakhir:</span>
            </span>
            <span className="text-dark-text font-medium tabular-nums">
              {formatIndonesianDateTime(userProfile?.lastLoginAt)}
            </span>
          </div>

          <div className="flex items-center justify-between text-dark-muted">
            <span className="flex items-center gap-1.5">
              <Clock size={15} />
              <span>Sinkronisasi Server:</span>
            </span>
            <span className="font-mono text-dark-text tabular-nums">
              {clockOffset >= 0 ? `+${clockOffset}ms` : `${clockOffset}ms`}
            </span>
          </div>
        </div>
      </Card>

      {/* Aksi Akun & Keamanan */}
      <div className="flex flex-col gap-2">
        <h4 className="text-body font-semibold text-dark-text px-1">
          Pengaturan Akun & Keamanan
        </h4>

        {/* Ubah Nama Tampilan Action */}
        <Card
          variant="surface"
          className="cursor-pointer hover:border-dark-muted/40 transition-colors flex items-center justify-between p-3.5"
          onClick={handleOpenEditName}
        >
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-btn bg-dark-surface-high flex items-center justify-center text-accent">
              <Edit3 size={18} className="stroke-[1.5]" />
            </div>
            <div>
              <span className="text-body font-medium text-dark-text block">
                Ubah Nama Tampilan
              </span>
              <span className="text-caption text-dark-muted">
                Perbarui nama yang terlihat di turnamen
              </span>
            </div>
          </div>
          <span className="text-caption text-dark-muted">&rarr;</span>
        </Card>

        {/* Ganti Password */}
        <Card
          variant="surface"
          className="cursor-pointer hover:border-dark-muted/40 transition-colors flex items-center justify-between p-3.5"
          onClick={() => setIsChangePassOpen(true)}
        >
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-btn bg-dark-surface-high flex items-center justify-center text-accent">
              <KeyRound size={18} className="stroke-[1.5]" />
            </div>
            <div>
              <span className="text-body font-medium text-dark-text block">
                Ganti Password
              </span>
              <span className="text-caption text-dark-muted">
                Perbarui sandi akun dengan standar keamanan
              </span>
            </div>
          </div>
          <span className="text-caption text-dark-muted">&rarr;</span>
        </Card>

        {/* Tombol Keluar yang Jelas */}
        <Card
          variant="surface"
          className="cursor-pointer hover:border-status-red/40 transition-colors flex items-center justify-between p-3.5"
          onClick={() => setIsLogoutConfirmOpen(true)}
        >
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-btn bg-status-red/10 flex items-center justify-center text-status-red">
              <LogOut size={18} className="stroke-[1.5]" />
            </div>
            <div>
              <span className="text-body font-medium text-status-red block">
                Keluar dari Aplikasi
              </span>
              <span className="text-caption text-dark-muted">
                Akhiri sesi aktif saat ini
              </span>
            </div>
          </div>
        </Card>
      </div>

      {/* Bottom Sheet Ubah Nama Tampilan */}
      <BottomSheet
        isOpen={isEditNameOpen}
        onClose={() => setIsEditNameOpen(false)}
        title="Ubah Nama Tampilan"
      >
        <form onSubmit={handleSaveDisplayName} className="flex flex-col gap-3 py-1">
          <Input
            label="Nama Tampilan Baru"
            placeholder="Masukkan nama tampilan"
            value={newDisplayName}
            onChange={(e) => {
              setNewDisplayName(e.target.value);
              if (nameError) setNameError('');
            }}
            error={nameError}
            disabled={nameLoading}
            maxLength={30}
            helperText="Maksimal 30 karakter. Boleh menggunakan huruf besar dan spasi."
          />

          {nameSuccess && (
            <div className="p-2.5 bg-status-green/10 border border-status-green/30 rounded-btn flex items-center gap-2 text-caption text-status-green">
              <CheckCircle2 size={16} />
              <span>{nameSuccess}</span>
            </div>
          )}

          <div className="flex flex-col gap-2 mt-2">
            <Button variant="primary" fullWidth type="submit" isLoading={nameLoading}>
              Simpan Perubahan
            </Button>
            <Button
              variant="secondary"
              fullWidth
              type="button"
              onClick={() => setIsEditNameOpen(false)}
              disabled={nameLoading}
            >
              Batal
            </Button>
          </div>
        </form>
      </BottomSheet>

      {/* Bottom Sheet Ganti Password Mandiri */}
      <BottomSheet
        isOpen={isChangePassOpen}
        onClose={() => setIsChangePassOpen(false)}
        title="Ganti Password Akun"
      >
        <ChangePasswordView
          forced={false}
          onSuccess={() => setIsChangePassOpen(false)}
          onCancel={() => setIsChangePassOpen(false)}
        />
      </BottomSheet>

      {/* Bottom Sheet Konfirmasi Logout yang Jelas */}
      <BottomSheet
        isOpen={isLogoutConfirmOpen}
        onClose={() => setIsLogoutConfirmOpen(false)}
        title="Konfirmasi Keluar"
      >
        <div className="flex flex-col gap-3 py-2">
          <p className="text-body text-dark-muted">
            Apakah Anda yakin ingin keluar dari akun <strong className="text-dark-text">@{userProfile?.username}</strong>?
          </p>
          <div className="flex flex-col gap-2 mt-2">
            <Button
              variant="danger"
              fullWidth
              onClick={() => {
                setIsLogoutConfirmOpen(false);
                logout();
              }}
              icon={<LogOut size={18} />}
            >
              Ya, Keluar
            </Button>
            <Button
              variant="secondary"
              fullWidth
              onClick={() => setIsLogoutConfirmOpen(false)}
            >
              Batal
            </Button>
          </div>
        </div>
      </BottomSheet>
    </div>
  );
};
