import React from 'react';
import { TournamentMatch, TournamentTopCut } from '../../types';
import { Card } from '../common/Card';
import { getRoundDisplayLabel, filterTopCutMatches } from '../../utils/topCutLogic';
import { Trophy, CheckCircle2, Swords } from 'lucide-react';

interface TopCutBracketCardProps {
  topCut: TournamentTopCut;
  matches: TournamentMatch[];
  totalSwissRounds: number;
  highlightUid?: string;
  onSelectMatch?: (match: TournamentMatch) => void;
}

export const TopCutBracketCard: React.FC<TopCutBracketCardProps> = ({
  topCut,
  matches,
  totalSwissRounds,
  highlightUid,
  onSelectMatch,
}) => {
  const topCutMatches = filterTopCutMatches(matches).filter((m) => !m.archived);

  // Kelompokkan pertandingan berdasarkan nomor ronde Top Cut
  const roundsMap = new Map<number, TournamentMatch[]>();
  for (const m of topCutMatches) {
    const existing = roundsMap.get(m.round) || [];
    existing.push(m);
    roundsMap.set(m.round, existing);
  }

  const roundNumbers = Array.from(roundsMap.keys()).sort((a, b) => a - b);

  // Peta seed (playerId -> seed number 1..N)
  const seedNumberMap = new Map<string, number>();
  (topCut.seeds || []).forEach((s, idx) => {
    seedNumberMap.set(s.playerId, idx + 1);
  });

  if (roundNumbers.length === 0) {
    return null;
  }

  return (
    <Card variant="surface-high" className="p-3.5 flex flex-col gap-3 border-accent/30">
      <div className="flex items-center justify-between gap-2 border-b border-dark-border pb-2">
        <div className="flex items-center gap-2">
          <Trophy size={17} className="text-accent flex-shrink-0" />
          <div>
            <h3 className="text-body font-semibold text-dark-text">
              Bagan Top Cut (Top {topCut.size})
            </h3>
            <p className="text-[11px] text-dark-muted">
              Sistem gugur tunggal &bull; Seed berdasarkan klasemen Swiss akhir
            </p>
          </div>
        </div>
        <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-accent/15 text-accent border border-accent/30 font-semibold">
          Top {topCut.size}
        </span>
      </div>

      {/* Daftar babak Top Cut (mobile-first bertumpuk, responsif di layar lebar) */}
      <div
        className={`grid gap-3 ${
          roundNumbers.length >= 3
            ? 'grid-cols-1 md:grid-cols-3'
            : roundNumbers.length === 2
            ? 'grid-cols-1 md:grid-cols-2'
            : 'grid-cols-1'
        }`}
      >
        {roundNumbers.map((roundNum) => {
          const roundMatches = [...(roundsMap.get(roundNum) || [])].sort(
            (a, b) => a.table - b.table
          );
          const roundLabel = getRoundDisplayLabel(roundNum, totalSwissRounds, topCut.size);
          const isFinalRound = roundLabel === 'Final';

          return (
            <div key={roundNum} className="flex flex-col gap-2">
              <div className="flex items-center justify-between px-1">
                <span className="text-[11px] font-mono font-bold uppercase text-accent flex items-center gap-1">
                  {isFinalRound ? <Trophy size={12} /> : <Swords size={12} />}
                  {roundLabel}
                </span>
                <span className="text-[10px] font-mono text-dark-muted">
                  {roundMatches.filter((m) => m.status === 'confirmed').length}/{roundMatches.length} selesai
                </span>
              </div>

              <div className="flex flex-col gap-2">
                {roundMatches.map((m) => {
                  const isConfirmed = m.status === 'confirmed';
                  const p1Won = isConfirmed && m.p1Score > m.p2Score;
                  const p2Won = isConfirmed && m.p2Score > m.p1Score;
                  const p1Seed = seedNumberMap.get(m.p1Id);
                  const p2Seed = m.p2Id ? seedNumberMap.get(m.p2Id) : undefined;
                  const p1IsMe = Boolean(highlightUid && m.p1Id === highlightUid);
                  const p2IsMe = Boolean(highlightUid && m.p2Id === highlightUid);

                  return (
                    <div
                      key={m.id}
                      onClick={() => onSelectMatch?.(m)}
                      className={`rounded-btn border p-2 flex flex-col gap-1 text-caption transition-colors ${
                        isFinalRound
                          ? 'border-accent/40 bg-accent/5'
                          : 'border-dark-border bg-dark-bg/50'
                      } ${onSelectMatch ? 'cursor-pointer hover:border-accent/60' : ''}`}
                    >
                      <div className="flex items-center justify-between text-[10px] font-mono text-dark-muted pb-1 border-b border-dark-border/50">
                        <span>Meja #{m.table}</span>
                        <span>
                          {isConfirmed
                            ? isFinalRound && (p1Won || p2Won)
                              ? 'Juara Ditentukan'
                              : 'Selesai'
                            : m.status === 'awaiting'
                            ? 'Menunggu Konfirmasi'
                            : m.status === 'disputed'
                            ? 'Disputed'
                            : 'Berlangsung'}
                        </span>
                      </div>

                      {/* Pemain 1 */}
                      <div
                        className={`flex items-center justify-between gap-2 px-1.5 py-1 rounded ${
                          p1Won
                            ? 'bg-accent/15 text-dark-text font-semibold'
                            : p2Won
                            ? 'text-dark-muted opacity-70'
                            : 'text-dark-text'
                        }`}
                      >
                        <div className="flex items-center gap-1.5 min-w-0">
                          {p1Seed && (
                            <span className="text-[10px] font-mono text-accent flex-shrink-0">
                              #{p1Seed}
                            </span>
                          )}
                          <span className={`truncate ${p1IsMe ? 'underline decoration-accent' : ''}`}>
                            {m.p1Name}
                          </span>
                          {p1Won && (
                            <CheckCircle2 size={12} className="text-accent flex-shrink-0" />
                          )}
                        </div>
                        <span
                          className={`font-mono font-bold text-xs flex-shrink-0 ${
                            p1Won ? 'text-accent' : 'text-dark-muted'
                          }`}
                        >
                          {isConfirmed || m.status === 'awaiting' ? m.p1Score : '-'}
                        </span>
                      </div>

                      {/* Pemain 2 */}
                      <div
                        className={`flex items-center justify-between gap-2 px-1.5 py-1 rounded ${
                          p2Won
                            ? 'bg-accent/15 text-dark-text font-semibold'
                            : p1Won
                            ? 'text-dark-muted opacity-70'
                            : 'text-dark-text'
                        }`}
                      >
                        <div className="flex items-center gap-1.5 min-w-0">
                          {p2Seed && (
                            <span className="text-[10px] font-mono text-accent flex-shrink-0">
                              #{p2Seed}
                            </span>
                          )}
                          <span className={`truncate ${p2IsMe ? 'underline decoration-accent' : ''}`}>
                            {m.p2Name}
                          </span>
                          {p2Won && (
                            <CheckCircle2 size={12} className="text-accent flex-shrink-0" />
                          )}
                        </div>
                        <span
                          className={`font-mono font-bold text-xs flex-shrink-0 ${
                            p2Won ? 'text-accent' : 'text-dark-muted'
                          }`}
                        >
                          {isConfirmed || m.status === 'awaiting' ? m.p2Score : '-'}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </Card>
  );
};
