import React, { useState, useEffect } from 'react';
import { Card } from '../components/common/Card';
import { Button } from '../components/common/Button';
import { Input } from '../components/common/Input';
import { loginUser, registerUser, getRateLimitStatus } from '../services/authService';
import { getBootstrapError, BootstrapError } from '../services/bootstrapService';
import { LogIn, UserPlus, Eye, EyeOff, ShieldAlert, CheckCircle2, AlertTriangle } from 'lucide-react';
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
    <div className="min-h-screen bg-dark-bg text-dark-text flex flex-col justify-center px-4 py-8 safe-top safe-bottom relative">
      <div className="absolute top-4 right-4 z-10">
        <ThemeToggle />
      </div>
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
  );
};
