import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Participation, DeckColor } from '../../types';
import { Button } from '../../components/common/Button';
import {
  useVisibleViewportHeight,
  scrollFocusedInputIntoView,
} from '../../utils/useVisibleViewportHeight';
import { useBackLayer } from '../../utils/backStack';
import {
  OFFICIAL_DECK_COLORS,
  DECK_COLOR_STYLES,
  DECK_COLOR_HEX,
  DECK_COLOR_ACTIVE_TEXT,
  formatDeckColorsEmoji,
  validateDeckSubmission
} from '../../utils/deckExportLogic';
import { DeckColorDots } from '../../components/common/DeckColorDots';
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
  AlertCircle,
  CheckCircle2
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
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const isModalVisible = isOpen && Boolean(participation);
  const { maxHeightCss } = useVisibleViewportHeight(isModalVisible);

  useBackLayer(
    isModalVisible,
    () => {
      if (!saving) onClose();
    },
    { blocked: saving }
  );

  useEffect(() => {
    if (!isModalVisible || typeof document === 'undefined') return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [isModalVisible]);

  // Inisialisasi data dari participation
  useEffect(() => {
    if (participation) {
      setDeckName(participation.deckName || '');
      setSelectedColors((participation.deckColors as DeckColor[]) || []);
      setErrorMsg(null);
      setSuccessMsg(null);

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
    setSuccessMsg(null);
  };

  // Pilih dari riwayat deck (otomatis mengisi nama dan warnanya, tetap dapat diedit)
  const handleSelectFromHistory = (item: PlayerDeckHistory) => {
    setDeckName(item.deckName);
    setSelectedColors([...item.deckColors]);
    setSuccessMsg(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setSuccessMsg(null);

    // Pemain manual tanpa UID hanya boleh diisi organizer
    if (!isOrganizer && !participation.uid) {
      setErrorMsg('Deck untuk pemain manual hanya dapat diisi atau diubah oleh organizer.');
      return;
    }

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
      // Perbarui kartu Klasemen Akhir lewat callback tanpa menutup modal
      onDeckUpdated();
      setSuccessMsg('Deck berhasil disimpan.');
    } catch (err: any) {
      const code = err?.code || '';
      const msg = err?.message || '';
      if (
        code === 'permission-denied' ||
        msg.includes('permission-denied') ||
        msg.includes('insufficient permissions')
      ) {
        setErrorMsg('Deck tidak dapat disimpan. Hubungi organizer.');
      } else {
        setErrorMsg(msg || 'Gagal menyimpan data deck.');
      }
    } finally {
      setSaving(false);
    }
  };

  const formId = 'deck-registration-form';

  const modalContent = (
    <div
      className="fixed inset-0 z-[70] flex flex-col items-center justify-end px-4 bg-black/80 backdrop-blur-sm animate-fade-in"
      style={{
        paddingTop: 'calc(env(safe-area-inset-top, 0px) + 8px)',
        paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 12px)',
      }}
    >
      <div
        className="w-full max-w-md bg-dark-surface border border-dark-border rounded-card shadow-2xl overflow-hidden flex flex-col"
        style={{ maxHeight: maxHeightCss }}
      >
        {/* Modal Header */}
        <div className="shrink-0 flex items-center justify-between p-4 border-b border-dark-border">
          <div className="flex items-center gap-2 min-w-0">
            <Layers className="text-accent flex-shrink-0" size={20} />
            <div className="min-w-0">
              <h3 className="text-body font-semibold text-dark-text truncate">
                {isOrganizer ? 'Kelola Deck Pemain' : 'Daftarkan Deck Anda'}
              </h3>
              <p className="text-caption text-dark-muted truncate">
                Pemain: <strong className="text-dark-text">{participation.name}</strong> ({participation.tournamentName})
              </p>
            </div>
          </div>
          <button
            type="button"
            disabled={saving}
            onClick={() => {
              if (!saving) onClose();
            }}
            className="text-dark-muted hover:text-dark-text p-1 rounded-btn hover:bg-dark-surface-high transition-colors disabled:opacity-50"
            aria-label="Tutup"
          >
            <X size={18} />
          </button>
        </div>

        {/* Modal Body */}
        <form
          id={formId}
          onSubmit={handleSubmit}
          className="flex-1 min-h-0 overflow-y-auto overscroll-contain p-4 flex flex-col gap-4"
        >
          {errorMsg && (
            <div className="p-2.5 rounded bg-status-red/10 border border-status-red/30 text-status-red text-caption flex items-center gap-2">
              <AlertCircle size={15} className="flex-shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          {successMsg && (
            <div className="p-2.5 rounded bg-status-green/10 border border-status-green/30 text-status-green text-caption flex items-center gap-2">
              <CheckCircle2 size={15} className="flex-shrink-0" />
              <span>{successMsg}</span>
            </div>
          )}

          {/* Dropdown Riwayat Deck Sebelumnya (Jika ada) */}
          {deckHistory.length > 0 && (
            <div className="flex flex-col gap-1.5 p-2.5 rounded bg-dark-bg/60 border border-dark-border">
              <span className="text-[11px] font-medium text-dark-muted flex items-center gap-1.5">
                <History size={13} className="text-accent" />
                Pilih dari Riwayat Deck:
              </span>

              <select
                defaultValue=""
                onFocus={(e) => scrollFocusedInputIntoView(e.currentTarget)}
                onChange={(e) => {
                  const val = e.target.value;
                  if (val) {
                    const item = deckHistory.find((d) => d.deckName === val);
                    if (item) handleSelectFromHistory(item);
                  }
                }}
                className="w-full bg-dark-surface border border-dark-border rounded-btn px-2.5 py-1.5 text-caption text-dark-text focus:outline-none focus:border-accent"
              >
                <option value="" disabled>-- Pilih Deck yang Pernah Digunakan --</option>
                {deckHistory.map((item, idx) => {
                  const emojis = formatDeckColorsEmoji(item.deckColors);
                  return (
                    <option key={idx} value={item.deckName}>
                      {item.deckName} {emojis ? `${emojis} ` : ''}&bull; {item.tournamentName}
                    </option>
                  );
                })}
              </select>

              {/* Chip pilihan cepat */}
              <div className="flex flex-wrap gap-1.5 mt-1 max-h-20 overflow-y-auto">
                {deckHistory.map((item, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => handleSelectFromHistory(item)}
                    className="text-[11px] px-2 py-1 rounded bg-dark-surface border border-dark-border hover:border-accent text-dark-text flex items-center gap-1.5 transition-colors"
                  >
                    <span>{item.deckName}</span>
                    <DeckColorDots colors={item.deckColors} size="sm" />
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
              required
              maxLength={40}
              value={deckName}
              onFocus={(e) => scrollFocusedInputIntoView(e.currentTarget)}
              onChange={(e) => {
                setDeckName(e.target.value);
                setSuccessMsg(null);
              }}
              placeholder="Contoh: WarGreymon OTK, MirageGaogamon"
              className="w-full bg-dark-bg border border-dark-border rounded-btn px-3 py-2 text-body text-dark-text placeholder:text-dark-muted/60 focus:outline-none focus:border-accent"
            />
            <span className="text-[11px] text-dark-muted">
              {deckName.length} / 40 karakter
            </span>
          </div>

          {/* Pemilihan Warna Deck (Chip Toggle) */}
          <div className="flex flex-col gap-1.5">
            <label className="text-caption font-medium text-dark-muted">
              Warna Deck: <span className="text-status-red">*</span> (Boleh lebih dari 1)
            </label>
            <div className="flex flex-wrap gap-2 pt-1">
              {OFFICIAL_DECK_COLORS.map((color) => {
                const isSelected = selectedColors.includes(color);
                const style = DECK_COLOR_STYLES[color];
                const hex = DECK_COLOR_HEX[color];
                const activeTextColor = DECK_COLOR_ACTIVE_TEXT[color];

                return (
                  <button
                    key={color}
                    type="button"
                    onClick={() => toggleColor(color)}
                    style={
                      isSelected
                        ? {
                            backgroundColor: hex,
                            color: activeTextColor,
                            borderColor: 'var(--c-dot-outline, rgba(232, 237, 243, 0.65))'
                          }
                        : undefined
                    }
                    className={`px-3 py-1.5 rounded-full text-caption font-medium flex items-center gap-1.5 border transition-all ${
                      isSelected
                        ? style.activeBg
                        : `${style.bg} ${style.text} ${style.border} hover:border-accent/60`
                    }`}
                  >
                    <span
                      className="w-3.5 h-3.5 rounded-full flex-shrink-0"
                      style={{
                        backgroundColor: hex,
                        boxShadow: 'inset 0 0 0 1.5px var(--c-dot-outline, rgba(232, 237, 243, 0.65))'
                      }}
                    />
                    <span>{color}</span>
                    {isSelected && <Check size={13} className="stroke-[2.5]" />}
                  </button>
                );
              })}
            </div>
          </div>
        </form>

        {/* Tombol Aksi (selalu terlihat di luar area scroll) */}
        <div className="shrink-0 flex items-center justify-end gap-2 p-4 pt-3 border-t border-dark-border bg-dark-surface">
          <Button
            type="button"
            variant="secondary"
            onClick={onClose}
            disabled={saving}
            className="!min-h-[38px] !px-4"
          >
            {successMsg ? 'Tutup' : 'Batal'}
          </Button>
          <Button
            type="submit"
            form={formId}
            variant="primary"
            isLoading={saving}
            className="!min-h-[38px] !px-4"
          >
            Simpan Deck
          </Button>
        </div>
      </div>
    </div>
  );

  if (typeof document !== 'undefined' && document.body) {
    return createPortal(modalContent, document.body);
  }
  return modalContent;
};
