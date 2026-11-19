import React, { useState, useEffect } from 'react';
import {
  Tournament,
  Participation,
  TournamentPlayer,
  TournamentMatch,
  DeckColor
} from '../../types';
import { useAuth } from '../../context/AuthContext';
import { Card } from '../../components/common/Card';
import { Button } from '../../components/common/Button';
import {
  finalizeTournamentResults,
  getTournamentParticipations,
  recalculateLeagueFinalRecords,
  syncLeagueParticipationsDecksFromRegistration,
  updateParticipationLeagueDecksIfExists
} from '../../services/participationService';
import {
  calculateDeckFillProgress,
  generateStandingsCsv,
  generateStandingsText
} from '../../utils/deckExportLogic';
import { exportStandingsToImage } from '../../utils/canvasExport';
import { DeckColorDots } from '../../components/common/DeckColorDots';
import { DeckRegistrationModal } from './DeckRegistrationModal';
import { LeagueDeckModal } from './LeagueDeckModal';
import { LeagueDecksChips } from '../../components/tournaments/LeagueDecksChips';
import { LeagueSeasonBadge } from '../../components/tournaments/LeagueSeasonBadge';
import { ConfirmSheet } from '../../components/common/ConfirmSheet';
import {
  buildTournamentExportFileName,
  formatSeasonLabel,
  isLeagueTournament
} from '../../utils/seasonLogic';
import { hasValidParticipationTwoDecks } from '../../utils/leagueFinalDecksLogic';
import {
  formatFinalRecordBreakdown,
  needsLeagueFinalRecordRecalc
} from '../../utils/finalRecordLogic';
import { useToast } from '../../context/ToastContext';
import { saveFileNative, copyTextNative } from '../../services/nativeBridge';
import {
  Trophy,
  Award,
  Layers,
  FileSpreadsheet,
  FileText,
  Image as ImageIcon,
  AlertCircle,
  Check,
  Edit2,
  RefreshCw,
  AlertTriangle
} from 'lucide-react';

interface FinalResultsSectionProps {
  tournament: Tournament;
  players: TournamentPlayer[];
  matches: TournamentMatch[];
  isOrganizer: boolean;
  onTournamentUpdated?: () => void;
}

