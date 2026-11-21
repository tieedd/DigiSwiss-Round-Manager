import React, { useState, useEffect } from 'react';
import { Tournament } from '../types';
import { useAuth } from '../context/AuthContext';
import { Card } from '../components/common/Card';
import { Button } from '../components/common/Button';
import { Input } from '../components/common/Input';
import { StatusBadge } from '../components/common/StatusBadge';
import { EmptyState } from '../components/common/EmptyState';
import { BottomSheet } from '../components/common/BottomSheet';
import { TournamentDetailModal } from './tournaments/TournamentDetailModal';
import { LeagueDeckModal } from './tournaments/LeagueDeckModal';
import { LeagueSeasonBadge } from '../components/tournaments/LeagueSeasonBadge';
import { TournamentTypeFilterBar } from '../components/tournaments/TournamentTypeFilterBar';
import { LeagueInviteJoinSheet } from '../components/tournaments/LeagueInviteJoinSheet';
import { getRegistrationTournaments, getAllTournaments } from '../services/tournamentService';
import {
  filterTournamentsByType,
  isLeagueTournament,
  TournamentTypeFilter
} from '../utils/seasonLogic';
import { Swords, Search, KeyRound, Calendar, MapPin, RefreshCw, Ticket, Award } from 'lucide-react';
import { LeagueCumulativeView } from './LeagueCumulativeView';

