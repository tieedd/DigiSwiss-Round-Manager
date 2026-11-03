import React, { useState, useEffect, useMemo } from 'react';
import { useAuth } from '../context/AuthContext';
import { Tournament, Participation, DeckColor } from '../types';
import { Card } from '../components/common/Card';
import { Button } from '../components/common/Button';
import { StatusBadge } from '../components/common/StatusBadge';
import { EmptyState } from '../components/common/EmptyState';
import {
  getAllTournaments,
  getOrganizerTournaments
} from '../services/tournamentService';
import { collection, query, where, getDocs, orderBy, limit } from 'firebase/firestore';
import { db } from '../firebaseConfig';
import { PlayerMatchDetailsModal } from './history/PlayerMatchDetailsModal';
import { TournamentDetailModal } from './tournaments/TournamentDetailModal';
import { DeckRegistrationModal } from './tournaments/DeckRegistrationModal';
import { DeckColorDots } from '../components/common/DeckColorDots';
import { countUnfilledDecks } from '../utils/finalStandingsLogic';
import {
  History,
  Search,
  Calendar,
  Trophy,
  Swords,
  Layers,
  ChevronLeft,
  ChevronRight,
  RefreshCw,
  Eye,
  AlertCircle,
  Edit2
} from 'lucide-react';

const PAGE_SIZE = 6;

