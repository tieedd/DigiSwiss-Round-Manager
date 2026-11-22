import React, { useState, useEffect } from 'react';
import { collection, onSnapshot } from 'firebase/firestore';
import { db } from '../../firebaseConfig';
import {
  Tournament,
  TournamentRound,
  TournamentMatch,
  TournamentPlayer,
  MatchStatus,
  TopCutSize,
  MatchGameRecord
} from '../../types';
import { useAuth } from '../../context/AuthContext';
import { Card } from '../../components/common/Card';
import { Button } from '../../components/common/Button';
import { StatusBadge } from '../../components/common/StatusBadge';
import { EmptyState } from '../../components/common/EmptyState';
import { ConfirmSheet } from '../../components/common/ConfirmSheet';
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
  finishTournamentExplicit,
  startTopCutPhase,
  createNextTopCutRound,
  revertTournamentToRound
} from '../../services/roundService';
import { MatchScoreModal } from '../rounds/MatchScoreModal';
import { ManualSwapModal } from '../rounds/ManualSwapModal';
import { RevertRoundModal } from '../rounds/RevertRoundModal';
import { TournamentAuditLogModal } from '../rounds/TournamentAuditLogModal';
import { RoundTimerCard } from '../../components/rounds/RoundTimerCard';
import { TopCutBracketCard } from '../../components/rounds/TopCutBracketCard';
import { FinalResultsSection } from '../tournaments/FinalResultsSection';
import { finalizeTournamentResults } from '../../services/participationService';
import { BottomSheet } from '../../components/common/BottomSheet';
import { PastMatchRecord } from '../../utils/swissPairing';
import { isRoundLocked } from '../../utils/roundLockLogic';
import { shouldShowNextRoundPause } from '../../utils/roundPauseLogic';
import {
  buildTopCutSeeds,
  checkTopCutEligibility,
  filterSwissMatches,
  getNextTopCutRoundLabel,
  getRoundDisplayLabel,
  isFinalTopCutRound
} from '../../utils/topCutLogic';
import { getSessionTournament, setSessionTournament } from '../../utils/sessionStore';
import { findDuplicatePlayersInRound } from '../../utils/playerLinkLogic';
import { LeagueSeasonBadge } from '../../components/tournaments/LeagueSeasonBadge';
import {
  formatSeasonLabel,
  isLeagueTournament,
  isRoundTimerEnabledForTournament,
  isTopCutMandatoryForTournament
} from '../../utils/seasonLogic';
import { LeagueMatchGamesModal } from '../../components/rounds/LeagueMatchGamesModal';
import { MatchGamesBreakdown } from '../../components/rounds/MatchGamesBreakdown';
import { isLeaguePerGameMatch } from '../../utils/matchGamesLogic';
import { useToast } from '../../context/ToastContext';
import { saveFileNative, copyTextNative } from '../../services/nativeBridge';
import {
  buildLeagueRoundExportFileName,
  buildLeagueRoundPairingExportData,
  buildLeagueRoundStandingsExportData,
  buildLeagueTopCutBracketExportData,
  buildWaitingMatchesList,
  formatWaitingMatchesReminderText,
  generateLeagueRoundPairingText,
  generateLeagueRoundStandingCsv,
  generateLeagueRoundStandingText,
  generateLeagueTopCutBracketText
} from '../../utils/roundExportLogic';
import {
  exportLeagueRoundPairingToImage,
  exportLeagueRoundStandingToImage,
  exportLeagueTopCutBracketToImage
} from '../../utils/canvasRoundExport';
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
  Lock,
  Clock,
  Image as ImageIcon,
  FileText,
  FileSpreadsheet,
  Copy,
  Check,
  Download
} from 'lucide-react';

