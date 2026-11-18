import React, { useState, useEffect, useMemo } from 'react';
import qrcode from 'qrcode-generator';
import { LeagueInvite, Tournament } from '../../types';
import { Card } from '../common/Card';
import { Button } from '../common/Button';
import { StatusBadge } from '../common/StatusBadge';
import { ConfirmSheet } from '../common/ConfirmSheet';
import { useToast } from '../../context/ToastContext';
import { copyTextNative } from '../../services/nativeBridge';
import {
  getLeagueInvitesForTournament,
  regenerateLeagueInviteCode,
  toggleLeagueInviteActive,
} from '../../services/leagueInviteService';
import {
  formatLeagueInviteQrPayload,
  shouldShowLegacyInviteRegenerateWarning,
} from '../../utils/leagueInviteLogic';
import {
  QrCode,
  Copy,
  Check,
  RefreshCw,
  ShieldOff,
  ShieldCheck,
  AlertCircle,
  AlertTriangle,
} from 'lucide-react';

interface LeagueInviteQrCardProps {
  tournament: Tournament;
  actor: { uid: string; name: string };
}

export const LeagueInviteQrCard: React.FC<LeagueInviteQrCardProps> = ({
  tournament,
  actor,
}) => {
  const { success: showToastSuccess, error: showToastError } = useToast();
  const [invites, setInvites] = useState<LeagueInvite[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [copiedTarget, setCopiedTarget] = useState<'code' | 'qr' | null>(null);
  const [regenerateConfirmOpen, setRegenerateConfirmOpen] = useState(false);

  const loadInvites = async () => {
    setLoading(true);
    setErrorMsg(null);
    try {
      const res = await getLeagueInvitesForTournament(
        tournament.id,
        tournament.organizerId
      );
      setInvites(res.invites);
    } catch (err: any) {
      console.error('Gagal memuat undangan liga:', err);
      setErrorMsg(err?.message || 'Gagal memuat kode undangan liga.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadInvites();
  }, [tournament.id, tournament.organizerId]);

  const currentInvite = useMemo(() => {
    return invites.find((i) => i.active) || invites[0] || null;
  }, [invites]);

  const qrPayload = useMemo(() => {
    if (!currentInvite) return '';
    return formatLeagueInviteQrPayload(currentInvite.code);
  }, [currentInvite]);

  const qrMatrix = useMemo(() => {
    if (!qrPayload) return null;
    try {
      const qr = qrcode(0, 'M');
      qr.addData(qrPayload);
      qr.make();
      const count = qr.getModuleCount();
      const rows: boolean[][] = [];
      for (let r = 0; r < count; r++) {
        const row: boolean[] = [];
        for (let c = 0; c < count; c++) {
          row.push(qr.isDark(r, c));
        }
        rows.push(row);
      }
      return { count, rows };
    } catch (err) {
      console.error('Gagal membuat QR undangan:', err);
      return null;
    }
  }, [qrPayload]);

  const handleCopy = async (target: 'code' | 'qr') => {
    if (!currentInvite) return;
    const text = target === 'code' ? currentInvite.code : qrPayload;
    const res = await copyTextNative(text);
    if (res.ok) {
      setCopiedTarget(target);
      setTimeout(() => setCopiedTarget(null), 2000);
      showToastSuccess(
        target === 'code'
          ? 'Kode undangan berhasil disalin'
          : 'Teks QR undangan berhasil disalin'
      );
    } else {
      showToastError('Gagal menyalin ke papan klip');
    }
  };

  const handleRegenerate = async () => {
    if (actionLoading) return;
    setActionLoading(true);
    setErrorMsg(null);
    try {
      await regenerateLeagueInviteCode(tournament, actor);
      await loadInvites();
      setRegenerateConfirmOpen(false);
      showToastSuccess('Kode undangan baru dibuat. Kode lama dinonaktifkan.');
    } catch (err: any) {
      console.error('Gagal membuat ulang kode undangan:', err);
      setErrorMsg(err?.message || 'Gagal membuat ulang kode undangan.');
    } finally {
      setActionLoading(false);
    }
  };

  const handleToggleActive = async () => {
    if (!currentInvite || actionLoading) return;
    const nextActive = !currentInvite.active;
    setActionLoading(true);
    setErrorMsg(null);
    try {
      await toggleLeagueInviteActive(
        currentInvite.code,
        nextActive,
        tournament.id,
        actor
      );
      await loadInvites();
      showToastSuccess(
        nextActive
          ? 'Kode undangan berhasil diaktifkan kembali.'
          : 'Kode undangan berhasil dinonaktifkan.'
      );
    } catch (err: any) {
      console.error('Gagal mengubah status kode undangan:', err);
      setErrorMsg(err?.message || 'Gagal mengubah status kode undangan.');
    } finally {
      setActionLoading(false);
    }
  };

  const quietZone = 2;
  const svgSize = qrMatrix ? qrMatrix.count + quietZone * 2 : 0;

  return (
    <Card
      variant="surface"
      className="flex flex-col gap-3 border-amber-400/30 bg-amber-500/5"
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <QrCode size={18} className="text-amber-300 flex-shrink-0" />
          <span className="text-body font-semibold text-dark-text truncate">
            Undangan Turnamen Liga
          </span>
        </div>
        {currentInvite && (
          <StatusBadge
            label={currentInvite.active ? 'Aktif' : 'Nonaktif'}
            variant={currentInvite.active ? 'green' : 'red'}
          />
        )}
      </div>

      {tournament.status !== 'registration' && (
        <div className="p-2.5 rounded-btn bg-dark-surface-high border border-dark-border text-[11px] text-dark-muted">
          Pendaftaran otomatis tertutup karena turnamen{' '}
          {tournament.status === 'running' ? 'sedang berjalan' : 'sudah selesai'}.
        </div>
      )}

      {shouldShowLegacyInviteRegenerateWarning(currentInvite) && (
        <div className="p-2.5 rounded-btn bg-status-yellow/10 border border-status-yellow/30 text-[11px] text-status-yellow flex items-start gap-2">
          <AlertTriangle size={14} className="flex-shrink-0 mt-0.5" />
          <span>
            Liga ini dibuat sebelum pembaruan keamanan kode undangan. Tekan{' '}
            <strong>&ldquo;Buat Ulang Kode&rdquo;</strong> agar kode lama yang pernah
            tersimpan di data peserta tidak lagi berlaku.
          </span>
        </div>
      )}

      {errorMsg && (
        <div className="p-2.5 rounded-btn bg-status-red/10 border border-status-red/30 text-caption text-status-red flex items-start gap-2">
          <AlertCircle size={15} className="flex-shrink-0 mt-0.5" />
          <span>{errorMsg}</span>
        </div>
      )}

      {loading ? (
        <p className="text-caption text-dark-muted text-center py-4">
          Memuat kode undangan liga...
        </p>
      ) : !currentInvite ? (
        <div className="flex flex-col gap-2 py-2">
          <p className="text-caption text-dark-muted">
            Belum ada kode undangan untuk turnamen liga ini.
          </p>
          <Button
            variant="primary"
            fullWidth
            isLoading={actionLoading}
            onClick={handleRegenerate}
            icon={<RefreshCw size={15} />}
          >
            Buat Kode Undangan
          </Button>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {/* Kode Undangan + QR Code */}
          <div className="flex flex-col sm:flex-row items-center gap-3 p-3 rounded-btn bg-dark-surface-high border border-dark-border">
            {qrMatrix && (
              <div className="bg-white p-2 rounded-lg flex-shrink-0 border border-dark-border">
                <svg
                  width={120}
                  height={120}
                  viewBox={`0 0 ${svgSize} ${svgSize}`}
                  shapeRendering="crispEdges"
                  role="img"
                  aria-label={`QR Undangan Liga ${currentInvite.code}`}
                >
                  <rect width={svgSize} height={svgSize} fill="#FFFFFF" />
                  {qrMatrix.rows.map((row, rIdx) =>
                    row.map((dark, cIdx) =>
                      dark ? (
                        <rect
                          key={`${rIdx}-${cIdx}`}
                          x={cIdx + quietZone}
                          y={rIdx + quietZone}
                          width={1}
                          height={1}
                          fill="#0B0F14"
                        />
                      ) : null
                    )
                  )}
                </svg>
              </div>
            )}

            <div className="flex-1 min-w-0 w-full flex flex-col gap-2 items-center sm:items-start text-center sm:text-left">
              <div className="w-full">
                <span className="text-[11px] text-dark-muted block">
                  Kode Undangan (8 Karakter)
                </span>
                <div className="mt-1 inline-flex items-center gap-2 px-3 py-1.5 rounded-btn bg-dark-bg border border-amber-400/40">
                  <span className="font-mono text-lg font-bold tracking-widest text-amber-300 select-all">
                    {currentInvite.code}
                  </span>
                </div>
              </div>

              <p className="text-[11px] font-mono text-dark-muted break-all">
                {qrPayload}
              </p>

              <div className="flex items-center gap-1.5 flex-wrap justify-center sm:justify-start w-full">
                <Button
                  variant="secondary"
                  className="!min-h-[34px] !px-2.5 !text-[11px]"
                  onClick={() => handleCopy('code')}
                  icon={
                    copiedTarget === 'code' ? (
                      <Check size={13} className="text-status-green" />
                    ) : (
                      <Copy size={13} />
                    )
                  }
                >
                  {copiedTarget === 'code' ? 'Kode Disalin' : 'Salin Kode'}
                </Button>
                <Button
                  variant="secondary"
                  className="!min-h-[34px] !px-2.5 !text-[11px]"
                  onClick={() => handleCopy('qr')}
                  icon={
                    copiedTarget === 'qr' ? (
                      <Check size={13} className="text-status-green" />
                    ) : (
                      <Copy size={13} />
                    )
                  }
                >
                  {copiedTarget === 'qr' ? 'Teks QR Disalin' : 'Salin Teks QR'}
                </Button>
              </div>
            </div>
          </div>

          {/* Kontrol Organizer: Buat Ulang & Nonaktifkan/Aktifkan */}
          <div className="grid grid-cols-2 gap-2">
            <Button
              variant="secondary"
              className="!min-h-[38px] !text-caption"
              disabled={actionLoading}
              onClick={() => setRegenerateConfirmOpen(true)}
              icon={<RefreshCw size={14} />}
            >
              Buat Ulang Kode
            </Button>
            <Button
              variant={currentInvite.active ? 'danger' : 'primary'}
              className="!min-h-[38px] !text-caption"
              isLoading={actionLoading}
              disabled={actionLoading}
              onClick={handleToggleActive}
              icon={
                currentInvite.active ? (
                  <ShieldOff size={14} />
                ) : (
                  <ShieldCheck size={14} />
                )
              }
            >
              {currentInvite.active ? 'Nonaktifkan Kode' : 'Aktifkan Kode'}
            </Button>
          </div>
        </div>
      )}

      <ConfirmSheet
        isOpen={regenerateConfirmOpen}
        title="Buat Ulang Kode Undangan?"
        message="Kode undangan saat ini akan dinonaktifkan dan diganti dengan kode baru 8 karakter. Pemain yang belum mendaftar harus menggunakan kode yang baru."
        confirmLabel="Ya, Buat Ulang"
        cancelLabel="Batal"
        variant="primary"
        isLoading={actionLoading}
        zIndexClass="z-[70]"
        onConfirm={handleRegenerate}
        onCancel={() => {
          if (!actionLoading) setRegenerateConfirmOpen(false);
        }}
      />
    </Card>
  );
};
