import React, { useState, useEffect } from 'react';
import {
  Tournament,
  TournamentMatch,
  TournamentFormat,
  MatchStatus,
  Participation
} from '../../types';
import { useAuth } from '../../context/AuthContext';
import { Card } from '../../components/common/Card';
import { Button } from '../../components/common/Button';
import { StatusBadge } from '../../components/common/StatusBadge';
import { EmptyState } from '../../components/common/EmptyState';
import {
  getAllTournaments
} from '../../services/tournamentService';
import {
  getAllTournamentMatches,
  reportMatchScoreByPlayer,
  respondToReportedScore,
  checkAndFinishTournamentIfComplete
} from '../../services/roundService';
import { calculateMatchPoints } from '../../utils/standingsLogic';
import { collection, query, where, onSnapshot, getDocs } from 'firebase/firestore';
import { db } from '../../firebaseConfig';
import { DeckRegistrationModal } from '../tournaments/DeckRegistrationModal';
import { DECK_COLOR_STYLES } from '../../utils/deckExportLogic';
import {
  Swords,
  Flame,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Clock,
  Trophy,
  RefreshCw,
  HelpCircle,
  Layers,
  Edit2
} from 'lucide-react';
import { getSessionTournament, setSessionTournament } from '../../utils/sessionStore';

export const MyMatchesView: React.FC = () => {
  const { currentUser, userProfile } = useAuth();
  const [tournaments, setTournaments] = useState<Tournament[]>([]);
  const [selectedTournament, setSelectedTournament] = useState<Tournament | null>(() => getSessionTournament());
  const [myMatches, setMyMatches] = useState<TournamentMatch[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [myFinishedParticipation, setMyFinishedParticipation] = useState<Participation | null>(null);
  const [deckModalOpen, setDeckModalOpen] = useState(false);

  // 1. Cari turnamen yang sedang aktif / baru selesai di mana pemain mungkin berpartisipasi
  const fetchMyTournaments = async () => {
    if (!currentUser) return;
    setLoading(true);
    try {
      const all = await getAllTournaments();
      // Prioritaskan turnamen berstatus running
      const runningAndFinished = all.filter(
        (t) => t.status === 'running' || t.status === 'finished'
      );
      setTournaments(runningAndFinished);

      if (runningAndFinished.length > 0) {
        const sessionTourney = getSessionTournament();
        const matched = sessionTourney
          ? runningAndFinished.find((t) => t.id === sessionTourney.id)
          : null;
        const chosen = matched || runningAndFinished[0];
        setSelectedTournament(chosen);
        setSessionTournament(chosen);
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
    if (!selectedTournament || !currentUser) return;

    const matchesCol = collection(db, 'tournaments', selectedTournament.id, 'matches');
    const unsub = onSnapshot(
      matchesCol,
      (snapshot) => {
        const matchesList: TournamentMatch[] = [];
        snapshot.forEach((docSnap) => {
          const m = docSnap.data() as TournamentMatch;
          // Filter hanya pertandingan yang melibatkan currentUser.uid
          if (m.p1Id === currentUser.uid || m.p2Id === currentUser.uid) {
            matchesList.push({
              ...m,
              hasPendingWrite: docSnap.metadata.hasPendingWrites,
            } as any);
          }
        });

        // Urutkan ronde terbaru di paling atas
        matchesList.sort((a, b) => b.round - a.round);
        setMyMatches(matchesList);
      },
      (error) => {
        console.error('Snapshot error pada pertandingan pemain:', error);
      }
    );

    return () => unsub();
  }, [selectedTournament?.id, currentUser?.uid]);

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
        // Cek jika seluruh pertandingan di ronde selesai
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
          onClick={fetchMyTournaments}
          icon={<RefreshCw size={15} className={loading ? 'animate-spin' : ''} />}
        />
      </div>

      {actionError && (
        <div className="p-3 bg-status-red/10 border border-status-red/30 rounded-card text-caption text-status-red flex items-start gap-2">
          <AlertTriangle size={16} className="flex-shrink-0 mt-0.5" />
          <span>{actionError}</span>
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
            message="Belum ada turnamen aktif yang Anda ikuti saat ini. Daftarkan diri Anda di menu Turnamen."
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
              <p className="text-caption text-dark-muted">
                Status:{' '}
                <strong className={selectedTournament.status === 'running' ? 'text-status-green' : 'text-dark-text'}>
                  {selectedTournament.status === 'running' ? 'Sedang Berjalan' : 'Selesai'}
                </strong>{' '}
                • Total: {selectedTournament.totalRounds || 3} Ronde
              </p>
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
                    <span className="text-dark-text truncate">
                      Deck Anda: <strong>{myFinishedParticipation.deckName}</strong>
                    </span>
                    <div className="flex items-center gap-1">
                      {myFinishedParticipation.deckColors?.map((c) => {
                        const s = DECK_COLOR_STYLES[c];
                        return (
                          <span
                            key={c}
                            className={`text-[8px] px-1 rounded-full border ${s ? `${s.bg} ${s.text} ${s.border}` : ''}`}
                          >
                            {c}
                          </span>
                        );
                      })}
                    </div>
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

          {/* Daftar Pertandingan Pemain */}
          {myMatches.length === 0 ? (
            <Card variant="surface" className="my-2">
              <EmptyState
                icon={Swords}
                message="Anda belum memiliki pertandingan yang dijadwalkan pada turnamen ini. Tunggu organizer membuat pairing ronde."
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
                          {isBye ? '• BYE' : `• Meja #${match.table}`}
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
                          {isBye ? 'BYE (Tanpa Lawan)' : oppName}
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
                        Pertandingan BYE otomatis menang (+3 Poin).
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
                        // Kasus A: Saya yang melaporkan skor
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
                        // Kasus B: Lawan yang melaporkan skor -> Saya mengonfirmasi / menolak
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