export const TournamentsView: React.FC = () => {
  const { currentUser, userProfile } = useAuth();
  const isAdmin = userProfile?.role === 'admin';
  const [tournaments, setTournaments] = useState<Tournament[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState<TournamentTypeFilter>('all');

  // Selected tournament modal
  const [selectedTournament, setSelectedTournament] = useState<Tournament | null>(null);
  const [isDetailOpen, setIsDetailOpen] = useState(false);

  // Join Code Modal (Reguler 6-digit)
  const [isJoinCodeOpen, setIsJoinCodeOpen] = useState(false);
  const [joinCodeInput, setJoinCodeInput] = useState('');
  const [joinCodeError, setJoinCodeError] = useState('');

  // League Invite Join Sheet & Post-Join 2-Deck Prompt
  const [isLeagueInviteOpen, setIsLeagueInviteOpen] = useState(false);
  const [postJoinDeckTournament, setPostJoinDeckTournament] = useState<Tournament | null>(null);
  const [isLeagueCumulativeOpen, setIsLeagueCumulativeOpen] = useState(false);

  const fetchTournaments = async () => {
    setLoading(true);
    try {
      if (isAdmin) {
        const list = await getAllTournaments();
        if (searchQuery.trim()) {
          const q = searchQuery.trim().toLowerCase();
          setTournaments(list.filter((t) =>
            (t.name && t.name.toLowerCase().includes(q)) ||
            (!isLeagueTournament(t) && t.joinCode && t.joinCode.toLowerCase() === q)
          ));
        } else {
          setTournaments(list);
        }
      } else {
        const list = await getRegistrationTournaments(searchQuery);
        setTournaments(list);
      }
    } catch (err) {
      console.error('Gagal memuat turnamen:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTournaments();
  }, [searchQuery, isAdmin]);

  const handleOpenDetail = (t: Tournament) => {
    setSelectedTournament(t);
    setIsDetailOpen(true);
  };

  const handleJoinByCode = (e: React.FormEvent) => {
    e.preventDefault();
    const clean = joinCodeInput.trim().toUpperCase();
    if (!clean) {
      setJoinCodeError('Masukkan kode turnamen.');
      return;
    }

    const found = tournaments.find(
      (t) => !isLeagueTournament(t) && t.joinCode.toUpperCase() === clean
    );
    if (found) {
      setIsJoinCodeOpen(false);
      setJoinCodeInput('');
      setJoinCodeError('');
      handleOpenDetail(found);
    } else {
      setJoinCodeError(
        `Turnamen reguler dengan kode "${clean}" tidak ditemukan. Untuk Turnamen Liga, gunakan tombol "Masukkan Kode Undangan".`
      );
    }
  };

  const handleLeagueInviteRegistered = (joinedTournament: Tournament) => {
    setIsLeagueInviteOpen(false);
    fetchTournaments();
    setPostJoinDeckTournament(joinedTournament);
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <h2 className="text-section-title text-dark-text font-semibold">
            Turnamen Tersedia
          </h2>
          <p className="text-caption text-dark-muted">
            Pendaftaran turnamen Swiss Round Digimon TCG
          </p>
        </div>
        <div className="flex items-center gap-1.5 flex-shrink-0">
          <Button
            variant="secondary"
            className="!min-h-[36px] !px-2.5 !text-caption"
            onClick={() => setIsLeagueCumulativeOpen(true)}
            icon={<Award size={15} className="text-amber-400" />}
            title="Poin Liga Lintas Season"
          >
            Poin Liga
          </Button>
          <Button
            variant="secondary"
            className="!min-h-[36px] !px-2.5 !text-caption"
            onClick={() => setIsJoinCodeOpen(true)}
            icon={<KeyRound size={15} />}
          >
            Kode
          </Button>
          <Button
            variant="secondary"
            className="!min-h-[36px] !px-2.5 !text-caption"
            onClick={fetchTournaments}
            icon={<RefreshCw size={15} className={loading ? 'animate-spin' : ''} />}
          />
        </div>
      </div>

      {/* Kartu Pendaftaran Turnamen Liga via Kode Undangan */}
      <Card
        variant="surface"
        className="flex items-center justify-between gap-3 border-amber-400/30 bg-amber-500/5"
      >
        <div className="min-w-0">
          <div className="flex items-center gap-1.5">
            <span className="text-[10px] font-mono font-bold px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-400/40">
              LIGA
            </span>
            <span className="text-body font-semibold text-dark-text truncate">
              Punya Undangan Liga?
            </span>
          </div>
          <p className="text-[11px] text-dark-muted mt-0.5">
            Daftar ke Turnamen Liga dengan kode undangan 8 karakter atau teks QR.
          </p>
        </div>
        <Button
          variant="primary"
          className="!min-h-[36px] !px-3 !text-caption flex-shrink-0"
          onClick={() => setIsLeagueInviteOpen(true)}
          icon={<Ticket size={15} />}
        >
          Masukkan Kode Undangan
        </Button>
      </Card>

      {/* Pencarian Turnamen */}
      <Input
        placeholder="Cari nama atau 6-digit kode turnamen reguler..."
        value={searchQuery}
        onChange={(e) => setSearchQuery(e.target.value)}
        leftIcon={<Search size={18} />}
      />

      {/* Filter Jenis Turnamen */}
      {tournaments.length > 0 && (
        <TournamentTypeFilterBar
          value={typeFilter}
          onChange={setTypeFilter}
          counts={{
            all: tournaments.length,
            league: tournaments.filter((t) => isLeagueTournament(t)).length,
            regular: tournaments.filter((t) => !isLeagueTournament(t)).length,
          }}
        />
      )}

      {/* Daftar Turnamen */}
      <div className="flex flex-col gap-2.5">
        {loading ? (
          <Card variant="surface" className="text-center py-8 text-caption text-dark-muted">
            Memuat daftar turnamen...
          </Card>
        ) : tournaments.length === 0 ? (
          <Card variant="surface" className="my-1">
            <EmptyState
              icon={Swords}
              message="Belum ada turnamen berstatus pendaftaran saat ini."
            />
          </Card>
        ) : filterTournamentsByType(tournaments, typeFilter).length === 0 ? (
          <Card variant="surface" className="my-1">
            <EmptyState
              icon={Swords}
              message={
                typeFilter === 'league'
                  ? 'Belum ada Turnamen Liga yang sedang membuka pendaftaran.'
                  : 'Belum ada Turnamen Reguler yang sedang membuka pendaftaran.'
              }
            />
          </Card>
        ) : (
          filterTournamentsByType(tournaments, typeFilter).map((t) => {
            const isLeague = isLeagueTournament(t);
            return (
              <Card
                key={t.id}
                variant="surface"
                className="cursor-pointer hover:border-accent/40 transition-colors flex flex-col gap-2"
                onClick={() => handleOpenDetail(t)}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-body font-semibold text-dark-text">{t.name}</span>
                      <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-accent/10 text-accent border border-accent/20">
                        {t.format}
                      </span>
                    </div>
                    <LeagueSeasonBadge tournament={t} compact className="mt-1" />
                    <p className="text-caption text-dark-muted mt-0.5">
                      Oleh: <strong className="text-dark-text">{t.organizerName}</strong>
                    </p>
                  </div>
                  <StatusBadge label="Pendaftaran" variant="yellow" />
                </div>

                <div className="pt-2 border-t border-dark-border flex items-center justify-between text-caption text-dark-muted">
                  <div className="flex items-center gap-1.5">
                    <Calendar size={13} />
                    <span>{t.date}</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <MapPin size={13} />
                    <span className="truncate max-w-[140px]">{t.location}</span>
                  </div>
                  {isLeague ? (
                    <span className="font-mono text-amber-300 text-[11px] font-semibold bg-amber-500/10 px-1.5 py-0.5 rounded border border-amber-400/30">
                      Khusus Undangan
                    </span>
                  ) : (
                    <span className="font-mono text-accent text-[11px] font-semibold bg-dark-surface-high px-1.5 py-0.5 rounded border border-dark-border">
                      #{t.joinCode}
                    </span>
                  )}
                </div>
              </Card>
            );
          })
        )}
      </div>

      {/* Modal Gabung Lewat Kode Reguler */}
      <BottomSheet
        isOpen={isJoinCodeOpen}
        onClose={() => {
          setIsJoinCodeOpen(false);
          setJoinCodeError('');
        }}
        title="Cari Berdasarkan Kode Turnamen"
      >
        <form onSubmit={handleJoinByCode} className="flex flex-col gap-3 py-1">
          <Input
            label="Kode Unik Turnamen Reguler (6 Karakter)"
            placeholder="Contoh: X8K9P2"
            value={joinCodeInput}
            onChange={(e) => {
              setJoinCodeInput(e.target.value.toUpperCase());
              if (joinCodeError) setJoinCodeError('');
            }}
            error={joinCodeError}
            maxLength={6}
            autoCapitalize="characters"
          />
          <div className="flex flex-col gap-2 mt-2">
            <Button variant="primary" fullWidth type="submit">
              Cari & Buka Turnamen
            </Button>
            <Button
              variant="secondary"
              fullWidth
              type="button"
              onClick={() => setIsJoinCodeOpen(false)}
            >
              Batal
            </Button>
          </div>
        </form>
      </BottomSheet>

      {/* Sheet Gabung Turnamen Liga via Kode Undangan */}
      <LeagueInviteJoinSheet
        isOpen={isLeagueInviteOpen}
        onClose={() => setIsLeagueInviteOpen(false)}
        currentUser={
          currentUser
            ? {
                uid: currentUser.uid,
                name: userProfile?.displayName || userProfile?.username || 'Pemain',
              }
            : null
        }
        onRegistered={handleLeagueInviteRegistered}
      />

      {/* Prompt Pengisian 2 Deck Liga Sesaat Setelah Berhasil Daftar */}
      {postJoinDeckTournament && currentUser && (
        <LeagueDeckModal
          isOpen={Boolean(postJoinDeckTournament)}
          onClose={() => {
            const target = postJoinDeckTournament;
            setPostJoinDeckTournament(null);
            handleOpenDetail(target);
          }}
          tournamentId={postJoinDeckTournament.id}
          tournamentName={postJoinDeckTournament.name}
          playerId={currentUser.uid}
          playerName={userProfile?.displayName || userProfile?.username || 'Pemain'}
          playerUid={currentUser.uid}
          isOrganizerMode={false}
          actor={{
            uid: currentUser.uid,
            name: userProfile?.displayName || userProfile?.username || 'Pemain',
          }}
          allowSkip={true}
          onSaved={() => {
            fetchTournaments();
          }}
        />
      )}

      {/* Modal Detail Turnamen */}
      <TournamentDetailModal
        tournament={selectedTournament}
        isOpen={isDetailOpen}
        onClose={() => {
          setIsDetailOpen(false);
          setSelectedTournament(null);
        }}
        onTournamentUpdated={fetchTournaments}
      />

      {/* BottomSheet Poin Liga Lintas Season */}
      <BottomSheet
        isOpen={isLeagueCumulativeOpen}
        onClose={() => setIsLeagueCumulativeOpen(false)}
        title="Poin Liga Lintas Season"
      >
        <div className="py-1">
          <LeagueCumulativeView compact />
        </div>
      </BottomSheet>
    </div>
  );
};
