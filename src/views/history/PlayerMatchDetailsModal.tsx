import React, { useState, useEffect } from 'react';
import { Participation, TournamentMatch } from '../../types';
import { getAllTournamentMatches } from '../../services/roundService';
import { Button } from '../../components/common/Button';
import { StatusBadge } from '../../components/common/StatusBadge';
import { DeckColorDots } from '../../components/common/DeckColorDots';
import { FinalStandingsCard } from './FinalStandingsCard';
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

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fade-in">
      <div className="w-full max-w-md bg-dark-surface border border-dark-border rounded-card shadow-2xl overflow-hidden flex flex-col max-h-[88vh]">
        {/* Header Modal */}
        <div className="flex items-center justify-between p-4 border-b border-dark-border">
          <div className="flex items-center gap-2">
            <Trophy className="text-accent" size={20} />
            <div>
              <h3 className="text-body font-semibold text-dark-text truncate max-w-[240px]">
                {participation.tournamentName}
              </h3>
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
        <div className="p-3.5 bg-dark-bg/60 border-b border-dark-border flex flex-col gap-2">
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
          {participation.deckName && (
            <div className="flex items-center gap-2 pt-1 border-t border-dark-border/60 text-caption">
              <Layers size={14} className="text-accent flex-shrink-0" />
              <span className="text-dark-text font-medium truncate" title={participation.deckName}>
                Deck: <strong>{participation.deckName}</strong>
              </span>
              <div className="ml-auto flex items-center">
                <DeckColorDots colors={participation.deckColors} size="sm" />
              </div>
            </div>
          )}
        </div>

        {/* Segmented Tab: Klasemen Akhir vs Pertandingan Saya */}
        <div className="flex p-1 bg-dark-bg/80 border-b border-dark-border gap-1 px-3">
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
        <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-3">
          {activeTab === 'standings' ? (
            <FinalStandingsCard
              tournamentId={participation.tournamentId}
              tournamentName={participation.tournamentName}
              format={participation.format as any}
              status="finished"
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
                      className={`p-3 rounded-card border transition-colors flex items-center justify-between gap-3 ${
                        isWin
                          ? 'bg-status-green/5 border-status-green/30'
                          : 'bg-dark-bg/40 border-dark-border'
                      }`}
                    >
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
                  );
                })
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
