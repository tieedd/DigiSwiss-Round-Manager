import React, { useState, useEffect } from 'react';
import {
  Tournament,
  TournamentMatch,
  TournamentFormat,
  PlayerStatus,
  Participation,
} from '../../types';
import { useAuth } from '../../context/AuthContext';
import { Card } from '../../components/common/Card';
import { Button } from '../../components/common/Button';
import { StatusBadge } from '../../components/common/StatusBadge';
import { EmptyState } from '../../components/common/EmptyState';
import { getAllTournaments } from '../../services/tournamentService';
import {
  reportMatchScoreByPlayer,
  respondToReportedScore,
  checkAndFinishTournamentIfComplete,
} from '../../services/roundService';
import { calculateMatchPoints } from '../../utils/standingsLogic';
import {
  collection,
  doc,
  getDoc,
  query,
  where,
  onSnapshot,
  getDocs,
} from 'firebase/firestore';
import { db } from '../../firebaseConfig';
import { DeckRegistrationModal } from '../tournaments/DeckRegistrationModal';
import { DeckColorDots } from '../../components/common/DeckColorDots';
import {
  Swords,
  Flame,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Clock,
  RefreshCw,
  Layers,
  Edit2,
  AlertCircle,
} from 'lucide-react';
import {
  getSessionTournament,
  setSessionTournament,
} from '../../utils/sessionStore';
import { shouldShowNextRoundPause } from '../../utils/roundPauseLogic';
import { resolvePlayerMatchState } from '../../utils/playerMatchStateLogic';

