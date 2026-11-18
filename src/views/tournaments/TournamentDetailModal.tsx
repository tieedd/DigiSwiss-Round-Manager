import React, { useState, useEffect } from 'react';
import {
  Tournament,
  TournamentPlayer,
  PlayerStatus
} from '../../types';
import { useAuth } from '../../context/AuthContext';
import { Card } from '../../components/common/Card';
import { Button } from '../../components/common/Button';
import { Input } from '../../components/common/Input';
import { StatusBadge } from '../../components/common/StatusBadge';
import { BottomSheet } from '../../components/common/BottomSheet';
import { ConfirmSheet } from '../../components/common/ConfirmSheet';
import { ReauthModal } from '../../components/common/ReauthModal';
import { TournamentFormSheet } from '../../components/tournaments/TournamentFormSheet';
import {
  createTournament,
  updateTournamentDetails,
  getTournamentPlayers,
  registerPlayer,
  cancelRegistration,
  addManualPlayer,
  updatePlayerStatus,
  acceptAllWaitingPlayers,
  startTournament,
  dropPlayer,
  deleteTournament
} from '../../services/tournamentService';
import { TournamentAuditLogModal } from '../rounds/TournamentAuditLogModal';
import { calculateSwissRounds } from '../../utils/swissLogic';
import { FinalStandingsCard } from '../history/FinalStandingsCard';
import { generateStandingsText } from '../../utils/deckExportLogic';
import { getTournamentParticipations } from '../../services/participationService';
import { copyTextNative } from '../../services/nativeBridge';
import { useToast } from '../../context/ToastContext';
import {
  findAccountPlayerWithSameName,
  detectPreflightIssues,
} from '../../utils/playerLinkLogic';
import {
  buildWaitingStatusConfirmContent,
  filterWaitingPlayers,
  getAlreadyProcessedMessage,
  getWaitingStatusSuccessToast,
  isPlayerStillWaitingInList,
  WaitingStatusConfirmRequest,
} from '../../utils/playerStatusConfirmLogic';
import {
  buildPlayerActionConfirmContent,
  getPlayerActionSuccessToast,
  PlayerActionConfirmRequest,
  PlayerActionConfirmType,
} from '../../utils/playerActionConfirmLogic';
import {
  buildDuplicateTournamentDraft,
  TournamentFormValues,
} from '../../utils/tournamentEditLogic';
import { executeLinkManualPlayerToAccount } from '../../services/playerLinkService';
import {
  Swords,
  Calendar,
  MapPin,
  KeyRound,
  Users,
  UserPlus,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Play,
  Trash2,
  Copy,
  CopyPlus,
  Check,
  ShieldAlert,
  ArrowRight,
  Timer,
  RefreshCw,
  AlertCircle,
  Link2,
  History,
  Pencil,
} from 'lucide-react';
import { AddFromHistoryModal } from './AddFromHistoryModal';

interface TournamentDetailModalProps {
  tournament: Tournament | null;
  isOpen: boolean;
  onClose: () => void;
  onTournamentUpdated?: () => void;
  onTournamentDeleted?: () => void;
  onOpenRounds?: (tournamentId: string) => void;
}

