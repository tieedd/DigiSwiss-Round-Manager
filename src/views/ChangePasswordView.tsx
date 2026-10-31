import React, { useState } from 'react';
import { Card } from '../components/common/Card';
import { Button } from '../components/common/Button';
import { Input } from '../components/common/Input';
import { useAuth } from '../context/AuthContext';
import { changeUserPassword } from '../services/authService';
import { evaluatePasswordStrength } from '../utils/authHelpers';
import { KeyRound, ShieldAlert, CheckCircle2, Eye, EyeOff } from 'lucide-react';

interface ChangePasswordViewProps {
  forced?: boolean;
  onSuccess?: () => void;
  onCancel?: () => void;
}

export const ChangePasswordView: React.FC<ChangePasswordViewProps> = ({
  forced = true,
  onSuccess,
  onCancel,
}) => {
  const { userProfile, refreshProfile, logout } = useAuth();

  const [oldPassword, setOldPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showOldPass, setShowOldPass] = useState(false);
  const [showNewPass, setShowNewPass] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  const isAdmin = userProfile?.role === 'admin';
  const minLength = isAdmin ? 12 : 8;

  const strength = evaluatePasswordStrength(newPassword);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!oldPassword) {
      setError('Password saat ini wajib diisi.');
      return;
    }

    if (!newPassword) {
      setError('Password baru wajib diisi.');
      return;
    }

    if (newPassword.length < minLength) {
      setError(`Password baru minimal ${minLength} karakter untuk peran ${isAdmin ? 'Admin' : 'Pengguna'}.`);
      return;
    }

    if (newPassword !== confirmPassword) {
      setError('Konfirmasi password baru tidak cocok.');
      return;
    }

    if (!userProfile) {
      setError('Profil pengguna tidak ditemukan.');
      return;
    }

    setLoading(true);
    try {
      await changeUserPassword(oldPassword, newPassword, userProfile);
      setSuccess(true);
      await refreshProfile();
      if (onSuccess) {
        onSuccess();
      }
    } catch (err: any) {
      setError(err?.message || 'Gagal mengubah password. Pastikan password saat ini benar.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-dark-bg text-dark-text flex flex-col justify-center px-4 py-8 safe-top safe-bottom">
      <div className="w-full max-w-sm mx-auto flex flex-col gap-4">
        {/* Header Peringatan */}
        <div className="flex flex-col items-center text-center">
          <div className="w-12 h-12 rounded-full bg-status-yellow/10 text-status-yellow flex items-center justify-center mb-2">
            <KeyRound size={22} className="stroke-[1.5]" />
          </div>
          <h2 className="text-page-title text-dark-text font-bold">
            {forced ? 'Wajib Ganti Password' : 'Ganti Password Akun'}
          </h2>
          <p className="text-caption text-dark-muted mt-1 max-w-xs">
            {forced
              ? 'Akun Anda memerlukan pembaruan password sebelum dapat mengakses fitur aplikasi.'
              : 'Perbarui password akun Anda secara berkala demi keamanan.'}
          </p>
        </div>

        <Card variant="surface" className="flex flex-col gap-4">
          {success ? (
            <div className="flex flex-col items-center text-center py-4 gap-3">
              <CheckCircle2 size={40} className="text-status-green stroke-[1.5]" />
              <h3 className="text-body font-semibold text-dark-text">Password Berhasil Diperbarui</h3>
              <p className="text-caption text-dark-muted">
                Anda kini dapat melanjutkan ke halaman utama aplikasi.
              </p>
              {!forced && onCancel && (
                <Button variant="secondary" onClick={onCancel}>
                  Kembali
                </Button>
              )}
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="flex flex-col gap-3.5">
              <Input
                label="Password Saat Ini"
                type={showOldPass ? 'text' : 'password'}
                placeholder="Password"
                value={oldPassword}
                onChange={(e) => {
                  setOldPassword(e.target.value);
                  if (error) setError('');
                }}
                disabled={loading}
                autoComplete="current-password"
                rightIcon={
                  <button
                    type="button"
                    onClick={() => setShowOldPass(!showOldPass)}
                    className="p-1 text-dark-muted hover:text-dark-text focus:outline-none"
                    aria-label={showOldPass ? 'Sembunyikan' : 'Tampilkan'}
                  >
                    {showOldPass ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                }
              />

              <div className="flex flex-col gap-1.5">
                <Input
                  label="Password Baru"
                  type={showNewPass ? 'text' : 'password'}
                  placeholder="Password"
                  value={newPassword}
                  onChange={(e) => {
                    setNewPassword(e.target.value);
                    if (error) setError('');
                  }}
                  helperText={`Minimal ${minLength} karakter. Tidak boleh memuat username atau password bawaan.`}
                  disabled={loading}
                  autoComplete="new-password"
                  rightIcon={
                    <button
                      type="button"
                      onClick={() => setShowNewPass(!showNewPass)}
                      className="p-1 text-dark-muted hover:text-dark-text focus:outline-none"
                      aria-label={showNewPass ? 'Sembunyikan' : 'Tampilkan'}
                    >
                      {showNewPass ? <EyeOff size={18} /> : <Eye size={18} />}
                    </button>
                  }
                />

                {/* Indikator Kekuatan Password */}
                {newPassword && (
                  <div className="mt-1 flex flex-col gap-1.5">
                    <div className="flex items-center justify-between text-[11px]">
                      <span className="text-dark-muted">Kekuatan Sandi:</span>
                      <span className={`font-semibold ${
                        strength.strength === 'Kuat' ? 'text-status-green' :
                        strength.strength === 'Sedang' ? 'text-status-yellow' : 'text-status-red'
                      }`}>
                        {strength.strength}
                      </span>
                    </div>
                    <div className="grid grid-cols-4 gap-1 h-1.5 w-full bg-dark-surface-high rounded-full overflow-hidden">
                      <div className={`h-full ${strength.score >= 1 ? strength.color : 'bg-transparent'}`} />
                      <div className={`h-full ${strength.score >= 2 ? strength.color : 'bg-transparent'}`} />
                      <div className={`h-full ${strength.score >= 3 ? strength.color : 'bg-transparent'}`} />
                      <div className={`h-full ${strength.score >= 4 ? strength.color : 'bg-transparent'}`} />
                    </div>
                  </div>
                )}
              </div>

              <Input
                label="Konfirmasi Password Baru"
                type="password"
                placeholder="Password"
                value={confirmPassword}
                onChange={(e) => {
                  setConfirmPassword(e.target.value);
                  if (error) setError('');
                }}
                disabled={loading}
                autoComplete="new-password"
              />

              {error && (
                <div className="p-2.5 bg-status-red/10 border border-status-red/30 rounded-btn flex items-start gap-2 text-caption text-status-red">
                  <ShieldAlert size={16} className="flex-shrink-0 mt-0.5" />
                  <span>{error}</span>
                </div>
              )}

              <div className="mt-2 flex flex-col gap-2">
                <Button
                  variant="primary"
                  fullWidth
                  type="submit"
                  isLoading={loading}
                >
                  Simpan Password Baru
                </Button>

                {forced ? (
                  <button
                    type="button"
                    onClick={() => logout()}
                    className="text-caption text-dark-muted hover:text-dark-text py-2 text-center transition-colors"
                  >
                    Keluar dari Akun
                  </button>
                ) : onCancel ? (
                  <Button variant="secondary" fullWidth onClick={onCancel}>
                    Batal
                  </Button>
                ) : null}
              </div>
            </form>
          )}
        </Card>
      </div>
    </div>
  );
};