export const RoundsView: React.FC = () => {
  const { currentUser, userProfile } = useAuth();
  const { success: showToastSuccess, error: showToastError } = useToast();
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

  // Top Cut Confirmation & Loading
  const [topCutConfirmSize, setTopCutConfirmSize] = useState<TopCutSize | null>(null);
  const [startingTopCut, setStartingTopCut] = useState(false);
  const [creatingNextTopCut, setCreatingNextTopCut] = useState(false);

  // Modals
  const [scoreModalMatch, setScoreModalMatch] = useState<TournamentMatch | null>(null);
  const [swapModalOpen, setSwapModalOpen] = useState(false);

  // Ekspor Per Ronde Liga & Daftar Menunggu
  const [roundExportTarget, setRoundExportTarget] = useState<
    'standing' | 'pairing' | 'bracket' | null
  >(null);
  const [exportingRound, setExportingRound] = useState(false);
  const [copiedWaitingReminder, setCopiedWaitingReminder] = useState(false);

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
    confirm: boolean,
    games?: MatchGameRecord[]
  ) => {
    if (!selectedTournament || !currentUser || !userProfile) return;
    const targetMatch = matches.find((m) => m.id === matchId);
    if (!targetMatch) return;

    const currentTourneyRound = selectedTournament.currentRound || 1;
    const totalRounds = selectedTournament.totalRounds || 3;

    // Ronde sebelumnya terkunci: cegah pengeditan langsung tanpa revert
    if (isRoundLocked(targetMatch.round, currentTourneyRound, selectedTournament.status)) {
      const targetLabel = getRoundDisplayLabel(
        targetMatch.round,
        totalRounds,
        selectedTournament.topCut?.size
      );
      alert(`${targetLabel} telah terkunci. Gunakan tombol Revert ke ${targetLabel} untuk mengoreksi skor.`);
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
      organizerInfo,
      games
    );

    // Tandai ronde completed bila semua match terkonfirmasi (tidak otomatis mengakhiri turnamen)
    await checkAndFinishTournamentIfComplete(
      selectedTournament.id,
      targetMatch.round,
      totalRounds
    );

    await fetchRoundData(selectedTournament.id, targetMatch.round);
  };

  // 5. Eksekusi Revert ke Ronde X
  const handleExecuteRevert = async (targetRound: number) => {
    if (!selectedTournament || !currentUser || !userProfile) return;
    const currentTourneyRound = selectedTournament.currentRound || rounds.length || 1;
    const totalSwissRounds = selectedTournament.totalRounds || 3;
    const hadTopCut = Boolean(selectedTournament.topCut);
    const isRevertingToSwiss = targetRound <= totalSwissRounds;

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

    const revertedTourney: Tournament = {
      ...selectedTournament,
      currentRound: targetRound,
      status: 'running' as const,
      finalized: false,
      ...(hadTopCut && isRevertingToSwiss ? { topCut: undefined } : {}),
    };
    setSelectedTournament(revertedTourney);
    setSessionTournament(revertedTourney);

    const targetLabel = getRoundDisplayLabel(
      targetRound,
      totalSwissRounds,
      isRevertingToSwiss ? undefined : selectedTournament.topCut?.size
    );
    setPairingNotice(
      hadTopCut && isRevertingToSwiss
        ? `Turnamen telah di-revert ke ${targetLabel} dan fase Top Cut dibatalkan. Anda dapat mengoreksi skor sebelum melanjutkan.`
        : `Turnamen telah di-revert ke ${targetLabel}. Anda dapat mengoreksi skor sebelum melanjutkan.`
    );

    await fetchRoundData(selectedTournament.id, targetRound);
  };

  // 6. Eksekusi Akhiri Turnamen (baik tanpa Top Cut maupun setelah Final Top Cut)
  const handleFinishTournament = async () => {
    if (!selectedTournament) return;
    setFinishingTournament(true);
    setFinishError(null);
    try {
      const res = await finishTournamentExplicit(selectedTournament.id);
      if (res.tournamentFinished) {
        const finishedTourney: Tournament = {
          ...selectedTournament,
          status: 'finished' as const,
          finishedAt: Date.now(),
          finalized: true
        };

        // Otomatis finalisasi hasil saat turnamen diakhiri (idempoten)
        try {
          if (currentUser) {
            const [playersToFinalize, matchesToFinalize] = await Promise.all([
              getTournamentPlayers(selectedTournament.id),
              getAllTournamentMatches(selectedTournament.id, false)
            ]);

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
        await fetchRoundData(selectedTournament.id, activeRoundNumber ?? undefined);
        await fetchTournaments();
      }
    } catch (err: any) {
      setFinishError(err?.message || 'Gagal mengakhiri turnamen. Pastikan koneksi internet stabil.');
    } finally {
      setFinishingTournament(false);
    }
  };

  // 7. Mulai Fase Top Cut (Top 4 atau Top 8)
  const handleConfirmStartTopCut = async () => {
    if (!selectedTournament || !currentUser || !userProfile || !topCutConfirmSize || startingTopCut) return;
    setStartingTopCut(true);
    setPairingNotice(null);
    try {
      const totalSwissRounds = selectedTournament.totalRounds || 3;
      const organizerInfo = {
        uid: currentUser.uid,
        name: userProfile.displayName || userProfile.username,
      };
      const res = await startTopCutPhase(
        selectedTournament.id,
        topCutConfirmSize,
        selectedTournament.format,
        totalSwissRounds,
        organizerInfo
      );

      const updatedTourney: Tournament = {
        ...selectedTournament,
        topCut: res.topCut,
        currentRound: res.round.number,
        status: 'running' as const,
      };
      setSelectedTournament(updatedTourney);
      setSessionTournament(updatedTourney);
      const firstLabel = getRoundDisplayLabel(res.round.number, totalSwissRounds, topCutConfirmSize);
      setPairingNotice(`Fase Top ${topCutConfirmSize} (${firstLabel}) telah dimulai!`);
      setTopCutConfirmSize(null);
      await fetchRoundData(selectedTournament.id, res.round.number);
    } catch (err: any) {
      alert(err?.message || 'Gagal memulai fase Top Cut.');
    } finally {
      setStartingTopCut(false);
    }
  };

  // 8. Lanjut ke Babak Top Cut Berikutnya (Semifinal / Final)
  const handleCreateNextTopCutRound = async () => {
    if (!selectedTournament?.topCut || !currentUser || !userProfile || creatingNextTopCut) return;
    setCreatingNextTopCut(true);
    setPairingNotice(null);
    try {
      const totalSwissRounds = selectedTournament.totalRounds || 3;
      const currentNum = selectedTournament.currentRound || activeRoundNumber || totalSwissRounds + 1;
      const nextRoundNum = currentNum + 1;
      const organizerInfo = {
        uid: currentUser.uid,
        name: userProfile.displayName || userProfile.username,
      };

      const res = await createNextTopCutRound(
        selectedTournament.id,
        nextRoundNum,
        selectedTournament.format,
        totalSwissRounds,
        selectedTournament.topCut.size,
        organizerInfo
      );

      const updatedTourney: Tournament = {
        ...selectedTournament,
        currentRound: nextRoundNum,
        status: 'running' as const,
      };
      setSelectedTournament(updatedTourney);
      setSessionTournament(updatedTourney);
      const nextLabel = getRoundDisplayLabel(nextRoundNum, totalSwissRounds, selectedTournament.topCut.size);
      setPairingNotice(`Babak ${nextLabel} Top ${selectedTournament.topCut.size} siap dimainkan.`);
      await fetchRoundData(selectedTournament.id, res.round.number);
    } catch (err: any) {
      alert(err?.message || 'Gagal membuat babak Top Cut berikutnya.');
    } finally {
      setCreatingNextTopCut(false);
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
  const topCutSize = selectedTournament?.topCut?.size || null;
  const isTopCutPhase = Boolean(selectedTournament?.topCut);

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
  const activeRoundLabel = getRoundDisplayLabel(activeRound, totalRounds, topCutSize);
  const currentTourneyRoundLabel = getRoundDisplayLabel(currentTourneyRound, totalRounds, topCutSize);

  const nextRoundExists =
    rounds.some((r) => r.number === activeRound + 1 && !r.archived) ||
    allMatches.some((m) => m.round === activeRound + 1 && !m.archived);

  const isPauseActive =
    tourneyStatus === 'running' &&
    !isTopCutPhase &&
    shouldShowNextRoundPause(matches, activeRound, totalRounds, nextRoundExists);

  const isLastSwissRoundComplete =
    tourneyStatus === 'running' &&
    !isTopCutPhase &&
    rounds.length === totalRounds &&
    activeRound === totalRounds &&
    isAllMatchesConfirmed &&
    !nextRoundExists;

  const topCutEligibility = checkTopCutEligibility(tournamentPlayers);

  const isTopCutRoundComplete =
    tourneyStatus === 'running' &&
    isTopCutPhase &&
    activeRound > totalRounds &&
    isAllMatchesConfirmed &&
    !nextRoundExists;

  const isCurrentRoundTopCutFinal = isFinalTopCutRound(activeRound, totalRounds, topCutSize);
  const nextTopCutLabel = topCutSize
    ? getNextTopCutRoundLabel(activeRound, totalRounds, topCutSize)
    : null;

  const canCreateRound1 =
    tourneyStatus === 'running' && rounds.length === 0;

  const pastMatchRecords: PastMatchRecord[] = filterSwissMatches(allMatches)
    .filter((m) => m.round < (activeRoundNumber || currentTourneyRound) && !m.archived)
    .map((m) => ({ round: m.round, p1Id: m.p1Id, p2Id: m.p2Id }));

  const topCutPreviewSeeds = React.useMemo(() => {
    if (!topCutConfirmSize || !selectedTournament) return [];
    try {
      return buildTopCutSeeds(
        tournamentPlayers,
        filterSwissMatches(allMatches),
        selectedTournament.format,
        topCutConfirmSize
      );
    } catch {
      return [];
    }
  }, [topCutConfirmSize, tournamentPlayers, allMatches, selectedTournament?.format]);

  const isLeague = isLeagueTournament(selectedTournament);
  const isActiveTopCutRound = Boolean(isTopCutPhase && activeRound > totalRounds);
  const showLeagueRoundExports = Boolean(
    isOrganizer &&
      isLeague &&
      selectedTournament &&
      rounds.length > 0 &&
      selectedTournament.status !== 'registration'
  );

  const waitingMatches = React.useMemo(
    () => buildWaitingMatchesList(matches),
    [matches]
  );

  const showWaitingMatchesCard = Boolean(
    isOrganizer &&
      isLeague &&
      selectedTournament?.status === 'running' &&
      activeRound === currentTourneyRound &&
      waitingMatches.length > 0
  );

  const duplicateRoundWarnings = React.useMemo(() => {
    const duplicates = findDuplicatePlayersInRound(allMatches);
    if (duplicates.length === 0) return [];
    const byRound = new Map<number, string[]>();
    for (const entry of duplicates) {
      const list = byRound.get(entry.round) || [];
      if (!list.includes(entry.name)) {
        list.push(entry.name);
      }
      byRound.set(entry.round, list);
    }
    return Array.from(byRound.entries())
      .sort((a, b) => a[0] - b[0])
      .map(([round, names]) => ({
        round,
        namesText: names.join(', '),
      }));
  }, [allMatches]);

  const handleCopyWaitingReminder = async () => {
    if (!selectedTournament || waitingMatches.length === 0) return;
    const text = formatWaitingMatchesReminderText({
      tournamentName: selectedTournament.name,
      seasonLabel: formatSeasonLabel(selectedTournament.season),
      roundLabel: activeRoundLabel,
      items: waitingMatches
    });
    const res = await copyTextNative(text);
    if (res.ok) {
      setCopiedWaitingReminder(true);
      setTimeout(() => setCopiedWaitingReminder(false), 2000);
      showToastSuccess(
        'Pengingat disalin',
        `${waitingMatches.length} pertandingan menunggu siap ditempel.`
      );
    } else {
      showToastError('Gagal menyalin daftar pengingat.');
    }
  };

  const handleRunRoundExport = async (formatChoice: 'png' | 'text' | 'csv') => {
    if (!selectedTournament || !roundExportTarget || exportingRound) return;
    setExportingRound(true);

    try {
      if (roundExportTarget === 'standing') {
        const data = buildLeagueRoundStandingsExportData(
          selectedTournament,
          tournamentPlayers,
          allMatches,
          activeRound
        );
        const scopeLabel = `Ronde-${activeRound}`;

        if (formatChoice === 'png') {
          const dataUrl = exportLeagueRoundStandingToImage(data);
          if (!dataUrl) throw new Error('Gagal merender gambar standing.');
          const fileName = buildLeagueRoundExportFileName(
            selectedTournament,
            scopeLabel,
            'Standing',
            'png'
          );
          const res = await saveFileNative(fileName, 'image/png', dataUrl);
          if (res.ok) {
            showToastSuccess('Ekspor berhasil', `File ${res.fileName} tersimpan.`);
          } else {
            showToastError('Ekspor gagal', res.message || 'Gagal menyimpan PNG.');
          }
        } else if (formatChoice === 'csv') {
          const csv = generateLeagueRoundStandingCsv(data);
          const fileName = buildLeagueRoundExportFileName(
            selectedTournament,
            scopeLabel,
            'Standing',
            'csv'
          );
          const res = await saveFileNative(fileName, 'text/csv', csv);
          if (res.ok) {
            showToastSuccess('Ekspor berhasil', `File ${res.fileName} tersimpan.`);
          } else {
            showToastError('Ekspor gagal', res.message || 'Gagal menyimpan CSV.');
          }
        } else {
          const text = generateLeagueRoundStandingText(data);
          const copyRes = await copyTextNative(text);
          if (copyRes.ok) {
            showToastSuccess('Ekspor berhasil', 'Teks standing berhasil disalin.');
          } else {
            const fileName = buildLeagueRoundExportFileName(
              selectedTournament,
              scopeLabel,
              'Standing',
              'txt'
            );
            const saveRes = await saveFileNative(fileName, 'text/plain', text);
            if (saveRes.ok) {
              showToastSuccess('Ekspor berhasil', `File ${saveRes.fileName} tersimpan.`);
            } else {
              showToastError('Ekspor gagal', 'Gagal menyalin atau menyimpan teks.');
            }
          }
        }
      } else if (roundExportTarget === 'pairing') {
        const data = buildLeagueRoundPairingExportData(
          selectedTournament,
          activeRound,
          matches
        );
        const scopeLabel = `Ronde-${activeRound}`;

        if (formatChoice === 'png') {
          const dataUrl = exportLeagueRoundPairingToImage(data);
          if (!dataUrl) throw new Error('Gagal merender gambar pairing.');
          const fileName = buildLeagueRoundExportFileName(
            selectedTournament,
            scopeLabel,
            'Pairing',
            'png'
          );
          const res = await saveFileNative(fileName, 'image/png', dataUrl);
          if (res.ok) {
            showToastSuccess('Ekspor berhasil', `File ${res.fileName} tersimpan.`);
          } else {
            showToastError('Ekspor gagal', res.message || 'Gagal menyimpan PNG.');
          }
        } else {
          const text = generateLeagueRoundPairingText(data);
          const copyRes = await copyTextNative(text);
          if (copyRes.ok) {
            showToastSuccess('Ekspor berhasil', 'Teks pairing berhasil disalin.');
          } else {
            const fileName = buildLeagueRoundExportFileName(
              selectedTournament,
              scopeLabel,
              'Pairing',
              'txt'
            );
            const saveRes = await saveFileNative(fileName, 'text/plain', text);
            if (saveRes.ok) {
              showToastSuccess('Ekspor berhasil', `File ${saveRes.fileName} tersimpan.`);
            } else {
              showToastError('Ekspor gagal', 'Gagal menyalin atau menyimpan teks.');
            }
          }
        }
      } else if (roundExportTarget === 'bracket') {
        const data = buildLeagueTopCutBracketExportData(selectedTournament, allMatches);
        const scopeLabel = `Top-${data.topCutSize}`;

        if (formatChoice === 'png') {
          const dataUrl = exportLeagueTopCutBracketToImage(data);
          if (!dataUrl) throw new Error('Gagal merender gambar bracket.');
          const fileName = buildLeagueRoundExportFileName(
            selectedTournament,
            scopeLabel,
            'Bracket',
            'png'
          );
          const res = await saveFileNative(fileName, 'image/png', dataUrl);
          if (res.ok) {
            showToastSuccess('Ekspor berhasil', `File ${res.fileName} tersimpan.`);
          } else {
            showToastError('Ekspor gagal', res.message || 'Gagal menyimpan PNG.');
          }
        } else {
          const text = generateLeagueTopCutBracketText(data);
          const copyRes = await copyTextNative(text);
          if (copyRes.ok) {
            showToastSuccess('Ekspor berhasil', 'Teks bracket berhasil disalin.');
          } else {
            const fileName = buildLeagueRoundExportFileName(
              selectedTournament,
              scopeLabel,
              'Bracket',
              'txt'
            );
            const saveRes = await saveFileNative(fileName, 'text/plain', text);
            if (saveRes.ok) {
              showToastSuccess('Ekspor berhasil', `File ${saveRes.fileName} tersimpan.`);
            } else {
              showToastError('Ekspor gagal', 'Gagal menyalin atau menyimpan teks.');
            }
          }
        }
      }

      setRoundExportTarget(null);
    } catch (err: any) {
      showToastError('Ekspor gagal', err?.message || 'Terjadi kesalahan saat mengekspor.');
    } finally {
      setExportingRound(false);
    }
  };

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
              {tournaments.map((t) => {
                const sLabel = isLeagueTournament(t) ? formatSeasonLabel(t.season) : null;
                return (
                  <option key={t.id} value={t.id}>
                    {isLeagueTournament(t) ? '[LIGA] ' : ''}
                    {t.name}
                    {sLabel ? ` - ${sLabel}` : ''} (
                    {t.status === 'running' ? 'Berjalan' : t.status === 'finished' ? 'Selesai' : 'Pendaftaran'}) - #{t.joinCode}
                  </option>
                );
              })}
            </select>
          </div>

          {selectedTournament && (
            <Card variant="surface-high" className="flex flex-col gap-2 p-3">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-body font-semibold text-dark-text">
                      {selectedTournament.name}
                    </span>
                    <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-accent/10 text-accent border border-accent/20">
                      {selectedTournament.format}
                    </span>
                  </div>
                  <LeagueSeasonBadge tournament={selectedTournament} compact className="mt-1" />
                  <span className="text-caption text-dark-muted mt-0.5 block">
                    Total: <strong className="text-dark-text">{totalRounds} Ronde Swiss</strong>
                    {selectedTournament.topCut ? ` + Top ${selectedTournament.topCut.size}` : ''}
                    {selectedTournament.currentRound ? ` • Babak Aktif: ${currentTourneyRoundLabel}` : ''}
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
              {/* Banner Peringatan Pemain Ganda Dalam Satu Ronde */}
              {duplicateRoundWarnings.length > 0 && (
                <div
                  role="alert"
                  className="p-3 rounded-card bg-status-red/10 border border-status-red/30 text-caption text-status-red flex flex-col gap-1"
                >
                  {duplicateRoundWarnings.map((w) => (
                    <div key={w.round} className="flex items-start gap-2 font-medium">
                      <AlertTriangle size={16} className="flex-shrink-0 mt-0.5" />
                      <span>
                        Pemain ganda terdeteksi di Ronde {w.round}: {w.namesText}
                      </span>
                    </div>
                  ))}
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
                      const isLockedTab = isRoundLocked(r.number, currentTourneyRound, tourneyStatus);
                      const tabLabel = getRoundDisplayLabel(r.number, totalRounds, topCutSize);
                      const isTopCutTab = r.stage === 'topcut' || r.number > totalRounds;
                      return (
                        <button
                          key={r.number}
                          type="button"
                          onClick={() => handleSelectRound(r.number)}
                          className={`min-h-[38px] px-3.5 rounded-btn text-caption font-medium whitespace-nowrap transition-colors flex items-center gap-1.5 ${
                            isCurrentTab
                              ? 'bg-accent-solid text-[#0B0F14] font-semibold shadow'
                              : isTopCutTab
                              ? 'bg-dark-surface border border-accent/40 text-accent hover:bg-accent/10'
                              : 'bg-dark-surface border border-dark-border text-dark-muted hover:text-dark-text'
                          }`}
                        >
                          <span>{tabLabel}</span>
                          {isLockedTab && <Lock size={12} className={isCurrentTab ? 'text-[#0B0F14]' : 'text-dark-muted'} />}
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
                    onClick={() => setRevertModalTarget(activeRound)}
                    className="flex-shrink-0 text-[11px] font-medium text-status-yellow hover:text-status-yellow/80 flex items-center gap-1 px-2.5 py-1.5 rounded bg-status-yellow/10 border border-status-yellow/30 transition-colors"
                    title={`Revert ke ${activeRoundLabel}`}
                  >
                    <History size={13} />
                    <span>Revert ke {activeRound <= totalRounds ? `R${activeRound}` : activeRoundLabel}</span>
                  </button>
                )}
              </div>

              {/* Tombol Ekspor Per Ronde (khusus Organizer/Admin & Turnamen Liga) */}
              {showLeagueRoundExports && (
                <div className="flex items-center justify-between gap-2 flex-wrap px-2.5 py-2 rounded-card bg-dark-surface border border-dark-border">
                  <span className="text-[11px] font-medium text-dark-muted flex items-center gap-1.5">
                    <Download size={13} className="text-accent" />
                    <span>Ekspor {activeRoundLabel}:</span>
                  </span>
                  <div className="flex items-center gap-1.5 flex-wrap">
                    {!isActiveTopCutRound ? (
                      <>
                        <Button
                          variant="secondary"
                          className="!min-h-[32px] !px-2.5 !text-[11px]"
                          onClick={() => setRoundExportTarget('standing')}
                          icon={<FileSpreadsheet size={13} className="text-status-green" />}
                        >
                          Standing Saat Ini
                        </Button>
                        <Button
                          variant="secondary"
                          className="!min-h-[32px] !px-2.5 !text-[11px]"
                          onClick={() => setRoundExportTarget('pairing')}
                          icon={<Swords size={13} className="text-info" />}
                        >
                          Pairing Ronde {activeRound}
                        </Button>
                      </>
                    ) : (
                      <Button
                        variant="secondary"
                        className="!min-h-[32px] !px-2.5 !text-[11px]"
                        onClick={() => setRoundExportTarget('bracket')}
                        icon={<Trophy size={13} className="text-accent" />}
                      >
                        Bracket
                      </Button>
                    )}
                  </div>
                </div>
              )}

              {/* Daftar Menunggu (Organizer, Ronde Aktif, ukuran ringkas) */}
              {showWaitingMatchesCard && (
                <Card variant="surface" className="p-2.5 border-status-yellow/30 bg-status-yellow/5 flex flex-col gap-1.5">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-1.5 text-caption font-semibold text-status-yellow">
                      <Clock size={14} />
                      <span>Menunggu {waitingMatches.length} pertandingan</span>
                    </div>
                    <button
                      type="button"
                      onClick={handleCopyWaitingReminder}
                      className="min-h-[28px] px-2.5 rounded-btn text-[11px] font-medium flex items-center gap-1 bg-dark-surface-high hover:bg-dark-surface border border-dark-border text-dark-text transition-colors"
                    >
                      {copiedWaitingReminder ? (
                        <>
                          <Check size={12} className="text-status-green" />
                          <span>Tersalin!</span>
                        </>
                      ) : (
                        <>
                          <Copy size={12} className="text-accent" />
                          <span>Salin Pengingat</span>
                        </>
                      )}
                    </button>
                  </div>
                  <div className="flex flex-col gap-1 max-h-36 overflow-y-auto pr-0.5">
                    {waitingMatches.map((item) => (
                      <div
                        key={item.id}
                        className="flex items-center justify-between gap-2 text-[11px] px-2 py-1 rounded bg-dark-bg/50 border border-dark-border/60"
                      >
                        <span className="truncate text-dark-text">
                          <strong className="font-mono text-accent">Meja {item.table}</strong>
                          {' • '}
                          {item.p1Name} vs {item.p2Name}
                        </span>
                        <span
                          className={`flex-shrink-0 font-mono text-[10px] px-1.5 py-0.5 rounded ${
                            item.status === 'disputed'
                              ? 'bg-status-red/15 text-status-red'
                              : item.status === 'awaiting'
                              ? 'bg-status-yellow/15 text-status-yellow'
                              : 'bg-dark-surface-high text-dark-muted'
                          }`}
                        >
                          {item.statusLabel}
                        </span>
                      </div>
                    ))}
                  </div>
                </Card>
              )}

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
                      Progres {activeRoundLabel}:{' '}
                      <strong className="text-accent">
                        {confirmedMatchesCount} dari {totalMatchesInRound}
                      </strong>{' '}
                      pertandingan terkonfirmasi.
                    </span>
                  </div>
                )}

              {/* Kartu Aksi: Setelah Ronde Swiss Terakhir Selesai -> Pilih Top 4 / Top 8 / Akhiri Tanpa Top Cut (kecuali Liga) */}
              {isLastSwissRoundComplete && (
                <Card variant="surface" className="flex flex-col gap-3 p-3.5 border-accent/40 bg-accent/5">
                  <div>
                    <span className="text-body font-semibold text-dark-text flex items-center gap-1.5">
                      <CheckCircle2 size={16} className="text-status-green" />
                      Semua pertandingan ronde Swiss terakhir sudah terkonfirmasi
                    </span>
                    <span className="text-caption text-dark-muted mt-0.5 block">
                      {isOrganizerOwner
                        ? isTopCutMandatoryForTournament(selectedTournament)
                          ? `Peserta aktif: ${topCutEligibility.activeCount} pemain. Turnamen Liga mewajibkan fase gugur Top Cut (Top 4 atau Top 8).`
                          : `Peserta aktif: ${topCutEligibility.activeCount} pemain. Pilih lanjut ke babak gugur Top Cut atau akhiri turnamen langsung.`
                        : isTopCutMandatoryForTournament(selectedTournament)
                        ? 'Menunggu organizer melanjutkan ke fase Top Cut'
                        : 'Menunggu organizer memutuskan lanjut ke Top Cut atau mengakhiri turnamen'}
                    </span>
                  </div>

                  {isOrganizerOwner ? (
                    <div className="flex flex-col gap-2">
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        <Button
                          variant="primary"
                          className="!min-h-[42px] !text-caption"
                          disabled={!topCutEligibility.canStartTop4 || startingTopCut}
                          onClick={() => setTopCutConfirmSize(4)}
                          icon={<Swords size={15} />}
                        >
                          Lanjut ke Top 4 {!topCutEligibility.canStartTop4 ? '(Min. 4 Aktif)' : ''}
                        </Button>
                        <Button
                          variant="primary"
                          className="!min-h-[42px] !text-caption"
                          disabled={!topCutEligibility.canStartTop8 || startingTopCut}
                          onClick={() => setTopCutConfirmSize(8)}
                          icon={<Swords size={15} />}
                        >
                          Lanjut ke Top 8 {!topCutEligibility.canStartTop8 ? '(Min. 8 Aktif)' : ''}
                        </Button>
                      </div>
                      {!isTopCutMandatoryForTournament(selectedTournament) && (
                        <Button
                          variant="secondary"
                          fullWidth
                          className="!min-h-[40px] !text-caption"
                          disabled={startingTopCut}
                          onClick={() => setFinishConfirmModalOpen(true)}
                          icon={<Trophy size={15} />}
                        >
                          Akhiri Tanpa Top Cut
                        </Button>
                      )}
                    </div>
                  ) : (
                    <div className="text-caption font-medium text-status-yellow flex items-center gap-1.5 bg-status-yellow/10 px-3 py-1.5 rounded-btn border border-status-yellow/30 w-fit">
                      <Clock size={14} />
                      <span>
                        {isTopCutMandatoryForTournament(selectedTournament)
                          ? 'Menunggu organizer melanjutkan ke fase Top Cut'
                          : 'Menunggu organizer melanjutkan ke Top Cut atau mengakhiri turnamen'}
                      </span>
                    </div>
                  )}
                </Card>
              )}

              {/* Kartu Aksi Progres Top Cut: Lanjut ke Semifinal/Final atau Akhiri Turnamen */}
              {isTopCutRoundComplete && (
                <Card variant="surface" className="flex flex-col gap-2 p-3.5 border-accent/40 bg-accent/5">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div>
                      <span className="text-body font-semibold text-dark-text flex items-center gap-1.5">
                        <CheckCircle2 size={16} className="text-status-green" />
                        Semua pertandingan {activeRoundLabel} sudah terkonfirmasi
                      </span>
                      <span className="text-caption text-dark-muted mt-0.5 block">
                        {isCurrentRoundTopCutFinal
                          ? isOrganizerOwner
                            ? 'Babak Final telah tuntas. Akhiri turnamen untuk memfinalisasi juara dan hasil akhir.'
                            : 'Menunggu organizer mengakhiri turnamen'
                          : isOrganizerOwner
                          ? `Pemenang siap dipertemukan di babak ${nextTopCutLabel}.`
                          : `Menunggu organizer melanjutkan ke ${nextTopCutLabel}`}
                      </span>
                    </div>
                    {isOrganizerOwner ? (
                      isCurrentRoundTopCutFinal ? (
                        <Button
                          variant="primary"
                          className="!min-h-[40px] !px-4 !text-caption whitespace-nowrap"
                          onClick={() => setFinishConfirmModalOpen(true)}
                          icon={<Trophy size={15} />}
                        >
                          Akhiri Turnamen
                        </Button>
                      ) : (
                        <Button
                          variant="primary"
                          className="!min-h-[40px] !px-4 !text-caption whitespace-nowrap"
                          onClick={handleCreateNextTopCutRound}
                          isLoading={creatingNextTopCut}
                          disabled={creatingNextTopCut}
                          icon={<Play size={14} />}
                        >
                          Lanjut ke {nextTopCutLabel}
                        </Button>
                      )
                    ) : (
                      <div className="text-caption font-medium text-status-yellow flex items-center gap-1.5 bg-status-yellow/10 px-3 py-1.5 rounded-btn border border-status-yellow/30 w-fit">
                        <Clock size={14} />
                        <span>
                          {isCurrentRoundTopCutFinal
                            ? 'Menunggu organizer mengakhiri turnamen'
                            : `Menunggu organizer melanjutkan ke ${nextTopCutLabel}`}
                        </span>
                      </div>
                    )}
                  </div>
                </Card>
              )}

              {/* Komponen Timer Ronde (disembunyikan pada Turnamen Liga) */}
              {rounds.length > 0 && isRoundTimerEnabledForTournament(selectedTournament) && (
                <RoundTimerCard
                  tournamentId={selectedTournament.id}
                  round={rounds.find((r) => r.number === activeRound) || null}
                  isOrganizer={isOrganizer}
                  format={selectedTournament.format}
                  onTimerUpdated={() => fetchRoundData(selectedTournament.id, activeRoundNumber ?? undefined)}
                />
              )}

              {/* Bagan Top Cut Sederhana (tampil bila turnamen memiliki fase Top Cut) */}
              {selectedTournament.topCut && (
                <TopCutBracketCard
                  topCut={selectedTournament.topCut}
                  matches={allMatches}
                  totalSwissRounds={totalRounds}
                  highlightUid={currentUser?.uid}
                />
              )}

              {/* Banner Turnamen Selesai */}
              {selectedTournament.status === 'finished' && (
                <div className="flex flex-col gap-3">
                  <div className="p-3 rounded-card bg-accent/10 border border-accent/30 flex items-center justify-between gap-2 text-caption text-accent font-medium">
                    <div className="flex items-center gap-2">
                      <Trophy size={18} />
                      <span>
                        {selectedTournament.topCut
                          ? `Turnamen Selesai! ${totalRounds} ronde Swiss + Top ${selectedTournament.topCut.size} telah tuntas.`
                          : `Turnamen Selesai! Seluruh ${totalRounds} ronde telah tuntas dipertandingkan.`}
                      </span>
                    </div>
                    {isOrganizer && (
                      <button
                        type="button"
                        onClick={() =>
                          setRevertModalTarget(
                            activeRoundNumber ||
                              rounds[rounds.length - 1]?.number ||
                              currentTourneyRound
                          )
                        }
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

              {/* Kontrol Tukar Pairing Manual (hanya untuk ronde Swiss aktif yang belum ada skornya) */}
              {isOrganizer &&
                activeRound <= totalRounds &&
                matches.length > 1 &&
                selectedTournament.status === 'running' &&
                !isCurrentRoundLocked &&
                hasNoScoresYet && (
                  <div className="flex items-center justify-between px-1">
                    <span className="text-caption text-dark-muted font-medium">
                      Meja Pertandingan ({activeRoundLabel}):
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
                              {isBye ? 'Otomatis Win' : 'Pemain 2'}
                            </span>
                          </div>
                        </div>

                        {/* Rincian Per Game (bila Turnamen Liga & sudah ada input game) */}
                        {!isBye && match.games && match.games.length > 0 && (
                          <MatchGamesBreakdown
                            games={match.games}
                            p1Name={match.p1Name}
                            p2Name={match.p2Name}
                            p1Decks={match.p1Decks}
                            p2Decks={match.p2Decks}
                            compact
                            className="mb-2.5"
                          />
                        )}

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

      {/* Modal Input Skor Organizer: Liga (Per-Game & Deck) vs Reguler */}
      {scoreModalMatch && isLeaguePerGameMatch(scoreModalMatch) ? (
        <LeagueMatchGamesModal
          isOpen={Boolean(scoreModalMatch)}
          onClose={() => setScoreModalMatch(null)}
          match={scoreModalMatch}
          roundLabel={getRoundDisplayLabel(scoreModalMatch.round, totalRounds, topCutSize)}
          mode="organizer"
          onSaveGames={(matchId, games, p1Score, p2Score) =>
            handleSaveScore(matchId, p1Score, p2Score, true, games)
          }
        />
      ) : (
        <MatchScoreModal
          isOpen={Boolean(scoreModalMatch)}
          onClose={() => setScoreModalMatch(null)}
          match={scoreModalMatch}
          format={selectedTournament?.format || 'BO3'}
          roundLabel={
            scoreModalMatch
              ? getRoundDisplayLabel(scoreModalMatch.round, totalRounds, topCutSize)
              : undefined
          }
          onSaveScore={handleSaveScore}
        />
      )}

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
        currentRoundNumber={currentTourneyRound}
        targetRoundLabel={getRoundDisplayLabel(revertModalTarget || 1, totalRounds, topCutSize)}
        currentRoundLabel={currentTourneyRoundLabel}
        willDiscardTopCut={Boolean(isTopCutPhase && (revertModalTarget || 1) <= totalRounds)}
        onConfirmRevert={handleExecuteRevert}
      />

      {/* Modal Log Keamanan Turnamen */}
      <TournamentAuditLogModal
        isOpen={auditLogModalOpen}
        onClose={() => setAuditLogModalOpen(false)}
        tournamentId={selectedTournament?.id || ''}
        tournamentName={selectedTournament?.name || ''}
      />

      {/* Konfirmasi Mulai Fase Top Cut */}
      <ConfirmSheet
        isOpen={topCutConfirmSize !== null}
        title={`Mulai Fase Top ${topCutConfirmSize || 4}?`}
        message={
          <div className="flex flex-col gap-2.5 text-caption">
            <p>
              Turnamen akan memasuki fase gugur tunggal <strong>Top {topCutConfirmSize}</strong> berdasarkan klasemen Swiss akhir (pemain dropped dilewati). Pertandingan Top Cut menggunakan format <strong>{selectedTournament?.format}</strong> tanpa hasil seri.
            </p>
            {topCutPreviewSeeds.length > 0 && (
              <div className="p-2.5 rounded-btn bg-dark-bg/60 border border-dark-border flex flex-col gap-1">
                <span className="text-[11px] font-mono text-accent font-semibold">
                  Daftar Seed Top {topCutConfirmSize}:
                </span>
                <div className="grid grid-cols-1 gap-0.5 text-[11px]">
                  {topCutPreviewSeeds.map((seed, idx) => (
                    <span key={seed.playerId} className="font-mono text-dark-text">
                      Seed #{idx + 1}: <strong>{seed.name}</strong> (Swiss #{seed.swissRank})
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        }
        confirmLabel={`Ya, Mulai Top ${topCutConfirmSize || 4}`}
        variant="primary"
        isLoading={startingTopCut}
        onConfirm={handleConfirmStartTopCut}
        onCancel={() => !startingTopCut && setTopCutConfirmSize(null)}
      />

      {/* BottomSheet Konfirmasi Akhiri Turnamen */}
      <BottomSheet
        isOpen={finishConfirmModalOpen}
        onClose={() => !finishingTournament && setFinishConfirmModalOpen(false)}
        closeDisabled={finishingTournament}
        title="Akhiri Turnamen"
      >
        <div className="flex flex-col gap-4 py-2 pb-6">
          <div className="p-3.5 rounded-card bg-status-green/10 border border-status-green/30 text-status-green flex items-start gap-2.5">
            <CheckCircle2 size={20} className="flex-shrink-0 mt-0.5" />
            <div className="text-caption text-dark-text">
              <span className="font-bold text-body block mb-0.5 text-status-green">
                {selectedTournament?.topCut
                  ? `Babak Final Top ${selectedTournament.topCut.size} Telah Selesai`
                  : `Seluruh ${totalRounds} Ronde Swiss Telah Selesai`}
              </span>
              <span>
                Semua pertandingan babak terakhir telah terkonfirmasi. Mengakhiri turnamen akan mengubah status turnamen menjadi <strong>Selesai</strong> dan langsung membuka bagian Finalisasi Hasil serta pengisian Deck untuk seluruh peserta.
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
              disabled={finishingTournament}
              icon={<Trophy size={16} />}
            >
              Akhiri Sekarang
            </Button>
          </div>
        </div>
      </BottomSheet>

      {/* BottomSheet Pilih Format Ekspor Per Ronde Liga */}
      <BottomSheet
        isOpen={roundExportTarget !== null}
        onClose={() => !exportingRound && setRoundExportTarget(null)}
        closeDisabled={exportingRound}
        title={
          roundExportTarget === 'standing'
            ? `Ekspor Standing Saat Ini (Ronde ${activeRound})`
            : roundExportTarget === 'pairing'
            ? `Ekspor Pairing Ronde ${activeRound}`
            : `Ekspor Bracket Top ${topCutSize || 4}`
        }
      >
        <div className="flex flex-col gap-2.5 py-2 pb-6">
          <p className="text-caption text-dark-muted">
            {roundExportTarget === 'standing'
              ? 'Pilih format ekspor klasemen Swiss sementara/terkini Turnamen Liga.'
              : roundExportTarget === 'pairing'
              ? isAllMatchesConfirmed
                ? 'Semua pertandingan ronde ini sudah terkonfirmasi; skor & pemenang akan ikut ditampilkan.'
                : 'Masih ada pertandingan yang belum terkonfirmasi; skor & pemenang disembunyikan pada ekspor.'
              : 'Ekspor bagan Top Cut Liga (skor per babak hanya tampil jika semua match babak tersebut terkonfirmasi).'}
          </p>

          <Button
            variant="secondary"
            fullWidth
            className="!justify-start !min-h-[44px]"
            disabled={exportingRound}
            onClick={() => handleRunRoundExport('png')}
            icon={<ImageIcon size={16} className="text-accent" />}
          >
            Gambar (PNG)
          </Button>

          <Button
            variant="secondary"
            fullWidth
            className="!justify-start !min-h-[44px]"
            disabled={exportingRound}
            onClick={() => handleRunRoundExport('text')}
            icon={<FileText size={16} className="text-info" />}
          >
            Teks Ringkasan (Salin)
          </Button>

          {roundExportTarget === 'standing' && (
            <Button
              variant="secondary"
              fullWidth
              className="!justify-start !min-h-[44px]"
              disabled={exportingRound}
              onClick={() => handleRunRoundExport('csv')}
              icon={<FileSpreadsheet size={16} className="text-status-green" />}
            >
              Spreadsheet (CSV)
            </Button>
          )}
        </div>
      </BottomSheet>
    </div>
  );
};
