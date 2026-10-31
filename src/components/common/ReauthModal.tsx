import React, { useState } from 'react';
import { BottomSheet } from './BottomSheet';
import { Button } from './Button';
import { Input } from './Input';
import { reauthenticateCurrentUser } from '../../services/authService';
import { ShieldCheck, Eye, EyeOff } from 'lucide-react';

interface ReauthModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  actionTitle?: string;
  actionDescription?: string;
}

export const ReauthModal: React.FC<ReauthModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
  actionTitle = 'Konfirmasi Keamanan',
  actionDescription = 'Masukkan password akun Anda untuk melanjutkan aksi sensitif ini.',
}) => {
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!password) {
      setError('Password konfirmasi wajib diisi.');
      return;
    }

    setLoading(true);
    setError('');
    try {
      await reauthenticateCurrentUser(password);
      setPassword('');
      onSuccess();
      onClose();
    } catch (err: any) {
      setError(err?.message || 'Password tidak sesuai.');
    } finally {
      setLoading(false);
    }
  };

  const handleCancel = () => {
    setPassword('');
    setError('');
    onClose();
  };

  return (
    <BottomSheet isOpen={isOpen} onClose={handleCancel} title={actionTitle}>
      <form onSubmit={handleSubmit} className="flex flex-col gap-3 py-1">
        <div className="flex items-start gap-2.5 p-3 rounded-btn bg-status-yellow/10 border border-status-yellow/30 text-caption text-status-yellow">
          <ShieldCheck size={18} className="flex-shrink-0 mt-0.5 stroke-[1.5]" />
          <span>{actionDescription}</span>
        </div>

        <Input
          label="Password Konfirmasi"
          type={showPassword ? 'text' : 'password'}
          placeholder="Password"
          value={password}
          onChange={(e) => {
            setPassword(e.target.value);
            if (error) setError('');
          }}
          error={error}
          disabled={loading}
          autoComplete="current-password"
          rightIcon={
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="p-1 text-dark-muted hover:text-dark-text focus:outline-none"
              aria-label={showPassword ? 'Sembunyikan' : 'Tampilkan'}
            >
              {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
            </button>
          }
        />

        <div className="flex flex-col gap-2 mt-2">
          <Button variant="primary" fullWidth type="submit" isLoading={loading}>
            Konfirmasi Aksi
          </Button>
          <Button variant="secondary" fullWidth type="button" onClick={handleCancel} disabled={loading}>
            Batal
          </Button>
        </div>
      </form>
    </BottomSheet>
  );
};
