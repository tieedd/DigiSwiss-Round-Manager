import React, { useState } from 'react';
import { Card } from '../components/common/Card';
import { Button } from '../components/common/Button';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { setupUserPin } from '../services/pinService';
import { isWeakPin, isPinFormatValid } from '../utils/pinSecurityLogic';
import { ShieldCheck, Lock, AlertCircle, ArrowRight, RotateCcw, LogOut } from 'lucide-react';

export const CreatePinView: React.FC = () => {
  const { currentUser, userProfile, refreshPinStatus, logout } = useAuth();
  const toast = useToast();

  const [step, setStep] = useState<1 | 2>(1);
  const [pin, setPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const currentInput = step === 1 ? pin : confirmPin;

  const handleDigitPress = (digit: string) => {
    if (error) setError('');
    if (step === 1) {
      if (pin.length < 6) {
        const next = pin + digit;
        setPin(next);
        if (next.length === 6) {
          const weak = isWeakPin(next);
          if (weak.isWeak) {
            setError(weak.reason || 'Kombinasi PIN terlalu mudah ditebak.');
          }
        }
      }
    } else {
      if (confirmPin.length < 6) {
        setConfirmPin(confirmPin + digit);
      }
    }
  };

  const handleDeleteDigit = () => {
    if (error) setError('');
    if (step === 1) {
      setPin((prev) => prev.slice(0, -1));
    } else {
      setConfirmPin((prev) => prev.slice(0, -1));
    }
  };

  const handleClear = () => {
    setError('');
    if (step === 1) {
      setPin('');
    } else {
      setConfirmPin('');
    }
  };

  const handleNextStep = () => {
    if (!isPinFormatValid(pin)) {
      setError('Masukkan lengkap 6 digit PIN.');
      return;
    }
    const weak = isWeakPin(pin);
    if (weak.isWeak) {
      setError(weak.reason || 'Kombinasi PIN terlalu mudah ditebak.');
      return;
    }
    setError('');
    setStep(2);
  };

  const handleBackToStep1 = () => {
    setError('');
    setConfirmPin('');
    setStep(1);
  };

  const handleSubmit = async () => {
    if (confirmPin.length !== 6) {
      setError('Masukkan lengkap 6 digit PIN konfirmasi.');
      return;
    }
    if (pin !== confirmPin) {
      setError('PIN konfirmasi tidak cocok dengan PIN yang pertama.');
      return;
    }
    if (!currentUser) return;

    setLoading(true);
    setError('');
    try {
      await setupUserPin(currentUser.uid, pin);
      toast.success('PIN Berhasil Dibuat', 'PIN keamanan akun Anda aktif dan terlindungi.');
      await refreshPinStatus();
    } catch (err: any) {
      setError(err?.message || 'Gagal menyimpan PIN keamanan.');
      toast.error('Gagal membuat PIN', err?.message || 'Terjadi kesalahan sistem.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-dark-bg text-dark-text flex flex-col justify-center px-4 py-8 safe-top safe-bottom">
      <div className="w-full max-w-sm mx-auto flex flex-col gap-4">
        {/* Header Identitas */}
        <div className="flex flex-col items-center text-center">
          <div className="w-14 h-14 rounded-2xl bg-dark-surface border border-dark-border flex items-center justify-center text-accent mb-3">
            <ShieldCheck size={28} />
          </div>
          <h1 className="text-page-title text-dark-text font-bold">
            Atur PIN Keamanan 6-Digit
          </h1>
          <p className="text-caption text-dark-muted mt-1 max-w-[280px]">
            PIN keamanan digunakan untuk otentikasi tindakan sensitif seperti perubahan password akun.
          </p>
        </div>

        {/* Kartu Form */}
        <Card variant="surface" className="flex flex-col gap-5 p-5">
          <div className="text-center">
            <span className="text-caption font-semibold text-accent uppercase tracking-wider">
              Langkah {step} dari 2
            </span>
            <h2 className="text-body font-semibold text-dark-text mt-0.5">
              {step === 1 ? 'Buat 6-Digit PIN Baru' : 'Konfirmasi 6-Digit PIN Anda'}
            </h2>
            <p className="text-[12px] text-dark-muted mt-0.5">
              {step === 1
                ? 'Pilih 6 digit angka yang mudah Anda ingat namun sulit ditebak orang lain.'
                : 'Ketik ulang 6 digit PIN yang sama untuk memastikan tidak ada kesalahan.'}
            </p>
          </div>

          {/* Kotak Tampilan 6 Digit (Disguised Dots) */}
          <div className="flex items-center justify-center gap-2.5 my-1">
            {[0, 1, 2, 3, 4, 5].map((idx) => {
              const hasDigit = idx < currentInput.length;
              return (
                <div
                  key={idx}
                  className={`w-11 h-12 rounded-xl flex items-center justify-center border transition-all ${
                    hasDigit
                      ? 'border-accent bg-accent/10 scale-105'
                      : 'border-dark-border bg-dark-bg'
                  }`}
                >
                  {hasDigit ? (
                    <div className="w-3.5 h-3.5 rounded-full bg-accent" />
                  ) : (
                    <div className="w-2 h-2 rounded-full bg-dark-border" />
                  )}
                </div>
              );
            })}
          </div>

          {/* Pesan Kesalahan / Warning */}
          {error && (
            <div className="p-3 bg-status-red/10 border border-status-red/30 rounded-btn flex items-start gap-2 text-caption text-status-red">
              <AlertCircle size={16} className="flex-shrink-0 mt-0.5" />
              <span className="leading-snug">{error}</span>
            </div>
          )}

          {/* Papan Tombol Angka (Numeric Keypad) */}
          <div className="grid grid-cols-3 gap-2">
            {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((digit) => (
              <button
                key={digit}
                type="button"
                onClick={() => handleDigitPress(digit)}
                disabled={loading || currentInput.length >= 6}
                className="h-12 rounded-xl bg-dark-surface-high border border-dark-border/80 text-dark-text font-bold text-lg active:bg-dark-border transition-colors flex items-center justify-center disabled:opacity-50 select-none"
              >
                {digit}
              </button>
            ))}
            <button
              type="button"
              onClick={handleClear}
              disabled={loading || currentInput.length === 0}
              className="h-12 rounded-xl bg-dark-surface border border-dark-border/60 text-dark-muted font-medium text-xs active:bg-dark-border transition-colors flex items-center justify-center disabled:opacity-30 select-none"
            >
              Hapus
            </button>
            <button
              type="button"
              onClick={() => handleDigitPress('0')}
              disabled={loading || currentInput.length >= 6}
              className="h-12 rounded-xl bg-dark-surface-high border border-dark-border/80 text-dark-text font-bold text-lg active:bg-dark-border transition-colors flex items-center justify-center disabled:opacity-50 select-none"
            >
              0
            </button>
            <button
              type="button"
              onClick={handleDeleteDigit}
              disabled={loading || currentInput.length === 0}
              className="h-12 rounded-xl bg-dark-surface border border-dark-border/60 text-dark-text active:bg-dark-border transition-colors flex items-center justify-center disabled:opacity-30 select-none"
              aria-label="Hapus satu angka"
            >
              <RotateCcw size={18} />
            </button>
          </div>

          {/* Tombol Aksi Bawah */}
          <div className="flex flex-col gap-2 mt-1">
            {step === 1 ? (
              <Button
                variant="primary"
                onClick={handleNextStep}
                disabled={pin.length !== 6 || Boolean(error)}
                className="w-full flex items-center justify-center gap-2"
              >
                <span>Lanjut ke Konfirmasi</span>
                <ArrowRight size={16} />
              </Button>
            ) : (
              <div className="flex flex-col gap-2">
                <Button
                  variant="primary"
                  onClick={handleSubmit}
                  isLoading={loading}
                  disabled={confirmPin.length !== 6 || loading}
                  className="w-full"
                >
                  Simpan & Aktifkan PIN
                </Button>
                <Button
                  variant="text"
                  onClick={handleBackToStep1}
                  disabled={loading}
                  className="w-full text-dark-muted text-caption"
                >
                  Ubah PIN Pertama
                </Button>
              </div>
            )}
          </div>
        </Card>

        {/* Pilihan Keluar */}
        <div className="text-center">
          <button
            type="button"
            onClick={logout}
            className="text-caption text-dark-muted hover:text-status-red transition-colors inline-flex items-center gap-1.5"
          >
            <LogOut size={13} />
            <span>Keluar Akun ({userProfile?.displayName || userProfile?.username})</span>
          </button>
        </div>
      </div>
    </div>
  );
};
