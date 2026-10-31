import React from 'react';
import { Card } from './Card';
import { Button } from './Button';
import { ShieldAlert } from 'lucide-react';

interface AccessDeniedViewProps {
  onReturn?: () => void;
  message?: string;
}

export const AccessDeniedView: React.FC<AccessDeniedViewProps> = ({
  onReturn,
  message = 'Halaman ini dilindungi dan hanya dapat diakses oleh Admin Sistem.',
}) => {
  return (
    <div className="flex flex-col items-center justify-center min-h-[50vh] p-4 text-center">
      <Card variant="surface" className="max-w-sm w-full p-6 flex flex-col items-center">
        <div className="w-14 h-14 rounded-full bg-status-red/10 border border-status-red/20 text-status-red flex items-center justify-center mb-4">
          <ShieldAlert size={28} className="stroke-[1.5]" />
        </div>
        <h2 className="text-section-title text-dark-text font-semibold mb-1">
          Akses Ditolak
        </h2>
        <p className="text-caption text-dark-muted mb-6 leading-relaxed">
          {message}
        </p>
        {onReturn && (
          <Button variant="primary" fullWidth onClick={onReturn}>
            Kembali ke Beranda
          </Button>
        )}
      </Card>
    </div>
  );
};