export const FinalResultsSection: React.FC<FinalResultsSectionProps> = ({
  tournament,
  players,
  matches,
  isOrganizer,
  onTournamentUpdated
}) => {
  const { currentUser, userProfile } = useAuth();
  const { success: showToastSuccess, error: showToastError } = useToast();
  const [participations, setParticipations] = useState<Participation[]>([]);
  const [loading, setLoading] = useState(false);
  const [finalizing, setFinalizing] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [copySuccess, setCopySuccess] = useState(false);

  // Modal edit deck (Reguler & Liga)
  const [selectedParticipation, setSelectedParticipation] = useState<Participation | null>(null);
  const [deckModalOpen, setDeckModalOpen] = useState(false);
  const [leagueDeckTarget, setLeagueDeckTarget] = useState<Participation | null>(null);

  // Sync & ringkasan peserta tanpa deck pada Turnamen Liga
  const [finalizeMissingDeckPlayers, setFinalizeMissingDeckPlayers] = useState<string[]>([]);
  const [syncConfirmOpen, setSyncConfirmOpen] = useState(false);
  const [syncLoading, setSyncLoading] = useState(false);

  // Muat data participations jika turnamen sudah finalized
  const fetchParticipations = async () => {
    setLoading(true);
    try {
      const data = await getTournamentParticipations(tournament.id);
      setParticipations(data);
    } catch (err) {
      console.error('Gagal mengambil data partisipasi:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    setFinalizeMissingDeckPlayers([]);
    if (tournament.finalized) {
      fetchParticipations();
    } else {
      setParticipations([]);
    }
  }, [tournament.id, tournament.finalized]);

  const isLeague = isLeagueTournament(tournament);
  const canManageLeague = isOrganizer || userProfile?.role === 'admin';
  const seasonLabel = formatSeasonLabel(tournament.season);

  // Handler Finalisasi Hasil oleh Organizer
  const handleFinalize = async () => {
    if (!currentUser) return;
    setErrorMsg(null);
    setFinalizing(true);
    try {
      const result = await finalizeTournamentResults(
        tournament,
        players,
        matches,
        currentUser.uid,
        userProfile?.displayName || userProfile?.username || 'Organizer'
      );
      setFinalizeMissingDeckPlayers(result.missingDeckPlayers || []);
      if (isLeague && result.missingDeckPlayers.length > 0) {
        showToastError(
          'Finalisasi selesai dengan catatan',
          `${result.missingDeckPlayers.length} peserta belum memiliki 2 deck: ${result.missingDeckPlayers.join(', ')}`
        );
      } else {
        showToastSuccess('Finalisasi berhasil', `Hasil resmi untuk ${result.count} peserta telah disimpan.`);
      }
      await fetchParticipations();
      onTournamentUpdated?.();
    } catch (err: any) {
      setErrorMsg(err.message || 'Gagal melakukan finalisasi hasil turnamen.');
    } finally {
      setFinalizing(false);
    }
  };

  const handleConfirmSyncLeagueData = async () => {
    if (!currentUser || syncLoading) return;
    setSyncLoading(true);
    try {
      const actor = {
        uid: currentUser.uid,
        name: userProfile?.displayName || userProfile?.username || 'Organizer'
      };
      const doDeckSync = leagueParticipationsNeedingSync.length > 0;
      const doRecordRecalc = needsRecordRecalc;

      let syncedCount = 0;
      let missingPlayers: string[] = [];
      let recalculatedCount = 0;

      if (doDeckSync) {
        const deckRes = await syncLeagueParticipationsDecksFromRegistration(
          tournament,
          participations,
          actor
        );
        syncedCount = deckRes.syncedCount;
        missingPlayers = deckRes.missingPlayers;
      }

      if (doRecordRecalc) {
        const recalcRes = await recalculateLeagueFinalRecords(
          tournament,
          participations,
          actor,
          matches,
          players
        );
        recalculatedCount = recalcRes.updatedCount;
      }

      setSyncConfirmOpen(false);
      await fetchParticipations();
      onTournamentUpdated?.();

      const partsSummary: string[] = [];
      if (recalculatedCount > 0) {
        partsSummary.push(`${recalculatedCount} rekor final (Swiss + Top Cut) dihitung ulang`);
      }
      if (syncedCount > 0) {
        partsSummary.push(`${syncedCount} partisipasi diperbarui dengan 2 deck pendaftaran`);
      }

      if (partsSummary.length > 0) {
        const extra =
          missingPlayers.length > 0
            ? ` (${missingPlayers.length} peserta belum punya 2 deck di pendaftaran: ${missingPlayers.join(', ')})`
            : '';
        showToastSuccess(
          doRecordRecalc && !doDeckSync ? 'Rekor final diperbarui' : 'Sinkronisasi berhasil',
          `${partsSummary.join(' dan ')}.${extra}`
        );
      } else if (missingPlayers.length > 0) {
        showToastError(
          'Tidak ada data deck baru',
          `Peserta berikut belum mengisi 2 deck di pendaftaran: ${missingPlayers.join(', ')}`
        );
      } else {
        showToastSuccess('Sudah sinkron', 'Data hasil akhir liga sudah sesuai.');
      }
    } catch (err: any) {
      showToastError('Pembaruan gagal', err?.message || 'Gagal memperbarui data hasil akhir liga.');
    } finally {
      setSyncLoading(false);
    }
  };

  // Ekspor CSV
  const handleExportCsv = async () => {
    if (participations.length === 0) return;
    const csvContent = generateStandingsCsv(tournament.name, participations, {
      seasonLabel,
      isLeague
    });
    const fileName = buildTournamentExportFileName(tournament, 'csv');
    const res = await saveFileNative(fileName, 'text/csv', csvContent);
    if (res.ok) {
      showToastSuccess('Ekspor berhasil', `File ${res.fileName} tersimpan di folder Unduhan.`);
    } else {
      showToastError('Ekspor gagal', res.message || 'Gagal menyimpan file CSV.');
    }
  };

  // Ekspor Teks (Salin ke Clipboard & Download TXT)
  const handleCopyText = async () => {
    if (participations.length === 0) return;
    const textContent = generateStandingsText({
      tournamentName: tournament.name,
      tournamentDate: tournament.date,
      format: tournament.format,
      participations,
      organizerName: tournament.organizerName,
      location: tournament.location,
      seasonLabel,
      isLeague
    });
    const copyRes = await copyTextNative(textContent);
    if (copyRes.ok) {
      setCopySuccess(true);
      setTimeout(() => setCopySuccess(false), 2500);
      showToastSuccess('Ekspor berhasil', 'Teks ringkasan berhasil disalin.');
    } else {
      // Fallback download .txt
      const fileName = buildTournamentExportFileName(tournament, 'txt');
      const res = await saveFileNative(fileName, 'text/plain', textContent);
      if (res.ok) {
        showToastSuccess('Ekspor berhasil', `File ${res.fileName} tersimpan di folder Unduhan.`);
      } else {
        showToastError('Gagal menyalin atau mengekspor teks.');
      }
    }
  };

  // Ekspor Gambar (PNG via Canvas)
  const handleExportImage = async () => {
    if (participations.length === 0) return;
    const dataUrl = exportStandingsToImage({
      tournamentName: tournament.name,
      tournamentDate: tournament.date,
      format: tournament.format,
      participations,
      organizerName: tournament.organizerName,
      location: tournament.location,
      seasonLabel,
      isLeague
    });
    if (!dataUrl) return;
    const fileName = buildTournamentExportFileName(tournament, 'png');
    const res = await saveFileNative(fileName, 'image/png', dataUrl);
    if (res.ok) {
      showToastSuccess('Ekspor berhasil', `File ${res.fileName} tersimpan di folder Unduhan.`);
    } else {
      showToastError('Ekspor gagal', res.message || 'Gagal menyimpan gambar PNG.');
    }
  };

  // Buka modal deck
  const handleOpenDeckModal = (p: Participation) => {
    setSelectedParticipation(p);
    setDeckModalOpen(true);
  };

  const progress = calculateDeckFillProgress(participations);
  const leagueParticipationsNeedingSync = isLeague
    ? participations.filter((p) => !hasValidParticipationTwoDecks(p))
    : [];
  const needsDeckSync = isLeague && leagueParticipationsNeedingSync.length > 0;
  const needsRecordRecalc = needsLeagueFinalRecordRecalc(tournament, participations);
  const showLeagueMaintenanceAction = isLeague && canManageLeague && (needsDeckSync || needsRecordRecalc);

  return (
    <div className="flex flex-col gap-4 mt-2">
      {/* Jika turnamen selesai tapi belum difinalisasi */}
      {!tournament.finalized && (
        <Card variant="surface-high" className="p-4 flex flex-col gap-3 border-accent/40 bg-accent/5">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-start gap-2.5">
              <Trophy size={24} className="text-accent flex-shrink-0 mt-0.5" />
              <div>
                <h3 className="text-body font-semibold text-dark-text">
                  Turnamen Telah Selesai
                </h3>
                <p className="text-caption text-dark-muted mt-0.5">
                  {isLeague
                    ? 'Seluruh ronde telah tuntas dipertandingkan. Organizer dapat melakukan finalisasi hasil resmi untuk menyalin 2 deck pendaftaran dan membuka ekspor laporan.'
                    : 'Seluruh ronde telah tuntas dipertandingkan. Organizer dapat melakukan finalisasi hasil resmi untuk membuka pengisian deck pemain dan ekspor laporan.'}
                </p>
              </div>
            </div>

            {canManageLeague && (
              <Button
                variant="primary"
                className="!min-h-[38px] !px-4 !text-caption whitespace-nowrap shadow-md"
                onClick={handleFinalize}
                isLoading={finalizing}
                icon={<Award size={16} />}
              >
                Finalisasi Hasil
              </Button>
            )}
          </div>

          {errorMsg && (
            <div className="p-2.5 rounded bg-status-red/10 border border-status-red/30 text-status-red text-caption flex items-center gap-2">
              <AlertCircle size={15} />
              <span>{errorMsg}</span>
            </div>
          )}
        </Card>
      )}

      {/* Jika turnamen sudah difinalisasi: Tampilkan Hasil Akhir & Deck */}
      {tournament.finalized && (
        <div className="flex flex-col gap-3">
          {/* Header Hasil Akhir & Progres Deck */}
          <Card variant="surface-high" className="p-3.5 flex flex-col gap-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-dark-border pb-3">
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <Award className="text-accent" size={20} />
                  <h3 className="text-body font-bold text-dark-text">
                    Hasil Akhir Resmi Turnamen
                  </h3>
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-status-green/10 text-status-green border border-status-green/20">
                    Finalized
                  </span>
                </div>
                <LeagueSeasonBadge tournament={tournament} compact className="mt-1" />
                <p className="text-caption text-dark-muted mt-0.5">
                  Hasil resmi tercatat di riwayat partisipasi pemain.
                </p>
              </div>

              {/* Penghitung Progres Deck (hanya untuk Turnamen Reguler) */}
              {!isLeague && (
                <div className="flex items-center gap-2 bg-dark-surface px-3 py-1.5 rounded-card border border-dark-border">
                  <Layers size={16} className="text-accent" />
                  <div className="flex flex-col">
                    <span className="text-[11px] text-dark-muted leading-tight">
                      Pengisian Deck
                    </span>
                    <span className="text-caption font-bold font-mono text-dark-text leading-tight">
                      {progress.filled} dari {progress.total} deck sudah diisi{' '}
                      <span className="text-accent text-[11px]">({progress.percentage}%)</span>
                    </span>
                  </div>
                </div>
              )}

              {/* Tombol Sinkronisasi 2 Deck Liga & Hitung Ulang Rekor Final untuk data lama */}
              {showLeagueMaintenanceAction && (
                <Button
                  variant="secondary"
                  className="!min-h-[36px] !px-3 !text-caption border-amber-400/40 bg-amber-500/10 text-amber-200 hover:bg-amber-500/20"
                  onClick={() => setSyncConfirmOpen(true)}
                  icon={<RefreshCw size={14} />}
                >
                  {needsDeckSync && needsRecordRecalc
                    ? 'Sinkronkan Deck & Hitung Ulang Rekor'
                    : needsRecordRecalc
                    ? 'Hitung Ulang Rekor Final'
                    : 'Sinkronkan Deck dari Pendaftaran'}
                </Button>
              )}
            </div>

            {isLeague &&
              (finalizeMissingDeckPlayers.length > 0 ||
                leagueParticipationsNeedingSync.length > 0 ||
                needsRecordRecalc) && (
                <div className="p-2.5 rounded-btn bg-status-yellow/10 border border-status-yellow/30 text-[11px] text-status-yellow flex items-start gap-2">
                  <AlertTriangle size={14} className="flex-shrink-0 mt-0.5" />
                  <div className="flex flex-col gap-0.5">
                    {(finalizeMissingDeckPlayers.length > 0 ||
                      leagueParticipationsNeedingSync.length > 0) && (
                      <span>
                        {finalizeMissingDeckPlayers.length > 0
                          ? `Peserta tanpa data 2 deck saat finalisasi: ${finalizeMissingDeckPlayers.join(', ')}.`
                          : `${leagueParticipationsNeedingSync.length} peserta belum memiliki 2 deck pada hasil akhir.`}
                      </span>
                    )}
                    {needsRecordRecalc && (
                      <span>
                        Rekor babak Top Cut belum terhitung pada hasil akhir lama. Organizer dapat menekan "Hitung Ulang Rekor Final" untuk memperbarui total W-L dan poin (Swiss + Top Cut).
                      </span>
                    )}
                  </div>
                </div>
              )}

            {/* Bilah Tombol Ekspor (Gambar, Teks, CSV) */}
            <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
              <span className="text-caption font-medium text-dark-muted">
                Ekspor Hasil Akhir:
              </span>

              <div className="flex items-center gap-1.5 flex-wrap">
                <Button
                  variant="secondary"
                  className="!min-h-[34px] !px-3 !text-[11px]"
                  onClick={handleExportImage}
                  icon={<ImageIcon size={14} className="text-amber-400" />}
                >
                  Gambar (PNG)
                </Button>
                <Button
                  variant="secondary"
                  className="!min-h-[34px] !px-3 !text-[11px]"
                  onClick={handleCopyText}
                  icon={
                    copySuccess ? (
                      <Check size={14} className="text-status-green" />
                    ) : (
                      <FileText size={14} className="text-sky-400" />
                    )
                  }
                >
                  {copySuccess ? 'Tersalin!' : 'Teks Ringkasan'}
                </Button>
                <Button
                  variant="secondary"
                  className="!min-h-[34px] !px-3 !text-[11px]"
                  onClick={handleExportCsv}
                  icon={<FileSpreadsheet size={14} className="text-emerald-400" />}
                >
                  Spreadsheet (CSV)
                </Button>
              </div>
            </div>
          </Card>

          {/* Daftar Partisipasi Pemain & Pengisian Deck */}
          {loading ? (
            <Card variant="surface" className="text-center py-6 text-caption text-dark-muted">
              Memuat hasil partisipasi...
            </Card>
          ) : (
            <div className="flex flex-col gap-2">
              {participations.map((p) => {
                const isCurrentUser = currentUser?.uid === p.uid;
                const canEditDeck = isOrganizer || isCurrentUser;
                const hasDeck = p.deckName && p.deckName.trim().length > 0;
                const isTop3 = p.rank <= 3;

                return (
                  <Card
                    key={p.id}
                    variant="surface"
                    className={`p-3 transition-colors ${
                      isCurrentUser ? 'border-accent/60 bg-accent/5' : ''
                    } ${isTop3 ? 'border-l-4 border-l-accent' : ''}`}
                  >
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
                      {/* Peringkat & Info Pemain */}
                      <div className="flex items-center gap-3 min-w-0">
                        <div
                          className={`w-7 h-7 rounded-full flex items-center justify-center font-mono font-bold text-caption flex-shrink-0 ${
                            p.rank === 1
                              ? 'bg-accent text-dark-bg'
                              : p.rank === 2
                              ? 'bg-accent/80 text-dark-bg'
                              : p.rank === 3
                              ? 'bg-accent/60 text-dark-bg'
                              : 'bg-dark-surface-high text-dark-muted border border-dark-border'
                          }`}
                        >
                          {p.rank}
                        </div>

                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="text-body font-semibold text-dark-text truncate">
                              {p.name}
                            </span>
                            {p.topCutResult && (
                              <span className="text-[10px] font-mono font-bold px-1.5 py-0.2 rounded bg-accent/20 text-accent border border-accent/30">
                                {p.topCutResult}
                              </span>
                            )}
                            {isCurrentUser && (
                              <span className="text-[10px] font-mono px-1 rounded bg-accent/20 text-accent">
                                Anda
                              </span>
                            )}
                            {p.isManual && (
                              <span className="text-[10px] font-mono px-1 rounded bg-dark-surface-high text-dark-muted border border-dark-border">
                                Manual
                              </span>
                            )}
                          </div>
                          <span className="text-caption text-dark-muted font-mono block">
                            Poin: <strong className="text-accent">{p.points}</strong> • Match: {p.wins}W - {p.losses}L • OMW: {p.omw}%
                            {p.swissRank !== undefined && tournament.topCut ? ` • Swiss #${p.swissRank}` : ''}
                          </span>
                          {(() => {
                            const breakdown = formatFinalRecordBreakdown(p);
                            return breakdown ? (
                              <span className="text-[11px] text-dark-muted/85 font-mono block mt-0.5">
                                {breakdown}
                              </span>
                            ) : null;
                          })()}
                        </div>
                      </div>

                      {/* Info Deck & Tombol Aksi */}
                      <div className="flex items-center justify-between sm:justify-end gap-2.5 pt-1 sm:pt-0 border-t sm:border-t-0 border-dark-border">
                        {isLeague ? (
                          <>
                            <LeagueDecksChips
                              decks={p.decks}
                              emptyLabel="Deck belum diisi"
                              className="sm:justify-end"
                            />
                            {canManageLeague && (
                              <button
                                type="button"
                                onClick={() => setLeagueDeckTarget(p)}
                                className="min-h-[32px] px-2.5 rounded-btn text-caption font-medium flex items-center gap-1 transition-colors bg-dark-surface-high hover:bg-dark-surface border border-dark-border text-dark-text shrink-0"
                              >
                                <Edit2 size={12} />
                                <span>
                                  {hasValidParticipationTwoDecks(p) ? 'Edit 2 Deck' : 'Isi 2 Deck'}
                                </span>
                              </button>
                            )}
                          </>
                        ) : (
                          <>
                            {hasDeck ? (
                              <div className="flex items-center gap-1.5 sm:justify-end min-w-0">
                                <span
                                  className="text-caption font-semibold text-dark-text truncate max-w-[130px] sm:max-w-[180px]"
                                  title={p.deckName}
                                >
                                  {p.deckName}
                                </span>
                                <DeckColorDots colors={p.deckColors} size="sm" />
                              </div>
                            ) : (
                              <span className="text-[11px] text-dark-muted italic">
                                Deck belum diisi
                              </span>
                            )}

                            {/* Tombol Input/Edit Deck Reguler */}
                            {canEditDeck && (
                              <button
                                type="button"
                                onClick={() => handleOpenDeckModal(p)}
                                className={`min-h-[32px] px-2.5 rounded-btn text-caption font-medium flex items-center gap-1 transition-colors ${
                                  hasDeck
                                    ? 'bg-dark-surface-high hover:bg-dark-surface border border-dark-border text-dark-text'
                                    : 'bg-accent/20 hover:bg-accent/30 text-accent border border-accent/40 font-semibold'
                                }`}
                              >
                                <Edit2 size={12} />
                                <span>{hasDeck ? 'Ubah' : 'Isi Deck'}</span>
                              </button>
                            )}
                          </>
                        )}
                      </div>
                    </div>
                  </Card>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Modal Pendaftaran Deck Reguler */}
      <DeckRegistrationModal
        isOpen={deckModalOpen}
        onClose={() => {
          setDeckModalOpen(false);
          setSelectedParticipation(null);
        }}
        participation={selectedParticipation}
        actorId={currentUser?.uid || ''}
        actorName={userProfile?.displayName || userProfile?.username || 'User'}
        isOrganizer={canManageLeague}
        onDeckUpdated={fetchParticipations}
      />

      {/* Modal Edit 2 Deck Liga oleh Organizer/Admin */}
      {leagueDeckTarget && currentUser && (
        <LeagueDeckModal
          isOpen={Boolean(leagueDeckTarget)}
          onClose={() => setLeagueDeckTarget(null)}
          tournamentId={tournament.id}
          tournamentName={tournament.name}
          playerId={leagueDeckTarget.playerId}
          playerName={leagueDeckTarget.name}
          playerUid={leagueDeckTarget.uid}
          initialDecks={
            hasValidParticipationTwoDecks(leagueDeckTarget)
              ? leagueDeckTarget.decks || null
              : null
          }
          isOrganizerMode={true}
          allowSkip={false}
          actor={{
            uid: currentUser.uid,
            name: userProfile?.displayName || userProfile?.username || 'Organizer'
          }}
          onSaved={async (saved) => {
            await updateParticipationLeagueDecksIfExists(
              tournament.id,
              leagueDeckTarget.playerId,
              saved.decks
            );
            await fetchParticipations();
            onTournamentUpdated?.();
          }}
        />
      )}

      {/* ConfirmSheet Sinkronisasi Deck & Hitung Ulang Rekor Final Liga */}
      <ConfirmSheet
        isOpen={syncConfirmOpen}
        title={
          needsDeckSync && needsRecordRecalc
            ? 'Sinkronkan Deck & Hitung Ulang Rekor?'
            : needsRecordRecalc
            ? 'Hitung Ulang Rekor Final Liga?'
            : 'Sinkronkan 2 Deck Liga?'
        }
        message={
          needsDeckSync && needsRecordRecalc
            ? `Hitung ulang total rekor (Swiss + Top Cut) dari seluruh pertandingan dan salin 2 deck pendaftaran ke ${leagueParticipationsNeedingSync.length} partisipasi yang belum terisi?`
            : needsRecordRecalc
            ? `Hitung ulang total W-L dan poin (Swiss + Top Cut) untuk ${participations.length} partisipasi berdasarkan seluruh pertandingan yang terkonfirmasi? Peringkat akhir, tie-breaker Swiss, dan deck tetap dipertahankan.`
            : `Salin data 2 deck peserta dari pendaftaran turnamen ke ${leagueParticipationsNeedingSync.length} hasil partisipasi yang belum memiliki 2 deck?`
        }
        confirmLabel={
          needsRecordRecalc && !needsDeckSync ? 'Ya, Hitung Ulang' : 'Ya, Perbarui'
        }
        cancelLabel="Batal"
        variant="primary"
        isLoading={syncLoading}
        zIndexClass="z-[60]"
        onConfirm={handleConfirmSyncLeagueData}
        onCancel={() => {
          if (!syncLoading) setSyncConfirmOpen(false);
        }}
      />
    </div>
  );
};
