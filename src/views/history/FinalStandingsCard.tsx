import React, { useState, useEffect, useCallback } from 'react';
import { Participation, DeckColor } from '../../types';
import { Card } from '../../components/common/Card';
import { Button } from '../../components/common/Button';
import { DECK_COLOR_STYLES } from '../../utils/deckExportLogic';
import {
  getTournamentParticipations
} from '../../services/participationService';
import {
  getTournamentPlayers
} from '../../services/tournamentService';
import {
  getAllTournamentMatches
} from '../../services/roundService';
import { calculateTournamentStandings } from '../../utils/standingsLogic';
import {
  buildFinalStandingsRows,
  FinalStandingsRowItem,
  getCachedStandings,
  setCachedStandings,
  invalidateStandingsCache
} from '../../utils/finalStandingsLogic';
import {
  Trophy,
  Layers,
  ChevronDown,
  ChevronUp,
  AlertCircle,
  RefreshCw
} from 'lucide-react';

export interface FinalStandingsCardProps {
  tournamentId: string;
  tournamentName: string;
  format: 'BO1' | 'BO3';
  status: string;
  highlightUid?: string;
  onDeckChanged?: () => void;
}

const DEFAULT_DISPLAY_LIMIT = 16;

export const FinalStandingsCard: React.FC<FinalStandingsCardProps> = ({
  tournamentId,
  tournamentName,
  format,
  status,
  highlightUid,
  onDeckChanged
}) => {
  const [participations, setParticipations] = useState<Participation[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isProvisional, setIsProvisional] = useState(false);
  const [showAll, setShowAll] = useState(false);

  const loadData = useCallback(async (forceReload: boolean = false) => {
    if (!tournamentId) return;

    if (!forceReload) {
      const cached = getCachedStandings(tournamentId);
      if (cached && cached.length > 0) {
        setParticipations(cached);
        setIsProvisional(false);
        setLoading(false);
        return;
      }
    }

    setLoading(true);
    setErrorMsg(null);

    try {
      // 1. Coba ambil dari dokumen participations resmi
      const official = await getTournamentParticipations(tournamentId);
      if (official.length > 0) {
        setParticipations(official);
        setCachedStandings(tournamentId, official);
        setIsProvisional(false);
      } else if (status === 'finished') {
        // 2. Jika turnamen finished tapi belum ada participations, hitung klasemen sementara
        const players = await getTournamentPlayers(tournamentId);
        const matches = await getAllTournamentMatches(tournamentId, false);
        const calculated = calculateTournamentStandings(players, matches, format);

        const provisionalList: Participation[] = calculated.map((s) => {
          const original = players.find((p) => p.id === s.playerId);
          return {
            id: `${tournamentId}_${s.playerId}`,
            tournamentId,
            tournamentName,
            date: '',
            format,
            playerId: s.playerId,
            uid: original?.uid || null,
            organizerId: '',
            name: s.playerName,
            rank: s.rank,
            wins: s.matchWins,
            losses: s.matchLosses,
            gamesWon: s.gamesWon,
            gamesLost: s.gamesLost,
            points: s.points,
            omw: s.omw,
            gw: s.gw,
            ogw: s.ogw,
            deckName: '',
            deckColors: [],
            isManual: original?.manual ?? false,
            createdAt: Date.now()
          };
        });

        setParticipations(provisionalList);
        setIsProvisional(true);
      } else {
        setParticipations([]);
        setIsProvisional(false);
      }
    } catch (err: any) {
      console.error('Gagal memuat klasemen akhir:', err);
      setErrorMsg(err.message || 'Gagal memuat klasemen akhir.');
    } finally {
      setLoading(false);
    }
  }, [tournamentId, tournamentName, format, status]);

  useEffect(() => {
    loadData(false);
  }, [loadData]);

  // Handle deck changed dari luar untuk reload data
  const handleReloadAfterDeckChange = useCallback(() => {
    invalidateStandingsCache(tournamentId);
    loadData(true);
    onDeckChanged?.();
  }, [tournamentId, loadData, onDeckChanged]);

  // Siapkan baris klasemen
  const rows = buildFinalStandingsRows(participations, highlightUid);
  const totalCount = rows.length;
  const displayedRows = showAll ? rows : rows.slice(0, DEFAULT_DISPLAY_LIMIT);

  if (loading) {
    return (
      <Card variant="surface" className="p-4 flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <div className="h-5 w-32 bg-dark-surface-high rounded animate-pulse" />
          <div className="h-4 w-20 bg-dark-surface-high rounded animate-pulse" />
        </div>
        <div className="flex flex-col gap-2 pt-1">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-12 bg-dark-surface-high/60 rounded-btn animate-pulse" />
          ))}
        </div>
      </Card>
    );
  }

  if (errorMsg) {
    return (
      <Card variant="surface" className="p-4 flex flex-col items-center gap-2.5 text-center">
        <AlertCircle size={22} className="text-status-red" />
        <span className="text-caption text-status-red">{errorMsg}</span>
        <Button
          variant="secondary"
          onClick={() => loadData(true)}
          className="!min-h-[34px] !px-3 !text-caption"
          icon={<RefreshCw size={13} />}
        >
          Coba lagi
        </Button>
      </Card>
    );
  }

  if (totalCount === 0) {
    return (
      <Card variant="surface" className="p-4 text-center text-caption text-dark-muted">
        Klasemen belum tersedia.
      </Card>
    );
  }

  return (
    <Card variant="surface" className="p-3.5 flex flex-col gap-3">
      {/* Header Kartu Klasemen */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <Trophy size={18} className="text-accent flex-shrink-0" />
          <div>
            <h3 className="text-body font-semibold text-dark-text flex items-center gap-1.5">
              <span>Klasemen Akhir</span>
              {isProvisional && (
                <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-status-yellow/15 text-status-yellow border border-status-yellow/30 font-normal">
                  Klasemen sementara (belum difinalisasi)
                </span>
              )}
            </h3>
            <p className="text-[11px] text-dark-muted">
              {totalCount} peserta &bull; {format}
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={() => loadData(true)}
          className="text-dark-muted hover:text-dark-text p-1 transition-colors"
          title="Segarkan Klasemen"
        >
          <RefreshCw size={14} />
        </button>
      </div>

      {/* Daftar Baris Klasemen (Mobile-friendly, no horizontal scroll) */}
      <div className="flex flex-col gap-1.5 pt-1">
        {displayedRows.map((row) => {
          return (
            <div
              key={row.participationId}
              className={`p-2.5 rounded-btn border transition-colors flex flex-col gap-1 ${
                row.isMe
                  ? 'border-l-4 border-l-accent bg-accent/5 border-dark-border'
                  : 'bg-dark-bg/40 border-dark-border/80'
              }`}
            >
              {/* Baris Atas: Peringkat, Nama, Deck, Poin */}
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2.5 min-w-0 flex-1">
                  {/* Badge Peringkat */}
                  <div
                    className={`w-6 h-6 rounded-full flex items-center justify-center font-mono font-bold text-[11px] flex-shrink-0 ${
                      row.rank === 1
                        ? 'bg-accent text-dark-bg'
                        : row.rank === 2
                        ? 'bg-accent/80 text-dark-bg'
                        : row.rank === 3
                        ? 'bg-accent/60 text-dark-bg'
                        : 'bg-dark-surface-high text-dark-muted border border-dark-border'
                    }`}
                  >
                    {row.rank}
                  </div>

                  {/* Nama Pemain & Deck */}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <span className="text-body font-semibold text-dark-text truncate leading-tight">
                        {row.name}
                      </span>
                      {row.isMe && (
                        <span className="text-[9px] font-bold px-1.5 py-0.2 rounded bg-accent/20 text-accent border border-accent/30 font-mono">
                          Anda
                        </span>
                      )}
                      {row.isDropped && (
                        <span className="text-[9px] font-bold px-1.5 py-0.2 rounded bg-status-red/15 text-status-red border border-status-red/30 font-mono">
                          Drop
                        </span>
                      )}
                    </div>

                    {/* Info Deck & Warna */}
                    <div className="flex items-center gap-1.5 mt-0.5 min-w-0 flex-wrap">
                      {row.deckName ? (
                        <>
                          <span className="text-[11px] text-dark-text font-medium truncate max-w-[150px]">
                            {row.deckName}
                          </span>
                          <div className="flex items-center gap-0.5">
                            {row.deckColors?.map((c) => {
                              const s = DECK_COLOR_STYLES[c];
                              return (
                                <span
                                  key={c}
                                  className={`text-[8px] px-1 py-0.1 rounded-full border ${
                                    s ? `${s.bg} ${s.text} ${s.border}` : ''
                                  }`}
                                >
                                  {c}
                                </span>
                              );
                            })}
                          </div>
                        </>
                      ) : (
                        <span className="text-[11px] text-dark-muted italic">
                          Deck belum diisi
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Poin Besar di Kanan */}
                <div className="text-right flex-shrink-0">
                  <span className="font-mono text-body font-bold text-accent">
                    {row.points} Pts
                  </span>
                </div>
              </div>

              {/* Baris Bawah: W-L dan Tiebreaker */}
              <div className="pl-8 flex items-center justify-between text-[10px] font-mono text-dark-muted pt-0.5 border-t border-dark-border/40">
                <span>
                  {row.wins}M-{row.losses}K
                </span>
                <span className="truncate">
                  OMW {row.omw.toFixed(1)}% &bull; GW {row.gw.toFixed(1)}% &bull; OGW {row.ogw.toFixed(1)}%
                </span>
              </div>
            </div>
          );
        })}
      </div>

      {/* Tombol Tampilkan Semua bila peserta > 16 */}
      {totalCount > DEFAULT_DISPLAY_LIMIT && (
        <Button
          variant="secondary"
          fullWidth
          className="!min-h-[34px] !text-caption mt-1"
          onClick={() => setShowAll((prev) => !prev)}
          icon={showAll ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
        >
          {showAll ? 'Tampilkan lebih sedikit' : `Tampilkan semua (${totalCount})`}
        </Button>
      )}
    </Card>
  );
};
