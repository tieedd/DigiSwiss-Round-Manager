import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import {
  DeckColor,
  LeagueDeckEntry,
  LeaguePlayerDecks,
} from '../../types';
import { Button } from '../../components/common/Button';
import { DeckColorDots } from '../../components/common/DeckColorDots';
import {
  useVisibleViewportHeight,
  scrollFocusedInputIntoView,
} from '../../utils/useVisibleViewportHeight';
import {
  OFFICIAL_DECK_COLORS,
  DECK_COLOR_STYLES,
  DECK_COLOR_HEX,
  formatDeckColorsEmoji,
} from '../../utils/deckExportLogic';
import {
  MAX_LEAGUE_DECK_NAME_LENGTH,
  validateLeagueDecksSubmission,
} from '../../utils/leagueDeckLogic';
import {
  getPlayerDeckHistory,
  PlayerDeckHistory,
} from '../../services/participationService';
import {
  saveParticipantLeagueDecksByOrganizer,
  savePlayerOwnLeagueDecks,
} from '../../services/leagueDeckService';
import { useToast } from '../../context/ToastContext';
import {
  X,
  Layers,
  History,
  Check,
  AlertCircle,
} from 'lucide-react';

interface LeagueDeckModalProps {
  isOpen: boolean;
  onClose: () => void;
  tournamentId: string;
  tournamentName: string;
  playerId: string;
  playerName: string;
  playerUid: string | null;
  initialDecks?: [LeagueDeckEntry, LeagueDeckEntry] | null;
  isOrganizerMode: boolean;
  actor: { uid: string; name: string };
  allowSkip?: boolean;
  onSaved: (saved: LeaguePlayerDecks) => void;
}

