import React, { useState, useEffect, useMemo } from 'react';
import { Tournament, TournamentType } from '../../types';
import { useAuth } from '../../context/AuthContext';
import { Card } from '../../components/common/Card';
import { Button } from '../../components/common/Button';
import { StatusBadge } from '../../components/common/StatusBadge';
import { EmptyState } from '../../components/common/EmptyState';
import { BottomSheet } from '../../components/common/BottomSheet';
import { TournamentDetailModal } from '../tournaments/TournamentDetailModal';
import { TournamentFormSheet } from '../../components/tournaments/TournamentFormSheet';
import { LeagueSeasonBadge } from '../../components/tournaments/LeagueSeasonBadge';
import { TournamentTypeFilterBar } from '../../components/tournaments/TournamentTypeFilterBar';
import {
  getOrganizerTournaments,
  createTournament
} from '../../services/tournamentService';
import { TournamentFormValues } from '../../utils/tournamentEditLogic';
import {
  filterTournamentsByType,
  isLeagueTournament,
  TournamentTypeFilter
} from '../../utils/seasonLogic';
import { Trophy, Plus, Calendar, MapPin, RefreshCw, Swords, ChevronRight } from 'lucide-react';

interface OrganizerTournamentsViewProps {
  onNavigateToRounds?: (tournamentId: string) => void;
}