export const MyMatchesView: React.FC = () => {
  const { currentUser, userProfile } = useAuth();
  const [tournaments, setTournaments] = useState<Tournament[]>([]);
  const [playerStatusMap, setPlayerStatusMap] = useState<Record<string, PlayerStatus>>({});
  const [selectedTournament, setSelectedTournament] = useState<Tournament | null>(() =>
    getSessionTournament()
  );
  const [myMatches, setMyMatches] = useState<TournamentMatch[]>([]);
  const [allTournamentMatches, setAllTournamentMatches] = useState<TournamentMatch[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [snapshotError, setSnapshotError] = useState<string | null>(null);
  const [snapshotRetryKey, setSnapshotRetryKey] = useState(0);
  const [myFinishedParticipation, setMyFinishedParticipation] = useState<Participation | null>(null);
  const [deckModalOpen, setDeckModalOpen] = useState(false);
  const [isWaitingNextRound, setIsWaitingNextRound] = useState(false);
  const [waitingNextRoundNum, setWaitingNextRoundNum] = useState(2);

  // Helper session cache untuk dokumen pemain
  const getCachedPlayerStatus = (
    tid: string,
    uid: string
  ): { cached: boolean; exists: boolean; status: PlayerStatus | null } => {
    try {
      const raw = sessionStorage.getItem(`my_player_doc_${tid}_${uid}`);
      if (raw) {
        const parsed = JSON.parse(raw);
        return { cached: true, exists: Boolean(parsed.exists), status: parsed.status || null };
      }
    } catch (_) {}
    return { cached: false, exists: false, status: null };
  };

  const setCachedPlayerStatus = (
    tid: string,
    uid: string,
    exists: boolean,
    status: PlayerStatus | null
  ) => {
    try {
      sessionStorage.setItem(
        `my_player_doc_${tid}_${uid}`,
        JSON.stringify({ exists, status })
      );
    } catch (_) {}
  };

  const clearSessionPlayerCache = () => {
    try {
      const keys = Object.keys(sessionStorage);
      for (const k of keys) {
        if (k.startsWith('my_player_doc_')) {
          sessionStorage.removeItem(k);
        }
      }
    } catch (_) {}
  };

  // 1. Cari turnamen yang HANYA diikuti oleh akun saat ini (maks 10 terbaru running / finished)
  const fetchMyTournaments = async (forceRefresh = false) => {
    if (!currentUser) return;
    if (forceRefresh) {
      clearSessionPlayerCache();
    }
    setLoading(true);
    setSnapshotError(null);
    try {
      const all = await getAllTournaments();
      // Filter turnamen running atau finished, maksimal 10 terbaru
      const candidateTournaments = all
        .filter((t) => t.status === 'running' || t.status === 'finished')
        .sort((a, b) => {
          if (a.status === 'running' && b.status !== 'running') return -1;
          if (b.status === 'running' && a.status !== 'running') return 1;
          const tA = (a as any).createdAt?.seconds || 0;
          const tB = (b as any).createdAt?.seconds || 0;
          return tB - tA;
        })
        .slice(0, 10);

      const joinedList: Tournament[] = [];
      const statusMap: Record<string, PlayerStatus> = {};

      for (const t of candidateTournaments) {
        const cached = getCachedPlayerStatus(t.id, currentUser.uid);
        let exists = false;
        let status: PlayerStatus | null = null;

        if (cached.cached && !forceRefresh) {
          exists = cached.exists;
          status = cached.status;
        } else {
          try {
            const pDocRef = doc(db, 'tournaments', t.id, 'players', currentUser.uid);
            const pSnap = await getDoc(pDocRef);
            exists = pSnap.exists();
            if (exists) {
              status = (pSnap.data()?.status as PlayerStatus) || 'waiting';
            }
            setCachedPlayerStatus(t.id, currentUser.uid, exists, status);
          } catch (e) {
            console.warn(`Gagal memeriksa peserta untuk turnamen ${t.id}:`, e);
          }
        }

        if (exists && status) {
          joinedList.push(t);
          statusMap[t.id] = status;
        }
      }

      setTournaments(joinedList);
      setPlayerStatusMap(statusMap);

      if (joinedList.length > 0) {
        const sessionTourney = getSessionTournament();
        const matched = sessionTourney
          ? joinedList.find((t) => t.id === sessionTourney.id)
          : null;
        const chosen = matched || joinedList[0];
        setSelectedTournament(chosen);
        setSessionTournament(chosen);
      } else {
        setSelectedTournament(null);
      }
    } catch (err) {
      console.error('Gagal memuat turnamen pemain:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchMyTournaments();
  }, [currentUser]);

  // 2. Pasang real-time listener onSnapshot pada turnamen yang dipilih
  useEffect(() => {
    if (!selectedTournament || !currentUser) {
      setMyMatches([]);
      setAllTournamentMatches([]);
      return;
    }

    setSnapshotError(null);
    const matchesCol = collection(db, 'tournaments', selectedTournament.id, 'matches');
    const unsub = onSnapshot(
      matchesCol,
      (snapshot) => {
        const currentRound = selectedTournament.currentRound || 1;
        const totalRounds = selectedTournament.totalRounds || 3;
        const currentRoundMatches: TournamentMatch[] = [];
        let nextRoundExists = false;
        const allMatches: TournamentMatch[] = [];
        const matchesList: TournamentMatch[] = [];

        snapshot.forEach((docSnap) => {
          const m: TournamentMatch = {
            ...(docSnap.data() as any),
            id: docSnap.id,
          };
          allMatches.push(m);

          if (!m.archived) {
            if (m.round === currentRound) {
              currentRoundMatches.push(m);
            }
            if (m.round > currentRound) {
              nextRoundExists = true;
            }
          }

          // Filter hanya pertandingan yang melibatkan currentUser.uid
          if (m.p1Id === currentUser.uid || m.p2Id === currentUser.uid) {
            matchesList.push({
              ...m,
              hasPendingWrite: docSnap.metadata.hasPendingWrites,
            } as any);
          }
        });

        const isPause =
          selectedTournament.status === 'running' &&
          shouldShowNextRoundPause(currentRoundMatches, currentRound, totalRounds, nextRoundExists);

        setIsWaitingNextRound(isPause);
        setWaitingNextRoundNum(currentRound + 1);

        // Urutkan ronde terbaru di paling atas
        matchesList.sort((a, b) => b.round - a.round);
        setMyMatches(matchesList);
        setAllTournamentMatches(allMatches);
        setSnapshotError(null);
      },
      (error: any) => {
        console.error('Snapshot error pada pertandingan pemain:', error);
        const code = error?.code || '';
        const msg = error?.message || '';
        if (
          code === 'permission-denied' ||
          msg.includes('permission-denied') ||
          msg.includes('insufficient permissions')
        ) {
          setSnapshotError('Akses ke data pertandingan ditolak.');
        } else {
          setSnapshotError('Gagal memuat data pertandingan secara langsung. Silakan coba lagi.');
        }
      }
    );

    return () => unsub();
  }, [selectedTournament?.id, currentUser?.uid, snapshotRetryKey]);

  // Muat status partisipasi pemain untuk turnamen finished
  const fetchMyParticipationForFinished = async () => {
    if (!selectedTournament || !currentUser || selectedTournament.status !== 'finished') {
      setMyFinishedParticipation(null);
      return;
    }
    try {
      const q = query(
        collection(db, 'participations'),
        where('tournamentId', '==', selectedTournament.id),
        where('uid', '==', currentUser.uid)
      );
      const snap = await getDocs(q);
      if (!snap.empty) {
        setMyFinishedParticipation(snap.docs[0].data() as Participation);
      } else {
        setMyFinishedParticipation(null);
      }
    } catch (e) {
      console.warn('Gagal memuat partisipasi player:', e);
    }
  };

  useEffect(() => {
    fetchMyParticipationForFinished();
  }, [selectedTournament?.id, selectedTournament?.status, currentUser?.uid]);

  // 3. Player input skor dengan tombol skor besar
  const handleReportScore = async (
    match: TournamentMatch,
    myScore: number,
    oppScore: number
  ) => {
    if (!selectedTournament || !currentUser) return;
    setActionLoadingId(match.id);
    setActionError(null);

    const isP1 = match.p1Id === currentUser.uid;
    const finalP1Score = isP1 ? myScore : oppScore;
    const finalP2Score = isP1 ? oppScore : myScore;

    try {
      await reportMatchScoreByPlayer(
        selectedTournament.id,
        match.id,
        finalP1Score,
        finalP2Score,
        currentUser.uid
      );
    } catch (err: any) {
      const code = err?.code || '';
      const msg = err?.message || '';
      if (
        code === 'permission-denied' ||
        msg.includes('permission-denied') ||
        msg.includes('insufficient permissions')
      ) {
        setActionError('Skor tidak dapat dikirim. Pastikan Anda peserta pertandingan ini, atau hubungi organizer.');
      } else {
        setActionError(msg || 'Gagal melaporkan skor pertandingan.');
      }
    } finally {
      setActionLoadingId(null);
    }
  };

  // 4. Lawan merespons hasil (konfirmasi atau tolak)
  const handleRespondScore = async (match: TournamentMatch, approve: boolean) => {
    if (!selectedTournament || !currentUser) return;
    setActionLoadingId(match.id);
    setActionError(null);

    try {
      await respondToReportedScore(selectedTournament.id, match.id, approve, currentUser.uid);

      if (approve) {
        const totalRounds = selectedTournament.totalRounds || 3;
        await checkAndFinishTournamentIfComplete(
          selectedTournament.id,
          match.round,
          totalRounds
        );
      }
    } catch (err: any) {
      const code = err?.code || '';
      const msg = err?.message || '';
      if (
        code === 'permission-denied' ||
        msg.includes('permission-denied') ||
        msg.includes('insufficient permissions')
      ) {
        setActionError('Skor tidak dapat dikirim. Pastikan Anda peserta pertandingan ini, atau hubungi organizer.');
      } else {
        setActionError(msg || 'Gagal menanggapi laporan skor.');
      }
    } finally {
      setActionLoadingId(null);
    }
  };

  const currentPlayerStatus: PlayerStatus | null =
    selectedTournament && playerStatusMap[selectedTournament.id]
      ? playerStatusMap[selectedTournament.id]
      : null;

  const currentMatchState = resolvePlayerMatchState(
    currentPlayerStatus,
    selectedTournament?.totalRounds || 3,
    allTournamentMatches,
    currentUser?.uid,
    userProfile?.displayName || userProfile?.username || ''
  );

  return (
    <div className="flex flex-col gap-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-section-title text-dark-text font-semibold flex items-center gap-2">
            <Flame className="text-accent" size={20} />
            Pertandingan Saya
          </h2>
          <p className="text-caption text-dark-muted">
            Meja tanding, input skor mandiri, dan konfirmasi hasil
          </p>
        </div>
        <Button
          variant="secondary"
          className="!min-h-[36px] !px-2.5 !text-caption"
          onClick={() => fetchMyTournaments(true)}
          icon={<RefreshCw size={15} className={loading ? 'animate-spin' : ''} />}
        />
      </div>

      {/* Banner Galat Aksi Skor */}
      {actionError && (
        <div className="p-3 bg-status-red/10 border border-status-red/30 rounded-card text-caption text-status-red flex items-start gap-2">
          <AlertTriangle size={16} className="flex-shrink-0 mt-0.5" />
          <span>{actionError}</span>
        </div>
      )}

      {/* Banner Galat Snapshot Real-time dengan Tombol Coba Lagi */}
      {snapshotError && (
        <div className="p-3 bg-status-red/10 border border-status-red/30 rounded-card text-caption text-status-red flex items-center justify-between gap-2 shadow-sm animate-fade-in">
          <div className="flex items-start gap-2">
            <AlertCircle size={16} className="flex-shrink-0 mt-0.5 text-status-red" />
            <span>{snapshotError}</span>
          </div>
          <Button
            variant="secondary"
            className="!min-h-[30px] !px-2.5 !text-[11px] flex-shrink-0"
            onClick={() => {
              setSnapshotError(null);
              setSnapshotRetryKey((k) => k + 1);
            }}
          >
            Coba Lagi
          </Button>
        </div>
      )}

      {loading ? (
        <Card variant="surface" className="text-center py-8 text-caption text-dark-muted">
          Memeriksa jadwal pertandingan Anda...
        </Card>
      ) : tournaments.length === 0 ? (
        <Card variant="surface" className="my-2">
          <EmptyState
            icon={Swords}
            message="Belum ada turnamen aktif yang Anda ikuti. Daftarkan diri Anda di menu Turnamen."
          />
        </Card>
      ) : (
        <div className="flex flex-col gap-3">
          {/* Pemilihan Turnamen Aktif */}
          {tournaments.length > 1 && (
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
                    {t.name} ({t.status === 'running' ? 'Sedang Berjalan' : 'Selesai'})
                  </option>
                ))}
              </select>
            </div>
          )}

          {selectedTournament && (
            <Card variant="surface-high" className="flex flex-col gap-1.5 p-3">
              <div className="flex items-center justify-between gap-2">
                <span className="text-body font-semibold text-dark-text">
                  {selectedTournament.name}
                </span>
                <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-accent/10 text-accent border border-accent/20">
                  {selectedTournament.format}
                </span>
              </div>
              <div className="flex items-center justify-between text-caption text-dark-muted">
                <span>
                  Status:{' '}
                  <strong className={selectedTournament.status === 'running' ? 'text-status-green' : 'text-dark-text'}>
                    {selectedTournament.status === 'running' ? 'Sedang Berjalan' : 'Selesai'}
                  </strong>{' '}
                  • Total: {selectedTournament.totalRounds || 3} Ronde
                </span>
                {currentPlayerStatus && (
                  <span className="text-[11px] font-medium px-2 py-0.5 rounded bg-dark-surface border border-dark-border">
                    Status: <strong className="text-dark-text capitalize">{currentPlayerStatus}</strong>
                  </span>
                )}
              </div>
            </Card>
          )}

          {/* Banner Turnamen Selesai: Isi Deck atau Menunggu Finalisasi */}
          {selectedTournament && selectedTournament.status === 'finished' && (
            myFinishedParticipation ? (
              !myFinishedParticipation.deckName || myFinishedParticipation.deckName.trim() === '' ? (
                <div className="p-3 bg-accent/15 border border-accent/30 rounded-card flex items-center justify-between gap-3 text-caption animate-fade-in">
                  <div className="flex items-center gap-2 min-w-0">
                    <Layers size={16} className="text-accent flex-shrink-0" />
                    <span className="text-dark-text truncate">
                      Turnamen <strong>{selectedTournament.name}</strong> sudah selesai. Isi deck Anda.
                    </span>
                  </div>
                  <Button
                    variant="primary"
                    className="!min-h-[30px] !px-3 !text-[11px] flex-shrink-0"
                    onClick={() => setDeckModalOpen(true)}
                  >
                    Isi Deck
                  </Button>
                </div>
              ) : (
                <div className="p-3 bg-dark-surface border border-dark-border rounded-card flex items-center justify-between gap-2 text-caption">
                  <div className="flex items-center gap-2 min-w-0">
                    <Layers size={15} className="text-accent flex-shrink-0" />
                    <span className="text-dark-text truncate" title={myFinishedParticipation.deckName}>
                      Deck Anda: <strong>{myFinishedParticipation.deckName}</strong>
                    </span>
                    <DeckColorDots colors={myFinishedParticipation.deckColors} size="sm" />
                  </div>
                  <button
                    type="button"
                    onClick={() => setDeckModalOpen(true)}
                    className="text-[11px] text-accent hover:underline flex items-center gap-1 flex-shrink-0"
                  >
                    <Edit2 size={12} />
                    <span>Ubah</span>
                  </button>
                </div>
              )
            ) : (
              <div className="p-3 bg-dark-surface border border-dark-border rounded-card flex items-center gap-2 text-caption text-dark-muted">
                <Clock size={16} className="text-status-yellow flex-shrink-0" />
                <span>Turnamen <strong>{selectedTournament.name}</strong> sudah selesai. Menunggu organizer memfinalisasi hasil.</span>
              </div>
            )
          )}

          {/* Banner Menunggu Organizer Lanjut ke Ronde Berikutnya */}
          {selectedTournament && selectedTournament.status === 'running' && isWaitingNextRound && (
            <div className="p-3 bg-dark-surface border border-accent/40 rounded-card flex items-center gap-2.5 text-caption text-accent font-medium shadow-sm animate-fade-in">
              <Clock size={16} className="text-accent flex-shrink-0" />
              <span>Menunggu organizer melanjutkan ke Ronde {waitingNextRoundNum}</span>
            </div>
          )}

          {/* Daftar Pertandingan Pemain atau Pesan Keadaan Spesifik */}
          {myMatches.length === 0 ? (
            <Card variant="surface" className="my-2">
              <EmptyState
                icon={Swords}
                message={currentMatchState.message}
              />
            </Card>
          ) : (
            <div className="flex flex-col gap-3">
              {myMatches.map((match) => {
                const isP1 = match.p1Id === currentUser?.uid;
                const oppName = isP1 ? match.p2Name : match.p1Name;
                const oppId = isP1 ? match.p2Id : match.p1Id;
                const myScore = isP1 ? match.p1Score : match.p2Score;
                const oppScore = isP1 ? match.p2Score : match.p1Score;
                const isBye = match.p2Id === null;

                const isReporter = match.reportedBy === currentUser?.uid;
                const format: TournamentFormat = selectedTournament?.format || 'BO3';

                const isLoadingAction = actionLoadingId === match.id;

                const pointsEarned =
                  match.status === 'confirmed'
                    ? calculateMatchPoints(format, myScore, oppScore, isBye)
                    : null;

                return (
                  <Card key={match.id} variant="surface" className="flex flex-col gap-3 p-4">
                    {/* Header Pertandingan */}
                    <div className="flex items-center justify-between pb-2 border-b border-dark-border">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-caption font-bold text-accent">
                          Ronde {match.round}
                        </span>
                        <span className="text-caption text-dark-muted font-mono">
                          {isBye ? '• BYE (menang otomatis)' : `• Meja #${match.table}`}
                        </span>
                      </div>
                      <StatusBadge
                        label={
                          (isLoadingAction || (match as any).hasPendingWrite) && match.status !== 'confirmed'
                            ? 'Mengirim ke Server...'
                            : match.status === 'confirmed'
                            ? 'Terkonfirmasi'
                            : match.status === 'awaiting'
                            ? 'Menunggu Konfirmasi'
                            : match.status === 'disputed'
                            ? 'Bermasalah (Disputed)'
                            : 'Belum Selesai'
                        }
                        variant={
                          (isLoadingAction || (match as any).hasPendingWrite) && match.status !== 'confirmed'
                            ? 'yellow'
                            : match.status === 'confirmed'
                            ? 'green'
                            : match.status === 'awaiting'
                            ? 'yellow'
                            : match.status === 'disputed'
                            ? 'red'
                            : 'neutral'
                        }
                      />
                    </div>

                    {/* Informasi Lawan & Skor */}
                    <div className="flex items-center justify-between py-1">
                      <div>
                        <span className="text-caption text-dark-muted block">Lawan Anda:</span>
                        <span className="text-title font-semibold text-dark-text">
                          {isBye ? 'BYE (menang otomatis)' : oppName}
                        </span>
                      </div>

                      <div className="text-right">
                        {match.status === 'confirmed' ? (
                          <div>
                            <span className="font-mono text-2xl font-bold text-accent">
                              {myScore} - {oppScore}
                            </span>
                            <span className="text-[11px] font-mono text-status-green block font-medium">
                              +{pointsEarned} Poin
                            </span>
                          </div>
                        ) : match.status === 'awaiting' ? (
                          <div className="font-mono text-lg font-bold text-dark-muted">
                            {myScore} - {oppScore}
                          </div>
                        ) : (
                          <span className="text-caption font-mono text-dark-muted">Skor: - / -</span>
                        )}
                      </div>
                    </div>

                    {/* Kontrol Interaktif Sesuai Status */}
                    {isBye ? (
                      <div className="p-2.5 rounded bg-accent/10 border border-accent/20 text-caption text-accent font-medium text-center">
                        Pertandingan BYE (menang otomatis) (+3 Poin).
                      </div>
                    ) : (isLoadingAction || (match as any).hasPendingWrite) && match.status !== 'confirmed' ? (
                      <div className="p-3 rounded bg-accent/10 border border-accent/30 text-caption text-accent flex items-center gap-2">
                        <RefreshCw size={16} className="animate-spin flex-shrink-0" />
                        <span>Mengirim laporan skor ke server... Mohon tunggu.</span>
                      </div>
                    ) : match.status === 'pending' ? (
                      // 1. Status PENDING: Tampilkan tombol skor besar untuk input
                      <div className="flex flex-col gap-2 pt-2 border-t border-dark-border">
                        <span className="text-caption font-semibold text-accent">
                          Pilih Hasil Pertandingan Anda:
                        </span>
                        {format === 'BO1' ? (
                          <div className="grid grid-cols-2 gap-2.5">
                            <button
                              type="button"
                              disabled={isLoadingAction}
                              onClick={() => handleReportScore(match, 1, 0)}
                              className="min-h-[50px] rounded-btn border border-status-green/40 bg-status-green/10 text-status-green font-bold text-body hover:bg-status-green/20 transition-colors flex items-center justify-center gap-2 shadow-sm"
                            >
                              <CheckCircle2 size={18} />
                              Menang (1 - 0)
                            </button>
                            <button
                              type="button"
                              disabled={isLoadingAction}
                              onClick={() => handleReportScore(match, 0, 1)}
                              className="min-h-[50px] rounded-btn border border-status-red/40 bg-status-red/10 text-status-red font-bold text-body hover:bg-status-red/20 transition-colors flex items-center justify-center gap-2 shadow-sm"
                            >
                              <XCircle size={18} />
                              Kalah (0 - 1)
                            </button>
                          </div>
                        ) : (
                          <div className="grid grid-cols-2 gap-2">
                            <button
                              type="button"
                              disabled={isLoadingAction}
                              onClick={() => handleReportScore(match, 2, 0)}
                              className="min-h-[48px] rounded-btn border border-status-green/40 bg-status-green/10 text-status-green font-bold text-caption hover:bg-status-green/20 transition-colors flex flex-col items-center justify-center py-1.5"
                            >
                              <span>Menang 2 - 0</span>
                              <span className="text-[10px] opacity-80">(3 Poin)</span>
                            </button>
                            <button
                              type="button"
                              disabled={isLoadingAction}
                              onClick={() => handleReportScore(match, 2, 1)}
                              className="min-h-[48px] rounded-btn border border-status-green/40 bg-status-green/10 text-status-green font-bold text-caption hover:bg-status-green/20 transition-colors flex flex-col items-center justify-center py-1.5"
                            >
                              <span>Menang 2 - 1</span>
                              <span className="text-[10px] opacity-80">(2 Poin)</span>
                            </button>
                            <button
                              type="button"
                              disabled={isLoadingAction}
                              onClick={() => handleReportScore(match, 1, 2)}
                              className="min-h-[48px] rounded-btn border border-status-yellow/40 bg-status-yellow/10 text-status-yellow font-bold text-caption hover:bg-status-yellow/20 transition-colors flex flex-col items-center justify-center py-1.5"
                            >
                              <span>Kalah 1 - 2</span>
                              <span className="text-[10px] opacity-80">(1 Poin)</span>
                            </button>
                            <button
                              type="button"
                              disabled={isLoadingAction}
                              onClick={() => handleReportScore(match, 0, 2)}
                              className="min-h-[48px] rounded-btn border border-status-red/40 bg-status-red/10 text-status-red font-bold text-caption hover:bg-status-red/20 transition-colors flex flex-col items-center justify-center py-1.5"
                            >
                              <span>Kalah 0 - 2</span>
                              <span className="text-[10px] opacity-80">(0 Poin)</span>
                            </button>
                          </div>
                        )}
                        <p className="text-[11px] text-dark-muted text-center mt-0.5">
                          Hasil yang Anda laporkan akan dikirimkan ke lawan untuk dikonfirmasi.
                        </p>
                      </div>
                    ) : match.status === 'awaiting' ? (
                      // 2. Status AWAITING
                      isReporter ? (
                        <div className="p-3 rounded bg-status-yellow/10 border border-status-yellow/30 text-caption text-status-yellow flex items-start gap-2">
                          <Clock size={16} className="flex-shrink-0 mt-0.5" />
                          <div>
                            <span className="font-semibold block">Menunggu Konfirmasi Lawan</span>
                            <span className="text-[11px] text-dark-muted">
                              Anda melaporkan skor <strong>{myScore} - {oppScore}</strong>. Menunggu <strong>{oppName}</strong> menyetujui hasil ini.
                            </span>
                          </div>
                        </div>
                      ) : (
                        <div className="flex flex-col gap-2 pt-2 border-t border-dark-border">
                          <div className="p-2.5 rounded bg-accent/10 border border-accent/20 text-caption text-dark-text">
                            <strong>{oppName}</strong> melaporkan skor pertandingan:{' '}
                            <strong className="text-accent">{oppScore} - {myScore}</strong> (Skor Anda: {myScore}). Apakah hasil ini sudah sesuai?
                          </div>
                          <div className="grid grid-cols-2 gap-2">
                            <Button
                              variant="primary"
                              onClick={() => handleRespondScore(match, true)}
                              isLoading={isLoadingAction}
                              icon={<CheckCircle2 size={16} />}
                            >
                              Konfirmasi (Benar)
                            </Button>
                            <Button
                              variant="danger"
                              onClick={() => handleRespondScore(match, false)}
                              isLoading={isLoadingAction}
                              icon={<XCircle size={16} />}
                            >
                              Tolak (Bermasalah)
                            </Button>
                          </div>
                        </div>
                      )
                    ) : match.status === 'disputed' ? (
                      // 3. Status DISPUTED
                      <div className="p-3 rounded bg-status-red/10 border border-status-red/30 text-caption text-status-red flex items-start gap-2">
                        <AlertTriangle size={16} className="flex-shrink-0 mt-0.5" />
                        <div>
                          <span className="font-semibold block">Pertandingan Bermasalah (Disputed)</span>
                          <span className="text-[11px] text-dark-muted">
                            Terdapat sanggahan atas hasil pertandingan ini. Harap panggil organizer turnamen untuk menentukan keputusan akhir di meja pertandingan.
                          </span>
                        </div>
                      </div>
                    ) : (
                      // 4. Status CONFIRMED
                      <div className="flex items-center justify-between text-caption text-status-green pt-1 border-t border-dark-border/40">
                        <span className="flex items-center gap-1.5 font-medium">
                          <CheckCircle2 size={15} />
                          Hasil pertandingan resmi terkonfirmasi
                        </span>
                      </div>
                    )}
                  </Card>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Modal Pendaftaran / Edit Deck Pemain */}
      <DeckRegistrationModal
        isOpen={deckModalOpen}
        onClose={() => setDeckModalOpen(false)}
        participation={myFinishedParticipation}
        actorId={currentUser?.uid || ''}
        actorName={userProfile?.displayName || userProfile?.username || 'Player'}
        isOrganizer={false}
        onDeckUpdated={() => {
          fetchMyParticipationForFinished();
        }}
      />
    </div>
  );
};