export const LeagueDeckModal: React.FC<LeagueDeckModalProps> = ({
  isOpen,
  onClose,
  tournamentId,
  tournamentName,
  playerId,
  playerName,
  playerUid,
  initialDecks,
  isOrganizerMode,
  actor,
  allowSkip = false,
  onSaved,
}) => {
  const { success: showToastSuccess } = useToast();

  const [deck1Name, setDeck1Name] = useState('');
  const [deck1Colors, setDeck1Colors] = useState<DeckColor[]>([]);
  const [deck2Name, setDeck2Name] = useState('');
  const [deck2Colors, setDeck2Colors] = useState<DeckColor[]>([]);

  const [deckHistory, setDeckHistory] = useState<PlayerDeckHistory[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const { maxHeightCss } = useVisibleViewportHeight(isOpen);

  useEffect(() => {
    if (!isOpen || typeof document === 'undefined') return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;

    setDeck1Name(initialDecks?.[0]?.name || '');
    setDeck1Colors((initialDecks?.[0]?.colors as DeckColor[]) || []);
    setDeck2Name(initialDecks?.[1]?.name || '');
    setDeck2Colors((initialDecks?.[1]?.colors as DeckColor[]) || []);
    setErrorMsg(null);
    setSaving(false);

    if (playerUid) {
      setLoadingHistory(true);
      getPlayerDeckHistory(playerUid)
        .then((hist) => setDeckHistory(hist))
        .catch((err) => console.error('Gagal mengambil riwayat deck:', err))
        .finally(() => setLoadingHistory(false));
    } else {
      setDeckHistory([]);
    }
  }, [isOpen, playerId, playerUid, initialDecks]);

  if (!isOpen) return null;

  const toggleColor = (slot: 1 | 2, color: DeckColor) => {
    const updater = (prev: DeckColor[]) =>
      prev.includes(color) ? prev.filter((c) => c !== color) : [...prev, color];
    if (slot === 1) {
      setDeck1Colors(updater);
    } else {
      setDeck2Colors(updater);
    }
    if (errorMsg) setErrorMsg(null);
  };

  const handleSelectFromHistory = (slot: 1 | 2, item: PlayerDeckHistory) => {
    if (slot === 1) {
      setDeck1Name(item.deckName);
      setDeck1Colors([...item.deckColors]);
    } else {
      setDeck2Name(item.deckName);
      setDeck2Colors([...item.deckColors]);
    }
    if (errorMsg) setErrorMsg(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (saving) return;
    setErrorMsg(null);

    const deck1: LeagueDeckEntry = {
      name: deck1Name,
      colors: deck1Colors,
    };
    const deck2: LeagueDeckEntry = {
      name: deck2Name,
      colors: deck2Colors,
    };

    const validation = validateLeagueDecksSubmission(deck1, deck2);
    if (!validation.valid) {
      setErrorMsg(validation.error || 'Data 2 deck liga tidak valid.');
      return;
    }

    setSaving(true);
    try {
      const saved = isOrganizerMode
        ? await saveParticipantLeagueDecksByOrganizer(
            tournamentId,
            { id: playerId, name: playerName },
            deck1,
            deck2,
            actor
          )
        : await savePlayerOwnLeagueDecks(tournamentId, playerId, deck1, deck2);

      showToastSuccess('2 Deck Liga berhasil disimpan.');
      onSaved(saved);
      onClose();
    } catch (err: any) {
      console.error('Gagal menyimpan 2 deck liga:', err);
      const code = err?.code || '';
      const msg = err?.message || '';
      if (
        code === 'permission-denied' ||
        msg.includes('permission-denied') ||
        msg.includes('insufficient permissions')
      ) {
        setErrorMsg(
          'Deck tidak dapat disimpan karena pendaftaran sudah terkunci. Hubungi organizer.'
        );
      } else {
        setErrorMsg(msg || 'Gagal menyimpan data 2 deck.');
      }
    } finally {
      setSaving(false);
    }
  };

  const renderDeckSection = (
    slot: 1 | 2,
    nameVal: string,
    setNameVal: (v: string) => void,
    colorsVal: DeckColor[]
  ) => (
    <div className="p-3 rounded-card bg-dark-bg/50 border border-dark-border flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <span className="text-body font-semibold text-amber-300">
          Deck {slot}
        </span>
        {colorsVal.length > 0 && <DeckColorDots colors={colorsVal} size="sm" />}
      </div>

      {/* Dropdown Riwayat Deck */}
      {!loadingHistory && deckHistory.length > 0 && (
        <div className="flex flex-col gap-1.5">
          <span className="text-[11px] font-medium text-dark-muted flex items-center gap-1.5">
            <History size={12} className="text-accent" />
            Pilih dari Riwayat Deck:
          </span>
          <select
            defaultValue=""
            disabled={saving}
            onFocus={(e) => scrollFocusedInputIntoView(e.currentTarget)}
            onChange={(e) => {
              const val = e.target.value;
              if (val) {
                const item = deckHistory.find((d) => d.deckName === val);
                if (item) handleSelectFromHistory(slot, item);
              }
            }}
            className="w-full bg-dark-surface border border-dark-border rounded-btn px-2.5 py-1.5 text-caption text-dark-text focus:outline-none focus:border-accent"
          >
            <option value="" disabled>
              -- Pilih Deck yang Pernah Digunakan --
            </option>
            {deckHistory.map((item, idx) => {
              const emojis = formatDeckColorsEmoji(item.deckColors);
              return (
                <option key={idx} value={item.deckName}>
                  {item.deckName} {emojis ? `${emojis} ` : ''}• {item.tournamentName}
                </option>
              );
            })}
          </select>
        </div>
      )}

      {/* Input Nama Deck */}
      <div className="flex flex-col gap-1">
        <label className="text-caption font-medium text-dark-muted">
          Nama Deck {slot}: <span className="text-status-red">*</span>
        </label>
        <input
          type="text"
          maxLength={MAX_LEAGUE_DECK_NAME_LENGTH}
          value={nameVal}
          disabled={saving}
          onFocus={(e) => scrollFocusedInputIntoView(e.currentTarget)}
          onChange={(e) => {
            setNameVal(e.target.value);
            if (errorMsg) setErrorMsg(null);
          }}
          placeholder={
            slot === 1
              ? 'Contoh: WarGreymon OTK'
              : 'Contoh: MirageGaogamon Burst'
          }
          className="w-full bg-dark-surface border border-dark-border rounded-btn px-3 py-2 text-body text-dark-text placeholder:text-dark-muted/60 focus:outline-none focus:border-accent"
        />
        <span className="text-[11px] text-dark-muted">
          {nameVal.length} / {MAX_LEAGUE_DECK_NAME_LENGTH} karakter
        </span>
      </div>

      {/* Pilihan Warna Deck */}
      <div className="flex flex-col gap-1.5">
        <label className="text-caption font-medium text-dark-muted">
          Warna Deck {slot}: <span className="text-status-red">*</span>
        </label>
        <div className="flex flex-wrap gap-1.5">
          {OFFICIAL_DECK_COLORS.map((color) => {
            const isSelected = colorsVal.includes(color);
            const style = DECK_COLOR_STYLES[color];
            const hex = DECK_COLOR_HEX[color];

            return (
              <button
                key={color}
                type="button"
                disabled={saving}
                onClick={() => toggleColor(slot, color)}
                className={`px-2.5 py-1 rounded-full text-[11px] font-medium flex items-center gap-1.5 border transition-all ${
                  isSelected
                    ? style.activeBg
                    : `${style.bg} ${style.text} ${style.border} hover:opacity-80`
                }`}
              >
                <span
                  className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                  style={{
                    backgroundColor: hex,
                    boxShadow:
                      color === 'Hitam'
                        ? '0 0 0 1px #94A3B8'
                        : color === 'Putih'
                        ? '0 0 0 1px #CBD5E1'
                        : undefined,
                  }}
                />
                <span>{color}</span>
                {isSelected && <Check size={12} className="stroke-[2.5]" />}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );

  const formId = 'league-deck-form';

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
        {/* Modal Header (tetap di atas) */}
        <div className="shrink-0 flex items-center justify-between p-4 border-b border-dark-border">
          <div className="flex items-center gap-2 min-w-0">
            <Layers className="text-amber-300 flex-shrink-0" size={20} />
            <div className="min-w-0">
              <h3 className="text-body font-semibold text-dark-text truncate">
                {isOrganizerMode
                  ? 'Kelola 2 Deck Liga Peserta'
                  : 'Daftarkan 2 Deck Liga Anda'}
              </h3>
              <p className="text-caption text-dark-muted truncate">
                Peserta: <strong className="text-dark-text">{playerName}</strong> •{' '}
                {tournamentName}
              </p>
            </div>
          </div>
          <button
            type="button"
            disabled={saving}
            onClick={onClose}
            className="text-dark-muted hover:text-dark-text p-1 rounded-btn hover:bg-dark-surface-high transition-colors disabled:opacity-50"
            aria-label="Tutup"
          >
            <X size={18} />
          </button>
        </div>

        {/* Scrollable Form Body */}
        <form
          id={formId}
          onSubmit={handleSubmit}
          className="flex-1 min-h-0 overflow-y-auto overscroll-contain p-4 flex flex-col gap-3"
        >
          <div className="p-2.5 rounded-btn bg-amber-500/10 border border-amber-400/30 text-[11px] text-amber-200 leading-relaxed">
            Isi <strong>Deck 1</strong> dan <strong>Deck 2</strong> (nama kedua deck tidak boleh sama). Kedua deck disembunyikan dari pemain lain dan hanya terbaca oleh Anda dan organizer.
          </div>

          {errorMsg && (
            <div className="p-2.5 rounded bg-status-red/10 border border-status-red/30 text-status-red text-caption flex items-start gap-2">
              <AlertCircle size={15} className="flex-shrink-0 mt-0.5" />
              <span>{errorMsg}</span>
            </div>
          )}

          {renderDeckSection(1, deck1Name, setDeck1Name, deck1Colors)}
          {renderDeckSection(2, deck2Name, setDeck2Name, deck2Colors)}
        </form>

        {/* Footer Tombol (selalu terlihat di luar area scroll) */}
        <div className="shrink-0 flex items-center justify-end gap-2 p-4 pt-3 border-t border-dark-border bg-dark-surface">
          <Button
            type="button"
            variant="secondary"
            onClick={onClose}
            disabled={saving}
            className="!min-h-[38px] !px-4"
          >
            {allowSkip ? 'Isi Nanti' : 'Batal'}
          </Button>
          <Button
            type="submit"
            form={formId}
            variant="primary"
            isLoading={saving}
            disabled={saving}
            className="!min-h-[38px] !px-4"
          >
            Simpan 2 Deck
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