export const HistoryView: React.FC = () => {
  const { currentUser, userProfile } = useAuth();
  const role = userProfile?.role || 'player';
  const isOrganizer = role === 'organizer';
  const isAdmin = role === 'admin';

  // Data states
  const [participations, setParticipations] = useState<Participation[]>([]);
  const [tournaments, setTournaments] = useState<Tournament[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Filter & Search
  const [searchQuery, setSearchQuery] = useState('');
  const [dateFilter, setDateFilter] = useState('');
  const [currentPage, setCurrentPage] = useState(1);

  // Modals
  const [selectedParticipation, setSelectedParticipation] = useState<Participation | null>(null);
  const [detailModalOpen, setDetailModalOpen] = useState(false);
  const [selectedTournament, setSelectedTournament] = useState<Tournament | null>(null);
  const [tournamentModalOpen, setTournamentModalOpen] = useState(false);

  // Deck Registration Modal untuk Player
  const [deckModalOpen, setDeckModalOpen] = useState(false);
  const [deckTargetParticipation, setDeckTargetParticipation] = useState<Participation | null>(null);

  // Peta Juara 1 untuk Organizer/Admin
  const [championsMap, setChampionsMap] = useState<Record<string, { name: string; deckName?: string }>>({});

  const fetchData = async () => {
    if (!currentUser) return;
    setLoading(true);
    setErrorMsg(null);
    try {
      if (isAdmin) {
        // Admin: Seluruh turnamen di sistem
        const all = await getAllTournaments();
        setTournaments(all);
      } else if (isOrganizer) {
        // Organizer: Turnamen yang ia selenggarakan
        const orgTourneys = await getOrganizerTournaments(currentUser.uid);
        setTournaments(orgTourneys);
      } else {
        // Player: Partisipasi miliknya (query terindeks: uid + createdAt desc, limit 30)
        const partsCol = collection(db, 'participations');
        const q = query(
          partsCol,
          where('uid', '==', currentUser.uid),
          orderBy('createdAt', 'desc'),
          limit(30)
        );
        const snap = await getDocs(q);
        const list = snap.docs.map((d) => d.data() as Participation);
        setParticipations(list);
      }
    } catch (err: any) {
      console.error('Gagal mengambil riwayat:', err);
      setErrorMsg(err.message || 'Gagal memuat data riwayat.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [currentUser?.uid, role]);

  // Daftar turnamen di mana player belum mengisi deck
  const unfilledDecksList = useMemo(() => {
    if (role !== 'player' || !currentUser) return [];
    return participations.filter(
      (p) => p.uid === currentUser.uid && (!p.deckName || p.deckName.trim() === '')
    );
  }, [participations, currentUser?.uid, role]);

  // Filter & Paginasi untuk Player
  const filteredParticipations = useMemo(() => {
    return participations.filter((p) => {
      const matchSearch =
        searchQuery === '' ||
        p.tournamentName.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (p.deckName && p.deckName.toLowerCase().includes(searchQuery.toLowerCase()));

      const matchDate = dateFilter === '' || p.date.includes(dateFilter);

      return matchSearch && matchDate;
    });
  }, [participations, searchQuery, dateFilter]);

  // Filter & Paginasi untuk Organizer & Admin
  const filteredTournaments = useMemo(() => {
    return tournaments.filter((t) => {
      const matchSearch =
        searchQuery === '' ||
        t.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        t.joinCode.toLowerCase().includes(searchQuery.toLowerCase()) ||
        t.location.toLowerCase().includes(searchQuery.toLowerCase());

      const matchDate = dateFilter === '' || t.date.includes(dateFilter);

      return matchSearch && matchDate;
    });
  }, [tournaments, searchQuery, dateFilter]);

  // Reset ke halaman 1 jika filter berubah
  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, dateFilter]);

  const totalItems = role === 'player' ? filteredParticipations.length : filteredTournaments.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / PAGE_SIZE));

  const paginatedParticipations = useMemo(() => {
    const start = (currentPage - 1) * PAGE_SIZE;
    return filteredParticipations.slice(start, start + PAGE_SIZE);
  }, [filteredParticipations, currentPage]);

  const paginatedTournaments = useMemo(() => {
    const start = (currentPage - 1) * PAGE_SIZE;
    return filteredTournaments.slice(start, start + PAGE_SIZE);
  }, [filteredTournaments, currentPage]);

  // Ambil Juara 1 untuk turnamen finished pada halaman aktif organizer/admin
  useEffect(() => {
    if (!isAdmin && !isOrganizer) return;
    const finishedWithoutChamp = paginatedTournaments.filter(
      (t) => t.status === 'finished' && !championsMap[t.id]
    );
    if (finishedWithoutChamp.length === 0) return;

    finishedWithoutChamp.forEach(async (t) => {
      try {
        const q = query(
          collection(db, 'participations'),
          where('tournamentId', '==', t.id),
          orderBy('rank', 'asc'),
          limit(1)
        );
        const snap = await getDocs(q);
        if (!snap.empty) {
          const first = snap.docs[0].data() as Participation;
          setChampionsMap((prev) => ({
            ...prev,
            [t.id]: {
              name: first.name,
              deckName: first.deckName
            }
          }));
        }
      } catch (err) {
        // Gagal diam-diam
      }
    });
  }, [paginatedTournaments, isAdmin, isOrganizer, championsMap]);

  const handleOpenPlayerMatchDetails = (p: Participation) => {
    setSelectedParticipation(p);
    setDetailModalOpen(true);
  };

  const handleOpenTournamentDetails = (t: Tournament) => {
    setSelectedTournament(t);
    setTournamentModalOpen(true);
  };

  const handleOpenDeckModal = (p: Participation) => {
    setDeckTargetParticipation(p);
    setDeckModalOpen(true);
  };

  return (
    <div className="flex flex-col gap-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-section-title text-dark-text font-semibold flex items-center gap-2">
            <History className="text-accent" size={20} />
            Riwayat {isAdmin ? 'Semua Turnamen' : isOrganizer ? 'Turnamen Diselenggarakan' : 'Turnamen Saya'}
          </h2>
          <p className="text-caption text-dark-muted">
            {isAdmin
              ? 'Seluruh catatan turnamen sistem DigiSwiss-Round'
              : isOrganizer
              ? 'Arsip turnamen yang pernah Anda selenggarakan'
              : 'Peringkat akhir, skor, deck, dan riwayat ronde pertandingan'}
          </p>
        </div>
        <Button
          variant="secondary"
          className="!min-h-[36px] !px-2.5 !text-caption"
          onClick={fetchData}
          icon={<RefreshCw size={15} className={loading ? 'animate-spin' : ''} />}
          title="Segarkan"
        />
      </div>

      {/* Kartu "Deck belum diisi (N)" untuk Player */}
      {role === 'player' && unfilledDecksList.length > 0 && (
        <Card variant="surface" className="border-l-4 border-l-status-yellow p-3.5 flex flex-col gap-2.5 animate-fade-in">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Layers size={17} className="text-status-yellow flex-shrink-0" />
              <span className="text-body font-semibold text-dark-text">
                Deck belum diisi ({unfilledDecksList.length})
              </span>
            </div>
            <span className="text-[10px] font-mono font-semibold text-status-yellow bg-status-yellow/10 px-2 py-0.5 rounded border border-status-yellow/20">
              Perlu Dilengkapi
            </span>
          </div>

          <div className="flex flex-col gap-2 pt-0.5">
            {unfilledDecksList.map((p) => (
              <div
                key={p.id}
                className="p-2.5 rounded-btn bg-dark-bg/60 border border-dark-border flex items-center justify-between gap-2 text-caption"
              >
                <div className="min-w-0 flex-1">
                  <span className="font-semibold text-dark-text block truncate">
                    {p.tournamentName}
                  </span>
                  <div className="flex items-center gap-2 text-[11px] text-dark-muted">
                    <span>{p.date}</span>
                    <span>&bull;</span>
                    <span className="font-mono text-accent">Peringkat #{p.rank}</span>
                  </div>
                </div>

                <Button
                  variant="primary"
                  className="!min-h-[30px] !px-3 !text-[11px] flex-shrink-0"
                  onClick={() => handleOpenDeckModal(p)}
                >
                  Isi Deck
                </Button>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Filter & Pencarian */}
      <Card variant="surface" className="p-3 flex flex-col gap-2.5">
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-dark-muted" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={role === 'player' ? 'Cari nama turnamen atau deck...' : 'Cari nama turnamen atau kode...'}
              className="w-full bg-dark-bg border border-dark-border rounded-btn pl-9 pr-3 py-2 text-caption text-dark-text placeholder:text-dark-muted/60 focus:outline-none focus:border-accent"
            />
          </div>

          <div className="relative w-36">
            <input
              type="date"
              value={dateFilter}
              onChange={(e) => setDateFilter(e.target.value)}
              className="w-full bg-dark-bg border border-dark-border rounded-btn px-2.5 py-2 text-caption text-dark-text focus:outline-none focus:border-accent"
              title="Filter Tanggal"
            />
          </div>

          {(searchQuery || dateFilter) && (
            <button
              type="button"
              onClick={() => {
                setSearchQuery('');
                setDateFilter('');
              }}
              className="text-[11px] text-accent hover:underline px-1 py-1 whitespace-nowrap"
            >
              Reset
            </button>
          )}
        </div>
      </Card>

      {/* Error Banner */}
      {errorMsg && (
        <div className="p-3 rounded-card bg-status-red/10 border border-status-red/30 text-status-red text-caption flex items-center gap-2">
          <AlertCircle size={16} />
          <span>{errorMsg}</span>
        </div>
      )}

      {/* Loading State */}
      {loading ? (
        <Card variant="surface" className="text-center py-10 text-caption text-dark-muted flex flex-col items-center justify-center gap-2">
          <RefreshCw size={22} className="animate-spin text-accent" />
          <span>Memuat riwayat data...</span>
        </Card>
      ) : totalItems === 0 ? (
        <Card variant="surface" className="my-2">
          <EmptyState
            icon={History}
            message={
              searchQuery || dateFilter
                ? 'Tidak ada riwayat yang cocok dengan kata kunci pencarian atau tanggal yang dipilih.'
                : role === 'player'
                ? 'Belum ada riwayat turnamen yang Anda ikuti. Gabung turnamen di tab Turnamen.'
                : 'Belum ada riwayat turnamen yang tercatat.'
            }
          />
        </Card>
      ) : (
        <div className="flex flex-col gap-2.5">
          {/* List untuk Player */}
          {role === 'player' &&
            paginatedParticipations.map((p) => {
              const isTop3 = p.rank <= 3;
              const isOwnDoc = p.uid === currentUser?.uid;

              return (
                <Card
                  key={p.id}
                  variant="surface"
                  className={`p-3.5 transition-colors cursor-pointer hover:border-accent/40 ${
                    isTop3 ? 'border-l-4 border-l-accent' : ''
                  }`}
                  onClick={() => handleOpenPlayerMatchDetails(p)}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-3 min-w-0">
                      <div
                        className={`w-8 h-8 rounded-full flex items-center justify-center font-mono font-bold text-caption flex-shrink-0 ${
                          p.rank === 1
                            ? 'bg-accent text-dark-bg'
                            : p.rank === 2
                            ? 'bg-accent/80 text-dark-bg'
                            : p.rank === 3
                            ? 'bg-accent/60 text-dark-bg'
                            : 'bg-dark-surface-high text-dark-muted border border-dark-border'
                        }`}
                      >
                        {p.rank}
                      </div>

                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="text-body font-semibold text-dark-text truncate">
                            {p.tournamentName}
                          </span>
                          <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-accent/10 text-accent border border-accent/20">
                            {p.format}
                          </span>
                        </div>
                        <span className="text-caption text-dark-muted flex items-center gap-1.5 mt-0.5">
                          <Calendar size={12} />
                          <span>{p.date}</span>
                        </span>
                      </div>
                    </div>

                    <div className="text-right flex flex-col items-end">
                      <span className="font-mono text-body font-bold text-accent">
                        {p.points} Pts
                      </span>
                      <span className="text-[11px] font-mono text-dark-muted">
                        {p.wins}M - {p.losses}K
                      </span>
                    </div>
                  </div>

                  {/* Deck Info & Tombol Aksi */}
                  <div className="flex items-center justify-between gap-2 mt-2 pt-2 border-t border-dark-border/60 text-caption">
                    <div className="flex items-center gap-1.5 min-w-0 flex-1">
                      <Layers size={13} className="text-accent flex-shrink-0" />
                      {p.deckName ? (
                        <>
                          <span className="text-dark-text font-medium truncate" title={p.deckName}>
                            {p.deckName}
                          </span>
                          <DeckColorDots colors={p.deckColors} size="sm" />
                          {isOwnDoc && (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleOpenDeckModal(p);
                              }}
                              className="text-[10px] text-accent hover:underline flex items-center gap-0.5 ml-1"
                              title="Ubah Deck"
                            >
                              <Edit2 size={11} />
                              <span>Ubah</span>
                            </button>
                          )}
                        </>
                      ) : (
                        <div className="flex items-center gap-1.5">
                          <span className="text-dark-muted italic">Deck belum diisi</span>
                          {isOwnDoc && (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleOpenDeckModal(p);
                              }}
                              className="text-[10px] text-accent font-semibold hover:underline flex items-center gap-0.5 ml-1"
                            >
                              <Edit2 size={11} />
                              <span>Isi</span>
                            </button>
                          )}
                        </div>
                      )}
                    </div>

                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleOpenPlayerMatchDetails(p);
                      }}
                      className="text-[11px] text-accent font-medium hover:underline flex items-center gap-1 whitespace-nowrap ml-2"
                    >
                      <Eye size={12} />
                      <span>Ronde Match</span>
                    </button>
                  </div>
                </Card>
              );
            })}

          {/* List untuk Organizer & Admin */}
          {(isOrganizer || isAdmin) &&
            paginatedTournaments.map((t) => (
              <Card
                key={t.id}
                variant="surface"
                className="p-3.5 transition-colors cursor-pointer hover:border-accent/40"
                onClick={() => handleOpenTournamentDetails(t)}
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-body font-semibold text-dark-text">
                        {t.name}
                      </span>
                      <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-accent/10 text-accent border border-accent/20">
                        {t.format}
                      </span>
                      <span className="text-[10px] font-mono text-dark-muted">
                        #{t.joinCode}
                      </span>
                    </div>
                    <span className="text-caption text-dark-muted flex items-center gap-1.5 mt-0.5">
                      <Calendar size={12} />
                      <span>{t.date}</span>
                      <span>•</span>
                      <span>{t.location}</span>
                    </span>
                  </div>

                  <StatusBadge
                    label={
                      t.status === 'running'
                        ? 'Berjalan'
                        : t.status === 'finished'
                        ? 'Selesai'
                        : 'Pendaftaran'
                    }
                    variant={
                      t.status === 'running'
                        ? 'green'
                        : t.status === 'finished'
                        ? 'neutral'
                        : 'yellow'
                    }
                  />
                </div>

                {/* Juara 1 jika turnamen finished */}
                {t.status === 'finished' && championsMap[t.id] && (
                  <div className="flex items-center gap-1.5 mt-2 text-[11px] text-accent/90 bg-accent/5 px-2 py-1 rounded border border-accent/20">
                    <Trophy size={13} className="text-accent flex-shrink-0" />
                    <span className="truncate">
                      Juara 1: <strong className="text-accent">{championsMap[t.id].name}</strong>
                      {championsMap[t.id].deckName ? ` (${championsMap[t.id].deckName})` : ''}
                    </span>
                  </div>
                )}

                <div className="flex items-center justify-between gap-2 mt-2 pt-2 border-t border-dark-border/60 text-caption">
                  <span className="text-dark-muted">
                    Total: <strong className="text-dark-text">{t.totalRounds || '-'} Ronde</strong>
                    {t.organizerName ? ` • Oleh: ${t.organizerName}` : ''}
                  </span>

                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleOpenTournamentDetails(t);
                    }}
                    className="text-[11px] text-accent font-medium hover:underline flex items-center gap-1 whitespace-nowrap"
                  >
                    <Eye size={12} />
                    <span>Lihat Detail</span>
                  </button>
                </div>
              </Card>
            ))}

          {/* Navigasi Paginasi */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between pt-2 px-1 text-caption text-dark-muted">
              <span>
                Menampilkan {(currentPage - 1) * PAGE_SIZE + 1} -{' '}
                {Math.min(currentPage * PAGE_SIZE, totalItems)} dari {totalItems} data
              </span>

              <div className="flex items-center gap-1.5">
                <Button
                  variant="secondary"
                  className="!min-h-[32px] !px-2.5 !text-[11px]"
                  disabled={currentPage <= 1}
                  onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                  icon={<ChevronLeft size={14} />}
                >
                  Sebelumnya
                </Button>
                <span className="font-mono text-dark-text px-1">
                  {currentPage} / {totalPages}
                </span>
                <Button
                  variant="secondary"
                  className="!min-h-[32px] !px-2.5 !text-[11px]"
                  disabled={currentPage >= totalPages}
                  onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                  icon={<ChevronRight size={14} />}
                >
                  Berikutnya
                </Button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Modal Detail Pertandingan Ronde Pemain */}
      <PlayerMatchDetailsModal
        isOpen={detailModalOpen}
        onClose={() => {
          setDetailModalOpen(false);
          setSelectedParticipation(null);
        }}
        participation={selectedParticipation}
        onDeckChanged={fetchData}
      />

      {/* Modal Detail Turnamen untuk Organizer / Admin */}
      <TournamentDetailModal
        tournament={selectedTournament}
        isOpen={tournamentModalOpen}
        onClose={() => {
          setTournamentModalOpen(false);
          setSelectedTournament(null);
        }}
        onTournamentUpdated={fetchData}
        onTournamentDeleted={fetchData}
      />

      {/* Modal Pendaftaran / Ubah Deck untuk Player */}
      <DeckRegistrationModal
        isOpen={deckModalOpen}
        onClose={() => {
          setDeckModalOpen(false);
          setDeckTargetParticipation(null);
        }}
        participation={deckTargetParticipation}
        actorId={currentUser?.uid || ''}
        actorName={userProfile?.displayName || userProfile?.username || 'Player'}
        isOrganizer={isOrganizer || isAdmin}
        onDeckUpdated={() => {
          fetchData();
        }}
      />
    </div>
  );
};
