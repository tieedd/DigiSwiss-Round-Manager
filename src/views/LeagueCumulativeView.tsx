import React, { useEffect, useMemo, useState } from 'react';
import { Tournament, Participation } from '../types';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { Card } from '../components/common/Card';
import { Button } from '../components/common/Button';
import { Input } from '../components/common/Input';
import { EmptyState } from '../components/common/EmptyState';
import { getFinishedLeagueDataForCumulative } from '../services/participationService';
import {
  buildLeagueCumulativeExportFileName,
  computeLeagueCumulativeStandings,
  extractLeagueOrganizers,
  generateLeagueCumulativeCsv,
  generateLeagueCumulativeText,
} from '../utils/leagueCumulativeLogic';
import { exportLeagueCumulativeToImage } from '../utils/canvasCumulativeExport';
import { formatSeasonLabel } from '../utils/seasonLogic';
import { formatIndonesianFullDate } from '../utils/exportFormatLogic';
import { getCurrentTheme } from '../utils/themeLogic';
import { copyTextNative, saveFileNative } from '../services/nativeBridge';
import {
  Trophy,
  RefreshCw,
  Search,
  Image as ImageIcon,
  FileText,
  FileSpreadsheet,
  Calendar,
  Award,
  Users,
  Layers,
} from 'lucide-react';

interface LeagueCumulativeViewProps {
  compact?: boolean;
  initialOrganizerId?: string;
}

