import React, { useState, useEffect, useMemo } from 'react';
import { BottomSheet } from '../../components/common/BottomSheet';
import { Button } from '../../components/common/Button';
import { Input } from '../../components/common/Input';
import { Card } from '../../components/common/Card';
import { Tournament, TournamentPlayer } from '../../types';
import {
  HistoryPlayerCandidate,
  aggregateHistoryPlayers,
  markAlreadyRegisteredPlayers,
  filterCandidatesByName
} from '../../utils/playerHistoryImportLogic';
import {
  fetchOrganizerPastParticipations,
  addPlayersFromHistory
} from '../../services/tournamentService';
import { Search, UserCheck, Users, AlertCircle, History, Check } from 'lucide-react';

interface AddFromHistoryModalProps {
  isOpen: boolean;
  onClose: () => void;
  tournament: Tournament;
  currentPlayers: TournamentPlayer[];
  organizerId: string;
  actor: { uid: string; name: string };
  onSuccess: (count: number) => void;
}

export const AddFromHistoryModal: React.FC<AddFromHistoryModalProps> = ({
  isOpen,
  onClose,
  tournament,
  currentPlayers,
  organizerId,
  actor,
  onSuccess
}) => {
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [candidates, setCandidates] = useState<HistoryPlayerCandidate[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // Muat riwayat pemain ketika modal dibuka
  useEffect(() => {
    if (!isOpen) {
      setSearchQuery('');
      setSelectedIds(new Set());
      setErrorMessage('');
      return;
    }

    const loadHistory = async () => {
      setLoading(true);
      setErrorMessage('');
      try {
        const parts = await fetchOrganizerPastParticipations(organizerId);
        const aggregated = aggregateHistoryPlayers(parts);
        const marked = markAlreadyRegisteredPlayers(aggregated, currentPlayers);
        setCandidates(marked);
      } catch (err: any) {
        console.error('Gagal memuat histori pemain:', err);
        setErrorMessage(err.message || 'Gagal memuat data histori pemain.');
      } finally {
        setLoading(false);
      }
    };

    loadHistory();
  }, [isOpen, organizerId, currentPlayers]);

  // Kandidat yang difilter berdasarkan pencarian
  const filteredCandidates = useMemo(() => {
    return filterCandidatesByName(candidates, searchQuery);
  }, [candidates, searchQuery]);

  // Daftar yang bisa dipilih (belum terdaftar di turnamen ini)
  const selectableCandidates = useMemo(() => {
    return filteredCandidates.filter((c) => !c.isAlreadyRegistered);
  }, [filteredCandidates]);

  const handleToggleSelect = (candidate: HistoryPlayerCandidate) => {
    if (candidate.isAlreadyRegistered) return;

    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(candidate.id)) {
        next.delete(candidate.id);
      } else {
        next.add(candidate.id);
      }
      return next;
    });
  };

  const handleSelectAll = () => {
    if (selectedIds.size === selectableCandidates.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(selectableCandidates.map((c) => c.id)));
    }
  };

  const handleSubmit = async () => {
    const toAdd = candidates.filter((c) => selectedIds.has(c.id) && !c.isAlreadyRegistered);
    if (toAdd.length === 0) return;

    setSaving(true);
    setErrorMessage('');
    try {
      const addedCount = await addPlayersFromHistory(
        tournament.id,
        tournament.name,
        toAdd,
        actor
      );
      onSuccess(addedCount);
      onClose();
    } catch (err: any) {
      console.error('Gagal menambahkan pemain dari histori:', err);
      setErrorMessage(err.message || 'Gagal menambahkan pemain terpilih.');
    } finally {
      setSaving(false);
    }
  };

  const selectedCount = selectedIds.size;
  const isAllSelectableChosen =
    selectableCandidates.length > 0 && selectedIds.size === selectableCandidates.length;

  return (
    <BottomSheet isOpen={isOpen} onClose={onClose} title="Tambah Peserta dari Histori">
      <div className="flex flex-col gap-3 py-2 pb-6 max-h-[75vh]">
        <p className="text-caption text-dark-muted px-1">
          Pilih pemain yang pernah mengikuti turnamen Anda sebelumnya untuk langsung didaftarkan ke turnamen ini.
        </p>

        {/* Kolom Pencarian */}
        <Input
          placeholder="Cari nama pemain..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          leftIcon={<Search size={16} />}
        />

        {/* Ringkasan & Tombol Pilih Semua */}
        <div className="flex items-center justify-between px-1 text-caption">
          <span className="text-dark-muted">
            {filteredCandidates.length} pemain ditemukan • <strong className="text-accent">{selectedCount}</strong> terpilih
          </span>
          {selectableCandidates.length > 0 && (
            <button
              type="button"
              onClick={handleSelectAll}
              className="text-accent hover:underline font-semibold"
            >
              {isAllSelectableChosen ? 'Batal Pilih Semua' : 'Pilih Semua'}
            </button>
          )}
        </div>

        {errorMessage && (
          <div className="p-2.5 rounded-btn bg-status-red/10 border border-status-red/30 text-caption text-status-red flex items-start gap-2">
            <AlertCircle size={16} className="flex-shrink-0 mt-0.5" />
            <span>{errorMessage}</span>
          </div>
        )}

        {/* Daftar Kandidat Pemain */}
        <div className="flex flex-col gap-2 overflow-y-auto pr-1 min-h-[160px] max-h-[340px]">
          {loading ? (
            <div className="text-center py-10 text-caption text-dark-muted flex flex-col items-center gap-2">
              <History size={24} className="animate-spin text-accent" />
              <span>Memuat data histori pemain...</span>
            </div>
          ) : filteredCandidates.length === 0 ? (
            <Card variant="surface" className="text-center py-8 text-caption text-dark-muted">
              {searchQuery.trim()
                ? `Tidak ada pemain histori yang cocok dengan "${searchQuery}".`
                : 'Belum ada riwayat pemain dari turnamen Anda sebelumnya.'}
            </Card>
          ) : (
            filteredCandidates.map((candidate) => {
              const isSelected = selectedIds.has(candidate.id);
              const isRegistered = candidate.isAlreadyRegistered;

              return (
                <div
                  key={candidate.id}
                  onClick={() => handleToggleSelect(candidate)}
                  className={`p-3 rounded-btn border transition-all flex items-center justify-between gap-3 ${
                    isRegistered
                      ? 'bg-dark-surface/50 border-dark-border/40 opacity-60 cursor-not-allowed'
                      : isSelected
                      ? 'bg-accent/10 border-accent cursor-pointer'
                      : 'bg-dark-surface border-dark-border hover:border-dark-muted/60 cursor-pointer'
                  }`}
                >
                  {/* Bagian Kiri: Checkbox & Info Nama */}
                  <div className="flex items-center gap-3 min-w-0">
                    <div
                      className={`w-5 h-5 rounded border flex items-center justify-center flex-shrink-0 transition-colors ${
                        isRegistered
                          ? 'border-dark-border bg-dark-surface-high text-transparent'
                          : isSelected
                          ? 'border-accent bg-accent text-[#0B0F14]'
                          : 'border-dark-border bg-dark-bg'
                      }`}
                    >
                      {isSelected && <Check size={14} className="stroke-[3]" />}
                    </div>

                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-body font-semibold text-dark-text truncate">
                          {candidate.name}
                        </span>
                        <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-dark-surface-high text-dark-muted border border-dark-border">
                          {candidate.isManual ? 'Manual' : 'Akun'}
                        </span>
                        {isRegistered && (
                          <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-status-yellow/20 text-status-yellow border border-status-yellow/30 font-semibold">
                            Sudah terdaftar
                          </span>
                        )}
                      </div>

                      <span className="text-[11px] text-dark-muted font-mono block mt-0.5">
                        {candidate.tournamentsCount} turnamen diikuti • Terakhir: {candidate.lastTournamentDate || '-'}
                      </span>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Tombol Aksi Bawah */}
        <div className="flex gap-2.5 pt-2 border-t border-dark-border">
          <Button
            variant="secondary"
            fullWidth
            onClick={onClose}
            disabled={saving}
          >
            Batal
          </Button>
          <Button
            variant="primary"
            fullWidth
            onClick={handleSubmit}
            isLoading={saving}
            disabled={selectedCount === 0 || saving}
            icon={<UserCheck size={16} />}
          >
            {selectedCount > 0 ? `Tambah Terpilih (${selectedCount})` : 'Pilih Pemain'}
          </Button>
        </div>
      </div>
    </BottomSheet>
  );
};
