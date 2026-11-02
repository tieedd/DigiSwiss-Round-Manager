import React, { useState, useEffect } from 'react';
import {
  Tournament,
  TournamentPlayer,
  TournamentMatch
} from '../types';
import { useAuth } from '../context/AuthContext';
import { Card } from '../components/common/Card';
import { Button } from '../components/common/Button';
import { StatusBadge } from '../components/common/StatusBadge';
import { EmptyState } from '../components/common/EmptyState';
import { getAllTournaments, getTournamentPlayers } from '../services/tournamentService';
import { calculateTournamentStandings, PlayerStanding } from '../utils/standingsLogic';
import { collection, onSnapshot } from 'firebase/firestore';
import { db } from '../firebaseConfig';
import {
  Trophy,
  Medal,
  RefreshCw,
  HelpCircle,
  Radio,
  ChevronDown,
  ChevronUp,
  Award
} from 'lucide-react';
import { FinalResultsSection } from './tournaments/FinalResultsSection';
import { getSessionTournament, setSessionTournament } from '../utils/sessionStore';

export const StandingsView: React.FC = () => {
  const { currentUser, userProfile } = useAuth();
  const [tournaments, setTournaments] = useState<Tournament[]>([]);
  const [selectedTournament, setSelectedTournament] = useState<Tournament | null>(() => getSessionTournament());
  const [players, setPlayers] = useState<TournamentPlayer[]>([]);
  const [matches, setMatches] = useState<TournamentMatch[]>([]);
  const [standings, setStandings] = useState<PlayerStanding[]>([]);
  const [loadingTournaments, setLoadingTournaments] = useState(true);
  const [loadingPlayers, setLoadingPlayers] = useState(false);
  const [expandedPlayerId, setExpandedPlayerId] = useState<string | null>(null);

  // 1. Muat daftar turnamen
  const fetchTournaments = async () => {
    setLoadingTournaments(true);
    try {
      const all = await getAllTournaments();
      // Prioritaskan yang running lalu finished
      const sorted = [...all].sort((a, b) => {
        const order: Record<string, number> = { running: 0, finished: 1, registration: 2 };
        return (order[a.status] ?? 3) - (order[b.status] ?? 3);
      });

      setTournaments(sorted);
      if (sorted.length > 0) {
        const sessionTourney = getSessionTournament();
        const matched = sessionTourney ? sorted.find((t) => t.id === sessionTourney.id) : null;
        const chosen = matched || sorted[0];
        setSelectedTournament(chosen);
        setSessionTournament(chosen);
      }
    } catch (err) {
      console.error('Gagal memuat turnamen untuk klasemen:', err);
    } finally {
      setLoadingTournaments(false);
    }
  };

  useEffect(() => {
    fetchTournaments();
  }, []);

  // 2. Muat data pemain turnamen terpilih
  useEffect(() => {
    if (!selectedTournament) return;
    let isMounted = true;
    setLoadingPlayers(true);

    getTournamentPlayers(selectedTournament.id)
      .then((pList) => {
        if (isMounted) {
          setPlayers(pList);
        }
      })
      .catch((err) => console.error('Gagal memuat peserta turnamen:', err))
      .finally(() => {
        if (isMounted) setLoadingPlayers(false);
      });

    return () => {
      isMounted = false;
    };
  }, [selectedTournament?.id]);

  // 3. Listener Real-time onSnapshot untuk pertandingan pada turnamen yang dipilih
  useEffect(() => {
    if (!selectedTournament) return;

    const matchesCol = collection(db, 'tournaments', selectedTournament.id, 'matches');
    const unsubscribe = onSnapshot(
      matchesCol,
      (snapshot) => {
        const matchList: TournamentMatch[] = [];
        snapshot.forEach((docSnap) => {
          matchList.push(docSnap.data() as TournamentMatch);
        });
        setMatches(matchList);
      },
      (error) => {
        console.error('Snapshot error pada klasemen turnamen:', error);
      }
    );

    return () => unsubscribe();
  }, [selectedTournament?.id]);

  // 4. Hitung ulang Klasemen di sisi klien setiap kali matches atau players berubah
  useEffect(() => {
    if (!selectedTournament || players.length === 0) {
      setStandings([]);
      return;
    }

    const calculated = calculateTournamentStandings(
      players,
      matches,
      selectedTournament.format
    );
    setStandings(calculated);
  }, [selectedTournament?.format, players, matches]);

  const toggleExpand = (playerId: string) => {
    setExpandedPlayerId((prev) => (prev === playerId ? null : playerId));
  };

  return (
    <div className="flex flex-col gap-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-section-title text-dark-text font-semibold flex items-center gap-2">
            <Trophy className="text-accent" size={20} />
            Klasemen Turnamen
          </h2>
          <p className="text-caption text-dark-muted">
            Papan peringkat real-time dan metrik tie-breaker resmi
          </p>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="flex items-center gap-1 text-[11px] font-mono text-status-green bg-status-green/10 border border-status-green/20 px-2 py-1 rounded-full">
            <span className="w-1.5 h-1.5 rounded-full bg-status-green animate-pulse" />
            <span>Live</span>
          </div>
          <Button
            variant="secondary"
            className="!min-h-[36px] !px-2.5 !text-caption"
            onClick={fetchTournaments}
            icon={<RefreshCw size={15} className={loadingTournaments ? 'animate-spin' : ''} />}
          />
        </div>
      </div>

      {/* Pilihan Turnamen */}
      {loadingTournaments ? (
        <Card variant="surface" className="text-center py-6 text-caption text-dark-muted">
          Memuat daftar turnamen...
        </Card>
      ) : tournaments.length === 0 ? (
        <Card variant="surface" className="my-2">
          <EmptyState
            icon={Trophy}
            message="Belum ada turnamen yang dibuat. Buat atau ikuti turnamen untuk melihat klasemen."
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
                  {t.name} ({t.status === 'running' ? 'Sedang Berjalan' : t.status === 'finished' ? 'Selesai' : 'Pendaftaran'}) - #{t.joinCode}
                </option>
              ))}
            </select>
          </div>

          {selectedTournament && (
            <Card variant="surface-high" className="flex flex-col gap-1.5 p-3">
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
                    Penyelenggara: {selectedTournament.organizerName} • Kode: #{selectedTournament.joinCode}
                  </span>
                </div>
                <StatusBadge
                  label={
                    selectedTournament.status === 'running'
                      ? 'Berjalan'
                      : selectedTournament.status === 'finished'
                      ? 'Selesai'
                      : 'Pendaftaran'
                  }
                  variant={
                    selectedTournament.status === 'running'
                      ? 'green'
                      : selectedTournament.status === 'finished'
                      ? 'neutral'
                      : 'yellow'
                  }
                />
              </div>
            </Card>
          )}

          {/* Bagian Finalisasi Hasil & Pengisian Deck & Ekspor (Saat Turnamen Selesai) */}
          {selectedTournament && selectedTournament.status === 'finished' && (
            <FinalResultsSection
              tournament={selectedTournament}
              players={players}
              matches={matches}
              isOrganizer={userProfile?.role === 'organizer' || userProfile?.role === 'admin'}
              onTournamentUpdated={fetchTournaments}
            />
          )}

          {/* Tabel Klasemen */}
          {loadingPlayers ? (
            <Card variant="surface" className="text-center py-8 text-caption text-dark-muted">
              Menghitung klasemen turnamen...
            </Card>
          ) : standings.length === 0 ? (
            <Card variant="surface" className="my-2">
              <EmptyState
                icon={Trophy}
                message={
                  selectedTournament?.status === 'registration'
                    ? 'Turnamen masih dalam tahap pendaftaran. Klasemen akan aktif saat ronde pertama dimulai.'
                    : 'Belum ada data klasemen untuk turnamen ini.'
                }
              />
            </Card>
          ) : (
            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between px-1 text-[11px] font-mono text-dark-muted uppercase">
                <span>Daftar Klasemen ({standings.length} Peserta)</span>
                <span>Klik untuk Detail Tie-breaker</span>
              </div>

              {standings.map((s) => {
                const isTop3 = s.rank <= 3;
                const isFirst = s.rank === 1;
                const isSecond = s.rank === 2;
                const isThird = s.rank === 3;
                const isExpanded = expandedPlayerId === s.playerId;
                const isCurrentUser = currentUser?.uid === s.playerId;

                return (
                  <Card
                    key={s.playerId}
                    variant="surface"
                    className={`transition-colors cursor-pointer p-3 ${
                      isCurrentUser ? 'border-accent/60 bg-accent/5' : ''
                    } ${isTop3 ? 'border-l-4 border-l-accent' : ''}`}
                    onClick={() => toggleExpand(s.playerId)}
                  >
                    <div className="flex items-center justify-between gap-2">
                      {/* Peringkat & Nama */}
                      <div className="flex items-center gap-3 min-w-0">
                        {/* Peringkat 1-3 ditandai angka berwarna aksen */}
                        <div
                          className={`w-8 h-8 rounded-full flex items-center justify-center font-mono font-bold text-caption flex-shrink-0 ${
                            isFirst
                              ? 'bg-accent text-dark-bg shadow-sm'
                              : isSecond
                              ? 'bg-accent/80 text-dark-bg'
                              : isThird
                              ? 'bg-accent/60 text-dark-bg'
                              : 'bg-dark-surface-high text-dark-muted border border-dark-border'
                          }`}
                        >
                          {s.rank}
                        </div>

                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="text-body font-semibold text-dark-text truncate">
                              {s.playerName}
                            </span>
                            {isCurrentUser && (
                              <span className="text-[10px] font-mono px-1 rounded bg-accent/20 text-accent">
                                Anda
                              </span>
                            )}
                            {s.isDropped && (
                              <span className="text-[10px] font-mono px-1 rounded bg-status-red/20 text-status-red">
                                Dropped
                              </span>
                            )}
                          </div>
                          <span className="text-caption text-dark-muted font-mono block">
                            Match: <strong className="text-dark-text">{s.matchWins}M - {s.matchLosses}K</strong>
                            {' • '}
                            Game: {s.gamesWon} - {s.gamesLost}
                          </span>
                        </div>
                      </div>

                      {/* Total Poin & Chevron */}
                      <div className="flex items-center gap-3">
                        <div className="text-right">
                          <span className="font-mono text-xl font-bold text-accent block leading-none">
                            {s.points}
                          </span>
                          <span className="text-[10px] font-mono text-dark-muted uppercase">
                            Poin
                          </span>
                        </div>
                        <div className="text-dark-muted">
                          {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                        </div>
                      </div>
                    </div>

                    {/* Rincian Tie-breaker (Expandable) */}
                    {isExpanded && (
                      <div className="mt-3 pt-2.5 border-t border-dark-border grid grid-cols-3 gap-2 text-center text-caption bg-dark-bg/40 p-2 rounded">
                        <div>
                          <span className="text-[10px] font-mono text-dark-muted block uppercase">
                            1. OMW%
                          </span>
                          <span className="font-mono font-bold text-accent text-body">
                            {s.omw}%
                          </span>
                        </div>
                        <div>
                          <span className="text-[10px] font-mono text-dark-muted block uppercase">
                            2. GW%
                          </span>
                          <span className="font-mono font-bold text-dark-text text-body">
                            {s.gw}%
                          </span>
                        </div>
                        <div>
                          <span className="text-[10px] font-mono text-dark-muted block uppercase">
                            3. OGW%
                          </span>
                          <span className="font-mono font-bold text-dark-text text-body">
                            {s.ogw}%
                          </span>
                        </div>
                      </div>
                    )}
                  </Card>
                );
              })}
            </div>
          )}

          {/* Panduan Tie-breaker Resmi */}
          <Card variant="surface-high" className="flex flex-col gap-2 mt-2">
            <div className="flex items-center gap-2">
              <HelpCircle size={18} className="text-accent stroke-[1.5]" />
              <h3 className="text-body font-semibold text-dark-text">
                Aturan Penentuan Tie-breaker Resmi
              </h3>
            </div>
            <div className="text-caption text-dark-muted space-y-1.5 mt-1 leading-relaxed">
              <p>
                <strong className="text-dark-text">1. OMW% (Opponent Match Win %):</strong> Rata-rata persentase kemenangan match lawan yang dihadapi (nilai minimum 33.33% per lawan; BYE tidak dihitung).
              </p>
              <p>
                <strong className="text-dark-text">2. GW% (Game Win %):</strong> Persentase kemenangan game individu pemain.
              </p>
              <p>
                <strong className="text-dark-text">3. OGW% (Opponent Game Win %):</strong> Rata-rata persentase kemenangan game seluruh lawan yang dihadapi.
              </p>
              <p>
                <strong className="text-dark-text">4. Head-to-Head:</strong> Hasil pertandingan langsung antara pemain jika seluruh metrik di atas bernilai sama.
              </p>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
};
