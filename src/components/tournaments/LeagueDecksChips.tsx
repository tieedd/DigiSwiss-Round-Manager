import React from 'react';
import type { LeagueDeckEntry } from '../../types';
import { DeckColorDots } from '../common/DeckColorDots';

interface LeagueDecksChipsProps {
  decks?: ReadonlyArray<LeagueDeckEntry> | null;
  emptyLabel?: string;
  className?: string;
}

export const LeagueDecksChips: React.FC<LeagueDecksChipsProps> = ({
  decks,
  emptyLabel = 'Deck belum diisi',
  className = '',
}) => {
  const validDecks = Array.isArray(decks)
    ? decks.filter((d) => d && typeof d.name === 'string' && d.name.trim().length > 0)
    : [];

  if (validDecks.length === 0) {
    return (
      <span className={`text-[11px] text-dark-muted italic ${className}`}>
        {emptyLabel}
      </span>
    );
  }

  return (
    <div className={`flex flex-wrap items-center gap-1.5 min-w-0 ${className}`}>
      {validDecks.map((d, idx) => (
        <span
          key={`${d.name}-${idx}`}
          title={d.name}
          className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-btn bg-dark-surface-high border border-dark-border text-[11px] text-dark-text max-w-full min-w-0"
        >
          <DeckColorDots colors={d.colors} size="sm" className="shrink-0" />
          <span className="truncate max-w-[160px] font-medium">{d.name}</span>
        </span>
      ))}
    </div>
  );
};