export const OrganizerTournamentsView: React.FC<OrganizerTournamentsViewProps> = ({
  onNavigateToRounds,
}) => {
  const { currentUser, userProfile } = useAuth();
  const [tournaments, setTournaments] = useState<Tournament[]>([]);
  const [loading, setLoading] = useState(true);
  const [typeFilter, setTypeFilter] = useState<TournamentTypeFilter>('all');

  // Pilihan Jenis Turnamen + Modal Buat Turnamen
  const [typeChoiceOpen, setTypeChoiceOpen] = useState(false);
  const [createTournamentType, setCreateTournamentType] = useState<TournamentType>('regular');
  const [createSheetOpen, setCreateSheetOpen] = useState(false);
  const [createLoading, setCreateLoading] = useState(false);
  const [createError, setCreateError] = useState('');

  // Selected tournament modal
  const [selectedTournament, setSelectedTournament] = useState<Tournament | null>(null);
  const [isDetailOpen, setIsDetailOpen] = useState(false);

  const fetchTournaments = async () => {
    if (!currentUser) return;
    setLoading(true);
    try {
      const list = await getOrganizerTournaments(currentUser.uid);
      setTournaments(list);
    } catch (err) {
      console.error('Gagal memuat turnamen organizer:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTournaments();
  }, [currentUser]);

  const filterCounts = useMemo(
    () => ({
      all: tournaments.length,
      league: tournaments.filter((t) => isLeagueTournament(t)).length,
      regular: tournaments.filter((t) => !isLeagueTournament(t)).length,
    }),
    [tournaments]
  );

  const filteredTournaments = useMemo(
    () => filterTournamentsByType(tournaments, typeFilter),
    [tournaments, typeFilter]
  );

  const handleOpenCreate = () => {
    setCreateError('');
    setTypeChoiceOpen(true);
  };

  const handleChooseTournamentType = (chosenType: TournamentType) => {
    setTypeChoiceOpen(false);
    setCreateTournamentType(chosenType);
    setCreateError('');
    setCreateSheetOpen(true);
  };

  const handleCreateSubmit = async (values: TournamentFormValues) => {
    if (!currentUser || !userProfile) return;

    setCreateLoading(true);
    setCreateError('');
    try {
      const created = await createTournament(
        values,
        { uid: currentUser.uid, name: userProfile.displayName || userProfile.username }
      );
      setCreateSheetOpen(false);
      await fetchTournaments();
      setSelectedTournament(created);
      setIsDetailOpen(true);
    } catch (err: any) {
      setCreateError(err.message || 'Gagal membuat turnamen.');
    } finally {
      setCreateLoading(false);
    }
  };

  const handleOpenDetail = (t: Tournament) => {
    setSelectedTournament(t);
    setIsDetailOpen(true);
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-section-title text-dark-text font-semibold">
            Turnamen Saya
          </h2>
          <p className="text-caption text-dark-muted">
            Kelola turnamen yang Anda selenggarakan
          </p>
        </div>
        <div className="flex items-center gap-1.5">
          <Button
            variant="primary"
            className="!min-h-[36px] !px-3 !text-caption"
            onClick={handleOpenCreate}
            icon={<Plus size={16} />}
          >
            Buat
          </Button>
          <Button
            variant="secondary"
            className="!min-h-[36px] !px-2.5 !text-caption"
            onClick={fetchTournaments}
            icon={<RefreshCw size={15} className={loading ? 'animate-spin' : ''} />}
          />
        </div>
      </div>

      {/* Tab/Filter Jenis Turnamen */}
      {tournaments.length > 0 && (
        <TournamentTypeFilterBar
          value={typeFilter}
          onChange={setTypeFilter}
          counts={filterCounts}
        />
      )}

      {/* Daftar Turnamen Organizer */}
      <div className="flex flex-col gap-2.5">
        {loading ? (
          <Card variant="surface" className="text-center py-8 text-caption text-dark-muted">
            Memuat turnamen Anda...
          </Card>
        ) : tournaments.length === 0 ? (
          <Card variant="surface" className="my-2">
            <EmptyState
              icon={Trophy}
              message="Anda belum menyelenggarakan turnamen apapun. Klik tombol di bawah untuk membuat turnamen baru."
              actionLabel="Buat Turnamen Baru"
              onAction={handleOpenCreate}
            />
          </Card>
        ) : filteredTournaments.length === 0 ? (
          <Card variant="surface" className="my-2">
            <EmptyState
              icon={Trophy}
              message={
                typeFilter === 'league'
                  ? 'Belum ada Turnamen Liga yang Anda selenggarakan.'
                  : 'Belum ada Turnamen Reguler yang Anda selenggarakan.'
              }
            />
          </Card>
        ) : (
          filteredTournaments.map((t) => (
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
                  <span className="text-caption font-mono text-dark-muted mt-0.5 block">
                    {isLeagueTournament(t)
                      ? 'Undangan Privat (Kode & QR di Detail)'
                      : `Kode: #${t.joinCode}`}
                  </span>
                </div>
                <StatusBadge
                  label={
                    t.status === 'registration'
                      ? 'Pendaftaran'
                      : t.status === 'running'
                      ? 'Sedang Berjalan'
                      : 'Selesai'
                  }
                  variant={
                    t.status === 'registration'
                      ? 'yellow'
                      : t.status === 'running'
                      ? 'green'
                      : 'neutral'
                  }
                />
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
                <div>
                  {t.totalRounds ? (
                    <span className="font-semibold text-accent">{t.totalRounds} Ronde</span>
                  ) : (
                    <span className="text-[11px] text-dark-muted">Belum Dimulai</span>
                  )}
                </div>
              </div>
            </Card>
          ))
        )}
      </div>

      {/* Bottom Sheet Pilihan Jenis Turnamen */}
      <BottomSheet
        isOpen={typeChoiceOpen}
        onClose={() => setTypeChoiceOpen(false)}
        title="Pilih Jenis Turnamen"
      >
        <div className="flex flex-col gap-2.5 py-1 pb-2">
          <button
            type="button"
            onClick={() => handleChooseTournamentType('league')}
            className="w-full text-left p-3.5 rounded-card bg-amber-500/10 border border-amber-400/40 hover:border-amber-400 transition-colors flex items-center justify-between gap-3"
          >
            <div className="flex items-start gap-3 min-w-0">
              <div className="w-10 h-10 rounded-btn bg-amber-500/20 border border-amber-400/40 flex items-center justify-center text-amber-300 flex-shrink-0">
                <Trophy size={20} />
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-body font-bold text-dark-text">
                    Turnamen Liga
                  </span>
                  <span className="text-[10px] font-mono font-bold px-1.5 py-0.2 rounded bg-amber-500/20 text-amber-300 border border-amber-400/40">
                    SEASON
                  </span>
                </div>
                <p className="text-caption text-dark-muted mt-0.5 leading-snug">
                  Berbasis Season (bulan & tahun). Format BO3 terkunci, min. 4 peserta, tanpa timer ronde, wajib Top Cut.
                </p>
              </div>
            </div>
            <ChevronRight size={18} className="text-amber-300 flex-shrink-0" />
          </button>

          <button
            type="button"
            onClick={() => handleChooseTournamentType('regular')}
            className="w-full text-left p-3.5 rounded-card bg-dark-surface-high border border-dark-border hover:border-accent/60 transition-colors flex items-center justify-between gap-3"
          >
            <div className="flex items-start gap-3 min-w-0">
              <div className="w-10 h-10 rounded-btn bg-accent/15 border border-accent/30 flex items-center justify-center text-accent flex-shrink-0">
                <Swords size={20} />
              </div>
              <div className="min-w-0">
                <span className="text-body font-bold text-dark-text block">
                  Turnamen Reguler
                </span>
                <p className="text-caption text-dark-muted mt-0.5 leading-snug">
                  Turnamen standar (BO1/BO3), min. 3 peserta, timer ronde aktif, Top Cut opsional.
                </p>
              </div>
            </div>
            <ChevronRight size={18} className="text-dark-muted flex-shrink-0" />
          </button>

          <Button
            variant="secondary"
            fullWidth
            type="button"
            className="mt-1"
            onClick={() => setTypeChoiceOpen(false)}
          >
            Batal
          </Button>
        </div>
      </BottomSheet>

      {/* Bottom Sheet Buat Turnamen Baru */}
      <TournamentFormSheet
        isOpen={createSheetOpen}
        mode="create"
        tournamentType={createTournamentType}
        organizerId={currentUser?.uid}
        existingTournaments={tournaments}
        isLoading={createLoading}
        errorMessage={createError}
        onClose={() => setCreateSheetOpen(false)}
        onSubmit={handleCreateSubmit}
      />

      {/* Modal Detail Turnamen */}
      <TournamentDetailModal
        tournament={selectedTournament}
        isOpen={isDetailOpen}
        onClose={() => {
          setIsDetailOpen(false);
          setSelectedTournament(null);
        }}
        onTournamentUpdated={fetchTournaments}
        onOpenRounds={onNavigateToRounds}
      />
    </div>
  );
};
