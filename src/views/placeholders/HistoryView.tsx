import React from 'react';
import { Card } from '../../components/common/Card';
import { EmptyState } from '../../components/common/EmptyState';
import { History } from 'lucide-react';

export const HistoryView: React.FC = () => {
  return (
    <div className="flex flex-col gap-4 pb-20">
      <div>
        <h2 className="text-section-title text-dark-text font-semibold">
          Riwayat Turnamen
        </h2>
        <p className="text-caption text-dark-muted">
          Catatan turnamen yang telah selesai diikuti
        </p>
      </div>

      <Card variant="surface" className="my-2">
        <EmptyState
          icon={History}
          message="Belum ada riwayat turnamen yang tercatat untuk akun Anda."
        />
      </Card>
    </div>
  );
};
