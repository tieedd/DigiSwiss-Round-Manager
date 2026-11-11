import React, { useState } from 'react';
import { TournamentMatch, TournamentFormat } from '../../types';
import { BottomSheet } from '../../components/common/BottomSheet';
import { Button } from '../../components/common/Button';
import { Card } from '../../components/common/Card';
import { Check, AlertCircle } from 'lucide-react';

interface MatchScoreModalProps {
  isOpen: boolean;
  onClose: () => void;
  match: TournamentMatch | null;
  format: TournamentFormat;
  onSaveScore: (matchId: string, p1Score: number, p2Score: number, confirm: boolean) => Promise<void>;
}

export const MatchScoreModal: React.FC<MatchScoreModalProps> = ({
  isOpen,
  onClose,
  match,
  format,
  onSaveScore,
}) => {
  if (!match) return null;

  const [p1Score, setP1Score] = useState<number>(match.p1Score || 0);
  const [p2Score, setP2Score] = useState<number>(match.p2Score || 0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const isBye = match.p2Id === null;

  const handleSetPreset = (s1: number, s2: number) => {
    setP1Score(s1);
    setP2Score(s2);
    setError('');
  };

  const handleSubmit = async (confirm: boolean) => {
    // Validasi aturan: Tidak ada seri!
    if (!isBye) {
      if (p1Score === p2Score) {
        setError('Tidak ada hasil seri. Tentukan pemenang pertandingan.');
        return;
      }

      if (format === 'BO1') {
        const validBO1 =
          (p1Score === 1 && p2Score === 0) || (p1Score === 0 && p2Score === 1);
        if (!validBO1) {
          setError('Format BO1 hanya mengizinkan skor 1 - 0 atau 0 - 1 (Win atau Lose).');
          return;
        }
      } else {
        const validBO3 =
          (p1Score === 2 && (p2Score === 0 || p2Score === 1)) ||
          (p2Score === 2 && (p1Score === 0 || p1Score === 1));
        if (!validBO3) {
          setError('Format BO3 hanya mengizinkan skor 2-0, 2-1, 1-2, atau 0-2.');
          return;
        }
      }
    }

    setLoading(true);
    setError('');
    try {
      await onSaveScore(match.id, p1Score, p2Score, confirm);
      onClose();
    } catch (err: any) {
      setError(err.message || 'Gagal menyimpan skor pertandingan.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <BottomSheet isOpen={isOpen} onClose={onClose} title={`Meja ${match.table} - Input Skor`}>
      <div className="flex flex-col gap-4 py-2 pb-6">
        <div className="flex items-center justify-between text-caption text-dark-muted px-1">
          <span>Format: <strong className="text-dark-text">{format}</strong></span>
          <span>Ronde: <strong className="text-accent">{match.round}</strong></span>
        </div>

        {isBye ? (
          <Card variant="surface-high" className="text-center py-4">
            <p className="text-body font-semibold text-accent">{match.p1Name}</p>
            <p className="text-caption text-dark-muted mt-1">
              Pertandingan BYE (Otomatis Win {match.p1Score} - 0)
            </p>
          </Card>
        ) : (
          <div className="flex flex-col gap-3">
            {/* Tombol Preset Cepat */}
            <div className="flex flex-col gap-1.5">
              <span className="text-[11px] font-mono text-dark-muted uppercase">Pilihan Skor Cepat:</span>
              {format === 'BO1' ? (
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => handleSetPreset(1, 0)}
                    className={`py-2 rounded-btn border text-caption font-semibold transition-colors ${
                      p1Score === 1 && p2Score === 0
                        ? 'border-accent bg-accent/20 text-accent'
                        : 'border-dark-border bg-dark-surface text-dark-muted hover:text-dark-text'
                    }`}
                  >
                    {match.p1Name} Win (1 - 0)
                  </button>
                  <button
                    type="button"
                    onClick={() => handleSetPreset(0, 1)}
                    className={`py-2 rounded-btn border text-caption font-semibold transition-colors ${
                      p1Score === 0 && p2Score === 1
                        ? 'border-accent bg-accent/20 text-accent'
                        : 'border-dark-border bg-dark-surface text-dark-muted hover:text-dark-text'
                    }`}
                  >
                    {match.p2Name} Win (0 - 1)
                  </button>
                </div>
              ) : (
                <div className="grid grid-cols-4 gap-1.5">
                  <button
                    type="button"
                    onClick={() => handleSetPreset(2, 0)}
                    className={`py-2 px-1 rounded-btn border text-[11px] font-semibold text-center transition-colors ${
                      p1Score === 2 && p2Score === 0
                        ? 'border-accent bg-accent/20 text-accent'
                        : 'border-dark-border bg-dark-surface text-dark-muted'
                    }`}
                  >
                    2 - 0
                  </button>
                  <button
                    type="button"
                    onClick={() => handleSetPreset(2, 1)}
                    className={`py-2 px-1 rounded-btn border text-[11px] font-semibold text-center transition-colors ${
                      p1Score === 2 && p2Score === 1
                        ? 'border-accent bg-accent/20 text-accent'
                        : 'border-dark-border bg-dark-surface text-dark-muted'
                    }`}
                  >
                    2 - 1
                  </button>
                  <button
                    type="button"
                    onClick={() => handleSetPreset(1, 2)}
                    className={`py-2 px-1 rounded-btn border text-[11px] font-semibold text-center transition-colors ${
                      p1Score === 1 && p2Score === 2
                        ? 'border-accent bg-accent/20 text-accent'
                        : 'border-dark-border bg-dark-surface text-dark-muted'
                    }`}
                  >
                    1 - 2
                  </button>
                  <button
                    type="button"
                    onClick={() => handleSetPreset(0, 2)}
                    className={`py-2 px-1 rounded-btn border text-[11px] font-semibold text-center transition-colors ${
                      p1Score === 0 && p2Score === 2
                        ? 'border-accent bg-accent/20 text-accent'
                        : 'border-dark-border bg-dark-surface text-dark-muted'
                    }`}
                  >
                    0 - 2
                  </button>
                </div>
              )}
            </div>

            {/* Input Manual Kontrol Skor */}
            <div className="grid grid-cols-2 gap-2">
              <Card variant="surface-high" className="flex flex-col items-center justify-between p-3 gap-2">
                <span className="text-[10px] font-mono text-accent block">PEMAIN 1</span>
                <span className="text-caption font-semibold text-dark-text text-center truncate max-w-full">
                  {match.p1Name}
                </span>
                <span className="font-mono font-bold text-2xl text-accent">{p1Score}</span>
              </Card>

              <Card variant="surface-high" className="flex flex-col items-center justify-between p-3 gap-2">
                <span className="text-[10px] font-mono text-accent block">PEMAIN 2</span>
                <span className="text-caption font-semibold text-dark-text text-center truncate max-w-full">
                  {match.p2Name}
                </span>
                <span className="font-mono font-bold text-2xl text-accent">{p2Score}</span>
              </Card>
            </div>
          </div>
        )}

        {error && (
          <p className="text-caption text-status-red text-center">{error}</p>
        )}

        <div className="flex flex-col gap-2 mt-2">
          {!isBye && (
            <Button
              variant="primary"
              fullWidth
              onClick={() => handleSubmit(true)}
              isLoading={loading}
              icon={<Check size={16} />}
            >
              Simpan & Konfirmasi Hasil
            </Button>
          )}

          <Button
            variant="secondary"
            fullWidth
            onClick={onClose}
            disabled={loading}
          >
            Tutup
          </Button>
        </div>
      </div>
    </BottomSheet>
  );
};
