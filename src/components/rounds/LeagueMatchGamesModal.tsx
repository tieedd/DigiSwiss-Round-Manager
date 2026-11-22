import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import {
  LeagueDeckEntry,
  LeagueDeckIndex,
  MatchGameRecord,
  MatchGameWinner,
  TournamentMatch,
} from '../../types';
import { Button } from '../common/Button';
import { DeckColorDots } from '../common/DeckColorDots';
import { useVisibleViewportHeight } from '../../utils/useVisibleViewportHeight';
import { useBackLayer } from '../../utils/backStack';
import {
  DraftMatchGame,
  createInitialDraftGames,
  deriveMatchScoresFromGames,
  getVisibleDraftGames,
  isMatchGamesFormComplete,
  toSubmittedMatchGames,
} from '../../utils/matchGamesLogic';
import { AlertCircle, Check, Swords, X } from 'lucide-react';

interface LeagueMatchGamesModalProps {
  isOpen: boolean;
  onClose: () => void;
  match: TournamentMatch | null;
  roundLabel?: string;
  mode: 'player' | 'organizer';
  onSaveGames: (
    matchId: string,
    games: MatchGameRecord[],
    p1Score: number,
    p2Score: number
  ) => Promise<void>;
}

export const LeagueMatchGamesModal: React.FC<LeagueMatchGamesModalProps> = ({
  isOpen,
  onClose,
  match,
  roundLabel,
  mode,
  onSaveGames,
}) => {
  const [drafts, setDrafts] = useState<[DraftMatchGame, DraftMatchGame, DraftMatchGame]>(() =>
    createInitialDraftGames(null)
  );
  const [touched, setTouched] = useState({
    g2p1: false,
    g2p2: false,
    g3p1: false,
    g3p2: false,
  });
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const isVisible = isOpen && Boolean(match && match.p1Decks && match.p2Decks);
  const { maxHeightCss } = useVisibleViewportHeight(isVisible);

  useBackLayer(
    isVisible,
    () => {
      if (!saving) onClose();
    },
    { blocked: saving }
  );

  useEffect(() => {
    if (!isVisible || typeof document === 'undefined') return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [isVisible]);

  useEffect(() => {
    if (!isOpen || !match) return;
    const initial = createInitialDraftGames(match.games);
    setDrafts(initial);
    const hasExisting = Boolean(match.games && match.games.length >= 2);
    setTouched({
      g2p1: hasExisting,
      g2p2: hasExisting,
      g3p1: Boolean(match.games && match.games.length >= 3),
      g3p2: Boolean(match.games && match.games.length >= 3),
    });
    setErrorMsg(null);
    setSaving(false);
  }, [isOpen, match?.id]);

  if (!isOpen || !match || !match.p1Decks || !match.p2Decks) return null;

  const p1Decks = match.p1Decks;
  const p2Decks = match.p2Decks;

  const visibleGames = getVisibleDraftGames(drafts);
  const derivedScores = deriveMatchScoresFromGames(visibleGames);
  const isFormComplete = isMatchGamesFormComplete(drafts);

  const isTopCut = match.stage === 'topcut';
  const headerRoundText =
    isTopCut && roundLabel
      ? `${roundLabel} · Meja ${match.table}`
      : `Round ${match.round} · Meja ${match.table}`;

  const handleSelectDeck = (
    gameIndex: 0 | 1 | 2,
    playerKey: 'p1' | 'p2',
    deckIndex: LeagueDeckIndex
  ) => {
    setErrorMsg(null);
    setDrafts((prev) => {
      const next: [DraftMatchGame, DraftMatchGame, DraftMatchGame] = [
        { ...prev[0] },
        { ...prev[1] },
        { ...prev[2] },
      ];

      if (playerKey === 'p1') {
        next[gameIndex].p1Deck = deckIndex;
        if (gameIndex === 0) {
          if (!touched.g2p1) {
            next[1].p1Deck = deckIndex;
            if (!touched.g3p1) {
              next[2].p1Deck = deckIndex;
            }
          }
        } else if (gameIndex === 1) {
          if (!touched.g3p1) {
            next[2].p1Deck = deckIndex;
          }
        }
      } else {
        next[gameIndex].p2Deck = deckIndex;
        if (gameIndex === 0) {
          if (!touched.g2p2) {
            next[1].p2Deck = deckIndex;
            if (!touched.g3p2) {
              next[2].p2Deck = deckIndex;
            }
          }
        } else if (gameIndex === 1) {
          if (!touched.g3p2) {
            next[2].p2Deck = deckIndex;
          }
        }
      }

      return next;
    });

    if (gameIndex === 1) {
      setTouched((prev) => ({
        ...prev,
        ...(playerKey === 'p1' ? { g2p1: true } : { g2p2: true }),
      }));
    } else if (gameIndex === 2) {
      setTouched((prev) => ({
        ...prev,
        ...(playerKey === 'p1' ? { g3p1: true } : { g3p2: true }),
      }));
    }
  };

  const handleSelectWinner = (gameIndex: 0 | 1 | 2, winner: MatchGameWinner) => {
    setErrorMsg(null);
    setDrafts((prev) => {
      const next: [DraftMatchGame, DraftMatchGame, DraftMatchGame] = [
        { ...prev[0] },
        { ...prev[1] },
        { ...prev[2] },
      ];
      next[gameIndex].winner = winner;

      // Bila Game 3 muncul setelah hasil 1-1, pastikan Game 3 mewarisi deck Game 2 bila belum disentuh
      const willShowGame3 =
        (next[0].winner === 'p1' || next[0].winner === 'p2') &&
        (next[1].winner === 'p1' || next[1].winner === 'p2') &&
        next[0].winner !== next[1].winner;

      if (willShowGame3) {
        if (!touched.g3p1 && next[2].p1Deck === null && next[1].p1Deck !== null) {
          next[2].p1Deck = next[1].p1Deck;
        }
        if (!touched.g3p2 && next[2].p2Deck === null && next[1].p2Deck !== null) {
          next[2].p2Deck = next[1].p2Deck;
        }
      }

      return next;
    });
  };

  const handleSubmit = async () => {
    if (!isFormComplete || saving) return;
    const submittedGames = toSubmittedMatchGames(drafts);
    const { p1Score, p2Score } = deriveMatchScoresFromGames(submittedGames);

    setSaving(true);
    setErrorMsg(null);
    try {
      await onSaveGames(match.id, submittedGames, p1Score, p2Score);
      onClose();
    } catch (err: any) {
      setErrorMsg(err?.message || 'Gagal menyimpan hasil pertandingan per game.');
    } finally {
      setSaving(false);
    }
  };

  const renderDeckChipsRow = (
    gameIndex: 0 | 1 | 2,
    playerKey: 'p1' | 'p2',
    playerName: string,
    decks: readonly [LeagueDeckEntry, LeagueDeckEntry],
    selectedDeckIndex: LeagueDeckIndex | null
  ) => (
    <div className="flex flex-col gap-1.5 min-w-0">
      <span className="text-[11px] font-medium text-dark-muted break-words [overflow-wrap:anywhere]">
        {playerName} Deck:
      </span>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 min-w-0">
        {([0, 1] as const).map((idx) => {
          const deck = decks[idx];
          const isSelected = selectedDeckIndex === idx;
          return (
            <button
              key={idx}
              type="button"
              disabled={saving}
              onClick={() => handleSelectDeck(gameIndex, playerKey, idx)}
              className={`min-h-[40px] px-2.5 py-1.5 rounded-btn border text-left transition-all flex items-center gap-2 min-w-0 ${
                isSelected
                  ? 'border-accent bg-accent/15 text-accent ring-1 ring-accent/40 font-semibold'
                  : 'border-dark-border bg-dark-surface text-dark-text hover:border-accent/40'
              }`}
            >
              <DeckColorDots colors={deck.colors} size="sm" className="shrink-0" />
              <span className="text-caption leading-tight break-words [overflow-wrap:anywhere] flex-1 min-w-0">
                {deck.name}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );

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
        {/* Header Modal + Kotak Skor Turunan */}
        <div className="shrink-0 p-4 border-b border-dark-border flex flex-col gap-3">
          <div className="flex items-start justify-between gap-2 min-w-0">
            <div className="flex items-start gap-2 min-w-0">
              <Swords className="text-accent flex-shrink-0 mt-0.5" size={18} />
              <div className="min-w-0">
                <p className="text-[11px] font-mono font-semibold text-accent uppercase tracking-wide">
                  {headerRoundText}
                </p>
                <h3 className="text-body font-bold text-dark-text break-words [overflow-wrap:anywhere]">
                  {match.p1Name} VS {match.p2Name}
                </h3>
              </div>
            </div>
            <button
              type="button"
              disabled={saving}
              onClick={onClose}
              className="text-dark-muted hover:text-dark-text p-1 rounded-btn hover:bg-dark-surface-high transition-colors disabled:opacity-50 shrink-0"
              aria-label="Tutup"
            >
              <X size={18} />
            </button>
          </div>

          {/* Kotak Skor Besar Hasil Turunan */}
          <div className="px-4 py-2.5 rounded-card bg-dark-bg/70 border border-dark-border flex items-center justify-between gap-3">
            <span className="text-caption font-semibold text-dark-text truncate flex-1 min-w-0">
              {match.p1Name}
            </span>
            <span className="font-mono text-2xl font-extrabold text-accent tracking-wider shrink-0 px-3 py-0.5 rounded-btn bg-accent/10 border border-accent/30">
              {derivedScores.p1Score} - {derivedScores.p2Score}
            </span>
            <span className="text-caption font-semibold text-dark-text truncate flex-1 min-w-0 text-right">
              {match.p2Name}
            </span>
          </div>
        </div>

        {/* Body Scrollable: Kartu Game 1, Game 2, dan Game 3 (bila 1-1) */}
        <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain p-4 flex flex-col gap-3">
          {visibleGames.map((game, idx) => {
            const gameIndex = idx as 0 | 1 | 2;
            const winnerName =
              game.winner === 'p1'
                ? match.p1Name
                : game.winner === 'p2'
                ? match.p2Name
                : null;

            return (
              <div
                key={gameIndex}
                className="p-3 rounded-card bg-dark-bg/50 border border-dark-border flex flex-col gap-2.5 min-w-0"
              >
                {/* Header Kartu Game */}
                <div className="flex items-center justify-between gap-2 pb-1.5 border-b border-dark-border/60 min-w-0 flex-wrap">
                  <span className="text-body font-bold text-dark-text">
                    Game {gameIndex + 1}
                  </span>
                  {winnerName && (
                    <span className="text-[11px] font-semibold text-status-green bg-status-green/10 border border-status-green/30 px-2 py-0.5 rounded-full break-words [overflow-wrap:anywhere]">
                      Pemenang: {winnerName}
                    </span>
                  )}
                </div>

                {/* Pilihan Deck Pemain 1 & Pemain 2 */}
                {renderDeckChipsRow(
                  gameIndex,
                  'p1',
                  match.p1Name,
                  p1Decks,
                  game.p1Deck
                )}
                {renderDeckChipsRow(
                  gameIndex,
                  'p2',
                  match.p2Name,
                  p2Decks,
                  game.p2Deck
                )}

                {/* Tombol Pemenang Game */}
                <div className="flex flex-col gap-1 pt-1">
                  <span className="text-[11px] font-medium text-dark-muted">
                    Pemenang Game {gameIndex + 1}:
                  </span>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      disabled={saving}
                      onClick={() => handleSelectWinner(gameIndex, 'p1')}
                      className={`min-h-[42px] px-2.5 py-1.5 rounded-btn border text-caption font-semibold transition-all flex items-center justify-center gap-1.5 min-w-0 ${
                        game.winner === 'p1'
                          ? 'border-status-green bg-status-green/15 text-status-green ring-1 ring-status-green/40'
                          : 'border-dark-border bg-dark-surface text-dark-text hover:border-status-green/50'
                      }`}
                    >
                      {game.winner === 'p1' && <Check size={14} className="shrink-0 stroke-[2.5]" />}
                      <span className="break-words [overflow-wrap:anywhere] text-center">
                        Menang: {match.p1Name}
                      </span>
                    </button>
                    <button
                      type="button"
                      disabled={saving}
                      onClick={() => handleSelectWinner(gameIndex, 'p2')}
                      className={`min-h-[42px] px-2.5 py-1.5 rounded-btn border text-caption font-semibold transition-all flex items-center justify-center gap-1.5 min-w-0 ${
                        game.winner === 'p2'
                          ? 'border-status-green bg-status-green/15 text-status-green ring-1 ring-status-green/40'
                          : 'border-dark-border bg-dark-surface text-dark-text hover:border-status-green/50'
                      }`}
                    >
                      {game.winner === 'p2' && <Check size={14} className="shrink-0 stroke-[2.5]" />}
                      <span className="break-words [overflow-wrap:anywhere] text-center">
                        Menang: {match.p2Name}
                      </span>
                    </button>
                  </div>
                </div>
              </div>
            );
          })}

          {errorMsg && (
            <div className="p-2.5 rounded-btn bg-status-red/10 border border-status-red/30 text-status-red text-caption flex items-start gap-2">
              <AlertCircle size={15} className="flex-shrink-0 mt-0.5" />
              <span>{errorMsg}</span>
            </div>
          )}
        </div>

        {/* Footer Tombol Tetap di Luar Area Scroll */}
        <div className="shrink-0 flex items-center justify-end gap-2 p-4 pt-3 border-t border-dark-border bg-dark-surface">
          <Button
            type="button"
            variant="secondary"
            onClick={onClose}
            disabled={saving}
            className="!min-h-[40px] !px-4"
          >
            Batal
          </Button>
          <Button
            type="button"
            variant="primary"
            onClick={handleSubmit}
            isLoading={saving}
            disabled={!isFormComplete || saving}
            icon={<Check size={16} />}
            className="!min-h-[40px] !px-4"
          >
            {mode === 'organizer' ? 'Simpan & Konfirmasi' : 'Simpan Hasil'}
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
