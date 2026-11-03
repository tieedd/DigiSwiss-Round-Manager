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
  getTournamentParticipations
} from '../../services/participationService';
import {
  calculateDeckFillProgress,
  generateStandingsCsv,
  generateStandingsText
} from '../../utils/deckExportLogic';
import { exportStandingsToImage } from '../../utils/canvasExport';
import { DeckColorDots } from '../../components/common/DeckColorDots';
import { DeckRegistrationModal } from './DeckRegistrationModal';
import { useToast } from '../../context/ToastContext';
import { saveFileNative, copyTextNative } from '../../services/nativeBridge';
import {
  Trophy,
  Award,
  Layers,
  Download,
  FileSpreadsheet,
  FileText,
  Image as ImageIcon,
  CheckCircle2,
  AlertCircle,
  Copy,
  Check,
  Edit2
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

  // Modal edit deck
  const [selectedParticipation, setSelectedParticipation] = useState<Participation | null>(null);
  const [deckModalOpen, setDeckModalOpen] = useState(false);

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
    if (tournament.finalized) {
      fetchParticipations();
    }
  }, [tournament.id, tournament.finalized]);

  // Handler Finalisasi Hasil oleh Organizer
  const handleFinalize = async () => {
    if (!currentUser) return;
    setErrorMsg(null);
    setFinalizing(true);
    try {
      await finalizeTournamentResults(
        tournament,
        players,
        matches,
        currentUser.uid,
        userProfile?.displayName || userProfile?.username || 'Organizer'
      );
      await fetchParticipations();
      onTournamentUpdated?.();
    } catch (err: any) {
      setErrorMsg(err.message || 'Gagal melakukan finalisasi hasil turnamen.');
    } finally {
      setFinalizing(false);
    }
  };

  // Ekspor CSV
  const handleExportCsv = async () => {
    if (participations.length === 0) return;
    const csvContent = generateStandingsCsv(tournament.name, participations);
    const fileName = `Hasil-${tournament.name.replace(/\s+/g, '_')}.csv`;
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
    const textContent = generateStandingsText(
      tournament.name,
      tournament.date,
      tournament.format,
      participations
    );
    const copyRes = await copyTextNative(textContent);
    if (copyRes.ok) {
      setCopySuccess(true);
      setTimeout(() => setCopySuccess(false), 2500);
      showToastSuccess('Ekspor berhasil', 'Teks ringkasan berhasil disalin.');
    } else {
      // Fallback download .txt
      const fileName = `Hasil-${tournament.name.replace(/\s+/g, '_')}.txt`;
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
    const dataUrl = exportStandingsToImage(
      tournament.name,
      tournament.date,
      tournament.format,
      participations
    );
    if (!dataUrl) return;
    const fileName = `Hasil-${tournament.name.replace(/\s+/g, '_')}.png`;
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
                  Seluruh ronde telah tuntas dipertandingkan. Organizer dapat melakukan finalisasi hasil resmi untuk membuka pengisian deck pemain dan ekspor laporan.
                </p>
              </div>
            </div>

            {isOrganizer && (
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
                <div className="flex items-center gap-2">
                  <Award className="text-accent" size={20} />
                  <h3 className="text-body font-bold text-dark-text">
                    Hasil Akhir Resmi Turnamen
                  </h3>
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-status-green/10 text-status-green border border-status-green/20">
                    Finalized
                  </span>
                </div>
                <p className="text-caption text-dark-muted mt-0.5">
                  Hasil resmi tercatat di riwayat partisipasi pemain.
                </p>
              </div>

              {/* Penghitung Progres Deck */}
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
            </div>

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
                            Poin: <strong className="text-accent">{p.points}</strong> • Match: {p.wins}M - {p.losses}K • OMW: {p.omw}%
                          </span>
                        </div>
                      </div>

                      {/* Info Deck & Tombol Aksi */}
                      <div className="flex items-center justify-between sm:justify-end gap-2.5 pt-1 sm:pt-0 border-t sm:border-t-0 border-dark-border">
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

                        {/* Tombol Input/Edit Deck */}
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
                      </div>
                    </div>
                  </Card>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Modal Pendaftaran Deck */}
      <DeckRegistrationModal
        isOpen={deckModalOpen}
        onClose={() => {
          setDeckModalOpen(false);
          setSelectedParticipation(null);
        }}
        participation={selectedParticipation}
        actorId={currentUser?.uid || ''}
        actorName={userProfile?.displayName || userProfile?.username || 'User'}
        isOrganizer={isOrganizer}
        onDeckUpdated={fetchParticipations}
      />
    </div>
  );
};
