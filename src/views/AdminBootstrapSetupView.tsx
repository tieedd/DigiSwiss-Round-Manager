import React, { useState } from 'react';
import { Card } from '../components/common/Card';
import { Button } from '../components/common/Button';
import { Input } from '../components/common/Input';
import { ThemeToggle } from '../components/common/ThemeToggle';
import { setupInitialAdmin } from '../services/bootstrapService';
import { evaluatePasswordStrength } from '../utils/authHelpers';
import { validateBootstrapAdminPassword } from '../utils/bootstrapLogic';
import { useAuth } from '../context/AuthContext';
import { ShieldCheck, Eye, EyeOff, AlertTriangle, KeyRound } from 'lucide-react';

export const AdminBootstrapSetupView: React.FC = () => {
  const { markBootstrapCompleted, recheckBootstrap } = useAuth();

  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const strength = evaluatePasswordStrength(password);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    const validation = validateBootstrapAdminPassword(password, confirmPassword);
    if (!validation.valid) {
      setError(validation.error || 'Password tidak memenuhi ketentuan.');
      return;
    }

    setLoading(true);
    try {
      await setupInitialAdmin(password, confirmPassword);
      markBootstrapCompleted();
    } catch (err: any) {
      setError(err?.message || 'Gagal menyiapkan akun admin utama.');
      await recheckBootstrap();
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="bg-dark-bg text-dark-text flex flex-col page-pad-top page-pad-bottom overflow-y-auto"
      style={{ minHeight: '100dvh' }}
    >
      <div className="w-full max-w-sm mx-auto px-4 flex justify-end">
        <ThemeToggle />
      </div>

      <div className="flex-1 flex flex-col justify-center px-4 py-2">
        <div className="w-full max-w-sm mx-auto flex flex-col gap-4">
          {/* Header Identitas */}
          <div className="flex flex-col items-center text-center">
            <div className="w-14 h-14 rounded-2xl bg-dark-surface border border-dark-border flex items-center justify-center text-accent mb-3">
              <ShieldCheck size={28} />
            </div>
            <h1 className="text-page-title text-dark-text font-bold">
              Setup Awal Admin
            </h1>
            <p className="text-caption text-dark-muted mt-1">
              Buat password untuk akun Admin Utama (<span className="font-mono text-dark-text">@admindss</span>). Setelah selesai, Anda akan diminta membuat PIN keamanan 6 digit.
            </p>
          </div>

          <Card variant="surface" className="flex flex-col gap-4">
            <form onSubmit={handleSubmit} className="flex flex-col gap-3.5">
              <div className="p-2.5 rounded-btn bg-dark-surface-high border border-dark-border flex items-center justify-between text-caption">
                <span className="text-dark-muted">Username Admin Utama</span>
                <span className="font-mono font-semibold text-accent">@admindss</span>
              </div>

              <div className="flex flex-col gap-1.5">
                <Input
                  label="Password Admin"
                  type={showPassword ? 'text' : 'password'}
                  placeholder="Minimal 8 karakter"
                  value={password}
                  onChange={(e) => {
                    setPassword(e.target.value);
                    if (error) setError('');
                  }}
                  disabled={loading}
                  autoComplete="new-password"
                  helperText="Minimal 8 karakter dan tidak boleh memuat username."
                  rightIcon={
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="p-1 text-dark-muted hover:text-dark-text focus:outline-none"
                      aria-label={showPassword ? 'Sembunyikan password' : 'Tampilkan password'}
                    >
                      {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                    </button>
                  }
                />

                {password && (
                  <div className="mt-0.5 flex flex-col gap-1.5">
                    <div className="flex items-center justify-between text-[11px]">
                      <span className="text-dark-muted">Kekuatan Sandi:</span>
                      <span
                        className={`font-semibold ${
                          strength.strength === 'Kuat'
                            ? 'text-status-green'
                            : strength.strength === 'Sedang'
                            ? 'text-status-yellow'
                            : 'text-status-red'
                        }`}
                      >
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
                label="Konfirmasi Password Admin"
                type={showConfirmPassword ? 'text' : 'password'}
                placeholder="Ketik ulang password"
                value={confirmPassword}
                onChange={(e) => {
                  setConfirmPassword(e.target.value);
                  if (error) setError('');
                }}
                disabled={loading}
                autoComplete="new-password"
                rightIcon={
                  <button
                    type="button"
                    onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                    className="p-1 text-dark-muted hover:text-dark-text focus:outline-none"
                    aria-label={showConfirmPassword ? 'Sembunyikan konfirmasi password' : 'Tampilkan konfirmasi password'}
                  >
                    {showConfirmPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                }
              />

              {error && (
                <div className="p-2.5 bg-status-red/10 border border-status-red/30 rounded-btn flex items-start gap-2 text-caption text-status-red">
                  <AlertTriangle size={16} className="flex-shrink-0 mt-0.5" />
                  <span className="leading-snug">{error}</span>
                </div>
              )}

              <div className="mt-1">
                <Button
                  variant="primary"
                  fullWidth
                  type="submit"
                  isLoading={loading}
                  disabled={loading}
                  icon={<KeyRound size={18} />}
                >
                  {loading ? 'Menyimpan Admin...' : 'Buat Akun Admin & Lanjut'}
                </Button>
              </div>
            </form>
          </Card>
        </div>
      </div>
    </div>
  );
};
