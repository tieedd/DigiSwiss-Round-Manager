import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Participation, TournamentMatch } from '../../types';
import { getAllTournamentMatches } from '../../services/roundService';
import { Button } from '../../components/common/Button';
import { StatusBadge } from '../../components/common/StatusBadge';
import { DeckColorDots } from '../../components/common/DeckColorDots';
import { LeagueSeasonBadge } from '../../components/tournaments/LeagueSeasonBadge';
import { LeagueDecksChips } from '../../components/tournaments/LeagueDecksChips';
import { FinalStandingsCard } from './FinalStandingsCard';
import { MatchGamesBreakdown } from '../../components/rounds/MatchGamesBreakdown';
import { isLeagueParticipation } from '../../utils/leagueFinalDecksLogic';
import { useVisibleViewportHeight } from '../../utils/useVisibleViewportHeight';
import {
  X,
  Trophy,
  Swords,
  Calendar,
  Layers,
  Award,
  CheckCircle2,
  AlertCircle
} from 'lucide-react';

interface PlayerMatchDetailsModalProps {
  isOpen: boolean;
  onClose: () => void;
  participation: Participation | null;
  onDeckChanged?: () => void;
}

export const PlayerMatchDetailsModal: React.FC<PlayerMatchDetailsModalProps> = ({
  isOpen,
  onClose,
  participation,
  onDeckChanged
}) => {
  const [activeTab, setActiveTab] = useState<'standings' | 'matches'>('standings');
  const [matches, setMatches] = useState<TournamentMatch[]>([]);
  const [loading, setLoading] = useState(false);

  const isModalVisible = isOpen && Boolean(participation);
  const { maxHeightCss } = useVisibleViewportHeight(isModalVisible);

  useEffect(() => {
    if (!isModalVisible || typeof document === 'undefined') return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [isModalVisible]);

  useEffect(() => {
    if (!isOpen || !participation) return;

    setActiveTab('standings'); // Default ke tab Klasemen Akhir
    setLoading(true);
    getAllTournamentMatches(participation.tournamentId, false)
      .then((allMatches) => {
        // Filter hanya pertandingan yang melibatkan pemain ini
        const playerMatches = allMatches.filter(
          (m) => m.p1Id === participation.playerId || m.p2Id === participation.playerId
        );
        playerMatches.sort((a, b) => a.round - b.round);
        setMatches(playerMatches);
      })
      .catch((err) => console.error('Gagal mengambil riwayat match pemain:', err))
      .finally(() => setLoading(false));
  }, [isOpen, participation]);

  if (!isOpen || !participation) return null;

  const modalContent = (
    <div
      className="fixed inset-0 z-50 flex flex-col items-center justify-end px-4 bg-black/80 backdrop-blur-sm animate-fade-in"
      style={{
        paddingTop: 'calc(env(safe-area-inset-top, 0px) + 8px)',
        paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 12px)',
      }}
    >
      <div
        className="w-full max-w-md bg-dark-surface border border-dark-border rounded-card shadow-2xl overflow-hidden flex flex-col"
        style={{ maxHeight: maxHeightCss }}
      >
        {/* Header Modal */}
        <div className="shrink-0 flex items-center justify-between p-4 border-b border-dark-border">
          <div className="flex items-center gap-2">
            <Trophy className="text-accent" size={20} />
            <div>
              <h3 className="text-body font-semibold text-dark-text truncate max-w-[240px]">
                {participation.tournamentName}
              </h3>
              <LeagueSeasonBadge
                tournamentType={participation.tournamentType}
                season={participation.season}
                compact
                className="mt-0.5"
              />
              <p className="text-caption text-dark-muted flex items-center gap-1.5 mt-0.5">
                <Calendar size={12} />
                <span>{participation.date}</span>
                <span>•</span>
                <span className="font-mono text-accent">{participation.format}</span>
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

        {/* Ringkasan Hasil Pemain */}
        <div className="shrink-0 p-3.5 bg-dark-bg/60 border-b border-dark-border flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div
                className={`w-9 h-9 rounded-full flex items-center justify-center font-mono font-bold text-body flex-shrink-0 ${
                  participation.rank === 1
                    ? 'bg-accent text-dark-bg'
                    : participation.rank === 2
                    ? 'bg-accent/80 text-dark-bg'
                    : participation.rank === 3
                    ? 'bg-accent/60 text-dark-bg'
                    : 'bg-dark-surface text-dark-muted border border-dark-border'
                }`}
              >
                {participation.rank}
              </div>
              <div>
                <span className="text-body font-bold text-dark-text block">
                  Peringkat #{participation.rank}
                </span>
                <span className="text-caption text-dark-muted font-mono">
                  Total Poin: <strong className="text-accent">{participation.points}</strong> • Match: {participation.wins}W - {participation.losses}L
                </span>
              </div>
            </div>

            <div className="text-right">
              <span className="text-[11px] font-mono text-dark-muted block">
                OMW: {participation.omw}%
              </span>
              <span className="text-[11px] font-mono text-dark-muted block">
                GW: {participation.gw}%
              </span>
            </div>
          </div>

          {/* Deck & Warna yang Digunakan */}
          {isLeagueParticipation(participation) ? (
            <div className="flex flex-col gap-1.5 pt-1 border-t border-dark-border/60 text-caption">
              <div className="flex items-center gap-1.5 text-dark-muted">
                <Layers size={14} className="text-accent flex-shrink-0" />
                <span>2 Deck Liga:</span>
              </div>
              <LeagueDecksChips
                decks={participation.decks}
                emptyLabel="Deck belum diisi"
              />
            </div>
          ) : participation.deckName ? (
            <div className="flex items-center gap-2 pt-1 border-t border-dark-border/60 text-caption">
              <Layers size={14} className="text-accent flex-shrink-0" />
              <span className="text-dark-text font-medium truncate" title={participation.deckName}>
                Deck: <strong>{participation.deckName}</strong>
              </span>
              <div className="ml-auto flex items-center">
                <DeckColorDots colors={participation.deckColors} size="sm" />
              </div>
            </div>
          ) : null}
        </div>

        {/* Segmented Tab: Klasemen Akhir vs Pertandingan Saya */}
        <div className="shrink-0 flex p-1 bg-dark-bg/80 border-b border-dark-border gap-1 px-3">
          <button
            type="button"
            onClick={() => setActiveTab('standings')}
            className={`flex-1 py-1.5 text-caption font-semibold rounded-btn transition-colors text-center ${
              activeTab === 'standings'
                ? 'bg-accent text-dark-bg shadow-sm'
                : 'text-dark-muted hover:text-dark-text'
            }`}
          >
            Klasemen Akhir
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('matches')}
            className={`flex-1 py-1.5 text-caption font-semibold rounded-btn transition-colors text-center ${
              activeTab === 'matches'
                ? 'bg-accent text-dark-bg shadow-sm'
                : 'text-dark-muted hover:text-dark-text'
            }`}
          >
            Pertandingan Saya
          </button>
        </div>

        {/* Konten Tab */}
        <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain p-4 flex flex-col gap-3">
          {activeTab === 'standings' ? (
            <FinalStandingsCard
              tournamentId={participation.tournamentId}
              tournamentName={participation.tournamentName}
              format={participation.format as any}
              status="finished"
              tournamentType={participation.tournamentType}
              season={participation.season}
              highlightUid={participation.uid || undefined}
              onDeckChanged={onDeckChanged}
            />
          ) : (
            <div className="flex flex-col gap-2.5">
              <span className="text-[11px] font-mono text-dark-muted uppercase block">
                Riwayat Pertandingan Ronde ({matches.length} Ronde)
              </span>

              {loading ? (
                <div className="text-center py-6 text-caption text-dark-muted">
                  Memuat detail pertandingan...
                </div>
              ) : matches.length === 0 ? (
                <div className="text-center py-6 text-caption text-dark-muted">
                  Belum ada data pertandingan yang tercatat untuk turnamen ini.
                </div>
              ) : (
                matches.map((m) => {
                  const isP1 = m.p1Id === participation.playerId;
                  const isBye = m.p2Id === null;
                  const opponentName = isBye ? 'BYE (Win Otomatis)' : isP1 ? m.p2Name : m.p1Name;
                  const myScore = isP1 ? m.p1Score : m.p2Score;
                  const oppScore = isP1 ? m.p2Score : m.p1Score;
                  const isWin = isBye || myScore > oppScore;

                  return (
                    <div
                      key={m.id}
                      className={`p-3 rounded-card border transition-colors flex flex-col gap-2 ${
                        isWin
                          ? 'bg-status-green/5 border-status-green/30'
                          : 'bg-dark-bg/40 border-dark-border'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-3">
                        <div className="flex items-center gap-2.5 min-w-0">
                          <div className="w-7 h-7 rounded bg-dark-surface border border-dark-border flex items-center justify-center font-mono text-[11px] text-accent font-semibold flex-shrink-0">
                            R{m.round}
                          </div>

                          <div className="min-w-0">
                            <span className="text-caption font-semibold text-dark-text block truncate">
                              vs {opponentName}
                            </span>
                            <span className="text-[11px] text-dark-muted font-mono">
                              {isBye ? 'Meja Otomatis' : `Meja #${m.table}`}
                            </span>
                          </div>
                        </div>

                        {/* Skor & Status */}
                        <div className="flex items-center gap-2 flex-shrink-0">
                          <span
                            className={`font-mono font-bold text-caption px-2 py-0.5 rounded ${
                              isWin
                                ? 'bg-status-green/15 text-status-green border border-status-green/30'
                                : 'bg-status-red/15 text-status-red border border-status-red/30'
                            }`}
                          >
                            {isBye ? '1 - 0' : `${myScore} - ${oppScore}`}
                          </span>
                        </div>
                      </div>

                      {!isBye && m.games && m.games.length > 0 && (
                        <MatchGamesBreakdown
                          games={m.games}
                          p1Name={m.p1Name}
                          p2Name={m.p2Name}
                          p1Decks={m.p1Decks}
                          p2Decks={m.p2Decks}
                          compact
                        />
                      )}
                    </div>
                  );
                })
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );

  if (typeof document !== 'undefined' && document.body) {
    return createPortal(modalContent, document.body);
  }
  return modalContent;
};
