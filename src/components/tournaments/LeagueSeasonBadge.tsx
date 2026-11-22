import React from 'react';
import { Tournament, TournamentSeason, TournamentType } from '../../types';
import { formatSeasonLabel, isLeagueTournament } from '../../utils/seasonLogic';
import { Trophy } from 'lucide-react';

interface LeagueSeasonBadgeProps {
  tournament?: Pick<Tournament, 'type' | 'season'> | null;
  tournamentType?: TournamentType;
  season?: TournamentSeason;
  showSeason?: boolean;
  compact?: boolean;
  className?: string;
}

export const LeagueSeasonBadge: React.FC<LeagueSeasonBadgeProps> = ({
  tournament,
  tournamentType,
  season,
  showSeason = true,
  compact = false,
  className = '',
}) => {
  const isLeague = tournament
    ? isLeagueTournament(tournament)
    : tournamentType === 'league';
  const resolvedSeason = tournament ? tournament.season : season;
  const seasonLabel = showSeason ? formatSeasonLabel(resolvedSeason) : null;

  if (!isLeague && !seasonLabel) {
    return null;
  }

  return (
    <span className={`inline-flex items-center gap-1.5 flex-wrap ${className}`}>
      {isLeague && (
        <span
          className={`inline-flex items-center gap-1 font-mono font-bold uppercase rounded bg-accent/15 text-accent border border-accent/40 ${
            compact ? 'text-[9px] px-1.5 py-0.2' : 'text-[10px] px-1.5 py-0.5'
          }`}
        >
          <Trophy size={compact ? 9 : 10} className="flex-shrink-0" />
          <span>LIGA</span>
        </span>
      )}
      {seasonLabel && (
        <span
          className={`font-mono font-bold bg-accent/15 text-accent border border-accent/40 rounded ${
            compact ? 'text-[10px] px-1.5 py-0.2' : 'text-[11px] px-2 py-0.5'
          }`}
        >
          {seasonLabel}
        </span>
      )}
    </span>
  );
};
