import React, { useState, useEffect, useMemo } from 'react';
import { collection, getDocs, query, orderBy, limit } from 'firebase/firestore';
import { db } from '../../firebaseConfig';
import { AuditLog } from '../../types';
import { useAuth } from '../../context/AuthContext';
import { CURRENT_APP_VERSION } from '../../services/versionService';
import { Card } from '../../components/common/Card';
import { Button } from '../../components/common/Button';
import { BottomSheet } from '../../components/common/BottomSheet';
import { ChangePasswordView } from '../ChangePasswordView';
import { formatIndonesianDateTime } from '../../utils/dateHelpers';
import {
  ShieldCheck,
  History,
  LogOut,
  KeyRound,
  Clock,
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
  RefreshCw,
  Info
} from 'lucide-react';

const LOGS_PAGE_SIZE = 20;

export const AdminSettingsView: React.FC = () => {
  const { userProfile, clockOffset, logout } = useAuth();
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [loadingLogs, setLoadingLogs] = useState(false);
  const [currentLogsPage, setCurrentLogsPage] = useState(1);

  const [isChangePassOpen, setIsChangePassOpen] = useState(false);
  const [isLogoutConfirmOpen, setIsLogoutConfirmOpen] = useState(false);

  const fetchAuditLogs = async () => {
    setLoadingLogs(true);
    try {
      // Query audit logs terbaru dengan limit hemat kuota (maksimal 200)
      const q = query(collection(db, 'auditLogs'), orderBy('createdAt', 'desc'), limit(200));
      const snap = await getDocs(q);
      const list: AuditLog[] = [];
      snap.forEach((d) => {
        list.push({ ...(d.data() as AuditLog), id: d.id });
      });
      setLogs(list);
    } catch (err) {
      console.error('Gagal mengambil audit logs:', err);
    } finally {
      setLoadingLogs(false);
    }
  };

  useEffect(() => {
    fetchAuditLogs();
  }, []);

  // Paginasi Log Keamanan (20 item per halaman)
  const totalLogsPages = Math.max(1, Math.ceil(logs.length / LOGS_PAGE_SIZE));
  const paginatedLogs = useMemo(() => {
    const start = (currentLogsPage - 1) * LOGS_PAGE_SIZE;
    return logs.slice(start, start + LOGS_PAGE_SIZE);
  }, [logs, currentLogsPage]);

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h2 className="text-section-title text-dark-text font-semibold">
          Pengaturan Admin
        </h2>
        <p className="text-caption text-dark-muted">
          Pusat kontrol sistem, informasi versi, dan audit keamanan
        </p>
      </div>

      {/* Informasi Versi & Sesi Admin */}
      <Card variant="surface" className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-btn bg-accent/10 text-accent flex items-center justify-center">
              <ShieldCheck size={22} className="stroke-[1.5]" />
            </div>
            <div>
              <h3 className="text-body font-semibold text-dark-text">
                DigiSwiss-Round
              </h3>
              <p className="text-caption text-dark-muted font-mono">
                Versi aplikasi: v{CURRENT_APP_VERSION} &bull; Akun: @{userProfile?.username}
              </p>
            </div>
          </div>
          <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-accent/10 text-accent border border-accent/30 font-semibold">
            Admin Utama
          </span>
        </div>

        <div className="pt-2 border-t border-dark-border flex flex-col gap-1.5 text-caption">
          <div className="flex items-center justify-between text-dark-muted">
            <span className="flex items-center gap-1.5">
              <Clock size={14} />
              <span>Deviasi Jam Server:</span>
            </span>
            <span className="font-mono text-dark-text tabular-nums">
              {clockOffset >= 0 ? `+${clockOffset}ms` : `${clockOffset}ms`}
            </span>
          </div>
          <div className="flex items-center justify-between text-dark-muted">
            <span className="flex items-center gap-1.5">
              <AlertTriangle size={14} />
              <span>Batas Sesi Inaktivitas:</span>
            </span>
            <span className="font-mono text-dark-text">30 Menit (Peringatan di menit ke-29)</span>
          </div>
        </div>
      </Card>

      {/* Aksi Keamanan Admin */}
      <div className="flex flex-col gap-2">
        <h3 className="text-body font-semibold text-dark-text px-1">
          Aksi Keamanan
        </h3>
        <Card
          variant="surface"
          className="cursor-pointer hover:border-dark-muted/40 transition-colors flex items-center justify-between p-3.5"
          onClick={() => setIsChangePassOpen(true)}
        >
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-btn bg-dark-surface-high flex items-center justify-center text-accent">
              <KeyRound size={18} className="stroke-[1.5]" />
            </div>
            <div>
              <span className="text-body font-medium text-dark-text block">
                Ganti Password Admin
              </span>
              <span className="text-caption text-dark-muted">
                Minimal 12 karakter dengan indikator kekuatan sandi
              </span>
            </div>
          </div>
          <span className="text-caption text-dark-muted">&rarr;</span>
        </Card>

        <Card
          variant="surface"
          className="cursor-pointer hover:border-status-red/40 transition-colors flex items-center justify-between p-3.5"
          onClick={() => setIsLogoutConfirmOpen(true)}
        >
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-btn bg-status-red/10 flex items-center justify-center text-status-red">
              <LogOut size={18} className="stroke-[1.5]" />
            </div>
            <div>
              <span className="text-body font-medium text-status-red block">
                Keluar dari Akun Admin
              </span>
              <span className="text-caption text-dark-muted">
                Tutup sesi administrator sistem
              </span>
            </div>
          </div>
        </Card>
      </div>

      {/* Log Keamanan (Audit Logs dengan Paginasi 20 per Halaman) */}
      <div className="flex flex-col gap-2 mt-1">
        <div className="flex items-center justify-between px-1">
          <div className="flex items-center gap-2">
            <History size={16} className="text-accent stroke-[1.5]" />
            <h3 className="text-body font-semibold text-dark-text">
              Log Keamanan ({logs.length} Total)
            </h3>
          </div>
          <button
            type="button"
            onClick={fetchAuditLogs}
            className="text-caption text-accent hover:underline flex items-center gap-1"
          >
            <RefreshCw size={12} className={loadingLogs ? 'animate-spin' : ''} />
            <span>Segarkan</span>
          </button>
        </div>

        <Card variant="surface" padding="sm" className="flex flex-col gap-2 border-dark-border">
          {loadingLogs ? (
            <p className="text-caption text-dark-muted text-center py-6">
              Memuat log keamanan...
            </p>
          ) : logs.length === 0 ? (
            <p className="text-caption text-dark-muted text-center py-6">
              Belum ada catatan aktivitas keamanan.
            </p>
          ) : (
            <div className="flex flex-col divide-y divide-dark-border/80">
              {paginatedLogs.map((log) => (
                <div key={log.id} className="py-2.5 first:pt-1 last:pb-1 flex flex-col gap-1 text-caption">
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <span className="font-semibold text-accent font-mono text-[11px] px-1.5 py-0.5 rounded bg-accent/10 border border-accent/20">
                      {log.action}
                    </span>
                    <span className="text-dark-muted text-[11px] tabular-nums">
                      {formatIndonesianDateTime(log.createdAt)}
                    </span>
                  </div>

                  <div className="text-dark-text mt-0.5">
                    Pelaku: <strong className="text-dark-text">{log.actorName}</strong> &bull; Target:{' '}
                    <span className="font-mono text-dark-muted text-[12px]">{log.target}</span>
                  </div>

                  {log.oldValue && log.newValue && (
                    <div className="text-[11px] text-dark-muted font-mono bg-dark-surface-high/60 px-2 py-1 rounded border border-dark-border mt-0.5">
                      <span className="text-status-red">{log.oldValue}</span> &rarr;{' '}
                      <span className="text-status-green">{log.newValue}</span>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Kontrol Paginasi Log Keamanan (20 per Halaman) */}
          {totalLogsPages > 1 && (
            <div className="flex items-center justify-between pt-2 border-t border-dark-border px-1 text-caption text-dark-muted">
              <span>
                Halaman <strong className="text-dark-text">{currentLogsPage}</strong> dari{' '}
                <strong className="text-dark-text">{totalLogsPages}</strong>
              </span>
              <div className="flex items-center gap-1.5">
                <Button
                  variant="secondary"
                  className="!min-h-[32px] !px-2 !text-[11px]"
                  disabled={currentLogsPage <= 1}
                  onClick={() => setCurrentLogsPage((p) => Math.max(1, p - 1))}
                  icon={<ChevronLeft size={14} />}
                >
                  Sebelumnya
                </Button>
                <Button
                  variant="secondary"
                  className="!min-h-[32px] !px-2 !text-[11px]"
                  disabled={currentLogsPage >= totalLogsPages}
                  onClick={() => setCurrentLogsPage((p) => Math.min(totalLogsPages, p + 1))}
                >
                  <span className="flex items-center gap-1">
                    <span>Berikutnya</span>
                    <ChevronRight size={14} />
                  </span>
                </Button>
              </div>
            </div>
          )}
        </Card>
      </div>

      {/* Bottom Sheet Ganti Password */}
      <BottomSheet
        isOpen={isChangePassOpen}
        onClose={() => setIsChangePassOpen(false)}
        title="Ganti Password Admin"
      >
        <ChangePasswordView
          forced={false}
          onSuccess={() => setIsChangePassOpen(false)}
          onCancel={() => setIsChangePassOpen(false)}
        />
      </BottomSheet>

      {/* Bottom Sheet Logout */}
      <BottomSheet
        isOpen={isLogoutConfirmOpen}
        onClose={() => setIsLogoutConfirmOpen(false)}
        title="Konfirmasi Keluar"
      >
        <div className="flex flex-col gap-3 py-2">
          <p className="text-body text-dark-muted">
            Apakah Anda yakin ingin mengakhiri sesi Administrator?
          </p>
          <div className="flex flex-col gap-2 mt-2">
            <Button
              variant="danger"
              fullWidth
              onClick={() => {
                setIsLogoutConfirmOpen(false);
                logout();
              }}
              icon={<LogOut size={18} />}
            >
              Ya, Keluar
            </Button>
            <Button
              variant="secondary"
              fullWidth
              onClick={() => setIsLogoutConfirmOpen(false)}
            >
              Batal
            </Button>
          </div>
        </div>
      </BottomSheet>
    </div>
  );
};
