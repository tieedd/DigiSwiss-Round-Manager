import React, { useState, useEffect } from 'react';
import { AuditLog } from '../../types';
import { BottomSheet } from '../../components/common/BottomSheet';
import { Card } from '../../components/common/Card';
import { EmptyState } from '../../components/common/EmptyState';
import { getTournamentAuditLogs } from '../../services/roundService';
import { formatIndonesianDateTime } from '../../utils/dateHelpers';
import { formatAuditLogValue } from '../../utils/auditLogDisplay';
import { ShieldAlert, RefreshCw, Clock, User } from 'lucide-react';

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
      <div className="flex flex-col gap-3 py-2 pb-6 max-h-[70vh] overflow-y-auto min-w-0">
        <div className="flex items-center justify-between gap-2 flex-wrap px-1 min-w-0">
          <span className="text-caption text-dark-muted">
            Riwayat aksi sensitif, perubahan skor, dan revert ronde:
          </span>
          <button
            type="button"
            onClick={fetchLogs}
            disabled={loading}
            className="text-caption text-accent hover:underline flex items-center gap-1 flex-shrink-0"
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
          <div className="flex flex-col gap-2 min-w-0">
            {logs.map((log) => {
              const hasValues = Boolean(log.oldValue || log.newValue);
              const oldFormatted = hasValues ? formatAuditLogValue(log.oldValue) : null;
              const newFormatted = hasValues ? formatAuditLogValue(log.newValue) : null;

              return (
                <Card
                  key={log.id}
                  variant="surface-high"
                  className="flex flex-col gap-1.5 p-3 text-caption min-w-0 overflow-x-clip"
                >
                  <div className="flex items-center justify-between gap-2 flex-wrap border-b border-dark-border/60 pb-1.5 min-w-0">
                    <span className="font-mono text-accent font-semibold min-w-0 max-w-full break-words [overflow-wrap:anywhere]">
                      {log.action}
                    </span>
                    <div className="flex items-center gap-1 text-[11px] text-dark-muted font-mono whitespace-nowrap flex-shrink-0">
                      <Clock size={11} />
                      <span>{formatIndonesianDateTime(log.createdAt)}</span>
                    </div>
                  </div>

                  <div className="flex items-start gap-1.5 text-dark-text mt-0.5 min-w-0">
                    <User size={13} className="text-dark-muted flex-shrink-0 mt-0.5" />
                    <span className="min-w-0 break-words [overflow-wrap:anywhere]">
                      Pelaku: <strong className="text-dark-text break-words [overflow-wrap:anywhere]">{log.actorName}</strong>
                    </span>
                  </div>

                  <div className="text-[11px] text-dark-muted min-w-0 break-words [overflow-wrap:anywhere]">
                    Target:{' '}
                    <span className="font-mono text-dark-text break-words [overflow-wrap:anywhere]">
                      {log.target}
                    </span>
                  </div>

                  {hasValues && oldFormatted && newFormatted && (
                    <div className="mt-1 pt-1.5 border-t border-dark-border/40 grid grid-cols-1 sm:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] gap-2 items-start bg-dark-bg/40 p-2 rounded text-[11px] font-mono min-w-0">
                      <div className="min-w-0">
                        <span className="text-dark-muted block font-sans mb-0.5">Nilai Lama:</span>
                        {oldFormatted.kind === 'json' ? (
                          <div className="flex flex-col gap-0.5 min-w-0 text-status-red">
                            {oldFormatted.lines.map((item, idx) => (
                              <div
                                key={`${item.key}-${idx}`}
                                className="whitespace-pre-wrap break-words [overflow-wrap:anywhere] min-w-0"
                              >
                                <span className="text-dark-muted">{item.key}:</span> {item.value}
                              </div>
                            ))}
                          </div>
                        ) : (
                          <span className="text-status-red whitespace-pre-wrap break-words [overflow-wrap:anywhere] block min-w-0">
                            {oldFormatted.text}
                          </span>
                        )}
                      </div>

                      <div
                        aria-hidden="true"
                        className="text-dark-muted font-sans flex-shrink-0 select-none sm:self-center leading-none"
                      >
                        &rarr;
                      </div>

                      <div className="min-w-0">
                        <span className="text-dark-muted block font-sans mb-0.5">Nilai Baru:</span>
                        {newFormatted.kind === 'json' ? (
                          <div className="flex flex-col gap-0.5 min-w-0 text-status-green">
                            {newFormatted.lines.map((item, idx) => (
                              <div
                                key={`${item.key}-${idx}`}
                                className="whitespace-pre-wrap break-words [overflow-wrap:anywhere] min-w-0"
                              >
                                <span className="text-dark-muted">{item.key}:</span> {item.value}
                              </div>
                            ))}
                          </div>
                        ) : (
                          <span className="text-status-green whitespace-pre-wrap break-words [overflow-wrap:anywhere] block min-w-0">
                            {newFormatted.text}
                          </span>
                        )}
                      </div>
                    </div>
                  )}
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </BottomSheet>
  );
};
