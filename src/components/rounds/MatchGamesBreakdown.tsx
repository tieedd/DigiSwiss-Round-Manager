import React from 'react';
import { LeagueDeckEntry, MatchGameRecord } from '../../types';
import { DeckColorDots } from '../common/DeckColorDots';
import { Trophy } from 'lucide-react';

interface MatchGamesBreakdownProps {
  games: ReadonlyArray<MatchGameRecord>;
  p1Name: string;
  p2Name: string;
  p1Decks?: ReadonlyArray<LeagueDeckEntry> | null;
  p2Decks?: ReadonlyArray<LeagueDeckEntry> | null;
  compact?: boolean;
  className?: string;
}

export const MatchGamesBreakdown: React.FC<MatchGamesBreakdownProps> = ({
  games,
  p1Name,
  p2Name,
  p1Decks,
  p2Decks,
  compact = false,
  className = '',
}) => {
  if (!games || games.length === 0) return null;

  return (
    <div className={`flex flex-col gap-1.5 min-w-0 ${className}`}>
      {games.map((g, idx) => {
        const winnerName = g.winner === 'p1' ? p1Name : p2Name;
        const d1 = p1Decks?.[g.p1Deck];
        const d2 = p2Decks?.[g.p2Deck];
        const d1Name = d1?.name || `Deck ${g.p1Deck + 1}`;
        const d2Name = d2?.name || `Deck ${g.p2Deck + 1}`;

        return (
          <div
            key={idx}
            className={`rounded-btn border border-dark-border/80 bg-dark-bg/50 min-w-0 ${
              compact ? 'px-2.5 py-1.5' : 'px-3 py-2'
            } flex flex-col gap-1`}
          >
            <div className="flex items-center justify-between gap-2 min-w-0 flex-wrap">
              <span className="text-[11px] font-mono font-semibold text-accent">
                Game {idx + 1}
              </span>
              <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-status-green min-w-0 break-words [overflow-wrap:anywhere]">
                <Trophy size={11} className="flex-shrink-0" />
                <span>Pemenang: {winnerName}</span>
              </span>
            </div>

            <div className="grid grid-cols-1 gap-1 text-[11px] text-dark-muted min-w-0">
              <div className="flex items-center gap-1.5 min-w-0 flex-wrap">
                <span className="font-medium text-dark-text shrink-0">{p1Name}:</span>
                {d1?.colors && <DeckColorDots colors={d1.colors} size="sm" />}
                <span className="text-dark-text break-words [overflow-wrap:anywhere]">
                  {d1Name}
                </span>
              </div>
              <div className="flex items-center gap-1.5 min-w-0 flex-wrap">
                <span className="font-medium text-dark-text shrink-0">{p2Name}:</span>
                {d2?.colors && <DeckColorDots colors={d2.colors} size="sm" />}
                <span className="text-dark-text break-words [overflow-wrap:anywhere]">
                  {d2Name}
                </span>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
};
