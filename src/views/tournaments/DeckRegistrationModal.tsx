import React, { useState, useEffect } from 'react';
import { Participation, DeckColor } from '../../types';
import { Button } from '../../components/common/Button';
import {
  OFFICIAL_DECK_COLORS,
  DECK_COLOR_STYLES,
  validateDeckSubmission
} from '../../utils/deckExportLogic';
import {
  getPlayerDeckHistory,
  PlayerDeckHistory,
  updateParticipationDeck
} from '../../services/participationService';
import {
  X,
  Layers,
  History,
  Check,
  AlertCircle
} from 'lucide-react';

interface DeckRegistrationModalProps {
  isOpen: boolean;
  onClose: () => void;
  participation: Participation | null;
  actorId: string;
  actorName: string;
  isOrganizer: boolean;
  onDeckUpdated: () => void;
}

export const DeckRegistrationModal: React.FC<DeckRegistrationModalProps> = ({
  isOpen,
  onClose,
  participation,
  actorId,
  actorName,
  isOrganizer,
  onDeckUpdated
}) => {
  const [deckName, setDeckName] = useState('');
  const [selectedColors, setSelectedColors] = useState<DeckColor[]>([]);
  const [deckHistory, setDeckHistory] = useState<PlayerDeckHistory[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Inisialisasi data dari participation
  useEffect(() => {
    if (participation) {
      setDeckName(participation.deckName || '');
      setSelectedColors((participation.deckColors as DeckColor[]) || []);
      setErrorMsg(null);

      // Ambil riwayat jika ada UID pemain
      if (participation.uid) {
        setLoadingHistory(true);
        getPlayerDeckHistory(participation.uid)
          .then((hist) => setDeckHistory(hist))
          .catch((err) => console.error('Gagal mengambil riwayat deck:', err))
          .finally(() => setLoadingHistory(false));
      } else {
        setDeckHistory([]);
      }
    }
  }, [participation]);

  if (!isOpen || !participation) return null;

  // Toggle pilihan warna deck (chip)
  const toggleColor = (color: DeckColor) => {
    setSelectedColors((prev) => {
      if (prev.includes(color)) {
        return prev.filter((c) => c !== color);
      } else {
        return [...prev, color];
      }
    });
  };

  // Pilih dari riwayat deck (otomatis mengisi nama dan warnanya)
  const handleSelectFromHistory = (item: PlayerDeckHistory) => {
    setDeckName(item.deckName);
    setSelectedColors([...item.deckColors]);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    const validation = validateDeckSubmission(deckName, selectedColors);
    if (!validation.valid) {
      setErrorMsg(validation.error || 'Data deck tidak valid.');
      return;
    }

    setSaving(true);
    try {
      await updateParticipationDeck(
        participation.id,
        deckName,
        selectedColors,
        actorId,
        actorName,
        participation.tournamentId
      );
      onDeckUpdated();
      onClose();
    } catch (err: any) {
      setErrorMsg(err.message || 'Gagal menyimpan data deck.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fade-in">
      <div className="w-full max-w-md bg-dark-surface border border-dark-border rounded-card shadow-2xl overflow-hidden flex flex-col">
        {/* Modal Header */}
        <div className="flex items-center justify-between p-4 border-b border-dark-border">
          <div className="flex items-center gap-2">
            <Layers className="text-accent" size={20} />
            <div>
              <h3 className="text-body font-semibold text-dark-text">
                {isOrganizer ? 'Kelola Deck Pemain' : 'Daftarkan Deck Anda'}
              </h3>
              <p className="text-caption text-dark-muted">
                Pemain: <strong className="text-dark-text">{participation.name}</strong> ({participation.tournamentName})
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-dark-muted hover:text-dark-text p-1 rounded-btn hover:bg-dark-surface-high transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        {/* Modal Body */}
        <form onSubmit={handleSubmit} className="p-4 flex flex-col gap-4">
          {errorMsg && (
            <div className="p-2.5 rounded bg-status-red/10 border border-status-red/30 text-status-red text-caption flex items-center gap-2">
              <AlertCircle size={15} className="flex-shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          {/* Riwayat Deck Sebelumnya (Jika ada) */}
          {deckHistory.length > 0 && (
            <div className="flex flex-col gap-1.5 p-2.5 rounded bg-dark-bg/60 border border-dark-border">
              <span className="text-[11px] font-medium text-dark-muted flex items-center gap-1.5">
                <History size={13} className="text-accent" />
                Pilih dari Riwayat Deck:
              </span>
              <div className="flex flex-wrap gap-1.5 mt-1 max-h-24 overflow-y-auto">
                {deckHistory.map((item, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => handleSelectFromHistory(item)}
                    className="text-[11px] px-2 py-1 rounded bg-dark-surface border border-dark-border hover:border-accent text-dark-text flex items-center gap-1.5 transition-colors"
                  >
                    <span>{item.deckName}</span>
                    <span className="text-[10px] text-accent font-mono">
                      ({item.deckColors.join('/')})
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Input Nama Deck */}
          <div className="flex flex-col gap-1.5">
            <label className="text-caption font-medium text-dark-muted">
              Nama Deck: <span className="text-status-red">*</span>
            </label>
            <input
              type="text"
              value={deckName}
              onChange={(e) => setDeckName(e.target.value)}
              placeholder="Contoh: Red Hybrid, MirageGaogamon, BloomHydra"
              maxLength={40}
              className="w-full bg-dark-bg border border-dark-border rounded-btn px-3 py-2 text-caption text-dark-text placeholder:text-dark-muted/60 focus:outline-none focus:border-accent"
            />
          </div>

          {/* Pemilihan Warna Deck (Chip Toggle) */}
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between">
              <label className="text-caption font-medium text-dark-muted">
                Warna Deck: <span className="text-status-red">*</span>
              </label>
              <span className="text-[11px] text-dark-muted">
                (Boleh lebih dari 1, minimal 1)
              </span>
            </div>

            <div className="flex flex-wrap gap-2 pt-1">
              {OFFICIAL_DECK_COLORS.map((color) => {
                const isSelected = selectedColors.includes(color);
                const style = DECK_COLOR_STYLES[color];

                return (
                  <button
                    key={color}
                    type="button"
                    onClick={() => toggleColor(color)}
                    className={`px-3 py-1.5 rounded-full text-caption font-medium flex items-center gap-1.5 border transition-all ${
                      isSelected
                        ? style.activeBg
                        : `${style.bg} ${style.text} ${style.border} hover:opacity-80`
                    }`}
                  >
                    {isSelected && <Check size={13} className="stroke-[2.5]" />}
                    <span>{color}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Tombol Aksi */}
          <div className="flex items-center justify-end gap-2 pt-3 border-t border-dark-border mt-1">
            <Button
              type="button"
              variant="secondary"
              onClick={onClose}
              disabled={saving}
              className="!min-h-[38px] !px-4"
            >
              Batal
            </Button>
            <Button
              type="submit"
              variant="primary"
              isLoading={saving}
              className="!min-h-[38px] !px-4"
            >
              Simpan Deck
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
};
