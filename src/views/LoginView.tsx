import React, { useState, useEffect } from 'react';
import { Card } from '../components/common/Card';
import { Button } from '../components/common/Button';
import { Input } from '../components/common/Input';
import { loginUser, registerUser, getRateLimitStatus } from '../services/authService';
import { getBootstrapError, BootstrapError } from '../services/bootstrapService';
import {
  normalizeResetCode,
  normalizeResetPin,
  normalizeResetUsername,
  PasswordResetError,
  resetPasswordWithCode,
  resetPasswordWithPin,
} from '../services/passwordResetService';
import { evaluatePasswordStrength, validateNewPassword } from '../utils/authHelpers';
import { isPinFormatValid } from '../utils/pinSecurityLogic';
import { BottomSheet } from '../components/common/BottomSheet';
import { LogIn, UserPlus, Eye, EyeOff, ShieldAlert, CheckCircle2, AlertTriangle, KeyRound } from 'lucide-react';
import { ThemeToggle } from '../components/common/ThemeToggle';

export const LoginView: React.FC = () => {
  const [tab, setTab] = useState<'login' | 'register'>('login');

  // State Login
  const [loginUsername, setLoginUsername] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [showLoginPassword, setShowLoginPassword] = useState(false);
  const [loginLoading, setLoginLoading] = useState(false);
  const [loginError, setLoginError] = useState('');
  const [loginErrorCode, setLoginErrorCode] = useState('');

  // State Register
  const [regUsername, setRegUsername] = useState('');
  const [regDisplayName, setRegDisplayName] = useState('');
  const [regPassword, setRegPassword] = useState('');
  const [showRegPassword, setShowRegPassword] = useState(false);
  const [regLoading, setRegLoading] = useState(false);
  const [regError, setRegError] = useState('');
  const [regErrorCode, setRegErrorCode] = useState('');
  const [regSuccess, setRegSuccess] = useState('');

  // Lockout rate-limit state
  const [lockoutSec, setLockoutSec] = useState<number>(0);

  // Status error bootstrap admin otomatis
  const [bootstrapErr, setBootstrapErr] = useState<BootstrapError | null>(null);

  // State Lupa Password
  const [forgotOpen, setForgotOpen] = useState(false);
  const [resetMode, setResetMode] = useState<'pin' | 'code'>('pin');
  const [resetUsername, setResetUsername] = useState('');
  const [resetPin, setResetPin] = useState('');
  const [resetCode, setResetCode] = useState('');
  const [resetNewPassword, setResetNewPassword] = useState('');
  const [resetConfirmPassword, setResetConfirmPassword] = useState('');
  const [showResetNewPassword, setShowResetNewPassword] = useState(false);
  const [showResetConfirmPassword, setShowResetConfirmPassword] = useState(false);
  const [resetLoading, setResetLoading] = useState(false);
  const [resetError, setResetError] = useState('');
  const [resetRemainingAttempts, setResetRemainingAttempts] = useState<number | null>(null);
  const [resetLockedUntil, setResetLockedUntil] = useState<number | null>(null);
  const [resetNowMs, setResetNowMs] = useState<number>(() => Date.now());
  const [resetSuccess, setResetSuccess] = useState(false);
  const [resetNeedsNewPin, setResetNeedsNewPin] = useState(false);

  useEffect(() => {
    const checkState = () => {
      const status = getRateLimitStatus();
      if (status.isLocked) {
        setLockoutSec(status.remainingSeconds);
      } else {
        setLockoutSec(0);
      }
      setBootstrapErr(getBootstrapError());
    };

    checkState();
    const interval = setInterval(checkState, 1000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (!forgotOpen || !resetLockedUntil) return;
    setResetNowMs(Date.now());
    const timer = setInterval(() => {
      const now = Date.now();
      setResetNowMs(now);
      if (now >= resetLockedUntil) {
        setResetLockedUntil(null);
      }
    }, 1000);
    return () => clearInterval(timer);
  }, [forgotOpen, resetLockedUntil]);

  const clearForgotSensitiveFields = () => {
    setResetPin('');
    setResetCode('');
    setResetNewPassword('');
    setResetConfirmPassword('');
    setShowResetNewPassword(false);
    setShowResetConfirmPassword(false);
  };

  const handleOpenForgotSheet = () => {
    clearForgotSensitiveFields();
    setResetMode('pin');
    setResetUsername(normalizeResetUsername(loginUsername));
    setResetError('');
    setResetRemainingAttempts(null);
    setResetLockedUntil(null);
    setResetSuccess(false);
    setResetNeedsNewPin(false);
    setForgotOpen(true);
  };

  const handleCloseForgotSheet = () => {
    if (resetLoading) return;
    setForgotOpen(false);
    clearForgotSensitiveFields();
    setResetError('');
    setResetRemainingAttempts(null);
    setResetLockedUntil(null);
    setResetSuccess(false);
    setResetNeedsNewPin(false);
  };

  const resetLockRemainingMs = resetLockedUntil ? Math.max(0, resetLockedUntil - resetNowMs) : 0;
  const isResetLocked = resetLockRemainingMs > 0;
  const resetLockRemainingMinutes = isResetLocked ? Math.max(1, Math.ceil(resetLockRemainingMs / 60000)) : 0;
  const resetPasswordStrength = evaluatePasswordStrength(resetNewPassword);

  const handleForgotSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (resetLoading || isResetLocked) return;

    setResetError('');
    setResetRemainingAttempts(null);

    const cleanUsername = normalizeResetUsername(resetUsername);
    if (!cleanUsername) {
      setResetError('Username wajib diisi.');
      return;
    }

    if (resetMode === 'pin') {
      const cleanPin = normalizeResetPin(resetPin);
      if (!isPinFormatValid(cleanPin)) {
        setResetError('PIN harus berupa tepat 6 digit angka.');
        return;
      }
    } else {
      const cleanCode = normalizeResetCode(resetCode);
      if (cleanCode.length !== 10) {
        setResetError('Kode reset harus terdiri dari 10 karakter tanpa spasi.');
        return;
      }
    }

    const passwordCheck = validateNewPassword(resetNewPassword, {
      isAdmin: false,
      username: cleanUsername,
    });
    if (!passwordCheck.valid) {
      setResetError(passwordCheck.error || 'Password baru tidak memenuhi persyaratan.');
      return;
    }

    if (resetNewPassword !== resetConfirmPassword) {
      setResetError('Konfirmasi password baru tidak cocok.');
      return;
    }

    setResetLoading(true);
    try {
      const result =
        resetMode === 'pin'
          ? await resetPasswordWithPin(cleanUsername, resetPin, resetNewPassword)
          : await resetPasswordWithCode(cleanUsername, resetCode, resetNewPassword);

      setResetUsername(cleanUsername);
      setResetNeedsNewPin(Boolean(result.needsNewPin));
      setResetSuccess(true);
      setResetError('');
      setResetRemainingAttempts(null);
      setResetLockedUntil(null);
      clearForgotSensitiveFields();
    } catch (err: any) {
      const resetErr = err instanceof PasswordResetError ? err : null;
      setResetError(err?.message || 'Gagal mereset password. Silakan coba lagi.');

      if (resetErr?.code === 'mismatch' && typeof resetErr.remainingAttempts === 'number') {
        setResetRemainingAttempts(resetErr.remainingAttempts);
      }

      if (resetErr?.code === 'locked' && typeof resetErr.lockedUntil === 'number') {
        setResetNowMs(Date.now());
        setResetLockedUntil(resetErr.lockedUntil);
      }
    } finally {
      setResetLoading(false);
    }
  };

  const handleGoToLoginAfterReset = () => {
    const cleanUsername = normalizeResetUsername(resetUsername);
    setForgotOpen(false);
    clearForgotSensitiveFields();
    setResetError('');
    setResetRemainingAttempts(null);
    setResetLockedUntil(null);
    setResetSuccess(false);
    setResetNeedsNewPin(false);
    setTab('login');
    setLoginUsername(cleanUsername);
    setLoginPassword('');
    setLoginError('');
    setLoginErrorCode('');
  };

  const handleLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginError('');
    setLoginErrorCode('');

    if (lockoutSec > 0) {
      setLoginError(`Terlalu banyak percobaan gagal. Silakan tunggu ${Math.ceil(lockoutSec / 60)} menit.`);
      return;
    }

    if (!loginUsername.trim() || !loginPassword) {
      setLoginError('Username atau password salah.');
      return;
    }

    setLoginLoading(true);
    try {
      await loginUser(loginUsername, loginPassword);
    } catch (err: any) {
      setLoginError(err.message || 'Username atau password salah.');
      setLoginErrorCode(err.code || '');
    } finally {
      setLoginLoading(false);
    }
  };

  const handleRegisterSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setRegError('');
    setRegErrorCode('');
    setRegSuccess('');

    if (!regUsername.trim()) {
      setRegError('Username wajib diisi.');
      return;
    }
    if (!regPassword) {
      setRegError('Password wajib diisi.');
      return;
    }

    setRegLoading(true);
    try {
      await registerUser(regUsername, regDisplayName, regPassword);
    } catch (err: any) {
      setRegError(err.message || 'Gagal mendaftar. Silakan periksa kembali data Anda.');
      setRegErrorCode(err.code || '');
    } finally {
      setRegLoading(false);
    }
  };

  return (
    <div
      className="bg-dark-bg text-dark-text flex flex-col page-pad-top page-pad-bottom overflow-y-auto"
      style={{ minHeight: '100dvh' }}
    >
      {/* Baris Atas dalam Alur Normal: Tombol Alih Tema */}
      <div className="w-full max-w-sm mx-auto px-4 flex justify-end">
        <ThemeToggle />
      </div>

      {/* Area Konten: Ditengahkan Vertikal dalam Sisa Ruang Layar */}
      <div className="flex-1 flex flex-col justify-center px-4 py-2">
        <div className="w-full max-w-sm mx-auto flex flex-col gap-4">
        {/* Header Logo & Identitas */}
        <div className="flex flex-col items-center text-center">
          <div className="w-14 h-14 rounded-2xl bg-dark-surface border border-dark-border flex items-center justify-center text-accent font-bold text-2xl mb-3 shadow-none">
            DS
          </div>
          <h1 className="text-page-title text-dark-text font-bold">DigiSwiss-Round</h1>
          <p className="text-caption text-dark-muted mt-1">
            Manajer Turnamen Swiss Round Digimon Card Game
          </p>
        </div>

        {/* Peringatan Masalah Bootstrap Admin (Jika Ada) */}
        {bootstrapErr && (
          <div className="p-3 bg-status-yellow/10 border border-status-yellow/30 rounded-btn flex flex-col gap-1 text-caption text-status-yellow">
            <div className="flex items-start gap-2">
              <AlertTriangle size={16} className="flex-shrink-0 mt-0.5" />
              <span className="leading-snug">{bootstrapErr.message}</span>
            </div>
            {bootstrapErr.code && (
              <span className="text-[11px] text-dark-muted font-mono pl-6">
                Kode: {bootstrapErr.code}
              </span>
            )}
          </div>
        )}

        {/* Tab Pilihan Masuk / Daftar */}
        <div className="grid grid-cols-2 p-1 bg-dark-surface border border-dark-border rounded-btn">
          <button
            type="button"
            onClick={() => {
              setTab('login');
              setLoginError('');
              setLoginErrorCode('');
            }}
            className={`min-h-[40px] flex items-center justify-center text-body font-medium rounded-lg transition-colors ${
              tab === 'login'
                ? 'bg-accent text-[#0B0F14] font-semibold'
                : 'text-dark-muted hover:text-dark-text'
            }`}
          >
            Masuk
          </button>
          <button
            type="button"
            onClick={() => {
              setTab('register');
              setRegError('');
              setRegErrorCode('');
            }}
            className={`min-h-[40px] flex items-center justify-center text-body font-medium rounded-lg transition-colors ${
              tab === 'register'
                ? 'bg-accent text-[#0B0F14] font-semibold'
                : 'text-dark-muted hover:text-dark-text'
            }`}
          >
            Daftar
          </button>
        </div>

        {/* Kartu Form */}
        <Card variant="surface" className="flex flex-col gap-4">
          {tab === 'login' ? (
            <form onSubmit={handleLoginSubmit} className="flex flex-col gap-3.5">
              {lockoutSec > 0 && (
                <div className="p-3 bg-status-red/10 border border-status-red/30 rounded-btn flex items-start gap-2.5 text-caption text-status-red">
                  <ShieldAlert size={18} className="flex-shrink-0 mt-0.5 stroke-[1.5]" />
                  <div>
                    <span className="font-semibold block">Akses Sementara Dikunci</span>
                    Terlalu banyak percobaan gagal. Silakan tunggu{' '}
                    <span className="font-mono font-bold">{Math.floor(lockoutSec / 60)}m {lockoutSec % 60}s</span>.
                  </div>
                </div>
              )}

              <Input
                label="Username"
                placeholder="Username"
                value={loginUsername}
                onChange={(e) => {
                  setLoginUsername(e.target.value);
                  if (loginError) {
                    setLoginError('');
                    setLoginErrorCode('');
                  }
                }}
                disabled={loginLoading || lockoutSec > 0}
                autoComplete="username"
                autoCapitalize="none"
              />

              <Input
                label="Password"
                type={showLoginPassword ? 'text' : 'password'}
                placeholder="Password"
                value={loginPassword}
                onChange={(e) => {
                  setLoginPassword(e.target.value);
                  if (loginError) {
                    setLoginError('');
                    setLoginErrorCode('');
                  }
                }}
                disabled={loginLoading || lockoutSec > 0}
                autoComplete="current-password"
                rightIcon={
                  <button
                    type="button"
                    onClick={() => setShowLoginPassword(!showLoginPassword)}
                    className="p-1 text-dark-muted hover:text-dark-text focus:outline-none"
                    aria-label={showLoginPassword ? 'Sembunyikan password' : 'Tampilkan password'}
                  >
                    {showLoginPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                }
              />

              <div className="flex justify-end -mt-1.5">
                <button
                  type="button"
                  onClick={handleOpenForgotSheet}
                  disabled={loginLoading}
                  className="text-caption text-accent hover:underline py-1 min-h-[36px] inline-flex items-center focus:outline-none"
                >
                  Lupa password?
                </button>
              </div>

              {/* Tampilan Galat Login + Kode Error Saja */}
              {loginError && (
                <div className="flex flex-col items-center py-1 gap-0.5">
                  <p className="text-caption text-status-red text-center">
                    {loginError}
                  </p>
                  {loginErrorCode && (
                    <p className="text-[11px] text-dark-muted font-mono text-center">
                      Kode: {loginErrorCode}
                    </p>
                  )}
                </div>
              )}

              <div className="mt-2">
                <Button
                  variant="primary"
                  fullWidth
                  type="submit"
                  isLoading={loginLoading}
                  disabled={lockoutSec > 0}
                  icon={<LogIn size={18} />}
                >
                  Masuk
                </Button>
              </div>
            </form>
          ) : (
            <form onSubmit={handleRegisterSubmit} className="flex flex-col gap-3.5">
              <Input
                label="Username"
                placeholder="Username"
                value={regUsername}
                onChange={(e) => {
                  setRegUsername(e.target.value);
                  if (regError) {
                    setRegError('');
                    setRegErrorCode('');
                  }
                }}
                helperText="Hanya a-z, 0-9, titik, dan garis bawah (3-20 karakter)."
                disabled={regLoading}
                autoComplete="username"
                autoCapitalize="none"
              />

              <Input
                label="Nama Tampilan"
                placeholder="Nama Tampilan"
                value={regDisplayName}
                onChange={(e) => setRegDisplayName(e.target.value)}
                helperText="Nama yang akan ditampilkan di turnamen (opsional)."
                disabled={regLoading}
              />

              <Input
                label="Password"
                type={showRegPassword ? 'text' : 'password'}
                placeholder="Password"
                value={regPassword}
                onChange={(e) => {
                  setRegPassword(e.target.value);
                  if (regError) {
                    setRegError('');
                    setRegErrorCode('');
                  }
                }}
                helperText="Minimal 8 karakter."
                disabled={regLoading}
                autoComplete="new-password"
                rightIcon={
                  <button
                    type="button"
                    onClick={() => setShowRegPassword(!showRegPassword)}
                    className="p-1 text-dark-muted hover:text-dark-text focus:outline-none"
                    aria-label={showRegPassword ? 'Sembunyikan password' : 'Tampilkan password'}
                  >
                    {showRegPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                }
              />

              {regError && (
                <div className="flex flex-col items-center py-1 gap-0.5">
                  <p className="text-caption text-status-red text-center">
                    {regError}
                  </p>
                  {regErrorCode && (
                    <p className="text-[11px] text-dark-muted font-mono text-center">
                      Kode: {regErrorCode}
                    </p>
                  )}
                </div>
              )}

              {regSuccess && (
                <div className="p-2.5 bg-status-green/10 border border-status-green/30 rounded-btn flex items-center gap-2 text-caption text-status-green">
                  <CheckCircle2 size={16} />
                  <span>{regSuccess}</span>
                </div>
              )}

              <div className="mt-2">
                <Button
                  variant="primary"
                  fullWidth
                  type="submit"
                  isLoading={regLoading}
                  icon={<UserPlus size={18} />}
                >
                  Daftar Akun
                </Button>
              </div>
            </form>
          )}
        </Card>
      </div>
      </div>

      {/* Bottom Sheet Lupa Password */}
      <BottomSheet
        isOpen={forgotOpen}
        onClose={handleCloseForgotSheet}
        title="Lupa Password"
      >
        {resetSuccess ? (
          <div className="flex flex-col gap-3.5 py-2">
            <div className="p-3.5 bg-status-green/10 border border-status-green/30 rounded-btn flex items-start gap-2.5 text-caption text-status-green">
              <CheckCircle2 size={18} className="flex-shrink-0 mt-0.5" />
              <div className="flex flex-col gap-1">
                <span className="font-semibold text-body">Password berhasil diganti</span>
                {resetNeedsNewPin && (
                  <span className="text-dark-text">
                    Anda akan diminta membuat PIN baru setelah masuk.
                  </span>
                )}
              </div>
            </div>

            <Button
              variant="primary"
              fullWidth
              type="button"
              onClick={handleGoToLoginAfterReset}
              icon={<LogIn size={18} />}
            >
              Masuk sekarang
            </Button>
          </div>
        ) : (
          <form onSubmit={handleForgotSubmit} className="flex flex-col gap-3.5 py-1">
            {/* Pilihan Metode Reset */}
            <div className="grid grid-cols-2 p-1 bg-dark-surface-high border border-dark-border rounded-btn">
              <button
                type="button"
                disabled={resetLoading}
                onClick={() => {
                  setResetMode('pin');
                  setResetCode('');
                  setResetError('');
                  setResetRemainingAttempts(null);
                }}
                className={`min-h-[38px] flex items-center justify-center text-caption font-medium rounded-lg transition-colors ${
                  resetMode === 'pin'
                    ? 'bg-accent text-[#0B0F14] font-semibold'
                    : 'text-dark-muted hover:text-dark-text'
                }`}
              >
                Pakai PIN
              </button>
              <button
                type="button"
                disabled={resetLoading}
                onClick={() => {
                  setResetMode('code');
                  setResetPin('');
                  setResetError('');
                  setResetRemainingAttempts(null);
                }}
                className={`min-h-[38px] flex items-center justify-center text-caption font-medium rounded-lg transition-colors ${
                  resetMode === 'code'
                    ? 'bg-accent text-[#0B0F14] font-semibold'
                    : 'text-dark-muted hover:text-dark-text'
                }`}
              >
                Kode dari Admin
              </button>
            </div>

            <Input
              label="Username"
              placeholder="Username"
              value={resetUsername}
              onChange={(e) => {
                setResetUsername(e.target.value.toLowerCase());
                if (resetError) setResetError('');
              }}
              disabled={resetLoading}
              autoComplete="username"
              autoCapitalize="none"
            />

            {resetMode === 'pin' ? (
              <Input
                label="PIN Keamanan (6 Digit)"
                type="password"
                inputMode="numeric"
                maxLength={6}
                placeholder="••••••"
                value={resetPin}
                onChange={(e) => {
                  setResetPin(normalizeResetPin(e.target.value));
                  if (resetError) setResetError('');
                }}
                disabled={resetLoading}
                autoComplete="off"
                helperText="Masukkan PIN 6 digit angka milik akun Anda."
              />
            ) : (
              <Input
                label="Kode Reset dari Admin (10 Karakter)"
                type="text"
                maxLength={10}
                placeholder="XXXXXXXXXX"
                value={resetCode}
                onChange={(e) => {
                  setResetCode(normalizeResetCode(e.target.value).slice(0, 10));
                  if (resetError) setResetError('');
                }}
                disabled={resetLoading}
                autoComplete="off"
                autoCapitalize="characters"
                className="font-mono tracking-wider uppercase"
                helperText="Masukkan kode 10 karakter tanpa spasi dari Admin."
              />
            )}

            <div className="flex flex-col gap-1.5">
              <Input
                label="Password Baru"
                type={showResetNewPassword ? 'text' : 'password'}
                placeholder="Password Baru"
                value={resetNewPassword}
                onChange={(e) => {
                  setResetNewPassword(e.target.value);
                  if (resetError) setResetError('');
                }}
                disabled={resetLoading}
                autoComplete="new-password"
                helperText="Minimal 8 karakter dan tidak boleh memuat username."
                rightIcon={
                  <button
                    type="button"
                    onClick={() => setShowResetNewPassword(!showResetNewPassword)}
                    className="p-1 text-dark-muted hover:text-dark-text focus:outline-none"
                    aria-label={showResetNewPassword ? 'Sembunyikan password baru' : 'Tampilkan password baru'}
                  >
                    {showResetNewPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                }
              />

              {resetNewPassword && (
                <div className="mt-0.5 flex flex-col gap-1.5">
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="text-dark-muted">Kekuatan Sandi:</span>
                    <span
                      className={`font-semibold ${
                        resetPasswordStrength.strength === 'Kuat'
                          ? 'text-status-green'
                          : resetPasswordStrength.strength === 'Sedang'
                          ? 'text-status-yellow'
                          : 'text-status-red'
                      }`}
                    >
                      {resetPasswordStrength.strength}
                    </span>
                  </div>
                  <div className="grid grid-cols-4 gap-1 h-1.5 w-full bg-dark-surface-high rounded-full overflow-hidden">
                    <div className={`h-full ${resetPasswordStrength.score >= 1 ? resetPasswordStrength.color : 'bg-transparent'}`} />
                    <div className={`h-full ${resetPasswordStrength.score >= 2 ? resetPasswordStrength.color : 'bg-transparent'}`} />
                    <div className={`h-full ${resetPasswordStrength.score >= 3 ? resetPasswordStrength.color : 'bg-transparent'}`} />
                    <div className={`h-full ${resetPasswordStrength.score >= 4 ? resetPasswordStrength.color : 'bg-transparent'}`} />
                  </div>
                </div>
              )}
            </div>

            <Input
              label="Konfirmasi Password Baru"
              type={showResetConfirmPassword ? 'text' : 'password'}
              placeholder="Konfirmasi Password Baru"
              value={resetConfirmPassword}
              onChange={(e) => {
                setResetConfirmPassword(e.target.value);
                if (resetError) setResetError('');
              }}
              disabled={resetLoading}
              autoComplete="new-password"
              rightIcon={
                <button
                  type="button"
                  onClick={() => setShowResetConfirmPassword(!showResetConfirmPassword)}
                  className="p-1 text-dark-muted hover:text-dark-text focus:outline-none"
                  aria-label={showResetConfirmPassword ? 'Sembunyikan konfirmasi password' : 'Tampilkan konfirmasi password'}
                >
                  {showResetConfirmPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              }
            />

            {isResetLocked && (
              <div className="p-2.5 bg-status-red/10 border border-status-red/30 rounded-btn flex items-start gap-2 text-caption text-status-red">
                <ShieldAlert size={16} className="flex-shrink-0 mt-0.5" />
                <span>
                  Percobaan reset dikunci sementara. Tunggu{' '}
                  <strong className="font-mono">{resetLockRemainingMinutes} menit</strong> sebelum mencoba lagi.
                </span>
              </div>
            )}

            {resetError && (
              <div className="p-2.5 bg-status-red/10 border border-status-red/30 rounded-btn flex items-start gap-2 text-caption text-status-red">
                <ShieldAlert size={16} className="flex-shrink-0 mt-0.5" />
                <div className="flex flex-col gap-0.5">
                  <span>{resetError}</span>
                  {resetRemainingAttempts !== null && (
                    <span className="font-medium">
                      Sisa percobaan: {resetRemainingAttempts} kali
                    </span>
                  )}
                </div>
              </div>
            )}

            <div className="flex flex-col gap-2 mt-1">
              <Button
                variant="primary"
                fullWidth
                type="submit"
                isLoading={resetLoading}
                disabled={resetLoading || isResetLocked}
                icon={!resetLoading ? <KeyRound size={18} /> : undefined}
              >
                {resetLoading ? 'Memeriksa... mohon tunggu' : 'Simpan Password Baru'}
              </Button>
              <Button
                variant="secondary"
                fullWidth
                type="button"
                disabled={resetLoading}
                onClick={handleCloseForgotSheet}
              >
                Batal
              </Button>
            </div>
          </form>
        )}
      </BottomSheet>
    </div>
  );
};
