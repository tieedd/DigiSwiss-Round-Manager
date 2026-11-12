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
import { CURRENT_APP_VERSION } from '../services/versionService';
import { ThemeToggle } from '../components/common/ThemeToggle';
import { useToast } from '../context/ToastContext';
import { useUpdate } from '../context/UpdateContext';
import { changeUserPin, resetUserPinWithPassword, verifyUserPin } from '../services/pinService';
import { isWeakPin, isPinFormatValid } from '../utils/pinSecurityLogic';
import {
  User,
  Shield,
  ShieldCheck,
  Mail,
  KeyRound,
  LogOut,
  Clock,
  Edit3,
  CheckCircle2,
  Calendar,
  Sun,
  Lock,
  AlertCircle,
  RotateCcw
} from 'lucide-react';

export const ProfileView: React.FC = () => {
  const { userProfile, currentUser, hasPin, logout, clockOffset, refreshProfile } = useAuth();
  const toast = useToast();
  const {
    checkForUpdate,
    isChecking: isCheckingUpdate,
    isOtaActive,
    nativeVersion,
    resetToDefault
  } = useUpdate();
  const [isChangePassOpen, setIsChangePassOpen] = useState(false);
  const [isLogoutConfirmOpen, setIsLogoutConfirmOpen] = useState(false);

  const handleManualCheckUpdate = async () => {
    try {
      const { presentation, error: checkError } = await checkForUpdate(true);
      if (presentation.visible && presentation.mode !== 'none') {
        toast.info(
          presentation.mode === 'ota'
            ? 'Pembaruan Web Cepat (OTA)'
            : 'Pembaruan Aplikasi (Perlu APK Baru)',
          `v${presentation.latestVersion} tersedia`
        );
      } else if (checkError) {
        toast.error('Pembaruan', 'Gagal memeriksa, coba lagi');
      } else {
        toast.success('Pembaruan', 'Sudah versi terbaru');
      }
    } catch {
      toast.error('Pembaruan', 'Gagal memeriksa, coba lagi');
    }
  };

  // Verifikasi PIN sebelum Ganti Password
  const [isVerifyPinOpen, setIsVerifyPinOpen] = useState(false);
  const [verifyPinInput, setVerifyPinInput] = useState('');
  const [verifyPinError, setVerifyPinError] = useState('');
  const [verifyPinLoading, setVerifyPinLoading] = useState(false);

  // Modal Ubah / Reset PIN
  const [isChangePinOpen, setIsChangePinOpen] = useState(false);
  const [pinModalMode, setPinModalMode] = useState<'change' | 'reset_with_password'>('change');
  const [oldPin, setOldPin] = useState('');
  const [newPin, setNewPin] = useState('');
  const [confirmNewPin, setConfirmNewPin] = useState('');
  const [accountPassword, setAccountPassword] = useState('');
  const [changePinError, setChangePinError] = useState('');
  const [changePinLoading, setChangePinLoading] = useState(false);
  const [changePinSuccess, setChangePinSuccess] = useState('');

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

  const handleVerifyPinSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentUser) return;
    if (verifyPinInput.length !== 6) {
      setVerifyPinError('Masukkan lengkap 6 digit PIN.');
      return;
    }
    setVerifyPinLoading(true);
    setVerifyPinError('');
    try {
      const res = await verifyUserPin(currentUser.uid, verifyPinInput);
      if (res.success) {
        setIsVerifyPinOpen(false);
        setVerifyPinInput('');
        setIsChangePassOpen(true);
      } else {
        setVerifyPinError(res.error || 'PIN tidak valid.');
      }
    } catch (err: any) {
      setVerifyPinError(err?.message || 'Gagal memverifikasi PIN.');
    } finally {
      setVerifyPinLoading(false);
    }
  };

  const resetPinForm = () => {
    setOldPin('');
    setNewPin('');
    setConfirmNewPin('');
    setAccountPassword('');
    setChangePinError('');
    setChangePinSuccess('');
  };

  const handleChangePinSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentUser) return;
    setChangePinError('');
    setChangePinSuccess('');

    if (pinModalMode === 'change') {
      if (!isPinFormatValid(oldPin)) {
        setChangePinError('PIN lama harus terdiri dari 6 digit angka.');
        return;
      }
      if (!isPinFormatValid(newPin)) {
        setChangePinError('PIN baru harus terdiri dari 6 digit angka.');
        return;
      }
      const weakCheck = isWeakPin(newPin);
      if (weakCheck.isWeak) {
        setChangePinError(weakCheck.reason || 'Kombinasi PIN baru terlalu lemah.');
        return;
      }
      if (newPin !== confirmNewPin) {
        setChangePinError('Konfirmasi PIN baru tidak cocok.');
        return;
      }

      setChangePinLoading(true);
      try {
        await changeUserPin(currentUser.uid, oldPin, newPin);
        setChangePinSuccess('PIN keamanan berhasil diperbarui.');
        toast.success('Berhasil', 'PIN keamanan akun Anda berhasil diperbarui.');
        setTimeout(() => {
          setIsChangePinOpen(false);
          resetPinForm();
        }, 1200);
      } catch (err: any) {
        setChangePinError(err?.message || 'Gagal mengubah PIN.');
      } finally {
        setChangePinLoading(false);
      }
    } else {
      // Reset dengan password akun
      if (!accountPassword) {
        setChangePinError('Password akun wajib diisi.');
        return;
      }
      if (!isPinFormatValid(newPin)) {
        setChangePinError('PIN baru harus terdiri dari 6 digit angka.');
        return;
      }
      const weakCheck = isWeakPin(newPin);
      if (weakCheck.isWeak) {
        setChangePinError(weakCheck.reason || 'Kombinasi PIN baru terlalu lemah.');
        return;
      }
      if (newPin !== confirmNewPin) {
        setChangePinError('Konfirmasi PIN baru tidak cocok.');
        return;
      }

      setChangePinLoading(true);
      try {
        await resetUserPinWithPassword(currentUser.uid, accountPassword, newPin);
        setChangePinSuccess('PIN keamanan berhasil diatur ulang.');
        toast.success('Berhasil', 'PIN keamanan berhasil diatur ulang.');
        setTimeout(() => {
          setIsChangePinOpen(false);
          resetPinForm();
        }, 1200);
      } catch (err: any) {
        setChangePinError(err?.message || 'Password salah atau gagal mereset PIN.');
      } finally {
        setChangePinLoading(false);
      }
    }
  };


  return (
    <div className="flex flex-col gap-4">
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

      {/* Pengaturan Tampilan & Tema */}
      <div className="flex flex-col gap-2">
        <h4 className="text-body font-semibold text-dark-text px-1">
          Pengaturan Tampilan
        </h4>

        {/* Alihkan Tema Terang / Gelap */}
        <Card variant="surface" className="flex items-center justify-between p-3.5">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-btn bg-dark-surface-high flex items-center justify-center text-accent">
              <Sun size={18} className="stroke-[1.5]" />
            </div>
            <div>
              <span className="text-body font-medium text-dark-text block">
                Tema Aplikasi
              </span>
              <span className="text-caption text-dark-muted">
                Pilih tampilan mode gelap atau terang
              </span>
            </div>
          </div>
          <ThemeToggle />
        </Card>
      </div>

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

        {/* PIN Keamanan 6 Digit */}
        <Card
          variant="surface"
          className="cursor-pointer hover:border-dark-muted/40 transition-colors flex items-center justify-between p-3.5"
          onClick={() => {
            setIsChangePinOpen(true);
            setPinModalMode('change');
            resetPinForm();
          }}
        >
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-btn bg-dark-surface-high flex items-center justify-center text-accent">
              <ShieldCheck size={18} className="stroke-[1.5]" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-body font-medium text-dark-text block">
                  PIN Keamanan
                </span>
                <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-status-green/10 text-status-green border border-status-green/30">
                  Sudah diatur
                </span>
              </div>
              <span className="text-caption text-dark-muted">
                6-digit untuk proteksi tindakan penting
              </span>
            </div>
          </div>
          <span className="text-caption text-accent font-medium hover:underline">
            Ubah PIN
          </span>
        </Card>

        {/* Ganti Password (Wajib PIN jika aktif) */}
        <Card
          variant="surface"
          className="cursor-pointer hover:border-dark-muted/40 transition-colors flex items-center justify-between p-3.5"
          onClick={() => {
            if (hasPin) {
              setVerifyPinInput('');
              setVerifyPinError('');
              setIsVerifyPinOpen(true);
            } else {
              setIsChangePassOpen(true);
            }
          }}
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
                {hasPin ? 'Memerlukan verifikasi PIN 6-digit' : 'Perbarui sandi akun dengan standar keamanan'}
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

        {/* Informasi Versi Aplikasi & Tombol Cek Pembaruan */}
        <div className="flex flex-col items-center gap-2 pt-2 pb-1 text-center">
          <div className="flex flex-col items-center gap-0.5">
            <span className="text-caption text-dark-muted font-mono">
              Versi web: v{CURRENT_APP_VERSION}
            </span>
            <span className="text-caption text-dark-muted font-mono">
              Versi aplikasi (native): v{nativeVersion || '-'}
            </span>
            {isOtaActive && (
              <span className="inline-block mt-1 px-2 py-0.5 text-[10px] font-semibold rounded bg-brand-primary/15 text-brand-primary border border-brand-primary/30">
                Paket OTA Aktif
              </span>
            )}
          </div>
          <div className="flex items-center gap-2 flex-wrap justify-center mt-1">
            <Button
              variant="secondary"
              onClick={handleManualCheckUpdate}
              disabled={isCheckingUpdate}
              isLoading={isCheckingUpdate}
              className="!min-h-[34px] !py-1 !px-3 !text-[12px]"
            >
              {isCheckingUpdate ? 'Memeriksa...' : 'Cek pembaruan'}
            </Button>
            {isOtaActive && (
              <Button
                variant="danger"
                onClick={async () => {
                  if (window.confirm('Kembalikan ke versi web bawaan dari APK? Aplikasi akan dimuat ulang.')) {
                    await resetToDefault();
                  }
                }}
                className="!min-h-[34px] !py-1 !px-3 !text-[12px]"
              >
                Kembali ke versi bawaan
              </Button>
            )}
          </div>
        </div>
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

      {/* Bottom Sheet Verifikasi PIN sebelum Ubah Password */}
      <BottomSheet
        isOpen={isVerifyPinOpen}
        onClose={() => {
          setIsVerifyPinOpen(false);
          setVerifyPinInput('');
          setVerifyPinError('');
        }}
        title="Verifikasi PIN Keamanan"
      >
        <form onSubmit={handleVerifyPinSubmit} className="flex flex-col gap-4 py-2">
          <p className="text-body text-dark-muted">
            Masukkan 6 digit PIN keamanan akun Anda untuk membuka akses perubahan password.
          </p>

          <Input
            label="6-Digit PIN Keamanan"
            type="password"
            inputMode="numeric"
            maxLength={6}
            placeholder="••••••"
            value={verifyPinInput}
            onChange={(e) => {
              const val = e.target.value.replace(/\D/g, '').slice(0, 6);
              setVerifyPinInput(val);
              if (verifyPinError) setVerifyPinError('');
            }}
            error={verifyPinError}
            disabled={verifyPinLoading}
            autoFocus
          />

          <div className="flex flex-col gap-2 mt-1">
            <Button
              variant="primary"
              fullWidth
              type="submit"
              isLoading={verifyPinLoading}
              disabled={verifyPinInput.length !== 6 || verifyPinLoading}
            >
              Verifikasi & Lanjut
            </Button>
            <Button
              variant="secondary"
              fullWidth
              type="button"
              onClick={() => {
                setIsVerifyPinOpen(false);
                setVerifyPinInput('');
                setVerifyPinError('');
              }}
              disabled={verifyPinLoading}
            >
              Batal
            </Button>
          </div>
        </form>
      </BottomSheet>

      {/* Bottom Sheet Ubah / Reset PIN Keamanan */}
      <BottomSheet
        isOpen={isChangePinOpen}
        onClose={() => {
          setIsChangePinOpen(false);
          resetPinForm();
        }}
        title={pinModalMode === 'change' ? 'Ubah PIN Keamanan' : 'Reset PIN Keamanan'}
      >
        <form onSubmit={handleChangePinSubmit} className="flex flex-col gap-3 py-2">
          {pinModalMode === 'change' ? (
            <>
              <p className="text-body text-dark-muted text-sm">
                Masukkan PIN saat ini dan tentukan 6-digit PIN baru yang aman.
              </p>

              <Input
                label="PIN Lama Saat Ini"
                type="password"
                inputMode="numeric"
                maxLength={6}
                placeholder="6 digit angka"
                value={oldPin}
                onChange={(e) => {
                  const val = e.target.value.replace(/\D/g, '').slice(0, 6);
                  setOldPin(val);
                  if (changePinError) setChangePinError('');
                }}
                disabled={changePinLoading}
              />

              <Input
                label="PIN Baru"
                type="password"
                inputMode="numeric"
                maxLength={6}
                placeholder="6 digit angka"
                value={newPin}
                onChange={(e) => {
                  const val = e.target.value.replace(/\D/g, '').slice(0, 6);
                  setNewPin(val);
                  if (changePinError) setChangePinError('');
                }}
                disabled={changePinLoading}
              />

              <Input
                label="Konfirmasi PIN Baru"
                type="password"
                inputMode="numeric"
                maxLength={6}
                placeholder="Ketik ulang PIN baru"
                value={confirmNewPin}
                onChange={(e) => {
                  const val = e.target.value.replace(/\D/g, '').slice(0, 6);
                  setConfirmNewPin(val);
                  if (changePinError) setChangePinError('');
                }}
                disabled={changePinLoading}
              />

              <div className="text-right">
                <button
                  type="button"
                  onClick={() => {
                    setPinModalMode('reset_with_password');
                    setChangePinError('');
                    setChangePinSuccess('');
                  }}
                  className="text-caption text-accent hover:underline"
                >
                  Lupa PIN lama?
                </button>
              </div>
            </>
          ) : (
            <>
              <p className="text-body text-dark-muted text-sm">
                Masukkan kata sandi (password) akun Anda untuk memverifikasi kepemilikan dan mengatur ulang PIN baru.
              </p>

              <Input
                label="Password Akun Anda"
                type="password"
                placeholder="Masukkan kata sandi akun"
                value={accountPassword}
                onChange={(e) => {
                  setAccountPassword(e.target.value);
                  if (changePinError) setChangePinError('');
                }}
                disabled={changePinLoading}
              />

              <Input
                label="PIN Baru"
                type="password"
                inputMode="numeric"
                maxLength={6}
                placeholder="6 digit angka"
                value={newPin}
                onChange={(e) => {
                  const val = e.target.value.replace(/\D/g, '').slice(0, 6);
                  setNewPin(val);
                  if (changePinError) setChangePinError('');
                }}
                disabled={changePinLoading}
              />

              <Input
                label="Konfirmasi PIN Baru"
                type="password"
                inputMode="numeric"
                maxLength={6}
                placeholder="Ketik ulang PIN baru"
                value={confirmNewPin}
                onChange={(e) => {
                  const val = e.target.value.replace(/\D/g, '').slice(0, 6);
                  setConfirmNewPin(val);
                  if (changePinError) setChangePinError('');
                }}
                disabled={changePinLoading}
              />

              <div className="text-right">
                <button
                  type="button"
                  onClick={() => {
                    setPinModalMode('change');
                    setChangePinError('');
                    setChangePinSuccess('');
                  }}
                  className="text-caption text-accent hover:underline"
                >
                  Kembali ke Ubah PIN
                </button>
              </div>
            </>
          )}

          {changePinError && (
            <div className="p-3 bg-status-red/10 border border-status-red/30 rounded-btn flex items-start gap-2 text-caption text-status-red">
              <AlertCircle size={16} className="flex-shrink-0 mt-0.5" />
              <span>{changePinError}</span>
            </div>
          )}

          {changePinSuccess && (
            <div className="p-3 bg-status-green/10 border border-status-green/30 rounded-btn flex items-center gap-2 text-caption text-status-green">
              <CheckCircle2 size={16} />
              <span>{changePinSuccess}</span>
            </div>
          )}

          <div className="flex flex-col gap-2 mt-2">
            <Button
              variant="primary"
              fullWidth
              type="submit"
              isLoading={changePinLoading}
              disabled={
                changePinLoading ||
                newPin.length !== 6 ||
                confirmNewPin.length !== 6 ||
                (pinModalMode === 'change' ? oldPin.length !== 6 : !accountPassword)
              }
            >
              {pinModalMode === 'change' ? 'Simpan PIN Baru' : 'Reset PIN Keamanan'}
            </Button>
            <Button
              variant="secondary"
              fullWidth
              type="button"
              onClick={() => {
                setIsChangePinOpen(false);
                resetPinForm();
              }}
              disabled={changePinLoading}
            >
              Batal
            </Button>
          </div>
        </form>
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
