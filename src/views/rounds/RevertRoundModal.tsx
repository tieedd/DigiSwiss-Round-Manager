import React, { useState } from 'react';
import { BottomSheet } from '../../components/common/BottomSheet';
import { Button } from '../../components/common/Button';
import { Card } from '../../components/common/Card';
import { AlertTriangle, History, ArrowRight } from 'lucide-react';

interface RevertRoundModalProps {
  isOpen: boolean;
  onClose: () => void;
  targetRoundNumber: number;
  currentRoundNumber: number;
  onConfirmRevert: (targetRound: number) => Promise<void>;
}

export const RevertRoundModal: React.FC<RevertRoundModalProps> = ({
  isOpen,
  onClose,
  targetRoundNumber,
  currentRoundNumber,
  onConfirmRevert,
}) => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  if (!isOpen) return null;

  const handleExecute = async () => {
    setLoading(true);
    setError('');
    try {
      await onConfirmRevert(targetRoundNumber);
      onClose();
    } catch (err: any) {
      setError(err.message || 'Gagal melakukan revert ronde.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <BottomSheet
      isOpen={isOpen}
      onClose={onClose}
      title={`Peringatan Revert ke Ronde ${targetRoundNumber}`}
    >
      <div className="flex flex-col gap-4 py-2 pb-6">
        {/* Banner Peringatan */}
        <div className="p-3.5 rounded-card bg-status-yellow/10 border border-status-yellow/30 text-status-yellow flex items-start gap-2.5">
          <AlertTriangle size={20} className="flex-shrink-0 mt-0.5" />
          <div className="text-caption">
            <span className="font-bold text-body block mb-0.5">Konfirmasi Pembatalan Progres Ronde</span>
            <span>
              Anda akan memundurkan turnamen dari <strong>Ronde {currentRoundNumber}</strong> kembali ke <strong>Ronde {targetRoundNumber}</strong>.
            </span>
          </div>
        </div>

        {/* Daftar Dampak (Impact List) */}
        <Card variant="surface-high" className="flex flex-col gap-2 p-3">
          <span className="text-[11px] font-mono text-dark-muted uppercase font-semibold">
            Daftar Dampak Tindakan:
          </span>
          <ul className="text-caption text-dark-text space-y-2 list-disc list-inside">
            <li>
              Seluruh ronde dan pertandingan <strong>setelah Ronde {targetRoundNumber}</strong> akan <strong>diarsipkan</strong> (tidak dihapus permanen).
            </li>
            <li>
              Klasemen dan perolehan poin akan <strong>otomatis dihitung ulang</strong> hanya berdasarkan data ronde yang aktif (1 s.d. {targetRoundNumber}).
            </li>
            <li>
              Status turnamen kembali menjadi <strong>Sedang Berjalan (running)</strong>.
            </li>
            <li>
              Anda dapat mengoreksi skor pertandingan di Ronde {targetRoundNumber}. Setelah semua pertandingan confirmed lagi, sistem akan <strong>otomatis membuat ulang pairing Ronde {targetRoundNumber + 1}</strong>.
            </li>
            <li>
              Tindakan ini akan dicatat ke <strong>Log Audit Keamanan</strong> turnamen.
            </li>
          </ul>
        </Card>

        {error && (
          <p className="text-caption text-status-red text-center">{error}</p>
        )}

        <div className="flex flex-col gap-2 mt-2">
          <Button
            variant="danger"
            fullWidth
            onClick={handleExecute}
            isLoading={loading}
            icon={<History size={16} />}
          >
            Ya, Revert ke Ronde {targetRoundNumber}
          </Button>
          <Button
            variant="secondary"
            fullWidth
            onClick={onClose}
            disabled={loading}
          >
            Batal
          </Button>
        </div>
      </div>
    </BottomSheet>
  );
};
