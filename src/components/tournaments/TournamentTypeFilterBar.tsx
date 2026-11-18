import React from 'react';
import { TournamentTypeFilter } from '../../utils/seasonLogic';

interface TournamentTypeFilterBarProps {
  value: TournamentTypeFilter;
  onChange: (next: TournamentTypeFilter) => void;
  counts?: {
    all: number;
    league: number;
    regular: number;
  };
}

const FILTER_OPTIONS: ReadonlyArray<{
  key: TournamentTypeFilter;
  label: string;
}> = [
  { key: 'all', label: 'Semua' },
  { key: 'league', label: 'Liga' },
  { key: 'regular', label: 'Reguler' },
];

export const TournamentTypeFilterBar: React.FC<TournamentTypeFilterBarProps> = ({
  value,
  onChange,
  counts,
}) => {
  return (
    <div
      className="grid grid-cols-3 gap-1 p-1 rounded-btn bg-dark-surface border border-dark-border"
      role="tablist"
      aria-label="Filter jenis turnamen"
    >
      {FILTER_OPTIONS.map((opt) => {
        const isActive = value === opt.key;
        const count = counts ? counts[opt.key] : undefined;
        return (
          <button
            key={opt.key}
            type="button"
            role="tab"
            aria-selected={isActive}
            onClick={() => onChange(opt.key)}
            className={`min-h-[34px] px-2 rounded-btn text-caption font-semibold transition-colors flex items-center justify-center gap-1.5 ${
              isActive
                ? 'bg-accent text-dark-bg shadow-sm'
                : 'text-dark-muted hover:text-dark-text'
            }`}
          >
            <span>{opt.label}</span>
            {count !== undefined && (
              <span
                className={`text-[10px] font-mono px-1.5 py-0.2 rounded-full ${
                  isActive
                    ? 'bg-dark-bg/20 text-dark-bg'
                    : 'bg-dark-surface-high text-dark-muted'
                }`}
              >
                {count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
};