export const TournamentDetailModal: React.FC<TournamentDetailModalProps> = ({
  tournament: initialTournament,
  isOpen,
  onClose,
  onTournamentUpdated,
  onTournamentDeleted,
  onOpenRounds,
}) => {
  const { currentUser, userProfile } = useAuth();
  const [tournament, setTournament] = useState<Tournament | null>(initialTournament);
  const [players, setPlayers] = useState<TournamentPlayer[]>([]);
  const [loadingPlayers, setLoadingPlayers] = useState(false);
  const [copiedCode, setCopiedCode] = useState(false);
  const [copiedStandings, setCopiedStandings] = useState(false);

  useEffect(() => {
    setTournament(initialTournament);
  }, [initialTournament, isOpen]);

  const handleCopyStandingsText = async () => {
    if (!tournament) return;
    try {
      const participations = await getTournamentParticipations(tournament.id);
      if (participations.length > 0) {
        const text = generateStandingsText({
          tournamentName: tournament.name,
          tournamentDate: tournament.date,
          format: tournament.format,
          participations,
          organizerName: tournament.organizerName,
          location: tournament.location
        });
        const res = await copyTextNative(text);
        if (res.ok) {
          setCopiedStandings(true);
          setTimeout(() => setCopiedStandings(false), 2500);
        } else {
          alert('Gagal menyalin hasil ke papan klip.');
        }
      } else {
        alert('Data klasemen akhir belum tersedia untuk disalin.');
      }
    } catch (e: any) {
      alert('Gagal menyalin hasil: ' + (e?.message || 'Error'));
    }
  };

  // Manual Player Modal
  const [manualModalOpen, setManualModalOpen] = useState(false);
  const [manualName, setManualName] = useState('');
  const [manualLoading, setManualLoading] = useState(false);
  const [manualError, setManualError] = useState('');
  const [manualDuplicateWarning, setManualDuplicateWarning] = useState<TournamentPlayer | null>(null);

  // History Player Modal (Tambah dari Histori)
  const [historyModalOpen, setHistoryModalOpen] = useState(false);

  // Link Manual Player state
  const [linkModalOpen, setLinkModalOpen] = useState(false);
  const [selectedManualPlayer, setSelectedManualPlayer] = useState<TournamentPlayer | null>(null);
  const [selectedTargetAccountId, setSelectedTargetAccountId] = useState<string>('');
  const [linkLoading, setLinkLoading] = useState(false);
  const [linkError, setLinkError] = useState<string | null>(null);

  // Start Tournament Warning / Confirmation
  const [startConfirmOpen, setStartConfirmOpen] = useState(false);
  const [startWarningMessage, setStartWarningMessage] = useState('');
  const [startLoading, setStartLoading] = useState(false);

  // Waiting List Status Confirmation
  const [statusConfirmRequest, setStatusConfirmRequest] = useState<WaitingStatusConfirmRequest | null>(null);
  const [statusConfirmLoading, setStatusConfirmLoading] = useState(false);

  // Drop / Delete Manual Player Confirmation
  const [playerActionConfirmRequest, setPlayerActionConfirmRequest] =
    useState<PlayerActionConfirmRequest | null>(null);
  const [playerActionConfirmLoading, setPlayerActionConfirmLoading] = useState(false);

  const { success: showToastSuccess, info: showToastInfo } = useToast();

  // Edit & Duplicate Tournament sheets
  const [editSheetOpen, setEditSheetOpen] = useState(false);
  const [editLoading, setEditLoading] = useState(false);
  const [editError, setEditError] = useState('');
  const [duplicateSheetOpen, setDuplicateSheetOpen] = useState(false);
  const [duplicateLoading, setDuplicateLoading] = useState(false);
  const [duplicateError, setDuplicateError] = useState('');

  // Admin Delete Tournament Reauth & Progress
  const [deleteReauthOpen, setDeleteReauthOpen] = useState(false);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [deleteProgress, setDeleteProgress] = useState<{ deleted: number; total: number } | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [auditLogModalOpen, setAuditLogModalOpen] = useState(false);

  // Player action loading
  const [playerActionLoading, setPlayerActionLoading] = useState(false);
  const [actionMessage, setActionMessage] = useState('');

  const isOrganizerOwner =
    Boolean(currentUser && tournament && tournament.organizerId === currentUser.uid);
  const isAdmin = userProfile?.role === 'admin';
  const canManageTournament = isOrganizerOwner || isAdmin;

  const fetchPlayers = async (targetTournamentId?: string) => {
    const tid = targetTournamentId || tournament?.id;
    if (!tid) return;
    setLoadingPlayers(true);
    try {
      const list = await getTournamentPlayers(tid);
      setPlayers(list);
    } catch (err) {
      console.error('Gagal memuat peserta:', err);
    } finally {
      setLoadingPlayers(false);
    }
  };

  useEffect(() => {
    if (isOpen && tournament?.id) {
      fetchPlayers(tournament.id);
      setActionMessage('');
      setCopiedCode(false);
      setStatusConfirmRequest(null);
      setStatusConfirmLoading(false);
      setPlayerActionConfirmRequest(null);
      setPlayerActionConfirmLoading(false);
      setEditSheetOpen(false);
      setEditError('');
      setDuplicateSheetOpen(false);
      setDuplicateError('');
    }
  }, [isOpen, tournament?.id]);

  if (!tournament || !isOpen) return null;

  const waitingPlayers = players.filter((p) => p.status === 'waiting');
  const acceptedPlayers = players.filter((p) => p.status === 'accepted');
  const droppedPlayers = players.filter((p) => p.status === 'dropped');
  const rejectedPlayers = players.filter((p) => p.status === 'rejected');

  const myPlayerRecord = currentUser
    ? players.find((p) => p.uid === currentUser.uid)
    : null;

  const isRegistration = tournament.status === 'registration';
  const isRunning = tournament.status === 'running';

  const copyJoinCode = async () => {
    await copyTextNative(tournament.joinCode);
    setCopiedCode(true);
    setTimeout(() => setCopiedCode(false), 2000);
  };

  // Player actions
  const handleRegisterSelf = async () => {
    if (!currentUser || !userProfile) return;
    setPlayerActionLoading(true);
    setActionMessage('');
    try {
      await registerPlayer(tournament.id, {
        uid: currentUser.uid,
        name: userProfile.displayName || userProfile.username,
      });
      await fetchPlayers();
      setActionMessage('Berhasil mendaftar! Anda berada di Waiting List.');
      if (onTournamentUpdated) onTournamentUpdated();
    } catch (err: any) {
      setActionMessage(err.message || 'Gagal mendaftar.');
    } finally {
      setPlayerActionLoading(false);
    }
  };

  const handleCancelSelf = async () => {
    if (!currentUser) return;
    setPlayerActionLoading(true);
    try {
      await cancelRegistration(tournament.id, currentUser.uid);
      await fetchPlayers();
      setActionMessage('Pendaftaran telah dibatalkan.');
      if (onTournamentUpdated) onTournamentUpdated();
    } catch (err: any) {
      setActionMessage(err.message || 'Gagal membatalkan pendaftaran.');
    } finally {
      setPlayerActionLoading(false);
    }
  };

  // Organizer: Add Manual Player (dengan pencegahan nama ganda akun)
  const handleAddManual = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!manualName.trim()) {
      setManualError('Nama peserta manual wajib diisi.');
      return;
    }

    const duplicateAccount = findAccountPlayerWithSameName(manualName, players);
    if (duplicateAccount && !manualDuplicateWarning) {
      setManualDuplicateWarning(duplicateAccount);
      return;
    }

    await executeAddManual(manualName);
  };

  const executeAddManual = async (name: string) => {
    setManualLoading(true);
    setManualError('');
    try {
      await addManualPlayer(tournament.id, name);
      setManualName('');
      setManualDuplicateWarning(null);
      setManualModalOpen(false);
      await fetchPlayers();
      if (onTournamentUpdated) onTournamentUpdated();
    } catch (err: any) {
      setManualError(err.message || 'Gagal menambahkan peserta.');
    } finally {
      setManualLoading(false);
    }
  };

  // Organizer: Aksi Tautkan Peserta Manual ke Akun
  const handleOpenLinkModal = (
    manualPlayer: TournamentPlayer,
    preferredTargetId?: string
  ) => {
    setSelectedManualPlayer(manualPlayer);
    const eligible = players.filter(
      (p) => !p.manual && (p.status === 'waiting' || p.status === 'accepted')
    );
    if (preferredTargetId) {
      setSelectedTargetAccountId(preferredTargetId);
    } else if (eligible.length > 0) {
      setSelectedTargetAccountId(eligible[0].id);
    } else {
      setSelectedTargetAccountId('');
    }
    setLinkError(null);
    setLinkModalOpen(true);
  };

  const handleConfirmLinkPlayer = async () => {
    if (!tournament || !selectedManualPlayer || !selectedTargetAccountId || !currentUser) return;
    const targetAccount = players.find((p) => p.id === selectedTargetAccountId);
    if (!targetAccount) return;

    setLinkLoading(true);
    setLinkError(null);
    try {
      await executeLinkManualPlayerToAccount(
        tournament.id,
        selectedManualPlayer,
        targetAccount,
        {
          uid: currentUser.uid,
          name: userProfile?.displayName || userProfile?.username || 'Organizer',
        }
      );
      setLinkModalOpen(false);
      showToastSuccess(
        `Berhasil menautkan ${selectedManualPlayer.name} ke akun ${targetAccount.name}.`
      );
      await fetchPlayers();
      if (onTournamentUpdated) onTournamentUpdated();
    } catch (err: any) {
      console.error('Gagal menautkan peserta manual:', err);
      setLinkError(err.message || 'Gagal menautkan peserta ke akun.');
    } finally {
      setLinkLoading(false);
    }
  };

  // Organizer: Konfirmasi Drop / Hapus Peserta Manual
  const handleOpenPlayerActionConfirm = (
    action: PlayerActionConfirmType,
    player: TournamentPlayer
  ) => {
    if (playerActionConfirmLoading) return;
    setPlayerActionConfirmRequest({
      action,
      playerId: player.id,
      playerName: player.name,
    });
  };

  const handleClosePlayerActionConfirm = () => {
    if (playerActionConfirmLoading) return;
    setPlayerActionConfirmRequest(null);
  };

  const handleExecutePlayerActionConfirm = async () => {
    if (!playerActionConfirmRequest || playerActionConfirmLoading) return;

    setPlayerActionConfirmLoading(true);
    try {
      if (playerActionConfirmRequest.action === 'drop') {
        await dropPlayer(tournament.id, playerActionConfirmRequest.playerId);
      } else {
        await cancelRegistration(tournament.id, playerActionConfirmRequest.playerId);
      }
      await fetchPlayers();
      if (onTournamentUpdated) onTournamentUpdated();
      const toastMessage = getPlayerActionSuccessToast(
        playerActionConfirmRequest.action,
        playerActionConfirmRequest.playerName
      );
      setPlayerActionConfirmRequest(null);
      showToastSuccess(toastMessage);
    } catch (err: any) {
      alert(
        err?.message ||
          (playerActionConfirmRequest.action === 'drop'
            ? 'Gagal menandai peserta sebagai dropped.'
            : 'Gagal menghapus peserta manual.')
      );
    } finally {
      setPlayerActionConfirmLoading(false);
    }
  };

  const handleOpenStatusConfirm = (action: 'accept' | 'reject', player: TournamentPlayer) => {
    if (statusConfirmLoading) return;
    setStatusConfirmRequest({
      action,
      playerId: player.id,
      playerName: player.name,
    });
  };

  const handleOpenAcceptAllConfirm = () => {
    if (statusConfirmLoading || waitingPlayers.length === 0) return;
    setStatusConfirmRequest({
      action: 'acceptAll',
      waitingCount: waitingPlayers.length,
    });
  };

  const handleCloseStatusConfirm = () => {
    if (statusConfirmLoading) return;
    setStatusConfirmRequest(null);
  };

  const handleExecuteStatusConfirm = async () => {
    if (!statusConfirmRequest || statusConfirmLoading) return;

    setStatusConfirmLoading(true);
    try {
      const latestPlayers = await getTournamentPlayers(tournament.id);

      if (statusConfirmRequest.action === 'acceptAll') {
        const currentWaiting = filterWaitingPlayers(latestPlayers);
        if (currentWaiting.length === 0) {
          setPlayers(latestPlayers);
          if (onTournamentUpdated) onTournamentUpdated();
          setStatusConfirmRequest(null);
          showToastInfo(getAlreadyProcessedMessage('acceptAll'));
          return;
        }

        await acceptAllWaitingPlayers(tournament.id, currentWaiting);
        await fetchPlayers();
        if (onTournamentUpdated) onTournamentUpdated();
        setStatusConfirmRequest(null);
        showToastSuccess(
          getWaitingStatusSuccessToast('acceptAll', { count: currentWaiting.length })
        );
      } else {
        const targetId = statusConfirmRequest.playerId || '';
        const targetStatus: PlayerStatus =
          statusConfirmRequest.action === 'accept' ? 'accepted' : 'rejected';

        if (!isPlayerStillWaitingInList(latestPlayers, targetId)) {
          setPlayers(latestPlayers);
          if (onTournamentUpdated) onTournamentUpdated();
          setStatusConfirmRequest(null);
          showToastInfo(
            getAlreadyProcessedMessage(
              statusConfirmRequest.action,
              statusConfirmRequest.playerName
            )
          );
          return;
        }

        await updatePlayerStatus(tournament.id, targetId, targetStatus);
        await fetchPlayers();
        if (onTournamentUpdated) onTournamentUpdated();
        setStatusConfirmRequest(null);
        showToastSuccess(
          getWaitingStatusSuccessToast(statusConfirmRequest.action, {
            playerName: statusConfirmRequest.playerName,
          })
        );
      }
    } catch (err: any) {
      alert(
        err?.message ||
          (statusConfirmRequest.action === 'acceptAll'
            ? 'Gagal menerima semua peserta.'
            : 'Gagal memperbarui status peserta.')
      );
    } finally {
      setStatusConfirmLoading(false);
    }
  };

  // Organizer: Start Tournament (dengan preflight check akun waiting & nama ganda)
  const handleOpenStartTournament = () => {
    if (acceptedPlayers.length < 3) {
      alert(`Minimal 3 peserta accepted diperlukan untuk memulai turnamen (saat ini: ${acceptedPlayers.length}).`);
      return;
    }
    setStartConfirmOpen(true);
  };

  const handleConfirmStartTournament = async () => {
    if (!currentUser || !userProfile) return;

    setStartLoading(true);
    try {
      await startTournament(
        tournament.id,
        acceptedPlayers.length,
        { uid: currentUser.uid, name: userProfile.displayName || userProfile.username }
      );
      setStartConfirmOpen(false);
      if (onTournamentUpdated) onTournamentUpdated();
      onClose();
    } catch (err: any) {
      alert(err.message || 'Gagal memulai turnamen.');
    } finally {
      setStartLoading(false);
    }
  };

  // Admin: Delete Tournament
  const handleConfirmDelete = async () => {
    if (!currentUser || !userProfile) return;
    setDeleteLoading(true);
    setDeleteError(null);
    setDeleteProgress({ deleted: 0, total: 0 });
    try {
      const result = await deleteTournament(
        tournament.id,
        tournament.name,
        {
          uid: currentUser.uid,
          name: userProfile.displayName || userProfile.username,
        },
        (deleted, total) => {
          setDeleteProgress({ deleted, total });
        }
      );
      setDeleteReauthOpen(false);
      setDeleteProgress(null);
      showToastSuccess(
        `Turnamen dan seluruh datanya (${result.totalDeleted} dokumen) berhasil dihapus.`
      );
      if (onTournamentDeleted) onTournamentDeleted();
      onClose();
    } catch (err: any) {
      console.error('Gagal menghapus turnamen:', err);
      setDeleteError(err.message || 'Gagal menghapus turnamen. Silakan coba lagi.');
    } finally {
      setDeleteLoading(false);
    }
  };

  // Organizer Owner / Admin: Edit Turnamen
  const handleEditTournamentSubmit = async (values: TournamentFormValues) => {
    if (!tournament || !currentUser || !userProfile) return;

    setEditLoading(true);
    setEditError('');
    try {
      const result = await updateTournamentDetails(tournament, values, {
        uid: currentUser.uid,
        name: userProfile.displayName || userProfile.username || 'Organizer',
      });
      setTournament(result.updatedTournament);
      setEditSheetOpen(false);
      if (result.syncedParticipationsCount > 0) {
        showToastSuccess(
          `Turnamen diperbarui (${result.syncedParticipationsCount} data partisipasi disinkronkan).`
        );
      } else {
        showToastSuccess('Data turnamen berhasil diperbarui.');
      }
      if (onTournamentUpdated) onTournamentUpdated();
    } catch (err: any) {
      setEditError(err?.message || 'Gagal memperbarui data turnamen.');
    } finally {
      setEditLoading(false);
    }
  };

  // Organizer Owner / Admin: Duplikat Turnamen
  const handleDuplicateTournamentSubmit = async (values: TournamentFormValues) => {
    if (!currentUser || !userProfile) return;

    setDuplicateLoading(true);
    setDuplicateError('');
    try {
      const created = await createTournament(values, {
        uid: currentUser.uid,
        name: userProfile.displayName || userProfile.username || 'Organizer',
      });
      setDuplicateSheetOpen(false);
      setTournament(created);
      showToastSuccess(
        `Turnamen "${created.name}" berhasil diduplikat (#${created.joinCode}).`
      );
      if (onTournamentUpdated) onTournamentUpdated();
    } catch (err: any) {
      setDuplicateError(err?.message || 'Gagal menduplikat turnamen.');
    } finally {
      setDuplicateLoading(false);
    }
  };

  const calculatedRoundsPreview = calculateSwissRounds(acceptedPlayers.length);

  return (
    <BottomSheet isOpen={isOpen} onClose={onClose} title={tournament.name}>
      <div className="flex flex-col gap-4 py-1 pb-6">
        {/* Info Utama Turnamen */}
        <Card variant="surface-high" className="flex flex-col gap-2.5">
          <div className="flex items-start justify-between gap-2">
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-semibold text-body text-dark-text">{tournament.name}</span>
                <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-accent/10 text-accent border border-accent/20">
                  {tournament.format}
                </span>
              </div>
              <p className="text-caption text-dark-muted mt-0.5">
                Penyelenggara: <strong className="text-dark-text">{tournament.organizerName}</strong>
              </p>
            </div>
            <StatusBadge
              label={
                tournament.status === 'registration'
                  ? 'Pendaftaran'
                  : tournament.status === 'running'
                  ? 'Sedang Berjalan'
                  : 'Selesai'
              }
              variant={
                tournament.status === 'registration'
                  ? 'yellow'
                  : tournament.status === 'running'
                  ? 'green'
                  : 'neutral'
              }
            />
          </div>

          <div className="pt-2 border-t border-dark-border grid grid-cols-2 gap-2 text-caption">
            <div className="flex items-center gap-1.5 text-dark-muted">
              <Calendar size={14} />
              <span>{tournament.date}</span>
            </div>
            <div className="flex items-center gap-1.5 text-dark-muted truncate">
              <MapPin size={14} />
              <span className="truncate">{tournament.location}</span>
            </div>
          </div>

          {/* Kode Unik & Ronde */}
          <div className="pt-2 border-t border-dark-border flex items-center justify-between gap-2 text-caption">
            <div className="flex items-center gap-2">
              <span className="text-dark-muted">Kode Gabung:</span>
              <span className="font-mono font-bold text-accent px-1.5 py-0.5 rounded bg-dark-surface border border-dark-border">
                {tournament.joinCode}
              </span>
              <button
                type="button"
                onClick={copyJoinCode}
                className="p-1 text-dark-muted hover:text-dark-text"
                title="Salin Kode"
              >
                {copiedCode ? <Check size={14} className="text-status-green" /> : <Copy size={14} />}
              </button>
            </div>

            <div>
              {tournament.totalRounds ? (
                <span className="font-medium text-dark-text">
                  Total Ronde: <strong className="text-accent">{tournament.totalRounds}</strong>
                </span>
              ) : (
                <span className="text-dark-muted">
                  Estimasi: ~{calculatedRoundsPreview} ronde
                </span>
              )}
            </div>
          </div>
        </Card>

        {/* Organizer Pemilik / Admin: Edit Turnamen & Duplikat */}
        {canManageTournament && (
          <div className="grid grid-cols-2 gap-2">
            <Button
              variant="secondary"
              className="!min-h-[40px] !text-caption"
              onClick={() => {
                setEditError('');
                setEditSheetOpen(true);
              }}
              icon={<Pencil size={15} />}
            >
              Edit Turnamen
            </Button>
            <Button
              variant="secondary"
              className="!min-h-[40px] !text-caption"
              onClick={() => {
                setDuplicateError('');
                setDuplicateSheetOpen(true);
              }}
              icon={<CopyPlus size={15} />}
            >
              Duplikat
            </Button>
          </div>
        )}

        {/* Notifikasi Pesan Aksi */}
        {actionMessage && (
          <div className="p-3 bg-accent/10 border border-accent/20 rounded-btn text-caption text-accent flex items-center gap-2">
            <CheckCircle2 size={16} />
            <span>{actionMessage}</span>
          </div>
        )}

        {/* Tombol Aksi Player (Daftar / Batalkan) */}
        {!isOrganizerOwner && !isAdmin && isRegistration && (
          <div className="flex flex-col gap-2">
            {!myPlayerRecord ? (
              <Button
                variant="primary"
                fullWidth
                isLoading={playerActionLoading}
                onClick={handleRegisterSelf}
                icon={<UserPlus size={18} />}
              >
                Daftar Turnamen
              </Button>
            ) : myPlayerRecord.status === 'waiting' ? (
              <div className="flex flex-col gap-2">
                <div className="p-2.5 rounded-btn bg-status-yellow/10 border border-status-yellow/30 text-caption text-status-yellow flex items-center justify-between">
                  <span className="font-medium">Status: Menunggu Persetujuan (Waiting List)</span>
                </div>
                <Button
                  variant="danger"
                  fullWidth
                  isLoading={playerActionLoading}
                  onClick={handleCancelSelf}
                >
                  Batalkan Pendaftaran
                </Button>
              </div>
            ) : myPlayerRecord.status === 'accepted' ? (
              <div className="p-2.5 rounded-btn bg-status-green/10 border border-status-green/30 text-caption text-status-green font-medium text-center">
                Pendaftaran Diterima! Anda terdaftar sebagai peserta aktif.
              </div>
            ) : null}
          </div>
        )}

        {/* Bagian Organizer: Waiting List */}
        {isOrganizerOwner && isRegistration && waitingPlayers.length > 0 && (
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between px-1">
              <span className="text-body font-semibold text-dark-text flex items-center gap-1.5">
                <span>Waiting List</span>
                <span className="text-caption font-mono text-status-yellow font-bold">
                  ({waitingPlayers.length})
                </span>
              </span>
              <Button
                variant="secondary"
                className="!min-h-[32px] !px-2.5 !text-[11px]"
                onClick={handleOpenAcceptAllConfirm}
                disabled={statusConfirmLoading}
              >
                Terima Semua
              </Button>
            </div>

            <div className="flex flex-col gap-1.5">
              {waitingPlayers.map((p) => (
                <Card key={p.id} variant="surface" padding="sm" className="flex items-center justify-between">
                  <div className="min-w-0">
                    <span className="text-body font-medium text-dark-text block truncate">
                      {p.name}
                    </span>
                    <span className="text-[11px] text-dark-muted font-mono">
                      {p.manual ? 'Peserta Manual' : 'Pemain Akun'}
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => handleOpenStatusConfirm('accept', p)}
                      disabled={statusConfirmLoading}
                      className="p-1.5 rounded-btn bg-status-green/10 text-status-green border border-status-green/30 hover:bg-status-green/20 disabled:opacity-50"
                      title="Terima Peserta"
                    >
                      <CheckCircle2 size={16} />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleOpenStatusConfirm('reject', p)}
                      disabled={statusConfirmLoading}
                      className="p-1.5 rounded-btn bg-status-red/10 text-status-red border border-status-red/30 hover:bg-status-red/20 disabled:opacity-50"
                      title="Tolak Peserta"
                    >
                      <XCircle size={16} />
                    </button>
                  </div>
                </Card>
              ))}
            </div>
          </div>
        )}

        {/* Klasemen Akhir untuk Turnamen Selesai */}
        {tournament.status === 'finished' && (
          <div className="flex flex-col gap-2">
            <FinalStandingsCard
              key={`${tournament.id}-${tournament.name}-${tournament.date}`}
              tournamentId={tournament.id}
              tournamentName={tournament.name}
              format={tournament.format}
              status={tournament.status}
              highlightUid={currentUser?.uid}
            />
            <Button
              variant="secondary"
              fullWidth
              className="!min-h-[36px] !text-caption"
              onClick={handleCopyStandingsText}
              icon={copiedStandings ? <Check size={14} className="text-status-green" /> : <Copy size={14} />}
            >
              {copiedStandings ? 'Hasil Berhasil Disalin!' : 'Salin Hasil'}
            </Button>
          </div>
        )}

        {/* Daftar Peserta Accepted */}
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between px-1">
            <span className="text-body font-semibold text-dark-text flex items-center gap-1.5">
              <Users size={16} className="text-accent" />
              <span>Peserta Resmi (Accepted)</span>
              <span className="text-caption font-mono text-status-green font-bold">
                ({acceptedPlayers.length})
              </span>
            </span>

            {(isOrganizerOwner || isAdmin) && isRegistration && (
              <div className="flex items-center gap-1.5 flex-wrap justify-end">
                <Button
                  variant="secondary"
                  className="!min-h-[32px] !px-2.5 !text-[11px]"
                  onClick={() => setHistoryModalOpen(true)}
                  icon={<History size={14} />}
                >
                  Tambah dari Histori
                </Button>
                <Button
                  variant="secondary"
                  className="!min-h-[32px] !px-2.5 !text-[11px]"
                  onClick={() => setManualModalOpen(true)}
                  icon={<UserPlus size={14} />}
                >
                  + Peserta Manual
                </Button>
              </div>
            )}
          </div>

          {loadingPlayers ? (
            <p className="text-caption text-dark-muted text-center py-4">Memuat daftar peserta...</p>
          ) : acceptedPlayers.length === 0 ? (
            <Card variant="surface" className="text-center py-6 text-caption text-dark-muted">
              Belum ada peserta yang berstatus accepted.
            </Card>
          ) : (
            <div className="flex flex-col gap-1.5">
              {acceptedPlayers.map((p, idx) => (
                <Card key={p.id} variant="surface" padding="sm" className="flex items-center justify-between">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <span className="text-caption font-mono text-dark-muted w-5 text-right">
                      {idx + 1}.
                    </span>
                    <div className="min-w-0">
                      <span className="text-body font-medium text-dark-text block truncate">
                        {p.name}
                      </span>
                      {p.manual && (
                        <span className="text-[10px] text-dark-muted font-mono">
                          (Peserta Manual)
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5 flex-shrink-0">
                    {/* Organizer: Tautkan Peserta Manual ke Akun (sebelum & sesudah turnamen mulai) */}
                    {isOrganizerOwner && p.manual && (
                      <Button
                        variant="secondary"
                        className="!min-h-[28px] !px-2 !text-[11px]"
                        onClick={() => handleOpenLinkModal(p)}
                        icon={<Link2 size={12} />}
                      >
                        Tautkan
                      </Button>
                    )}

                    {/* Organizer: Hapus peserta manual jika masih pendaftaran */}
                    {isOrganizerOwner && isRegistration && p.manual && (
                      <button
                        type="button"
                        disabled={playerActionConfirmLoading}
                        onClick={() => handleOpenPlayerActionConfirm('deleteManual', p)}
                        className="text-[11px] text-dark-muted hover:text-status-red hover:underline px-1.5 py-1 disabled:opacity-50"
                        title="Hapus Peserta Manual"
                      >
                        Hapus
                      </button>
                    )}

                    {/* Organizer: Tandai Dropped jika running */}
                    {isOrganizerOwner && isRunning && (
                      <button
                        type="button"
                        disabled={playerActionConfirmLoading}
                        onClick={() => handleOpenPlayerActionConfirm('drop', p)}
                        className="text-[11px] text-status-red hover:underline px-2 py-1 disabled:opacity-50"
                      >
                        Tandai Dropped
                      </button>
                    )}
                  </div>
                </Card>
              ))}
            </div>
          )}
        </div>

        {/* Daftar Dropped (jika ada) */}
        {droppedPlayers.length > 0 && (
          <div className="flex flex-col gap-1.5">
            <span className="text-caption font-semibold text-dark-muted px-1">
              Peserta Dropped ({droppedPlayers.length})
            </span>
            {droppedPlayers.map((p) => (
              <div
                key={p.id}
                className="p-2 rounded-btn bg-dark-surface border border-dark-border flex items-center justify-between text-caption text-dark-muted"
              >
                <span className="line-through">{p.name}</span>
                <span className="text-[11px] text-status-red">Dropped</span>
              </div>
            ))}
          </div>
        )}

        {/* Organizer: Tombol Mulai Turnamen */}
        {isOrganizerOwner && isRegistration && (
          <div className="pt-2">
            <Button
              variant="primary"
              fullWidth
              onClick={handleOpenStartTournament}
              disabled={acceptedPlayers.length < 3}
              icon={<Play size={18} />}
            >
              Mulai Turnamen ({acceptedPlayers.length} Peserta)
            </Button>
            {acceptedPlayers.length < 3 && (
              <p className="text-[11px] text-status-yellow text-center mt-1">
                Minimal 3 peserta accepted diperlukan untuk memulai turnamen.
              </p>
            )}
          </div>
        )}

        {/* Akses Cepat Manajemen Ronde jika turnamen running / finished */}
        {(isRunning || tournament.status === 'finished') && (
          <div className="pt-2">
            <Button
              variant="primary"
              fullWidth
              onClick={() => {
                onClose();
                if (onOpenRounds) onOpenRounds(tournament.id);
              }}
              icon={<Timer size={18} />}
            >
              Buka Manajemen Ronde
            </Button>
          </div>
        )}

        {/* Akses Log Keamanan Turnamen untuk Organizer & Admin */}
        {(isOrganizerOwner || isAdmin) && (
          <div className="pt-1">
            <Button
              variant="secondary"
              fullWidth
              onClick={() => setAuditLogModalOpen(true)}
              icon={<ShieldAlert size={16} />}
            >
              Log Keamanan Turnamen
            </Button>
          </div>
        )}

        {/* Admin: Tombol Hapus Turnamen */}
        {isAdmin && (
          <div className="pt-4 border-t border-dark-border">
            <Button
              variant="danger"
              fullWidth
              onClick={() => setDeleteReauthOpen(true)}
              icon={<Trash2 size={18} />}
            >
              Hapus Turnamen (Khusus Admin)
            </Button>
          </div>
        )}
      </div>

      {/* Bottom Sheet Tambah Peserta Manual */}
      <BottomSheet
        isOpen={manualModalOpen}
        onClose={() => {
          setManualDuplicateWarning(null);
          setManualModalOpen(false);
        }}
        title="Tambah Peserta Manual"
      >
        {manualDuplicateWarning ? (
          <div className="flex flex-col gap-3 py-1">
            <div className="p-3 bg-status-yellow/10 border border-status-yellow/30 rounded-btn flex items-start gap-2.5 text-caption text-status-yellow">
              <AlertTriangle size={20} className="flex-shrink-0 mt-0.5" />
              <span>
                Sudah ada pendaftar akun bernama <strong>'{manualDuplicateWarning.name}'</strong>. Terima akun itu di Waiting List, jangan tambah manual.
              </span>
            </div>
            <div className="flex flex-col gap-2 mt-2">
              <Button
                variant="secondary"
                fullWidth
                type="button"
                onClick={() => {
                  setManualDuplicateWarning(null);
                  setManualModalOpen(false);
                }}
              >
                Batal
              </Button>
              <Button
                variant="primary"
                fullWidth
                type="button"
                isLoading={manualLoading}
                onClick={() => executeAddManual(manualName)}
              >
                Tetap Tambah
              </Button>
            </div>
          </div>
        ) : (
          <form onSubmit={handleAddManual} className="flex flex-col gap-3 py-1">
            <Input
              label="Nama Peserta"
              placeholder="Contoh: Yamato Ishida"
              value={manualName}
              onChange={(e) => {
                setManualName(e.target.value);
                setManualDuplicateWarning(null);
                if (manualError) setManualError('');
              }}
              error={manualError}
              disabled={manualLoading}
              helperText="Peserta tanpa akun otomatis berstatus accepted."
            />
            <div className="flex flex-col gap-2 mt-2">
              <Button variant="primary" fullWidth type="submit" isLoading={manualLoading}>
                Simpan Peserta Manual
              </Button>
              <Button
                variant="secondary"
                fullWidth
                type="button"
                onClick={() => setManualModalOpen(false)}
                disabled={manualLoading}
              >
                Batal
              </Button>
            </div>
          </form>
        )}
      </BottomSheet>

      {/* Modal Tambah Peserta dari Histori Turnamen */}
      {(isOrganizerOwner || isAdmin) && isRegistration && (
        <AddFromHistoryModal
          isOpen={historyModalOpen}
          onClose={() => setHistoryModalOpen(false)}
          tournament={tournament}
          currentPlayers={players}
          organizerId={tournament.organizerId || currentUser?.uid || ''}
          actor={{
            uid: currentUser?.uid || '',
            name: userProfile?.displayName || userProfile?.username || 'Organizer'
          }}
          onSuccess={async (count) => {
            setActionMessage(`Berhasil menambahkan ${count} peserta dari histori turnamen.`);
            await fetchPlayers();
            if (onTournamentUpdated) onTournamentUpdated();
          }}
        />
      )}

      {/* Bottom Sheet Konfirmasi Mulai Turnamen (dengan pemeriksaan preflight) */}
      <BottomSheet
        isOpen={startConfirmOpen}
        onClose={() => setStartConfirmOpen(false)}
        title="Konfirmasi Mulai Turnamen"
      >
        {(() => {
          const preflight = detectPreflightIssues(players);
          const { waitingAccountPlayers, duplicatePairs, hasIssues } = preflight;

          return (
            <div className="flex flex-col gap-3 py-1">
              {hasIssues ? (
                <div className="flex flex-col gap-3">
                  <div className="p-3 rounded-btn bg-status-yellow/10 border border-status-yellow/30 text-caption text-status-yellow flex items-start gap-2">
                    <AlertTriangle size={18} className="flex-shrink-0 mt-0.5" />
                    <span>
                      Ditemukan masalah pada daftar pendaftar turnamen. Selesaikan sebelum memulai agar seluruh akun pemain terhubung ke pairing:
                    </span>
                  </div>

                  {/* 1. Akun Waiting List */}
                  {waitingAccountPlayers.length > 0 && (
                    <div className="flex flex-col gap-1.5">
                      <span className="text-caption font-semibold text-dark-text">
                        Akun di Waiting List ({waitingAccountPlayers.length}):
                      </span>
                      <div className="flex flex-col gap-1.5 max-h-36 overflow-y-auto">
                        {waitingAccountPlayers.map((p) => (
                          <div
                            key={p.id}
                            className="p-2 rounded-btn bg-dark-surface border border-dark-border flex items-center justify-between text-caption"
                          >
                            <span className="text-dark-text font-medium truncate">{p.name}</span>
                            <div className="flex items-center gap-1.5 flex-shrink-0">
                              <Button
                                variant="primary"
                                className="!min-h-[26px] !px-2.5 !text-[11px]"
                                disabled={statusConfirmLoading}
                                onClick={() => handleOpenStatusConfirm('accept', p)}
                              >
                                Terima
                              </Button>
                              <Button
                                variant="danger"
                                className="!min-h-[26px] !px-2.5 !text-[11px]"
                                disabled={statusConfirmLoading}
                                onClick={() => handleOpenStatusConfirm('reject', p)}
                              >
                                Tolak
                              </Button>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* 2. Nama Ganda (Manual vs Akun) */}
                  {duplicatePairs.length > 0 && (
                    <div className="flex flex-col gap-1.5">
                      <span className="text-caption font-semibold text-dark-text">
                        Nama Ganda Manual & Akun ({duplicatePairs.length}):
                      </span>
                      <div className="flex flex-col gap-1.5 max-h-36 overflow-y-auto">
                        {duplicatePairs.map(({ manualPlayer, accountPlayer }) => (
                          <div
                            key={manualPlayer.id}
                            className="p-2 rounded-btn bg-dark-surface border border-dark-border flex flex-col gap-1.5 text-caption"
                          >
                            <div className="flex items-center justify-between">
                              <span className="text-dark-text font-medium truncate">
                                Manual: <strong>{manualPlayer.name}</strong> ↔ Akun: <strong>{accountPlayer.name}</strong> ({accountPlayer.status})
                              </span>
                            </div>
                            <div className="flex items-center justify-end gap-1.5">
                              <Button
                                variant="secondary"
                                className="!min-h-[26px] !px-2.5 !text-[11px]"
                                onClick={() => {
                                  setStartConfirmOpen(false);
                                  handleOpenLinkModal(manualPlayer, accountPlayer.id);
                                }}
                              >
                                Tautkan ke akun
                              </Button>
                              <Button
                                variant="danger"
                                className="!min-h-[26px] !px-2.5 !text-[11px]"
                                disabled={playerActionConfirmLoading}
                                onClick={() => handleOpenPlayerActionConfirm('deleteManual', manualPlayer)}
                              >
                                Hapus manual
                              </Button>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  <div className="p-2.5 rounded-btn bg-dark-surface-high border border-dark-border flex flex-col gap-1 text-caption">
                    <div>
                      Jumlah Peserta Accepted Saat Ini: <strong className="text-status-green">{acceptedPlayers.length} orang</strong>
                    </div>
                    <div>
                      Ronde Swiss Otomatis: <strong className="text-accent font-mono">{calculatedRoundsPreview} Ronde</strong>
                    </div>
                  </div>

                  <div className="flex flex-col gap-2 mt-2 pt-2 border-t border-dark-border">
                    <Button
                      variant="primary"
                      fullWidth
                      disabled={acceptedPlayers.length < 3}
                      isLoading={startLoading}
                      onClick={handleConfirmStartTournament}
                      icon={<Play size={18} />}
                    >
                      Mulai Tetap ({acceptedPlayers.length} Peserta)
                    </Button>
                    <Button
                      variant="secondary"
                      fullWidth
                      onClick={() => setStartConfirmOpen(false)}
                      disabled={startLoading}
                    >
                      Kembali
                    </Button>
                    <p className="text-[11px] text-status-yellow text-center">
                      Peringatan: Memulai saat masih ada masalah dapat menyebabkan akun pemain tidak terhubung ke pairing pertandingan.
                    </p>
                  </div>
                </div>
              ) : (
                <div className="flex flex-col gap-3">
                  <div className="flex flex-col gap-2 text-caption">
                    <div className="p-3 bg-dark-surface-high rounded-btn border border-dark-border flex flex-col gap-1.5">
                      <span className="text-body font-semibold text-dark-text">{tournament.name}</span>
                      <div>
                        Jumlah Peserta Accepted: <strong className="text-dark-text">{acceptedPlayers.length} orang</strong>
                      </div>
                      <div>
                        Jumlah Ronde Swiss Otomatis:{' '}
                        <strong className="text-accent font-mono text-body">{calculatedRoundsPreview} Ronde</strong>
                      </div>
                      <div>Format: <strong className="text-dark-text">{tournament.format}</strong></div>
                    </div>

                    <div className="p-2.5 rounded-btn bg-status-yellow/10 border border-status-yellow/30 text-status-yellow flex items-start gap-2">
                      <ShieldAlert size={16} className="flex-shrink-0 mt-0.5" />
                      <span>
                        Setelah turnamen dimulai, format turnamen dan daftar peserta akan <strong>TERKUNCI</strong> dan jumlah total ronde tidak dapat diubah lagi.
                      </span>
                    </div>
                  </div>

                  <div className="flex flex-col gap-2 mt-2">
                    <Button
                      variant="primary"
                      fullWidth
                      disabled={acceptedPlayers.length < 3}
                      isLoading={startLoading}
                      onClick={handleConfirmStartTournament}
                      icon={<Play size={18} />}
                    >
                      Mulai Sekarang ({calculatedRoundsPreview} Ronde)
                    </Button>
                    <Button
                      variant="secondary"
                      fullWidth
                      onClick={() => setStartConfirmOpen(false)}
                      disabled={startLoading}
                    >
                      Kembali
                    </Button>
                  </div>
                </div>
              )}
            </div>
          );
        })()}
      </BottomSheet>

      {/* Bottom Sheet Tautkan Peserta Manual ke Akun */}
      <BottomSheet
        isOpen={linkModalOpen}
        onClose={() => {
          if (!linkLoading) setLinkModalOpen(false);
        }}
        title="Tautkan Peserta Manual ke Akun"
      >
        {selectedManualPlayer && (
          <div className="flex flex-col gap-3 py-1">
            {linkError && (
              <div className="p-3 rounded-btn bg-status-red/10 border border-status-red/30 text-caption text-status-red flex items-start gap-2">
                <AlertCircle size={16} className="flex-shrink-0 mt-0.5" />
                <span>{linkError}</span>
              </div>
            )}

            {(() => {
              const eligible = players.filter(
                (p) => !p.manual && (p.status === 'waiting' || p.status === 'accepted')
              );

              if (eligible.length === 0) {
                return (
                  <div className="flex flex-col gap-3 text-caption">
                    <div className="p-3 bg-dark-surface-high rounded-btn border border-dark-border text-dark-muted">
                      Belum ada akun pendaftar yang tersedia untuk ditautkan di turnamen ini. Pemain harus mendaftar ke turnamen ini terlebih dahulu agar akunnya dapat ditautkan.
                    </div>
                    <Button
                      variant="secondary"
                      fullWidth
                      onClick={() => setLinkModalOpen(false)}
                    >
                      Tutup
                    </Button>
                  </div>
                );
              }

              return (
                <div className="flex flex-col gap-3 text-caption">
                  <div className="p-3 bg-dark-surface-high rounded-btn border border-dark-border flex flex-col gap-1">
                    <span className="text-dark-muted">Peserta Manual yang akan ditautkan:</span>
                    <strong className="text-body text-dark-text">{selectedManualPlayer.name}</strong>
                  </div>

                  <div className="flex flex-col gap-1.5">
                    <label className="font-medium text-dark-text">Pilih Akun Pendaftar di Turnamen Ini:</label>
                    <select
                      value={selectedTargetAccountId}
                      onChange={(e) => setSelectedTargetAccountId(e.target.value)}
                      disabled={linkLoading}
                      className="w-full bg-dark-surface border border-dark-border rounded-btn px-3 py-2 text-caption text-dark-text focus:outline-none focus:border-accent"
                    >
                      {eligible.map((acc) => (
                        <option key={acc.id} value={acc.id}>
                          {acc.name} ({acc.status === 'waiting' ? 'Waiting List' : 'Accepted'})
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="p-2.5 rounded-btn bg-accent/10 border border-accent/20 text-caption text-accent flex flex-col gap-1">
                    <span className="font-semibold">Perubahan yang akan diproses:</span>
                    <ul className="list-disc list-inside text-[11px] opacity-90 space-y-0.5">
                      <li>Status akun pendaftar diubah menjadi accepted (bila waiting)</li>
                      <li>Seluruh ID & nama pada pertandingan turnamen dialihkan ke akun ini</li>
                      <li>Dokumen peserta manual dihapus</li>
                      <li>Jejak keamanan audit log PLAYER_LINKED dicatat</li>
                    </ul>
                  </div>

                  <div className="flex flex-col gap-2 mt-2">
                    <Button
                      variant="primary"
                      fullWidth
                      isLoading={linkLoading}
                      disabled={!selectedTargetAccountId}
                      onClick={handleConfirmLinkPlayer}
                    >
                      Konfirmasi Tautkan
                    </Button>
                    <Button
                      variant="secondary"
                      fullWidth
                      disabled={linkLoading}
                      onClick={() => setLinkModalOpen(false)}
                    >
                      Batal
                    </Button>
                  </div>
                </div>
              );
            })()}
          </div>
        )}
      </BottomSheet>

      {/* Reauth Modal untuk Hapus Turnamen (Admin) */}
      <ReauthModal
        isOpen={deleteReauthOpen}
        onClose={() => {
          if (!deleteLoading) setDeleteReauthOpen(false);
        }}
        onSuccess={handleConfirmDelete}
        actionTitle="Konfirmasi Hapus Turnamen"
        actionDescription="Menghapus turnamen juga menghapus seluruh hasil, klasemen, dan deck yang tercatat. Statistik dan riwayat pemain akan ikut berubah. Tindakan ini tidak dapat dibatalkan."
      />

      {/* Indikator Progres Hapus Turnamen / Galat Coba Lagi */}
      {(deleteLoading || deleteError) && (
        <div className="fixed inset-0 z-50 bg-dark-bg/80 backdrop-blur-sm flex items-center justify-center p-4">
          <Card variant="surface" className="max-w-md w-full p-4 flex flex-col gap-3 border border-dark-border shadow-xl">
            {deleteLoading ? (
              <div className="flex flex-col items-center justify-center py-4 text-center gap-3">
                <RefreshCw size={28} className="animate-spin text-status-red" />
                <div className="flex flex-col gap-1">
                  <span className="font-semibold text-body text-dark-text">
                    Menghapus data turnamen...
                  </span>
                  <span className="text-caption text-dark-muted font-mono">
                    {deleteProgress && deleteProgress.total > 0
                      ? `${deleteProgress.deleted} dari ${deleteProgress.total} dokumen`
                      : 'Menyiapkan dokumen turnamen...'}
                  </span>
                </div>
              </div>
            ) : (
              <div className="flex flex-col gap-3">
                <div className="flex items-start gap-2.5 text-status-red">
                  <AlertCircle size={20} className="flex-shrink-0 mt-0.5" />
                  <div className="flex flex-col gap-1 text-caption">
                    <strong className="text-body font-semibold">Gagal Menghapus Turnamen</strong>
                    <span className="text-dark-muted">{deleteError}</span>
                  </div>
                </div>
                <div className="flex items-center justify-end gap-2 pt-2 border-t border-dark-border">
                  <Button
                    variant="secondary"
                    className="!min-h-[36px] !text-caption"
                    onClick={() => {
                      setDeleteError(null);
                      setDeleteProgress(null);
                    }}
                  >
                    Batal
                  </Button>
                  <Button
                    variant="danger"
                    className="!min-h-[36px] !text-caption"
                    onClick={handleConfirmDelete}
                  >
                    Coba Lagi
                  </Button>
                </div>
              </div>
            )}
          </Card>
        </div>
      )}

      {/* Log Audit Keamanan Turnamen */}
      <TournamentAuditLogModal
        isOpen={auditLogModalOpen}
        onClose={() => setAuditLogModalOpen(false)}
        tournamentId={tournament.id}
        tournamentName={tournament.name}
      />

      {/* ConfirmSheet Konfirmasi Terima / Tolak Waiting List */}
      {(() => {
        const confirmContent = statusConfirmRequest
          ? buildWaitingStatusConfirmContent(statusConfirmRequest)
          : null;

        return (
          <ConfirmSheet
            isOpen={Boolean(statusConfirmRequest && confirmContent)}
            title={confirmContent?.title || ''}
            message={confirmContent?.message || ''}
            confirmLabel={confirmContent?.confirmLabel || 'Konfirmasi'}
            cancelLabel={confirmContent?.cancelLabel || 'Batal'}
            variant={confirmContent?.confirmVariant || 'primary'}
            isLoading={statusConfirmLoading}
            zIndexClass="z-[60]"
            onConfirm={handleExecuteStatusConfirm}
            onCancel={handleCloseStatusConfirm}
          />
        );
      })()}

      {/* ConfirmSheet Konfirmasi Drop / Hapus Peserta Manual */}
      {(() => {
        const actionContent = playerActionConfirmRequest
          ? buildPlayerActionConfirmContent(playerActionConfirmRequest)
          : null;

        return (
          <ConfirmSheet
            isOpen={Boolean(playerActionConfirmRequest && actionContent)}
            title={actionContent?.title || ''}
            message={actionContent?.message || ''}
            confirmLabel={actionContent?.confirmLabel || 'Konfirmasi'}
            cancelLabel={actionContent?.cancelLabel || 'Batal'}
            variant={actionContent?.variant || 'danger'}
            isLoading={playerActionConfirmLoading}
            zIndexClass="z-[60]"
            onConfirm={handleExecutePlayerActionConfirm}
            onCancel={handleClosePlayerActionConfirm}
          />
        );
      })()}

      {/* Sheet Edit Turnamen */}
      {canManageTournament && (
        <TournamentFormSheet
          isOpen={editSheetOpen}
          mode="edit"
          sourceTournament={tournament}
          isLoading={editLoading}
          errorMessage={editError}
          zIndexClass="z-[60]"
          onClose={() => setEditSheetOpen(false)}
          onSubmit={handleEditTournamentSubmit}
        />
      )}

      {/* Sheet Duplikat Turnamen */}
      {canManageTournament && (
        <TournamentFormSheet
          isOpen={duplicateSheetOpen}
          mode="duplicate"
          sourceTournament={tournament}
          initialValues={buildDuplicateTournamentDraft(tournament)}
          isLoading={duplicateLoading}
          errorMessage={duplicateError}
          zIndexClass="z-[60]"
          onClose={() => setDuplicateSheetOpen(false)}
          onSubmit={handleDuplicateTournamentSubmit}
        />
      )}
    </BottomSheet>
  );
};
