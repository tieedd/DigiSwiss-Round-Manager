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
import { PastMatchRecord } from '../../utils/swissPairing';
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
  RotateCcw
} from 'lucide-react';

export const RoundsView: React.FC = () => {
  const { currentUser, userProfile } = useAuth();
  const isOrganizer = userProfile?.role === 'organizer' || userProfile?.role === 'admin';
  const isAdmin = userProfile?.role === 'admin';

  // Tournaments
  const [tournaments, setTournaments] = useState<Tournament[]>([]);
  const [selectedTournament, setSelectedTournament] = useState<Tournament | null>(null);
  const [loadingTournaments, setLoadingTournaments] = useState(true);

  // Rounds & Matches
  const [rounds, setRounds] = useState<TournamentRound[]>([]);
  const [activeRoundNumber, setActiveRoundNumber] = useState<number>(1);
  const [matches, setMatches] = useState<TournamentMatch[]>([]);
  const [allMatches, setAllMatches] = useState<TournamentMatch[]>([]);
  const [loadingRounds, setLoadingRounds] = useState(false);
  const [pairingLoading, setPairingLoading] = useState(false);
  const [pairingNotice, setPairingNotice] = useState<string | null>(null);

  // Revert & Peringatan Koreksi Tanpa Revert
  const [unrevertedNotice, setUnrevertedNotice] = useState<{
    round: number;
    nextRound: number;
  } | null>(null);
  const [revertModalTarget, setRevertModalTarget] = useState<number | null>(null);
  const [auditLogModalOpen, setAuditLogModalOpen] = useState(false);

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

      // Jika belum ada turnamen terpilih, pilih turnamen running pertama
      if (sorted.length > 0 && !selectedTournament) {
        const runningTourney = sorted.find((t) => t.status === 'running') || sorted[0];
        setSelectedTournament(runningTourney);
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
  const fetchRoundData = async (tourneyId: string, preferredRound?: number) => {
    setLoadingRounds(true);
    try {
      const fetchedRounds = await getTournamentRounds(tourneyId, false);
      setRounds(fetchedRounds);

      const fetchedAllMatches = await getAllTournamentMatches(tourneyId, false);
      setAllMatches(fetchedAllMatches);

      if (fetchedRounds.length > 0) {
        const targetRound =
          preferredRound ||
          (fetchedRounds.some((r) => r.number === activeRoundNumber)
            ? activeRoundNumber
            : fetchedRounds[fetchedRounds.length - 1].number);

        setActiveRoundNumber(targetRound);
        const roundMatches = fetchedAllMatches.filter((m) => m.round === targetRound);
        setMatches(roundMatches);
      } else {
        setMatches([]);
        setActiveRoundNumber(1);
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
      setUnrevertedNotice(null);
    }
  }, [selectedTournament?.id]);

  const handleSelectRound = (roundNum: number) => {
    setActiveRoundNumber(roundNum);
    const roundMatches = allMatches.filter((m) => m.round === roundNum);
    setMatches(roundMatches);
  };

  // 3. Buat Pairing Ronde X
  const handleCreatePairing = async (roundToCreate: number) => {
    if (!selectedTournament || !isOrganizer) return;
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

    const currentTourneyRound = selectedTournament.currentRound || 1;
    const totalRounds = selectedTournament.totalRounds || 3;

    // Skenario A: Mengoreksi ronde yang sudah selesai tanpa revert (X < currentRound)
    if (targetMatch.round < currentTourneyRound) {
      setUnrevertedNotice({
        round: targetMatch.round,
        nextRound: targetMatch.round + 1,
      });
      await fetchRoundData(selectedTournament.id, targetMatch.round);
      return;
    }

    // Skenario B: Mengoreksi ronde aktif saat ini (X === currentRound)
    // Ambil data pertandingan terbaru di ronde ini
    const updatedRoundMatches = await getMatchesForRound(
      selectedTournament.id,
      targetMatch.round,
      false
    );
    const allNowConfirmed = updatedRoundMatches.every((m) => m.status === 'confirmed');

    if (allNowConfirmed && targetMatch.round < totalRounds) {
      // Periksa apakah ronde berikutnya (X+1) belum ada/telah di-revert
      const nextRoundMatches = await getMatchesForRound(
        selectedTournament.id,
        targetMatch.round + 1,
        false
      );

      if (nextRoundMatches.length === 0) {
        // Sistem OTOMATIS membuat ulang pairing ronde X+1 dari klasemen yang sudah diperbaiki
        try {
          const autoPairResult = await createRoundPairing(
            selectedTournament.id,
            targetMatch.round + 1,
            selectedTournament.format,
            totalRounds
          );

          setPairingNotice(
            `Pairing Ronde ${targetMatch.round + 1} telah otomatis dibuat ulang berdasarkan klasemen terbaru tanpa tanding ulang.`
          );
          await fetchRoundData(selectedTournament.id, targetMatch.round + 1);
          return;
        } catch (err: any) {
          console.error('Gagal membuat ulang pairing otomatis:', err);
        }
      }
    }

    // Skenario C: Ronde terakhir
    const finishCheck = await checkAndFinishTournamentIfComplete(
      selectedTournament.id,
      targetMatch.round,
      totalRounds
    );
    if (finishCheck.tournamentFinished) {
      setSelectedTournament((prev) => (prev ? { ...prev, status: 'finished' } : null));
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

    setSelectedTournament((prev) =>
      prev ? { ...prev, currentRound: targetRound, status: 'running' } : null
    );
    setUnrevertedNotice(null);
    setPairingNotice(
      `Turnamen telah di-revert ke Ronde ${targetRound}. Anda dapat mengoreksi skor sebelum pairing Ronde ${targetRound + 1} dibuat ulang.`
    );

    await fetchRoundData(selectedTournament.id, targetRound);
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
  const canCreateNextRound =
    selectedTournament?.status === 'running' &&
    rounds.length < totalRounds &&
    (rounds.length === 0 || isAllMatchesConfirmed);

  const nextRoundNumberToCreate = rounds.length + 1;

  const pastMatchRecords: PastMatchRecord[] = allMatches
    .filter((m) => m.round < activeRoundNumber && !m.archived)
    .map((m) => ({ round: m.round, p1Id: m.p1Id, p2Id: m.p2Id }));

  return (
    <div className="flex flex-col gap-4 pb-24">
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
              onClick={() => fetchRoundData(selectedTournament.id, activeRoundNumber)}
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
                if (found) setSelectedTournament(found);
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
              {/* Notifikasi Peringatan Koreksi Tanpa Revert */}
              {unrevertedNotice && isOrganizer && (
                <div className="p-3 rounded-card bg-status-yellow/10 border border-status-yellow/30 text-caption text-status-yellow flex flex-col gap-2">
                  <div className="flex items-start gap-2">
                    <AlertTriangle size={17} className="flex-shrink-0 mt-0.5" />
                    <span>
                      Skor Ronde {unrevertedNotice.round} telah diperbarui, namun <strong>pairing ronde berikutnya ({unrevertedNotice.nextRound}) tidak berubah secara otomatis</strong> karena turnamen belum di-revert.
                    </span>
                  </div>
                  <div className="flex items-center gap-2 pt-1">
                    <Button
                      variant="primary"
                      className="!min-h-[32px] !px-3 !text-[11px]"
                      onClick={() => setRevertModalTarget(unrevertedNotice.round)}
                      icon={<RotateCcw size={13} />}
                    >
                      Revert dan Buat Ulang Pairing
                    </Button>
                    <button
                      type="button"
                      onClick={() => setUnrevertedNotice(null)}
                      className="text-[11px] text-dark-muted hover:underline"
                    >
                      Abaikan
                    </button>
                  </div>
                </div>
              )}

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
                          {r.status === 'completed' && <CheckCircle2 size={13} />}
                        </button>
                      );
                    })}
                  </div>
                )}

                {/* Tombol Revert ke Ronde X */}
                {isOrganizer && rounds.length > 1 && (
                  <button
                    type="button"
                    onClick={() => setRevertModalTarget(activeRoundNumber)}
                    className="flex-shrink-0 text-[11px] font-medium text-status-yellow hover:text-status-yellow/80 flex items-center gap-1 px-2.5 py-1.5 rounded bg-status-yellow/10 border border-status-yellow/30 transition-colors"
                    title={`Revert ke Ronde ${activeRoundNumber}`}
                  >
                    <History size={13} />
                    <span>Revert ke R{activeRoundNumber}</span>
                  </button>
                )}
              </div>

              {/* Bilah Aksi Ronde: Tombol Buat Pairing Ronde X */}
              {canCreateNextRound && isOrganizer && (
                <Card variant="surface" className="flex flex-col gap-2 p-3 border-accent/40 bg-accent/5">
                  <div className="flex items-center justify-between gap-2">
                    <div>
                      <span className="text-body font-semibold text-dark-text block">
                        Pairing Ronde {nextRoundNumberToCreate}
                      </span>
                      <span className="text-caption text-dark-muted">
                        {rounds.length === 0
                          ? 'Mulai turnamen dengan membuat pairing Ronde 1 (acak penuh)'
                          : `Seluruh pertandingan Ronde ${rounds.length} terkonfirmasi. Lanjut ke Ronde ${nextRoundNumberToCreate}.`}
                      </span>
                    </div>
                    <Button
                      variant="primary"
                      className="!min-h-[38px] !px-3.5 !text-caption whitespace-nowrap"
                      onClick={() => handleCreatePairing(nextRoundNumberToCreate)}
                      isLoading={pairingLoading}
                      icon={<Play size={14} />}
                    >
                      Buat Pairing Ronde {nextRoundNumberToCreate}
                    </Button>
                  </div>
                </Card>
              )}

              {/* Jika masih ada pertandingan belum confirmed di ronde terakhir */}
              {rounds.length > 0 &&
                rounds.length < totalRounds &&
                !isAllMatchesConfirmed &&
                selectedTournament.status === 'running' && (
                  <div className="p-2.5 rounded bg-dark-surface border border-dark-border text-caption text-dark-muted flex items-center justify-between">
                    <span>
                      Progres Ronde {activeRoundNumber}:{' '}
                      <strong className="text-accent">
                        {confirmedMatchesCount} dari {totalMatchesInRound}
                      </strong>{' '}
                      pertandingan terkonfirmasi.
                    </span>
                  </div>
                )}

              {/* Komponen Timer Ronde (Angka 48px+ Tabular, Real-time bagi Semua Pengguna, Kontrol Organizer) */}
              {rounds.length > 0 && (
                <RoundTimerCard
                  tournamentId={selectedTournament.id}
                  round={rounds.find((r) => r.number === activeRoundNumber) || null}
                  isOrganizer={isOrganizer}
                  format={selectedTournament.format}
                  onTimerUpdated={() => fetchRoundData(selectedTournament.id, activeRoundNumber)}
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

              {/* Kontrol Tukar Pairing Manual */}
              {isOrganizer && matches.length > 1 && selectedTournament.status === 'running' && (
                <div className="flex items-center justify-between px-1">
                  <span className="text-caption text-dark-muted font-medium">
                    Meja Pertandingan (Ronde {activeRoundNumber}):
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
                        : `Tidak ada data pertandingan aktif untuk Ronde ${activeRoundNumber}.`
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
                          isOrganizer ? 'cursor-pointer hover:border-accent/40' : ''
                        } ${match.status === 'disputed' ? 'border-status-red/60 bg-status-red/5' : ''}`}
                        onClick={() => {
                          if (isOrganizer && !isBye) {
                            setScoreModalMatch(match);
                          }
                        }}
                      >
                        {/* Header Meja */}
                        <div className="flex items-center justify-between pb-2 border-b border-dark-border/60">
                          <span className="text-caption font-mono font-semibold text-accent">
                            {isBye ? 'BYE (Tanpa Lawan)' : `Meja #${match.table}`}
                          </span>
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

                        {/* Konten Pertandingan: Pemain 1 VS Pemain 2 */}
                        <div className="grid grid-cols-5 items-center py-3">
                          {/* Pemain 1 */}
                          <div className="col-span-2 flex flex-col">
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
                          <div className="col-span-2 flex flex-col items-end text-right">
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
                            <span>
                              {isConfirmed
                                ? 'Klik kartu untuk koreksi / timpa skor'
                                : 'Klik kartu untuk input skor & konfirmasi'}
                            </span>
                            <ChevronRight size={13} className="text-dark-muted" />
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
    </div>
  );
};
