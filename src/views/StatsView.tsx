import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { Card } from '../components/common/Card';
import { Button } from '../components/common/Button';
import { EmptyState } from '../components/common/EmptyState';
import {
  calculatePlayerStats,
  calculateOrganizerStats,
  calculateAdminStats,
  PlayerStatsSummary,
  OrganizerStatsSummary,
  AdminStatsSummary
} from '../utils/statsLogic';
import { DeckColorDots } from '../components/common/DeckColorDots';
import { filterParticipationsByExistingTournaments } from '../utils/cascadeDeleteLogic';
import { checkExistingTournaments } from '../services/tournamentCleanupService';
import { collection, query, where, getDocs, limit, orderBy } from 'firebase/firestore';
import { db } from '../firebaseConfig';
import { getAllTournaments, getOrganizerTournaments } from '../services/tournamentService';
import { getAllUsers } from '../services/authService';
import { Participation, Tournament, UserProfile, DeckColor } from '../types';
import {
  BarChart3,
  Trophy,
  Swords,
  Flame,
  Layers,
  Award,
  Users,
  PieChart,
  TrendingUp,
  RefreshCw,
  AlertCircle
} from 'lucide-react';

export const StatsView: React.FC = () => {
  const { currentUser, userProfile } = useAuth();
  const role = userProfile?.role || 'player';
  const isOrganizer = role === 'organizer';
  const isAdmin = role === 'admin';

  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // States
  const [playerStats, setPlayerStats] = useState<PlayerStatsSummary | null>(null);
  const [organizerStats, setOrganizerStats] = useState<OrganizerStatsSummary | null>(null);
  const [adminStats, setAdminStats] = useState<AdminStatsSummary | null>(null);

  const fetchStats = async () => {
    if (!currentUser) return;
    setLoading(true);
    setErrorMsg(null);
    try {
      if (isAdmin) {
        // Admin: Baca data pengguna, turnamen, dan sampel partisipasi terbaru
        const [users, allTournaments] = await Promise.all([
          getAllUsers(),
          getAllTournaments()
        ]);

        const partsCol = collection(db, 'participations');
        // Batasi pembacaan partisipasi terbaru agar hemat read quota
        const partsSnap = await getDocs(query(partsCol, orderBy('createdAt', 'desc'), limit(200)));
        const partsList = partsSnap.docs.map((d) => d.data() as Participation);

        // Hanya sertakan partisipasi dari turnamen yang masih ada
        const existingTournamentIds = new Set(allTournaments.map((t) => t.id));
        const validPartsList = filterParticipationsByExistingTournaments(partsList, existingTournamentIds);

        const summary = calculateAdminStats(users, allTournaments, validPartsList);
        setAdminStats(summary);
      } else if (isOrganizer) {
        // Organizer: Turnamen yang ia buat & seluruh partisipasi di turnamennya
        const orgTournaments = await getOrganizerTournaments(currentUser.uid);
        const partsCol = collection(db, 'participations');
        const partsSnap = await getDocs(
          query(partsCol, where('organizerId', '==', currentUser.uid), limit(300))
        );
        const partsList = partsSnap.docs.map((d) => d.data() as Participation);

        // Hanya sertakan partisipasi dari turnamen yang masih ada
        const existingTournamentIds = new Set(orgTournaments.map((t) => t.id));
        const validPartsList = filterParticipationsByExistingTournaments(partsList, existingTournamentIds);

        const summary = calculateOrganizerStats(orgTournaments, validPartsList);
        setOrganizerStats(summary);
      } else {
        // Player: Partisipasi miliknya
        const partsCol = collection(db, 'participations');
        const q = query(
          partsCol,
          where('uid', '==', currentUser.uid),
          orderBy('createdAt', 'desc')
        );
        const partsSnap = await getDocs(q);
        const partsList = partsSnap.docs.map((d) => d.data() as Participation);

        // Hanya sertakan partisipasi dari turnamen yang masih ada
        const tourneyIds = partsList.map((p) => p.tournamentId).filter(Boolean);
        const existingSet = await checkExistingTournaments(tourneyIds);
        const validPartsList = filterParticipationsByExistingTournaments(partsList, existingSet);

        const summary = calculatePlayerStats(validPartsList);
        setPlayerStats(summary);
      }
    } catch (err: any) {
      console.error('Gagal mengambil statistik:', err);
      setErrorMsg(err.message || 'Gagal memuat data statistik.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStats();
  }, [currentUser?.uid, role]);

  return (
    <div className="flex flex-col gap-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-section-title text-dark-text font-semibold flex items-center gap-2">
            <BarChart3 className="text-accent" size={20} />
            Statistik {isAdmin ? 'Sistem Global' : isOrganizer ? 'Turnamen Saya' : 'Performa Bermain'}
          </h2>
          <p className="text-caption text-dark-muted">
            {isAdmin
              ? 'Ringkasan pengguna, turnamen, dan meta deck secara menyeluruh'
              : isOrganizer
              ? 'Distribusi deck, win rate warna, dan tren peserta turnamen Anda'
              : 'Analisis kemenangan, win rate per deck, dan tren peringkat'}
          </p>
        </div>
        <Button
          variant="secondary"
          className="!min-h-[36px] !px-2.5 !text-caption"
          onClick={fetchStats}
          icon={<RefreshCw size={15} className={loading ? 'animate-spin' : ''} />}
          title="Segarkan"
        />
      </div>

      {errorMsg && (
        <div className="p-3 rounded-card bg-status-red/10 border border-status-red/30 text-status-red text-caption flex items-center gap-2">
          <AlertCircle size={16} />
          <span>{errorMsg}</span>
        </div>
      )}

      {loading ? (
        <Card variant="surface" className="text-center py-12 text-caption text-dark-muted flex flex-col items-center justify-center gap-2">
          <RefreshCw size={24} className="animate-spin text-accent" />
          <span>Menghitung statistik performa...</span>
        </Card>
      ) : (
        <>
          {/* ===================== TAMPILAN STATISTIK PLAYER ===================== */}
          {role === 'player' && playerStats && (
            playerStats.totalTournaments === 0 ? (
              <Card variant="surface" className="my-2">
                <EmptyState
                  icon={BarChart3}
                  message="Belum ada statistik turnamen. Statistik akan dihitung otomatis setelah Anda menyelesaikan dan memfinalisasi turnamen."
                />
              </Card>
            ) : (
              <div className="flex flex-col gap-4">
                {/* 4 Kartu KPI Utama */}
                <div className="grid grid-cols-2 gap-2.5">
                  <Card variant="surface" className="p-3 flex flex-col">
                    <span className="text-[11px] font-mono text-dark-muted uppercase">
                      Total Turnamen
                    </span>
                    <span className="text-2xl font-bold font-mono text-dark-text mt-1">
                      {playerStats.totalTournaments}
                    </span>
                    <span className="text-[10px] text-dark-muted mt-0.5">
                      Telah diselesaikan
                    </span>
                  </Card>

                  <Card variant="surface" className="p-3 flex flex-col">
                    <span className="text-[11px] font-mono text-dark-muted uppercase">
                      Win Rate Match
                    </span>
                    <span className="text-2xl font-bold font-mono text-accent mt-1">
                      {playerStats.winRate}%
                    </span>
                    <span className="text-[10px] text-dark-muted mt-0.5 font-mono">
                      {playerStats.totalWins}M - {playerStats.totalLosses}K Match
                    </span>
                  </Card>

                  <Card variant="surface" className="p-3 flex flex-col col-span-2">
                    <div className="flex items-center justify-between">
                      <div className="min-w-0">
                        <span className="text-[11px] font-mono text-dark-muted uppercase block">
                          Deck Paling Sering Dipakai
                        </span>
                        <span className="text-body font-bold text-dark-text truncate block mt-0.5">
                          {playerStats.mostPlayedDeck}
                        </span>
                      </div>
                      {playerStats.mostPlayedColor !== '-' && (
                        <div className="text-right">
                          <span className="text-[10px] text-dark-muted uppercase block">
                            Warna Utama
                          </span>
                          <span className="text-caption font-semibold text-accent">
                            {playerStats.mostPlayedColor}
                          </span>
                        </div>
                      )}
                    </div>
                  </Card>
                </div>

                {/* Grafik Tren Peringkat di Layar HP */}
                {playerStats.rankTrend.length > 0 && (
                  <Card variant="surface-high" className="p-3.5 flex flex-col gap-2.5">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <TrendingUp size={16} className="text-accent" />
                        <h3 className="text-caption font-semibold text-dark-text">
                          Tren Peringkat Turnamen
                        </h3>
                      </div>
                      <span className="text-[10px] text-dark-muted font-mono">
                        Peringkat #{Math.min(...playerStats.rankTrend.map((t) => t.rank))} Terbaik
                      </span>
                    </div>

                    <div className="flex flex-col gap-2 pt-1">
                      {playerStats.rankTrend.slice(-6).map((item, idx) => {
                        const isRank1 = item.rank === 1;
                        const isTop3 = item.rank <= 3;
                        return (
                          <div key={idx} className="flex items-center gap-2 text-caption">
                            <span className="text-[11px] text-dark-muted font-mono w-16 truncate">
                              {item.date}
                            </span>
                            <div className="flex-1 bg-dark-bg h-5 rounded-full overflow-hidden flex items-center px-2 border border-dark-border/80">
                              <div
                                className={`h-2.5 rounded-full transition-all ${
                                  isRank1
                                    ? 'bg-amber-400'
                                    : isTop3
                                    ? 'bg-accent/80'
                                    : 'bg-dark-muted/60'
                                }`}
                                style={{
                                  width: `${Math.max(12, Math.min(100, 110 - item.rank * 15))}%`
                                }}
                              />
                            </div>
                            <span
                              className={`font-mono font-bold text-caption w-10 text-right ${
                                isRank1 ? 'text-amber-400' : isTop3 ? 'text-accent' : 'text-dark-muted'
                              }`}
                            >
                              #{item.rank}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </Card>
                )}

                {/* Win Rate per Deck */}
                {playerStats.deckStats.length > 0 && (
                  <Card variant="surface-high" className="p-3.5 flex flex-col gap-2.5">
                    <div className="flex items-center gap-2">
                      <Layers size={16} className="text-accent" />
                      <h3 className="text-caption font-semibold text-dark-text">
                        Performa Berdasarkan Deck
                      </h3>
                    </div>

                    <div className="flex flex-col gap-2 pt-1">
                      {playerStats.deckStats.map((d) => (
                        <div key={d.deckName} className="flex flex-col gap-1 p-2 rounded bg-dark-bg/40 border border-dark-border">
                          <div className="flex items-center justify-between text-caption">
                            <span className="font-semibold text-dark-text truncate">
                              {d.deckName}
                            </span>
                            <span className="font-mono font-bold text-accent">
                              {d.winRate}% WR
                            </span>
                          </div>
                          <div className="w-full bg-dark-surface h-2 rounded-full overflow-hidden">
                            <div
                              className="bg-accent h-full rounded-full"
                              style={{ width: `${d.winRate}%` }}
                            />
                          </div>
                          <div className="flex items-center justify-between text-[10px] text-dark-muted font-mono pt-0.5">
                            <span>{d.count}x Turnamen</span>
                            <span>{d.wins} Menang - {d.losses} Kalah</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </Card>
                )}

                {/* Win Rate per Warna Deck */}
                {playerStats.colorStats.length > 0 && (
                  <Card variant="surface-high" className="p-3.5 flex flex-col gap-2.5">
                    <div className="flex items-center gap-2">
                      <PieChart size={16} className="text-accent" />
                      <h3 className="text-caption font-semibold text-dark-text">
                        Win Rate per Warna Deck
                      </h3>
                    </div>

                    <div className="flex flex-col gap-2 pt-1">
                      {playerStats.colorStats.map((c) => (
                        <div key={c.color} className="flex items-center gap-2.5 text-caption">
                          <div className="w-20 flex items-center gap-1.5 flex-shrink-0">
                            <DeckColorDots colors={[c.color]} size="sm" />
                            <span className="text-[11px] font-medium text-dark-text truncate">{c.color}</span>
                          </div>
                          <div className="flex-1 bg-dark-bg h-3 rounded-full overflow-hidden">
                            <div
                              className="bg-accent h-full rounded-full transition-all"
                              style={{ width: `${c.winRate}%` }}
                            />
                          </div>
                          <span className="font-mono text-dark-text font-bold w-12 text-right">
                            {c.winRate}%
                          </span>
                        </div>
                      ))}
                    </div>
                  </Card>
                )}
              </div>
            )
          )}

          {/* ===================== TAMPILAN STATISTIK ORGANIZER ===================== */}
          {isOrganizer && organizerStats && (
            organizerStats.totalTournaments === 0 ? (
              <Card variant="surface" className="my-2">
                <EmptyState
                  icon={BarChart3}
                  message="Belum ada data turnamen yang selesai. Statistik turnamen akan muncul begitu ronde turnamen difinalisasi."
                />
              </Card>
            ) : (
              <div className="flex flex-col gap-4">
                {/* 4 Kartu KPI Organizer */}
                <div className="grid grid-cols-2 gap-2.5">
                  <Card variant="surface" className="p-3 flex flex-col">
                    <span className="text-[11px] font-mono text-dark-muted uppercase">
                      Turnamen Diadakan
                    </span>
                    <span className="text-2xl font-bold font-mono text-dark-text mt-1">
                      {organizerStats.totalTournaments}
                    </span>
                    <span className="text-[10px] text-dark-muted mt-0.5">
                      Total penyelenggaraan
                    </span>
                  </Card>

                  <Card variant="surface" className="p-3 flex flex-col">
                    <span className="text-[11px] font-mono text-dark-muted uppercase">
                      Rata-rata Peserta
                    </span>
                    <span className="text-2xl font-bold font-mono text-accent mt-1">
                      {organizerStats.averagePlayers}
                    </span>
                    <span className="text-[10px] text-dark-muted mt-0.5 font-mono">
                      {organizerStats.totalParticipants} total pemain
                    </span>
                  </Card>

                  <Card variant="surface" className="p-3 flex flex-col">
                    <span className="text-[11px] font-mono text-dark-muted uppercase">
                      Deck Terpopuler
                    </span>
                    <span className="text-caption font-bold text-dark-text mt-1 truncate">
                      {organizerStats.mostPopularDeck}
                    </span>
                    <span className="text-[10px] text-dark-muted mt-0.5">
                      Pilihan favorit pemain
                    </span>
                  </Card>

                  <Card variant="surface" className="p-3 flex flex-col">
                    <span className="text-[11px] font-mono text-dark-muted uppercase">
                      Warna Tertinggi WR
                    </span>
                    <span className="text-caption font-bold text-emerald-400 mt-1">
                      {organizerStats.highestWinRateColor}
                    </span>
                    <span className="text-[10px] text-dark-muted mt-0.5">
                      Efektivitas tertinggi
                    </span>
                  </Card>
                </div>

                {/* Distribusi Warna Deck di Turnamen Organizer */}
                {organizerStats.colorDistribution.length > 0 && (
                  <Card variant="surface-high" className="p-3.5 flex flex-col gap-2.5">
                    <div className="flex items-center gap-2">
                      <PieChart size={16} className="text-accent" />
                      <h3 className="text-caption font-semibold text-dark-text">
                        Distribusi Warna Deck Pemain
                      </h3>
                    </div>

                    <div className="flex flex-col gap-2 pt-1">
                      {organizerStats.colorDistribution.map((item) => (
                        <div key={item.color} className="flex items-center gap-2.5 text-caption">
                          <div className="w-20 flex items-center gap-1.5 flex-shrink-0">
                            <DeckColorDots colors={[item.color]} size="sm" />
                            <span className="text-[11px] font-medium text-dark-text truncate">{item.color}</span>
                          </div>
                          <div className="flex-1 bg-dark-bg h-3 rounded-full overflow-hidden">
                            <div
                              className="bg-accent h-full rounded-full transition-all"
                              style={{ width: `${item.percentage}%` }}
                            />
                          </div>
                          <span className="font-mono text-dark-text font-semibold w-14 text-right text-[11px]">
                            {item.count} ({item.percentage}%)
                          </span>
                        </div>
                      ))}
                    </div>
                  </Card>
                )}

                {/* Top Deck yang Dibawa Peserta */}
                {organizerStats.popularDecks.length > 0 && (
                  <Card variant="surface-high" className="p-3.5 flex flex-col gap-2.5">
                    <div className="flex items-center gap-2">
                      <Layers size={16} className="text-accent" />
                      <h3 className="text-caption font-semibold text-dark-text">
                        Deck Paling Populer di Turnamen Anda
                      </h3>
                    </div>

                    <div className="flex flex-col gap-2 pt-1">
                      {organizerStats.popularDecks.slice(0, 5).map((d, idx) => (
                        <div key={d.deckName} className="flex items-center justify-between p-2 rounded bg-dark-bg/40 border border-dark-border text-caption">
                          <div className="flex items-center gap-2 min-w-0">
                            <span className="font-mono font-bold text-accent text-[11px]">
                              #{idx + 1}
                            </span>
                            <span className="font-semibold text-dark-text truncate">
                              {d.deckName}
                            </span>
                          </div>
                          <span className="font-mono text-dark-muted text-[11px] flex-shrink-0">
                            {d.count} pemain ({d.percentage}%)
                          </span>
                        </div>
                      ))}
                    </div>
                  </Card>
                )}
              </div>
            )
          )}

          {/* ===================== TAMPILAN STATISTIK ADMIN ===================== */}
          {isAdmin && adminStats && (
            <div className="flex flex-col gap-4">
              {/* 4 Kartu KPI Admin */}
              <div className="grid grid-cols-2 gap-2.5">
                <Card variant="surface" className="p-3 flex flex-col">
                  <span className="text-[11px] font-mono text-dark-muted uppercase">
                    Total Pengguna
                  </span>
                  <span className="text-2xl font-bold font-mono text-dark-text mt-1">
                    {adminStats.totalUsers}
                  </span>
                  <span className="text-[10px] text-dark-muted mt-0.5">
                    Terdaftar di sistem
                  </span>
                </Card>

                <Card variant="surface" className="p-3 flex flex-col">
                  <span className="text-[11px] font-mono text-dark-muted uppercase">
                    Total Turnamen
                  </span>
                  <span className="text-2xl font-bold font-mono text-accent mt-1">
                    {adminStats.totalTournaments}
                  </span>
                  <span className="text-[10px] text-dark-muted mt-0.5 font-mono">
                    {adminStats.tournamentsByStatus.finished} Selesai • {adminStats.tournamentsByStatus.running} Berjalan
                  </span>
                </Card>

                <Card variant="surface" className="p-3 flex flex-col col-span-2">
                  <span className="text-[11px] font-mono text-dark-muted uppercase block">
                    Distribusi Peran Pengguna
                  </span>
                  <div className="grid grid-cols-3 gap-2 mt-2 pt-1 border-t border-dark-border/60 text-center">
                    <div>
                      <span className="text-[10px] text-dark-muted block">Player</span>
                      <span className="font-mono font-bold text-body text-dark-text">
                        {adminStats.usersByRole.player}
                      </span>
                    </div>
                    <div>
                      <span className="text-[10px] text-accent block">Organizer</span>
                      <span className="font-mono font-bold text-body text-accent">
                        {adminStats.usersByRole.organizer}
                      </span>
                    </div>
                    <div>
                      <span className="text-[10px] text-amber-400 block">Admin</span>
                      <span className="font-mono font-bold text-body text-amber-400">
                        {adminStats.usersByRole.admin}
                      </span>
                    </div>
                  </div>
                </Card>
              </div>

              {/* Meta Warna Deck Global */}
              {adminStats.colorDistributionGlobal.length > 0 && (
                <Card variant="surface-high" className="p-3.5 flex flex-col gap-2.5">
                  <div className="flex items-center gap-2">
                    <PieChart size={16} className="text-accent" />
                    <h3 className="text-caption font-semibold text-dark-text">
                      Meta Warna Deck Global (Bandai Digimon TCG)
                    </h3>
                  </div>

                  <div className="flex flex-col gap-2 pt-1">
                    {adminStats.colorDistributionGlobal.map((item) => (
                      <div key={item.color} className="flex items-center gap-2.5 text-caption">
                        <div className="w-20 flex items-center gap-1.5 flex-shrink-0">
                          <DeckColorDots colors={[item.color]} size="sm" />
                          <span className="text-[11px] font-medium text-dark-text truncate">{item.color}</span>
                        </div>
                        <div className="flex-1 bg-dark-bg h-3 rounded-full overflow-hidden">
                          <div
                            className="bg-accent h-full rounded-full transition-all"
                            style={{ width: `${item.percentage}%` }}
                          />
                        </div>
                        <span className="font-mono text-dark-text font-semibold w-14 text-right text-[11px]">
                          {item.percentage}%
                        </span>
                      </div>
                    ))}
                  </div>
                </Card>
              )}

              {/* Top Deck Global */}
              {adminStats.topDecksGlobal.length > 0 && (
                <Card variant="surface-high" className="p-3.5 flex flex-col gap-2.5">
                  <div className="flex items-center gap-2">
                    <Layers size={16} className="text-accent" />
                    <h3 className="text-caption font-semibold text-dark-text">
                      Meta Deck Paling Sering Digunakan
                    </h3>
                  </div>

                  <div className="flex flex-col gap-2 pt-1">
                    {adminStats.topDecksGlobal.map((d, idx) => (
                      <div key={d.deckName} className="flex items-center justify-between p-2 rounded bg-dark-bg/40 border border-dark-border text-caption">
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="font-mono font-bold text-accent text-[11px]">
                            #{idx + 1}
                          </span>
                          <span className="font-semibold text-dark-text truncate">
                            {d.deckName}
                          </span>
                        </div>
                        <span className="font-mono text-dark-muted text-[11px] flex-shrink-0">
                          {d.count} partisipasi
                        </span>
                      </div>
                    ))}
                  </div>
                </Card>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
};