export const LeagueCumulativeView: React.FC<LeagueCumulativeViewProps> = ({
  compact = false,
  initialOrganizerId,
}) => {
  const { currentUser } = useAuth();
  const toast = useToast();

  const [tournaments, setTournaments] = useState<Tournament[]>([]);
  const [participations, setParticipations] = useState<Participation[]>([]);
  const [selectedOrganizerId, setSelectedOrganizerId] = useState<string>('');
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [exportingType, setExportingType] = useState<'png' | 'txt' | 'csv' | null>(null);

  const fetchData = async () => {
    setLoading(true);
    setErrorMsg(null);
    try {
      const res = await getFinishedLeagueDataForCumulative();
      setTournaments(res.tournaments);
      setParticipations(res.participations);
    } catch (err: any) {
      console.error('Gagal memuat data poin liga lintas season:', err);
      setErrorMsg(err?.message || 'Gagal memuat data liga lintas season.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const organizers = useMemo(
    () => extractLeagueOrganizers(tournaments),
    [tournaments]
  );

  useEffect(() => {
    if (organizers.length === 0) {
      setSelectedOrganizerId('');
      return;
    }
    const stillValid = organizers.some((o) => o.organizerId === selectedOrganizerId);
    if (stillValid) return;

    if (
      initialOrganizerId &&
      organizers.some((o) => o.organizerId === initialOrganizerId)
    ) {
      setSelectedOrganizerId(initialOrganizerId);
      return;
    }

    if (
      currentUser?.uid &&
      organizers.some((o) => o.organizerId === currentUser.uid)
    ) {
      setSelectedOrganizerId(currentUser.uid);
      return;
    }

    setSelectedOrganizerId(organizers[0].organizerId);
  }, [organizers, selectedOrganizerId, initialOrganizerId, currentUser?.uid]);

  const summary = useMemo(() => {
    if (!selectedOrganizerId) return null;
    return computeLeagueCumulativeStandings(
      tournaments,
      participations,
      selectedOrganizerId
    );
  }, [tournaments, participations, selectedOrganizerId]);

  const filteredStandings = useMemo(() => {
    if (!summary) return [];
    const q = searchQuery.trim().toLowerCase();
    if (!q) return summary.standings;
    return summary.standings.filter((row) =>
      row.playerName.toLowerCase().includes(q)
    );
  }, [summary, searchQuery]);

  const handleExportPng = async () => {
    if (!summary || summary.standings.length === 0) return;
    setExportingType('png');
    try {
      const dataUrl = exportLeagueCumulativeToImage({
        summary,
        theme: getCurrentTheme(),
      });
      if (!dataUrl) {
        toast.error('Peramban tidak mendukung ekspor gambar.');
        return;
      }
      const fileName = buildLeagueCumulativeExportFileName(
        summary.organizerName,
        'png'
      );
      const res = await saveFileNative(fileName, 'image/png', dataUrl);
      if (res.ok) {
        toast.success(res.message || `Gambar ${fileName} berhasil disimpan.`);
      } else {
        toast.error(res.message || 'Gagal menyimpan gambar.');
      }
    } catch (err: any) {
      toast.error(err?.message || 'Gagal mengekspor gambar.');
    } finally {
      setExportingType(null);
    }
  };

  const handleExportText = async () => {
    if (!summary || summary.standings.length === 0) return;
    setExportingType('txt');
    try {
      const text = generateLeagueCumulativeText(summary);
      const res = await copyTextNative(text);
      if (res.ok) {
        toast.success(res.message || 'Ringkasan teks berhasil disalin.');
      } else {
        const fileName = buildLeagueCumulativeExportFileName(
          summary.organizerName,
          'txt'
        );
        const fileRes = await saveFileNative(fileName, 'text/plain', text);
        if (fileRes.ok) {
          toast.success(fileRes.message);
        } else {
          toast.error(res.message || 'Gagal menyalin teks.');
        }
      }
    } catch (err: any) {
      toast.error(err?.message || 'Gagal mengekspor teks.');
    } finally {
      setExportingType(null);
    }
  };

  const handleExportCsv = async () => {
    if (!summary || summary.standings.length === 0) return;
    setExportingType('csv');
    try {
      const csv = generateLeagueCumulativeCsv(summary);
      const fileName = buildLeagueCumulativeExportFileName(
        summary.organizerName,
        'csv'
      );
      const res = await saveFileNative(fileName, 'text/csv;charset=utf-8', csv);
      if (res.ok) {
        toast.success(res.message || `CSV ${fileName} berhasil disimpan.`);
      } else {
        toast.error(res.message || 'Gagal menyimpan file CSV.');
      }
    } catch (err: any) {
      toast.error(err?.message || 'Gagal mengekspor CSV.');
    } finally {
      setExportingType(null);
    }
  };

  return (
    <div className="flex flex-col gap-3.5">
      {!compact && (
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0">
            <h2 className="text-section-title text-dark-text font-semibold flex items-center gap-2">
              <Award className="text-accent" size={20} />
              Poin Liga Lintas Season
            </h2>
            <p className="text-caption text-dark-muted">
              Akumulasi poin Hasil Akhir seluruh Turnamen Liga selesai per organizer
            </p>
          </div>
          <Button
            variant="secondary"
            className="!min-h-[36px] !px-2.5 !text-caption flex-shrink-0"
            onClick={fetchData}
            icon={<RefreshCw size={15} className={loading ? 'animate-spin' : ''} />}
            title="Segarkan Data Liga"
          />
        </div>
      )}

      {compact && (
        <div className="flex items-center justify-between gap-2">
          <p className="text-caption text-dark-muted">
            Total poin Hasil Akhir (Swiss + Top Cut) dari Liga yang sudah selesai.
          </p>
          <Button
            variant="secondary"
            className="!min-h-[32px] !px-2.5 !text-[11px] flex-shrink-0"
            onClick={fetchData}
            icon={<RefreshCw size={14} className={loading ? 'animate-spin' : ''} />}
            title="Segarkan"
          />
        </div>
      )}

      {errorMsg && (
        <Card variant="surface" className="border-status-red/40 bg-status-red/10 text-status-red text-caption p-3">
          {errorMsg}
        </Card>
      )}

      {loading ? (
        <Card variant="surface" className="text-center py-8 text-caption text-dark-muted flex flex-col items-center gap-2">
          <RefreshCw size={20} className="animate-spin text-accent" />
          <span>Menghitung akumulasi poin liga lintas season...</span>
        </Card>
      ) : organizers.length === 0 ? (
        <Card variant="surface" className="my-1">
          <EmptyState
            icon={Trophy}
            message="Belum ada Turnamen Liga yang berstatus selesai untuk dihitung poin lintas season-nya."
          />
        </Card>
      ) : (
        <>
          {/* Pilih Organizer */}
          <div className="flex flex-col gap-1.5">
            <label className="text-caption font-medium text-dark-muted">
              Pilih Organizer Liga:
            </label>
            <select
              value={selectedOrganizerId}
              onChange={(e) => setSelectedOrganizerId(e.target.value)}
              className="w-full bg-dark-surface border border-dark-border rounded-btn px-3 py-2 text-caption text-dark-text focus:outline-none focus:border-accent"
            >
              {organizers.map((org) => (
                <option key={org.organizerId} value={org.organizerId}>
                  {org.organizerName} ({org.tournamentsCount} Season Selesai)
                </option>
              ))}
            </select>
          </div>

          {summary && (
            <>
              {/* Ringkasan & Daftar Season */}
              <Card variant="surface-high" className="p-3 flex flex-col gap-2.5 border-accent/25">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="text-[10px] font-mono font-bold px-1.5 py-0.5 rounded bg-accent/15 text-accent border border-accent/40">
                      LIGA
                    </span>
                    <span className="text-body font-semibold text-dark-text truncate">
                      {summary.organizerName}
                    </span>
                  </div>
                  <div className="flex items-center gap-3 text-[11px] font-mono text-dark-muted">
                    <span className="flex items-center gap-1">
                      <Layers size={12} className="text-accent" />
                      <strong className="text-dark-text">{summary.tournaments.length}</strong> Season
                    </span>
                    <span className="flex items-center gap-1">
                      <Users size={12} className="text-accent" />
                      <strong className="text-dark-text">{summary.standings.length}</strong> Pemain
                    </span>
                  </div>
                </div>

                {/* Daftar Season yang Dihitung */}
                <div className="flex flex-wrap gap-1.5">
                  {summary.tournaments.map((t) => {
                    const sLabel = formatSeasonLabel(t.season) || t.name;
                    return (
                      <span
                        key={t.id}
                        className="inline-flex items-center gap-1 text-[10px] font-mono px-2 py-0.5 rounded bg-dark-bg/70 border border-dark-border text-dark-muted"
                        title={`${t.name} • ${formatIndonesianFullDate(t.date)}`}
                      >
                        <Calendar size={10} className="text-accent flex-shrink-0" />
                        <span className="text-dark-text font-semibold">{sLabel}</span>
                        <span>• {formatIndonesianFullDate(t.date)}</span>
                      </span>
                    );
                  })}
                </div>

                {/* Tombol Ekspor */}
                {summary.standings.length > 0 && (
                  <div className="pt-2 border-t border-dark-border/60 flex items-center gap-2 flex-wrap">
                    <Button
                      variant="secondary"
                      className="!min-h-[34px] !px-2.5 !text-[11px] flex-1"
                      onClick={handleExportPng}
                      isLoading={exportingType === 'png'}
                      icon={<ImageIcon size={14} />}
                    >
                      Gambar (PNG)
                    </Button>
                    <Button
                      variant="secondary"
                      className="!min-h-[34px] !px-2.5 !text-[11px] flex-1"
                      onClick={handleExportText}
                      isLoading={exportingType === 'txt'}
                      icon={<FileText size={14} />}
                    >
                      Salin Teks
                    </Button>
                    <Button
                      variant="secondary"
                      className="!min-h-[34px] !px-2.5 !text-[11px] flex-1"
                      onClick={handleExportCsv}
                      isLoading={exportingType === 'csv'}
                      icon={<FileSpreadsheet size={14} />}
                    >
                      CSV
                    </Button>
                  </div>
                )}
              </Card>

              {/* Pencarian Pemain */}
              {summary.standings.length > 0 && (
                <Input
                  placeholder="Cari nama pemain di klasemen liga..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  leftIcon={<Search size={16} />}
                />
              )}

              {/* Daftar Peringkat Akumulasi */}
              {filteredStandings.length === 0 ? (
                <Card variant="surface" className="my-1">
                  <EmptyState
                    icon={Trophy}
                    message={
                      searchQuery.trim()
                        ? 'Tidak ada pemain yang cocok dengan pencarian.'
                        : 'Belum ada data poin peserta pada Turnamen Liga organizer ini.'
                    }
                  />
                </Card>
              ) : (
                <div className="flex flex-col gap-2">
                  {filteredStandings.map((row) => {
                    const isTop3 = row.rank <= 3;
                    const isMe = Boolean(currentUser?.uid && row.uid === currentUser.uid);

                    return (
                      <Card
                        key={row.playerKey}
                        variant="surface"
                        className={`p-3 flex flex-col gap-2 ${
                          isTop3 ? 'border-l-4 border-l-accent' : ''
                        } ${isMe ? 'border-accent/60 bg-accent/5' : ''}`}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-3 min-w-0">
                            <div
                              className={`w-8 h-8 rounded-full flex items-center justify-center font-mono font-bold text-caption flex-shrink-0 ${
                                row.rank === 1
                                  ? 'bg-accent-solid text-[#0B0F14] shadow-sm'
                                  : row.rank === 2
                                  ? 'bg-dark-surface-high text-accent border border-accent/50'
                                  : row.rank === 3
                                  ? 'bg-dark-surface-high text-dark-text border border-accent/30'
                                  : 'bg-dark-surface-high text-dark-muted border border-dark-border'
                              }`}
                            >
                              {row.rank}
                            </div>

                            <div className="min-w-0">
                              <div className="flex items-center gap-1.5 flex-wrap">
                                <span className="text-body font-semibold text-dark-text truncate">
                                  {row.playerName}
                                </span>
                                {isMe && (
                                  <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-accent/20 text-accent">
                                    Anda
                                  </span>
                                )}
                              </div>
                              <span className="text-[11px] font-mono text-dark-muted block">
                                Total: <strong className="text-dark-text">{row.totalWins}W - {row.totalLosses}L</strong>
                                {' • '}
                                {row.seasonsCount} Season
                              </span>
                            </div>
                          </div>

                          <div className="text-right flex-shrink-0">
                            <span className="font-mono text-xl font-bold text-accent block leading-none">
                              {row.totalPoints}
                            </span>
                            <span className="text-[10px] font-mono text-dark-muted uppercase">
                              Total Pts
                            </span>
                          </div>
                        </div>

                        {/* Rincian Per Season */}
                        <div className="flex flex-wrap gap-1.5 pt-1.5 border-t border-dark-border/60">
                          {row.seasonBreakdown.map((sb) => (
                            <span
                              key={sb.tournamentId}
                              className="text-[10px] font-mono px-2 py-0.5 rounded bg-dark-bg/60 border border-dark-border text-dark-muted"
                            >
                              <strong className="text-dark-text">{sb.seasonLabel}</strong>:{' '}
                              <span className="text-accent font-semibold">{sb.points} Pts</span>{' '}
                              ({sb.wins}W-{sb.losses}L, #{sb.rank}
                              {sb.topCutResult ? `, ${sb.topCutResult}` : ''})
                            </span>
                          ))}
                        </div>
                      </Card>
                    );
                  })}
                </div>
              )}
            </>
          )}
        </>
      )}
    </div>
  );
};
