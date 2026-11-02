import React, { useState, useEffect } from 'react';
import { collection, onSnapshot } from 'firebase/firestore';
import { db } from '../../firebaseConfig';
import {
  Tournament,
  TournamentRound,
  TournamentMatch,
  TournamentPlayer,
  MatchStatus
} from '../../types';
import { useAuth } from '../../context/AuthContext';
import { Card } from '../../components/common/Card';
import { Button } from '../../components/common/Button';
import { StatusBadge } from '../../components/common/StatusBadge';
import { EmptyState } from '../../components/common/EmptyState';
import {
  getOrganizerTournaments,
  getAllTournaments,
  getTournamentPlayers
} from '../../services/tournamentService';
import {
  getTournamentRounds,
  getMatchesForRound,
  getAllTournamentMatches,
  createRoundPairing,
  swapPairingPlayers,
  updateMatchScore,
  organizerSetMatchResult,
  checkAndFinishTournamentIfComplete,
  revertTournamentToRound
} from '../../services/roundService';
import { MatchScoreModal } from '../rounds/MatchScoreModal';
import { ManualSwapModal } from '../rounds/ManualSwapModal';
import { RevertRoundModal } from '../rounds/RevertRoundModal';
import { TournamentAuditLogModal } from '../rounds/TournamentAuditLogModal';
import { RoundTimerCard } from '../../components/rounds/RoundTimerCard';
import { FinalResultsSection } from '../tournaments/FinalResultsSection';
import { finalizeTournamentResults } from '../../services/participationService';
import { BottomSheet } from '../../components/common/BottomSheet';
import { PastMatchRecord } from '../../utils/swissPairing';
import { isRoundLocked } from '../../utils/roundLockLogic';
import { shouldShowNextRoundPause } from '../../utils/roundPauseLogic';
import { getSessionTournament, setSessionTournament } from '../../utils/sessionStore';
import {
  Timer,
  Play,
  CheckCircle2,
  AlertTriangle,
  ArrowLeftRight,
  RefreshCw,
  Trophy,
  Swords,
  ChevronRight,
  History,
  ShieldAlert,
  RotateCcw,
  Lock,
  Clock
} from 'lucide-react';

