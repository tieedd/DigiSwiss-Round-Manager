import React, { useState, useEffect } from 'react';
import { AuditLog } from '../../types';
import { BottomSheet } from '../../components/common/BottomSheet';
import { Card } from '../../components/common/Card';
import { EmptyState } from '../../components/common/EmptyState';
import { getTournamentAuditLogs } from '../../services/roundService';
import { formatIndonesianDateTime } from '../../utils/dateHelpers';
import { ShieldAlert, RefreshCw, Clock, User, ArrowRight } from 'lucide-react';

interface TournamentAuditLogModalProps {
  isOpen: boolean;
  onClose: () => void;
  tournamentId: string;
  tournamentName: string;
}

export const TournamentAuditLogModal: React.FC<TournamentAuditLogModalProps> = ({
  isOpen,
  onClose,
  tournamentId,
  tournamentName,
}) => {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchLogs = async () => {
    if (!tournamentId) return;
    setLoading(true);
    try {
      const data = await getTournamentAuditLogs(tournamentId);
      setLogs(data);
    } catch (err) {
      console.error('Gagal memuat log audit turnamen:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen && tournamentId) {
      fetchLogs();
    }
  }, [isOpen, tournamentId]);

  if (!isOpen) return null;

  return (
    <BottomSheet
      isOpen={isOpen}
      onClose={onClose}
      title={`Log Keamanan: ${tournamentName}`}
    >
      <div className="flex flex-col gap-3 py-2 pb-6 max-h-[70vh] overflow-y-auto">
        <div className="flex items-center justify-between px-1">
          <span className="text-caption text-dark-muted">
            Riwayat aksi sensitif, perubahan skor, dan revert ronde:
          </span>
          <button
            type="button"
            onClick={fetchLogs}
            disabled={loading}
            className="text-caption text-accent hover:underline flex items-center gap-1"
          >
            <RefreshCw size={12} className={loading ? 'animate-spin' : ''} />
            Muat Ulang
          </button>
        </div>

        {loading ? (
          <Card variant="surface" className="text-center py-8 text-caption text-dark-muted">
            Memuat catatan log audit...
          </Card>
        ) : logs.length === 0 ? (
          <Card variant="surface" className="my-2">
            <EmptyState
              icon={ShieldAlert}
              message="Belum ada riwayat aktivitas keamanan atau modifikasi hasil pada turnamen ini."
            />
          </Card>
        ) : (
          <div className="flex flex-col gap-2">
            {logs.map((log) => (
              <Card key={log.id} variant="surface-high" className="flex flex-col gap-1.5 p-3 text-caption">
                <div className="flex items-center justify-between gap-2 border-b border-dark-border/60 pb-1.5">
                  <span className="font-mono text-accent font-semibold">{log.action}</span>
                  <div className="flex items-center gap-1 text-[11px] text-dark-muted font-mono">
                    <Clock size={11} />
                    <span>{formatIndonesianDateTime(log.createdAt)}</span>
                  </div>
                </div>

                <div className="flex items-center gap-1.5 text-dark-text mt-0.5">
                  <User size={13} className="text-dark-muted" />
                  <span>Pelaku: <strong className="text-dark-text">{log.actorName}</strong></span>
                </div>

                <div className="text-[11px] text-dark-muted">
                  Target: <span className="font-mono text-dark-text">{log.target}</span>
                </div>

                {(log.oldValue || log.newValue) && (
                  <div className="mt-1 pt-1.5 border-t border-dark-border/40 grid grid-cols-2 gap-2 bg-dark-bg/40 p-2 rounded text-[11px] font-mono">
                    <div>
                      <span className="text-dark-muted block">Nilai Lama:</span>
                      <span className="text-status-red">{log.oldValue || '-'}</span>
                    </div>
                    <div>
                      <span className="text-dark-muted block">Nilai Baru:</span>
                      <span className="text-status-green">{log.newValue || '-'}</span>
                    </div>
                  </div>
                )}
              </Card>
            ))}
          </div>
        )}
      </div>
    </BottomSheet>
  );
};
