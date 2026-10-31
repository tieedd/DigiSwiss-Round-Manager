import React, { useState, useEffect } from 'react';
import { Tournament, TournamentFormat } from '../../types';
import { useAuth } from '../../context/AuthContext';
import { Card } from '../../components/common/Card';
import { Button } from '../../components/common/Button';
import { Input } from '../../components/common/Input';
import { StatusBadge } from '../../components/common/StatusBadge';
import { EmptyState } from '../../components/common/EmptyState';
import { BottomSheet } from '../../components/common/BottomSheet';
import { TournamentDetailModal } from '../tournaments/TournamentDetailModal';
import {
  getOrganizerTournaments,
  createTournament
} from '../../services/tournamentService';
import { Trophy, Plus, Calendar, MapPin, RefreshCw, Play, Timer } from 'lucide-react';

interface OrganizerTournamentsViewProps {
  onNavigateToRounds?: (tournamentId: string) => void;
}

export const OrganizerTournamentsView: React.FC<OrganizerTournamentsViewProps> = ({
  onNavigateToRounds,
}) => {
  const { currentUser, userProfile } = useAuth();
  const [tournaments, setTournaments] = useState<Tournament[]>([]);
  const [loading, setLoading] = useState(true);

  // Modal Buat Turnamen
  const [createSheetOpen, setCreateSheetOpen] = useState(false);
  const [name, setName] = useState('');
  const [date, setDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [location, setLocation] = useState('');
  const [format, setFormat] = useState<TournamentFormat>('BO3');
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

  const handleOpenCreate = () => {
    setName('');
    setDate(new Date().toISOString().split('T')[0]);
    setLocation('');
    setFormat('BO3');
    setCreateError('');
    setCreateSheetOpen(true);
  };

  const handleCreateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentUser || !userProfile) return;

    if (!name.trim()) {
      setCreateError('Nama turnamen wajib diisi.');
      return;
    }
    if (!date) {
      setCreateError('Tanggal turnamen wajib diisi.');
      return;
    }
    if (!location.trim()) {
      setCreateError('Lokasi turnamen wajib diisi.');
      return;
    }

    setCreateLoading(true);
    setCreateError('');
    try {
      const created = await createTournament(
        { name, date, location, format },
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
    <div className="flex flex-col gap-4 pb-20">
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
        ) : (
          tournaments.map((t) => (
            <Card
              key={t.id}
              variant="surface"
              className="cursor-pointer hover:border-accent/40 transition-colors flex flex-col gap-2"
              onClick={() => handleOpenDetail(t)}
            >
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-body font-semibold text-dark-text">{t.name}</span>
                    <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-accent/10 text-accent border border-accent/20">
                      {t.format}
                    </span>
                  </div>
                  <span className="text-caption font-mono text-dark-muted mt-0.5 block">
                    Kode: #{t.joinCode}
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

      {/* Bottom Sheet Buat Turnamen Baru */}
      <BottomSheet
        isOpen={createSheetOpen}
        onClose={() => setCreateSheetOpen(false)}
        title="Buat Turnamen Baru"
      >
        <form onSubmit={handleCreateSubmit} className="flex flex-col gap-3 py-1">
          <Input
            label="Nama Turnamen"
            placeholder="Contoh: Digimon Evolution Cup 2026"
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              if (createError) setCreateError('');
            }}
            disabled={createLoading}
            maxLength={50}
          />

          <Input
            label="Tanggal Turnamen"
            type="date"
            value={date}
            onChange={(e) => {
              setDate(e.target.value);
              if (createError) setCreateError('');
            }}
            disabled={createLoading}
          />

          <Input
            label="Lokasi Turnamen"
            placeholder="Contoh: Arcanum Game Store, Jakarta"
            value={location}
            onChange={(e) => {
              setLocation(e.target.value);
              if (createError) setCreateError('');
            }}
            disabled={createLoading}
            maxLength={60}
          />

          {/* Pemilihan Format (BO1 atau BO3 saja, TANPA input jumlah ronde) */}
          <div className="flex flex-col gap-1.5">
            <label className="text-caption font-medium text-dark-text">Format Pertandingan</label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setFormat('BO1')}
                className={`min-h-[44px] rounded-btn border text-caption font-medium transition-colors ${
                  format === 'BO1'
                    ? 'border-accent bg-accent/10 text-accent font-semibold'
                    : 'border-dark-border bg-dark-surface-high text-dark-muted hover:text-dark-text'
                }`}
              >
                Best of 1 (BO1 - 25 Menit)
              </button>
              <button
                type="button"
                onClick={() => setFormat('BO3')}
                className={`min-h-[44px] rounded-btn border text-caption font-medium transition-colors ${
                  format === 'BO3'
                    ? 'border-accent bg-accent/10 text-accent font-semibold'
                    : 'border-dark-border bg-dark-surface-high text-dark-muted hover:text-dark-text'
                }`}
              >
                Best of 3 (BO3 - 45 Menit)
              </button>
            </div>
            <p className="text-[11px] text-dark-muted mt-0.5">
              *Jumlah ronde akan ditentukan otomatis oleh sistem berdasarkan total peserta saat turnamen dimulai.
            </p>
          </div>

          {createError && (
            <p className="text-caption text-status-red text-center py-1">{createError}</p>
          )}

          <div className="flex flex-col gap-2 mt-2">
            <Button variant="primary" fullWidth type="submit" isLoading={createLoading}>
              Simpan & Buat Turnamen
            </Button>
            <Button
              variant="secondary"
              fullWidth
              type="button"
              onClick={() => setCreateSheetOpen(false)}
              disabled={createLoading}
            >
              Batal
            </Button>
          </div>
        </form>
      </BottomSheet>

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
