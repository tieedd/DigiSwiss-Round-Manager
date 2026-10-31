import React from 'react';
import { BottomSheet } from './BottomSheet';
import { Button } from './Button';
import { AlertTriangle, Clock } from 'lucide-react';

interface AdminInactivityWarningProps {
  isOpen: boolean;
  remainingSeconds: number;
  onStayLoggedIn: () => void;
}

export const AdminInactivityWarning: React.FC<AdminInactivityWarningProps> = ({
  isOpen,
  remainingSeconds,
  onStayLoggedIn,
}) => {
  return (
    <BottomSheet isOpen={isOpen} onClose={onStayLoggedIn} title="Peringatan Inaktivitas Sesi">
      <div className="flex flex-col gap-3 py-1">
        <div className="flex items-start gap-3 p-3 rounded-btn bg-status-yellow/10 border border-status-yellow/30 text-caption text-status-yellow">
          <AlertTriangle size={20} className="flex-shrink-0 mt-0.5 stroke-[1.5]" />
          <div>
            <strong className="block text-dark-text">Sesi Admin Akan Berakhir</strong>
            Tidak ada aktivitas terdeteksi selama 29 menit. Sesi administrator akan ditutup otomatis demi keamanan dalam:
          </div>
        </div>

        <div className="flex items-center justify-center py-4">
          <div className="flex items-center gap-2 text-2xl font-bold font-mono text-accent">
            <Clock size={24} className="stroke-[1.5]" />
            <span>{remainingSeconds} detik</span>
          </div>
        </div>

        <div className="mt-1">
          <Button variant="primary" fullWidth onClick={onStayLoggedIn}>
            Tetap Masuk
          </Button>
        </div>
      </div>
    </BottomSheet>
  );
};