export const RoundsView: React.FC = () => {
  const { currentUser, userProfile } = useAuth();
  const isOrganizer = userProfile?.role === 'organizer' || userProfile?.role === 'admin';
  const isAdmin = userProfile?.role === 'admin';

  // Tournaments
  const [tournaments, setTournaments] = useState<Tournament[]>([]);
  const [selectedTournament, setSelectedTournament] = useState<Tournament | null>(() => getSessionTournament());
  const [loadingTournaments, setLoadingTournaments] = useState(true);

  // Rounds & Matches
  const [rounds, setRounds] = useState<TournamentRound[]>([]);
  const [activeRoundNumber, setActiveRoundNumber] = useState<number | null>(null);
  const [matches, setMatches] = useState<TournamentMatch[]>([]);
  const [allMatches, setAllMatches] = useState<TournamentMatch[]>([]);
  const [loadingRounds, setLoadingRounds] = useState(false);
  const [pairingLoading, setPairingLoading] = useState(false);
  const [pairingNotice, setPairingNotice] = useState<string | null>(null);

  // Revert & Modals
  const [revertModalTarget, setRevertModalTarget] = useState<number | null>(null);
  const [auditLogModalOpen, setAuditLogModalOpen] = useState(false);

  // Akhiri Turnamen Confirmation BottomSheet
  const [finishConfirmModalOpen, setFinishConfirmModalOpen] = useState(false);
  const [finishingTournament, setFinishingTournament] = useState(false);
  const [finishError, setFinishError] = useState<string | null>(null);

  // Modals
  const [scoreModalMatch, setScoreModalMatch] = useState<TournamentMatch | null>(null);
  const [swapModalOpen, setSwapModalOpen] = useState(false);

  // 1. Muat turnamen milik organizer
  const fetchTournaments = async () => {
    if (!currentUser) return;
    setLoadingTournaments(true);
    try {
      let list: Tournament[] = [];
      if (isAdmin) {
        list = await getAllTournaments();
      } else {
        list = await getOrganizerTournaments(currentUser.uid);
      }

      // Prioritaskan turnamen yang sedang berjalan (running) lalu finished, lalu registration
      const sorted = [...list].sort((a, b) => {
        const order: Record<string, number> = { running: 0, finished: 1, registration: 2 };
        return (order[a.status] ?? 3) - (order[b.status] ?? 3);
      });

      setTournaments(sorted);

      if (sorted.length > 0) {
        const sessionTourney = getSessionTournament();
        const matched = sessionTourney ? sorted.find((t) => t.id === sessionTourney.id) : null;
        const chosen = matched || sorted.find((t) => t.status === 'running') || sorted[0];
        setSelectedTournament(chosen);
        setSessionTournament(chosen);
      }
    } catch (err) {
      console.error('Gagal memuat turnamen untuk ronde:', err);
    } finally {
      setLoadingTournaments(false);
    }
  };

  useEffect(() => {
    fetchTournaments();
  }, [currentUser, isAdmin]);

  // 2. Muat data ronde & pertandingan turnamen terpilih (hanya non-archived secara default)
  const fetchRoundData = async (tourneyId: string, preferredRound?: number | null) => {
    setLoadingRounds(true);
    try {
      const fetchedRounds = await getTournamentRounds(tourneyId, false);
      setRounds(fetchedRounds);

      const fetchedAllMatches = await getAllTournamentMatches(tourneyId, false);
      setAllMatches(fetchedAllMatches);

      if (fetchedRounds.length > 0) {
        // Saat turnamen dibuka atau tab Ronde dibuka kembali, ronde yang tampil harus selalu
        // selectedTournament.currentRound (cadangan: nomor ronde terbesar yang tidak diarsipkan), bukan 1.
        const activeRound =
          selectedTournament?.currentRound ||
          fetchedRounds[fetchedRounds.length - 1].number;

        const targetRound = preferredRound != null ? preferredRound : activeRound;

        setActiveRoundNumber(targetRound);
        const roundMatches = fetchedAllMatches.filter((m) => m.round === targetRound);
        setMatches(roundMatches);
      } else {
        setMatches([]);
        setActiveRoundNumber(null);
      }
    } catch (err) {
      console.error('Gagal memuat ronde:', err);
    } finally {
      setLoadingRounds(false);
    }
  };

  // Peserta Turnamen untuk Finalisasi Hasil
  const [tournamentPlayers, setTournamentPlayers] = useState<TournamentPlayer[]>([]);

  useEffect(() => {
    if (selectedTournament) {
      getTournamentPlayers(selectedTournament.id)
        .then((p) => setTournamentPlayers(p))
        .catch((e) => console.error('Gagal mengambil peserta turnamen:', e));
    } else {
      setTournamentPlayers([]);
    }
  }, [selectedTournament?.id]);

  // Realtime onSnapshot listener untuk dokumen ronde (agar timer dan status ronde tersinkronisasi)
  useEffect(() => {
    if (!selectedTournament) return;
    const roundsCol = collection(db, 'tournaments', selectedTournament.id, 'rounds');
    const unsub = onSnapshot(roundsCol, (snap) => {
      const list: TournamentRound[] = [];
      snap.forEach((d) => list.push(d.data() as TournamentRound));
      const sorted = list.sort((a, b) => a.number - b.number).filter((r) => !r.archived);
      setRounds(sorted);
    });
    return () => unsub();
  }, [selectedTournament?.id]);

  useEffect(() => {
    if (selectedTournament) {
      fetchRoundData(selectedTournament.id);
      setPairingNotice(null);
    }
  }, [selectedTournament?.id]);

  const handleSelectRound = (roundNum: number) => {
    setActiveRoundNumber(roundNum);
    const roundMatches = allMatches.filter((m) => m.round === roundNum);
    setMatches(roundMatches);
  };

  // 3. Buat Pairing Ronde X
  const handleCreatePairing = async (roundToCreate: number) => {
    if (!selectedTournament || !isOrganizer || pairingLoading) return;
    setPairingLoading(true);
    setPairingNotice(null);

    try {
      const totalRounds = selectedTournament.totalRounds || 3;
      const result = await createRoundPairing(
        selectedTournament.id,
        roundToCreate,
        selectedTournament.format,
        totalRounds
      );

      if (result.warning) {
        setPairingNotice(result.warning);
      }

      const updatedTourney = {
        ...selectedTournament,
        currentRound: roundToCreate,
        status: 'running' as const
      };
      setSelectedTournament(updatedTourney);
      setSessionTournament(updatedTourney);

      await fetchRoundData(selectedTournament.id, roundToCreate);
    } catch (err: any) {
      alert(err.message || 'Gagal membuat pairing ronde.');
    } finally {
      setPairingLoading(false);
    }
  };

  // 4. Organizer Simpan skor & koreksi hasil pertandingan
  const handleSaveScore = async (
    matchId: string,
    p1Score: number,
    p2Score: number,
    confirm: boolean
  ) => {
    if (!selectedTournament || !currentUser || !userProfile) return;
    const targetMatch = matches.find((m) => m.id === matchId);
    if (!targetMatch) return;

    const currentTourneyRound = selectedTournament.currentRound || 1;
    const totalRounds = selectedTournament.totalRounds || 3;

    // Ronde sebelumnya terkunci: cegah pengeditan langsung tanpa revert
    if (isRoundLocked(targetMatch.round, currentTourneyRound, selectedTournament.status)) {
      alert(`Ronde ${targetMatch.round} telah terkunci. Gunakan tombol Revert ke Ronde ${targetMatch.round} untuk mengoreksi skor.`);
      return;
    }

    const organizerInfo = {
      uid: currentUser.uid,
      name: userProfile.displayName || userProfile.username,
    };

    // Organizer menimpa skor pertandingan & catat audit log
    await organizerSetMatchResult(
      selectedTournament.id,
      targetMatch,
      p1Score,
      p2Score,
      organizerInfo
    );

    // Ambil data pertandingan terbaru di ronde ini
    const updatedRoundMatches = await getMatchesForRound(
      selectedTournament.id,
      targetMatch.round,
      false
    );
    // Cek jika seluruh turnamen selesai pada ronde terakhir
    const finishCheck = await checkAndFinishTournamentIfComplete(
      selectedTournament.id,
      targetMatch.round,
      totalRounds
    );
    if (finishCheck.tournamentFinished) {
      const finishedTourney = {
        ...selectedTournament,
        status: 'finished' as const,
        finishedAt: Date.now()
      };
      setSelectedTournament(finishedTourney);
      setSessionTournament(finishedTourney);
    }

    await fetchRoundData(selectedTournament.id, targetMatch.round);
  };

  // 5. Eksekusi Revert ke Ronde X
  const handleExecuteRevert = async (targetRound: number) => {
    if (!selectedTournament || !currentUser || !userProfile) return;
    const currentTourneyRound = selectedTournament.currentRound || rounds.length || 1;

    const organizerInfo = {
      uid: currentUser.uid,
      name: userProfile.displayName || userProfile.username,
    };

    await revertTournamentToRound(
      selectedTournament.id,
      targetRound,
      currentTourneyRound,
      organizerInfo
    );

    const revertedTourney = {
      ...selectedTournament,
      currentRound: targetRound,
      status: 'running' as const
    };
    setSelectedTournament(revertedTourney);
    setSessionTournament(revertedTourney);

    setPairingNotice(
      `Turnamen telah di-revert ke Ronde ${targetRound}. Anda dapat mengoreksi skor sebelum pairing Ronde ${targetRound + 1} dibuat ulang.`
    );

    await fetchRoundData(selectedTournament.id, targetRound);
  };

  // 6. Eksekusi Akhiri Turnamen dari Kartu Aksi Ronde Terakhir
  const handleFinishTournament = async () => {
    if (!selectedTournament) return;
    setFinishingTournament(true);
    setFinishError(null);
    try {
      const totalRounds = selectedTournament.totalRounds || 3;
      const res = await checkAndFinishTournamentIfComplete(
        selectedTournament.id,
        totalRounds,
        totalRounds
      );
      if (res.tournamentFinished) {
        const finishedTourney = {
          ...selectedTournament,
          status: 'finished' as const,
          finishedAt: Date.now(),
          finalized: true
        };

        // Otomatis finalisasi hasil saat turnamen diakhiri (idempoten)
        try {
          if (currentUser) {
            const playersToFinalize =
              tournamentPlayers.length > 0
                ? tournamentPlayers
                : await getTournamentPlayers(selectedTournament.id);
            const matchesToFinalize =
              allMatches.length > 0
                ? allMatches
                : await getAllTournamentMatches(selectedTournament.id, false);

            await finalizeTournamentResults(
              finishedTourney,
              playersToFinalize,
              matchesToFinalize,
              currentUser.uid,
              userProfile?.displayName || userProfile?.username || 'Organizer'
            );
          }
        } catch (finErr) {
          console.warn('Finalisasi otomatis turnamen:', finErr);
        }

        setSelectedTournament(finishedTourney);
        setSessionTournament(finishedTourney);
        setFinishConfirmModalOpen(false);
        await fetchTournaments();
      } else {
        setFinishError('Belum semua pertandingan ronde terakhir terkonfirmasi.');
      }
    } catch (err: any) {
      setFinishError(err?.message || 'Gagal mengakhiri turnamen. Pastikan koneksi internet stabil.');
    } finally {
      setFinishingTournament(false);
    }
  };

  // 6. Penukaran Pairing Manual
  const handleSwapExecute = async (
    matchA: TournamentMatch,
    playerAKey: 'p1' | 'p2',
    matchB: TournamentMatch,
    playerBKey: 'p1' | 'p2',
    force: boolean
  ) => {
    if (!selectedTournament) return { success: false, warning: 'Turnamen belum dipilih.' };
    const res = await swapPairingPlayers(
      selectedTournament.id,
      matchA,
      playerAKey,
      matchB,
      playerBKey,
      force
    );
    if (res.success) {
      await fetchRoundData(selectedTournament.id, activeRoundNumber);
    }
    return res;
  };

  // Status kelengkapan pertandingan ronde saat ini
  const totalMatchesInRound = matches.length;
  const confirmedMatchesCount = matches.filter((m) => m.status === 'confirmed').length;
  const isAllMatchesConfirmed =
    totalMatchesInRound > 0 && confirmedMatchesCount === totalMatchesInRound;

  const totalRounds = selectedTournament?.totalRounds || 3;
  const currentTourneyRound = selectedTournament?.currentRound || rounds.length || 1;
  const tourneyStatus = selectedTournament?.status || 'registration';

  const isCurrentRoundLocked = isRoundLocked(
    activeRoundNumber || currentTourneyRound,
    currentTourneyRound,
    tourneyStatus
  );

  const hasNoScoresYet =
    matches.length > 0 &&
    matches.every(
      (m) => m.p2Id === null || (m.status === 'pending' && m.p1Score === 0 && m.p2Score === 0)
    );

  const isOrganizerOwner = Boolean(
    isOrganizer && selectedTournament && (selectedTournament.organizerId === currentUser?.uid || isAdmin)
  );

  const activeRound = activeRoundNumber || currentTourneyRound;
  const nextRoundExists =
    rounds.some((r) => r.number === activeRound + 1 && !r.archived) ||
    allMatches.some((m) => m.round === activeRound + 1 && !m.archived);

  const isPauseActive =
    tourneyStatus === 'running' &&
    shouldShowNextRoundPause(matches, activeRound, totalRounds, nextRoundExists);

  const canCreateRound1 =
    tourneyStatus === 'running' && rounds.length === 0;

  const pastMatchRecords: PastMatchRecord[] = allMatches
    .filter((m) => m.round < (activeRoundNumber || currentTourneyRound) && !m.archived)
    .map((m) => ({ round: m.round, p1Id: m.p1Id, p2Id: m.p2Id }));

  return (
    <div className="flex flex-col gap-4">
      {/* Header Halaman */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-section-title text-dark-text font-semibold flex items-center gap-2">
            <Timer className="text-accent" size={20} />
            Manajemen Ronde
          </h2>
          <p className="text-caption text-dark-muted">
            Pairing sistem Swiss, hasil meja, dan kontrol revert ronde
          </p>
        </div>
        <div className="flex items-center gap-1.5">
          {selectedTournament && (
            <Button
              variant="secondary"
              className="!min-h-[36px] !px-2.5 !text-caption"
              onClick={() => setAuditLogModalOpen(true)}
              icon={<ShieldAlert size={15} className="text-accent" />}
              title="Log Keamanan Turnamen"
            />
          )}
          {selectedTournament && (
            <Button
              variant="secondary"
              className="!min-h-[36px] !px-2.5 !text-caption"
              onClick={() => fetchRoundData(selectedTournament.id, activeRoundNumber ?? undefined)}
              icon={<RefreshCw size={15} className={loadingRounds ? 'animate-spin' : ''} />}
            />
          )}
        </div>
      </div>

      {/* Pemilihan Turnamen */}
      {loadingTournaments ? (
        <Card variant="surface" className="text-center py-6 text-caption text-dark-muted">
          Memuat data turnamen...
        </Card>
      ) : tournaments.length === 0 ? (
        <Card variant="surface" className="my-2">
          <EmptyState
            icon={Trophy}
            message="Belum ada turnamen yang Anda buat. Buka menu Turnamen Saya untuk membuat turnamen baru."
          />
        </Card>
      ) : (
        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-1.5">
            <label className="text-caption font-medium text-dark-muted">Pilih Turnamen:</label>
            <select
              value={selectedTournament?.id || ''}
              onChange={(e) => {
                const found = tournaments.find((t) => t.id === e.target.value);
                if (found) {
                  setSelectedTournament(found);
                  setSessionTournament(found);
                }
              }}
              className="w-full bg-dark-surface border border-dark-border rounded-btn px-3 py-2 text-caption text-dark-text focus:outline-none focus:border-accent"
            >
              {tournaments.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name} ({t.status === 'running' ? 'Berjalan' : t.status === 'finished' ? 'Selesai' : 'Pendaftaran'}) - #{t.joinCode}
                </option>
              ))}
            </select>
          </div>

          {selectedTournament && (
            <Card variant="surface-high" className="flex flex-col gap-2 p-3">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-body font-semibold text-dark-text">
                      {selectedTournament.name}
                    </span>
                    <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-accent/10 text-accent border border-accent/20">
                      {selectedTournament.format}
                    </span>
                  </div>
                  <span className="text-caption text-dark-muted mt-0.5 block">
                    Total: <strong className="text-dark-text">{totalRounds} Ronde</strong>
                    {selectedTournament.currentRound ? ` • Ronde Aktif: ${selectedTournament.currentRound}` : ''}
                  </span>
                </div>
                <StatusBadge
                  label={
                    selectedTournament.status === 'registration'
                      ? 'Pendaftaran'
                      : selectedTournament.status === 'running'
                      ? 'Sedang Berjalan'
                      : 'Selesai'
                  }
                  variant={
                    selectedTournament.status === 'registration'
                      ? 'yellow'
                      : selectedTournament.status === 'running'
                      ? 'green'
                      : 'neutral'
                  }
                />
              </div>

              {selectedTournament.status === 'registration' && (
                <div className="p-2.5 rounded bg-status-yellow/10 border border-status-yellow/30 text-status-yellow text-caption flex items-start gap-2 mt-1">
                  <AlertTriangle size={16} className="flex-shrink-0 mt-0.5" />
                  <span>
                    Turnamen ini masih dalam tahap pendaftaran. Silakan mulai turnamen terlebih dahulu di menu <strong>Turnamen Saya</strong> untuk memulai pairing ronde 1.
                  </span>
                </div>
              )}
            </Card>
          )}

          {/* Jika turnamen berstatus running atau finished */}
          {selectedTournament && selectedTournament.status !== 'registration' && (
            <div className="flex flex-col gap-3 mt-1">
              {/* Notifikasi Pairing / Revert Notice */}
              {pairingNotice && (
                <div className="p-3 rounded bg-accent/10 border border-accent/30 text-caption text-accent flex items-start justify-between gap-2">
                  <div className="flex items-start gap-2">
                    <CheckCircle2 size={16} className="flex-shrink-0 mt-0.5" />
                    <span>{pairingNotice}</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setPairingNotice(null)}
                    className="text-[11px] opacity-70 hover:opacity-100"
                  >
                    Tutup
                  </button>
                </div>
              )}

              {/* Tab Pemilihan Ronde & Tombol Revert */}
              <div className="flex items-center justify-between gap-2">
                {rounds.length > 0 && (
                  <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none flex-1">
                    {rounds.map((r) => {
                      const isCurrentTab = r.number === activeRoundNumber;
                      const isLockedTab = isRoundLocked(r.number, currentTourneyRound, tourneyStatus);
                      return (
                        <button
                          key={r.number}
                          type="button"
                          onClick={() => handleSelectRound(r.number)}
                          className={`min-h-[38px] px-3.5 rounded-btn text-caption font-medium whitespace-nowrap transition-colors flex items-center gap-1.5 ${
                            isCurrentTab
                              ? 'bg-accent text-dark-bg font-semibold shadow'
                              : 'bg-dark-surface border border-dark-border text-dark-muted hover:text-dark-text'
                          }`}
                        >
                          <span>Ronde {r.number}</span>
                          {isLockedTab && <Lock size={12} className={isCurrentTab ? 'text-dark-bg' : 'text-dark-muted'} />}
                          {r.status === 'completed' && !isLockedTab && <CheckCircle2 size={13} />}
                        </button>
                      );
                    })}
                  </div>
                )}

                {/* Tombol Revert ke Ronde X */}
                {isOrganizer && rounds.length > 1 && (
                  <button
                    type="button"
                    onClick={() => setRevertModalTarget(activeRoundNumber || currentTourneyRound)}
                    className="flex-shrink-0 text-[11px] font-medium text-status-yellow hover:text-status-yellow/80 flex items-center gap-1 px-2.5 py-1.5 rounded bg-status-yellow/10 border border-status-yellow/30 transition-colors"
                    title={`Revert ke Ronde ${activeRoundNumber || currentTourneyRound}`}
                  >
                    <History size={13} />
                    <span>Revert ke R{activeRoundNumber || currentTourneyRound}</span>
                  </button>
                )}
              </div>

              {/* Bilah Aksi Ronde: Tombol Buat Pairing Ronde 1 (Awal Turnamen) */}
              {canCreateRound1 && isOrganizer && (
                <Card variant="surface" className="flex flex-col gap-2 p-3 border-accent/40 bg-accent/5">
                  <div className="flex items-center justify-between gap-2">
                    <div>
                      <span className="text-body font-semibold text-dark-text block">
                        Pairing Ronde 1
                      </span>
                      <span className="text-caption text-dark-muted">
                        Mulai turnamen dengan membuat pairing Ronde 1 (acak penuh)
                      </span>
                    </div>
                    <Button
                      variant="primary"
                      className="!min-h-[38px] !px-3.5 !text-caption whitespace-nowrap"
                      onClick={() => handleCreatePairing(1)}
                      isLoading={pairingLoading}
                      disabled={pairingLoading}
                      icon={<Play size={14} />}
                    >
                      Buat Pairing Ronde 1
                    </Button>
                  </div>
                </Card>
              )}

              {/* Kartu Jeda Sebelum Pindah ke Ronde Berikutnya */}
              {isPauseActive && (
                <Card variant="surface" className="flex flex-col gap-2 p-3.5 border-accent/40 bg-accent/5">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div>
                      <span className="text-body font-semibold text-dark-text flex items-center gap-1.5">
                        <CheckCircle2 size={16} className="text-status-green" />
                        Semua pertandingan Ronde {activeRound} sudah terkonfirmasi
                      </span>
                      <span className="text-caption text-dark-muted mt-0.5 block">
                        Periksa hasil terlebih dahulu. Pairing Ronde {activeRound + 1} baru dibuat setelah Anda melanjutkan.
                      </span>
                    </div>
                    {isOrganizerOwner ? (
                      <Button
                        variant="primary"
                        className="!min-h-[40px] !px-4 !text-caption whitespace-nowrap"
                        onClick={() => handleCreatePairing(activeRound + 1)}
                        isLoading={pairingLoading}
                        disabled={pairingLoading}
                        icon={<Play size={14} />}
                      >
                        Lanjut ke Ronde {activeRound + 1}
                      </Button>
                    ) : (
                      <div className="text-caption font-medium text-status-yellow flex items-center gap-1.5 bg-status-yellow/10 px-3 py-1.5 rounded-btn border border-status-yellow/30 w-fit">
                        <Clock size={14} />
                        <span>Menunggu organizer melanjutkan ke Ronde {activeRound + 1}</span>
                      </div>
                    )}
                  </div>
                </Card>
              )}

              {/* Progres ronde (muncul untuk ronde yang belum seluruh pertandingannya terkonfirmasi) */}
              {rounds.length > 0 &&
                !isAllMatchesConfirmed &&
                selectedTournament.status === 'running' && (
                  <div className="p-2.5 rounded bg-dark-surface border border-dark-border text-caption text-dark-muted flex items-center justify-between">
                    <span>
                      Progres Ronde {activeRoundNumber || currentTourneyRound}:{' '}
                      <strong className="text-accent">
                        {confirmedMatchesCount} dari {totalMatchesInRound}
                      </strong>{' '}
                      pertandingan terkonfirmasi.
                    </span>
                  </div>
                )}

              {/* Kartu Aksi: Akhiri Turnamen pada Ronde Terakhir */}
              {selectedTournament.status === 'running' &&
                rounds.length === totalRounds &&
                isAllMatchesConfirmed && (
                  <Card variant="surface" className="flex flex-col gap-2 p-3.5 border-accent/40 bg-accent/5">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                      <div>
                        <span className="text-body font-semibold text-dark-text flex items-center gap-1.5">
                          <CheckCircle2 size={16} className="text-status-green" />
                          Semua pertandingan ronde terakhir sudah terkonfirmasi
                        </span>
                        <span className="text-caption text-dark-muted">
                          {isOrganizerOwner
                            ? 'Turnamen siap diakhiri untuk membuka finalisasi peringkat akhir dan pengisian deck.'
                            : 'Menunggu organizer mengakhiri turnamen'}
                        </span>
                      </div>
                      {isOrganizerOwner ? (
                        <Button
                          variant="primary"
                          className="!min-h-[40px] !px-4 !text-caption whitespace-nowrap"
                          onClick={() => setFinishConfirmModalOpen(true)}
                          icon={<Trophy size={15} />}
                        >
                          Akhiri Turnamen
                        </Button>
                      ) : (
                        <div className="text-caption font-medium text-status-yellow flex items-center gap-1.5 bg-status-yellow/10 px-3 py-1.5 rounded-btn border border-status-yellow/30 w-fit">
                          <Clock size={14} />
                          <span>Menunggu organizer mengakhiri turnamen</span>
                        </div>
                      )}
                    </div>
                  </Card>
                )}

              {/* Komponen Timer Ronde */}
              {rounds.length > 0 && (
                <RoundTimerCard
                  tournamentId={selectedTournament.id}
                  round={rounds.find((r) => r.number === (activeRoundNumber || currentTourneyRound)) || null}
                  isOrganizer={isOrganizer}
                  format={selectedTournament.format}
                  onTimerUpdated={() => fetchRoundData(selectedTournament.id, activeRoundNumber ?? undefined)}
                />
              )}

              {/* Banner Turnamen Selesai */}
              {selectedTournament.status === 'finished' && (
                <div className="flex flex-col gap-3">
                  <div className="p-3 rounded-card bg-accent/10 border border-accent/30 flex items-center justify-between gap-2 text-caption text-accent font-medium">
                    <div className="flex items-center gap-2">
                      <Trophy size={18} />
                      <span>Turnamen Selesai! Seluruh {totalRounds} ronde telah tuntas dipertandingkan.</span>
                    </div>
                    {isOrganizer && (
                      <button
                        type="button"
                        onClick={() => setRevertModalTarget(rounds.length)}
                        className="text-[11px] underline text-dark-text hover:text-accent whitespace-nowrap"
                      >
                        Koreksi / Revert
                      </button>
                    )}
                  </div>

                  {/* Bagian Finalisasi Hasil, Pengisian Deck & Ekspor Laporan */}
                  <FinalResultsSection
                    tournament={selectedTournament}
                    players={tournamentPlayers}
                    matches={allMatches}
                    isOrganizer={isOrganizer}
                    onTournamentUpdated={() => fetchTournaments()}
                  />
                </div>
              )}

              {/* Kontrol Tukar Pairing Manual (hanya untuk ronde aktif yang belum ada skornya) */}
              {isOrganizer && matches.length > 1 && selectedTournament.status === 'running' && !isCurrentRoundLocked && hasNoScoresYet && (
                <div className="flex items-center justify-between px-1">
                  <span className="text-caption text-dark-muted font-medium">
                    Meja Pertandingan (Ronde {activeRoundNumber || currentTourneyRound}):
                  </span>
                  <button
                    type="button"
                    onClick={() => setSwapModalOpen(true)}
                    className="text-[11px] text-accent hover:underline flex items-center gap-1 font-medium py-1"
                  >
                    <ArrowLeftRight size={13} />
                    Tukar Pairing Manual
                  </button>
                </div>
              )}

              {/* Daftar Meja Pertandingan */}
              {loadingRounds ? (
                <Card variant="surface" className="text-center py-8 text-caption text-dark-muted">
                  Memuat data meja pertandingan...
                </Card>
              ) : matches.length === 0 ? (
                <Card variant="surface" className="text-center py-8">
                  <EmptyState
                    icon={Swords}
                    message={
                      rounds.length === 0
                        ? 'Belum ada ronde yang dibuat. Klik tombol Buat Pairing Ronde 1 di atas.'
                        : `Tidak ada data pertandingan aktif untuk Ronde ${activeRoundNumber || currentTourneyRound}.`
                    }
                  />
                </Card>
              ) : (
                <div className="flex flex-col gap-2.5">
                  {matches.map((match) => {
                    const isBye = match.p2Id === null;
                    const isConfirmed = match.status === 'confirmed';

                    return (
                      <Card
                        key={match.id}
                        variant="surface"
                        className={`p-3.5 transition-colors ${
                          !isCurrentRoundLocked && isOrganizer && !isBye
                            ? 'cursor-pointer hover:border-accent/40'
                            : 'cursor-default'
                        } ${match.status === 'disputed' ? 'border-status-red/60 bg-status-red/5' : ''}`}
                        onClick={() => {
                          if (isOrganizer && !isBye && !isCurrentRoundLocked) {
                            setScoreModalMatch(match);
                          }
                        }}
                      >
                        {/* Header Meja */}
                        <div className="flex items-center justify-between pb-2 border-b border-dark-border/60">
                          <span className="text-caption font-mono font-semibold text-accent">
                            {isBye ? 'BYE (Tanpa Lawan)' : `Meja #${match.table}`}
                          </span>
                          <div className="flex items-center gap-1.5">
                            {isCurrentRoundLocked && (
                              <span className="text-[10px] font-mono text-dark-muted flex items-center gap-1 bg-dark-surface-high border border-dark-border px-1.5 py-0.5 rounded">
                                <Lock size={11} />
                                Terkunci
                              </span>
                            )}
                            <StatusBadge
                              label={
                                match.status === 'confirmed'
                                  ? 'Terkonfirmasi'
                                  : match.status === 'awaiting'
                                  ? 'Menunggu Konfirmasi'
                                  : match.status === 'disputed'
                                  ? 'Bermasalah (Disputed)'
                                  : 'Belum Selesai'
                              }
                              variant={
                                match.status === 'confirmed'
                                  ? 'green'
                                  : match.status === 'awaiting'
                                  ? 'yellow'
                                  : match.status === 'disputed'
                                  ? 'red'
                                  : 'neutral'
                              }
                            />
                          </div>
                        </div>

                        {/* Konten Pertandingan: Pemain 1 VS Pemain 2 */}
                        <div className="grid grid-cols-5 items-center py-3">
                          {/* Pemain 1 */}
                          <div className="col-span-2 flex flex-col min-w-0">
                            <span className="text-body font-semibold text-dark-text truncate">
                              {match.p1Name}
                            </span>
                            <span className="text-[11px] font-mono text-dark-muted">Pemain 1</span>
                          </div>

                          {/* Skor / VS */}
                          <div className="col-span-1 flex flex-col items-center justify-center">
                            {isConfirmed ? (
                              <span className="font-mono font-bold text-lg text-accent">
                                {match.p1Score} - {match.p2Score}
                              </span>
                            ) : (
                              <span className="text-caption font-bold text-dark-muted">VS</span>
                            )}
                          </div>

                          {/* Pemain 2 */}
                          <div className="col-span-2 flex flex-col items-end text-right min-w-0">
                            <span className={`text-body font-semibold truncate ${isBye ? 'text-dark-muted italic' : 'text-dark-text'}`}>
                              {match.p2Name}
                            </span>
                            <span className="text-[11px] font-mono text-dark-muted">
                              {isBye ? 'Otomatis Menang' : 'Pemain 2'}
                            </span>
                          </div>
                        </div>

                        {/* Petunjuk Interaksi Organizer */}
                        {isOrganizer && !isBye && (
                          <div className="pt-2 border-t border-dark-border/40 flex items-center justify-between text-[11px] text-dark-muted">
                            {isCurrentRoundLocked ? (
                              <span className="text-dark-muted italic flex items-center gap-1">
                                <Lock size={12} className="text-dark-muted" />
                                Ronde terkunci. Untuk mengubah skor, gunakan Revert ke Ronde {activeRoundNumber || currentTourneyRound}.
                              </span>
                            ) : (
                              <>
                                <span>
                                  {isConfirmed
                                    ? 'Klik kartu untuk koreksi / timpa skor'
                                    : 'Klik kartu untuk input skor & konfirmasi'}
                                </span>
                                <ChevronRight size={13} className="text-dark-muted" />
                              </>
                            )}
                          </div>
                        )}
                      </Card>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Modal Input Skor Organizer */}
      <MatchScoreModal
        isOpen={Boolean(scoreModalMatch)}
        onClose={() => setScoreModalMatch(null)}
        match={scoreModalMatch}
        format={selectedTournament?.format || 'BO3'}
        onSaveScore={handleSaveScore}
      />

      {/* Modal Tukar Pairing Manual */}
      <ManualSwapModal
        isOpen={swapModalOpen}
        onClose={() => setSwapModalOpen(false)}
        matches={matches}
        pastMatches={pastMatchRecords}
        onSwap={handleSwapExecute}
      />

      {/* Modal Revert ke Ronde X */}
      <RevertRoundModal
        isOpen={Boolean(revertModalTarget)}
        onClose={() => setRevertModalTarget(null)}
        targetRoundNumber={revertModalTarget || 1}
        currentRoundNumber={selectedTournament?.currentRound || rounds.length || 1}
        onConfirmRevert={handleExecuteRevert}
      />

      {/* Modal Log Keamanan Turnamen */}
      <TournamentAuditLogModal
        isOpen={auditLogModalOpen}
        onClose={() => setAuditLogModalOpen(false)}
        tournamentId={selectedTournament?.id || ''}
        tournamentName={selectedTournament?.name || ''}
      />

      {/* BottomSheet Konfirmasi Akhiri Turnamen */}
      <BottomSheet
        isOpen={finishConfirmModalOpen}
        onClose={() => !finishingTournament && setFinishConfirmModalOpen(false)}
        title="Akhiri Turnamen"
      >
        <div className="flex flex-col gap-4 py-2 pb-6">
          <div className="p-3.5 rounded-card bg-status-green/10 border border-status-green/30 text-status-green flex items-start gap-2.5">
            <CheckCircle2 size={20} className="flex-shrink-0 mt-0.5" />
            <div className="text-caption text-dark-text">
              <span className="font-bold text-body block mb-0.5 text-status-green">
                Seluruh {totalRounds} Ronde Telah Selesai
              </span>
              <span>
                Semua pertandingan ronde terakhir telah terkonfirmasi. Mengakhiri turnamen akan mengubah status turnamen menjadi <strong>Selesai</strong> dan langsung membuka bagian Finalisasi Hasil serta pengisian Deck untuk seluruh peserta.
              </span>
            </div>
          </div>

          {finishError && (
            <div className="p-3 bg-status-red/10 border border-status-red/30 rounded-card text-caption text-status-red flex items-start gap-2">
              <AlertTriangle size={16} className="flex-shrink-0 mt-0.5" />
              <span>{finishError}</span>
            </div>
          )}

          <div className="grid grid-cols-2 gap-2.5 pt-2">
            <Button
              variant="secondary"
              onClick={() => setFinishConfirmModalOpen(false)}
              disabled={finishingTournament}
            >
              Batal
            </Button>
            <Button
              variant="primary"
              onClick={handleFinishTournament}
              isLoading={finishingTournament}
              icon={<Trophy size={16} />}
            >
              Akhiri Sekarang
            </Button>
          </div>
        </div>
      </BottomSheet>
    </div>
  );
};
