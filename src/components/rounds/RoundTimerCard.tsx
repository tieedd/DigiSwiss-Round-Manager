import React, { useState, useEffect, useRef } from 'react';
import { TournamentRound } from '../../types';
import { Card } from '../common/Card';
import { Button } from '../common/Button';
import {
  calculateRemainingTime,
  getTimerDisplayCategory,
  formatTimerMs,
  canResumeTimer,
  canPauseTimer
} from '../../utils/timerLogic';
import { getClockOffset } from '../../services/authService';
import {
  startRoundTimer,
  pauseRoundTimer,
  resumeRoundTimer,
  resetRoundTimer
} from '../../services/roundService';
import {
  Play,
  Pause,
  RotateCcw,
  Clock,
  AlertTriangle,
  Flame
} from 'lucide-react';

interface RoundTimerCardProps {
  tournamentId: string;
  round: TournamentRound | null;
  isOrganizer: boolean;
  format?: 'BO1' | 'BO3';
  onTimerUpdated?: () => void;
}

export const RoundTimerCard: React.FC<RoundTimerCardProps> = ({
  tournamentId,
  round,
  isOrganizer,
  format = 'BO3',
  onTimerUpdated
}) => {
  const defaultMinutes = format === 'BO1' ? 25 : 45;
  const [inputMinutes, setInputMinutes] = useState<number>(defaultMinutes);
  const [actionLoading, setActionLoading] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  // Remaining ms state calculated every tick
  const [currentRemainingMs, setCurrentRemainingMs] = useState<number>(() => {
    if (!round?.timer) return defaultMinutes * 60 * 1000;
    const nowServer = Date.now() + getClockOffset();
    return calculateRemainingTime(round.timer, nowServer);
  });

  const hasVibratedRef = useRef(false);

  // Sinkronisasi input menit jika ronde berubah
  useEffect(() => {
    if (round?.timer?.durationMs) {
      setInputMinutes(Math.round(round.timer.durationMs / (60 * 1000)));
    } else {
      setInputMinutes(defaultMinutes);
    }
  }, [round?.number, round?.timer?.durationMs, defaultMinutes]);

  // Interval hitung mundur per 250ms saat running
  useEffect(() => {
    const tick = () => {
      if (!round?.timer) return;
      const nowServer = Date.now() + getClockOffset();
      const remaining = calculateRemainingTime(round.timer, nowServer);
      setCurrentRemainingMs(remaining);

      // Getar jika sisa waktu habis (<= 0) dan timer sedang running atau expired
      if (remaining <= 0 && round.timer.status === 'running' && !hasVibratedRef.current) {
        hasVibratedRef.current = true;
        if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
          try {
            navigator.vibrate([200, 100, 200, 100, 200]);
          } catch (e) {
            // Abaikan jika tidak didukung perangkat
          }
        }
      }

      if (remaining > 0) {
        hasVibratedRef.current = false;
      }
    };

    tick();
    const interval = setInterval(tick, 250);
    return () => clearInterval(interval);
  }, [round?.timer]);

  if (!round) return null;

  const timerStatus = round.timer?.status || 'idle';
  const category = getTimerDisplayCategory(currentRemainingMs, timerStatus);

  // Warna teks hitung mundur:
  // - Kuning pada sisa 5 menit (<= 300_000 ms)
  // - Merah saat habis (<= 0 ms)
  // - Normal (putih) di atas 5 menit
  let timerTextColorClass = 'text-dark-text';
  if (category === 'warning') {
    timerTextColorClass = 'text-amber-400';
  } else if (category === 'expired') {
    timerTextColorClass = 'text-red-500 animate-pulse';
  }

  // Tombol Aksi
  const handleStart = async () => {
    setActionError(null);
    setActionLoading(true);
    try {
      await startRoundTimer(tournamentId, round.number, inputMinutes);
      onTimerUpdated?.();
    } catch (err: any) {
      setActionError(err.message || 'Gagal memulai timer');
    } finally {
      setActionLoading(false);
    }
  };

  const handlePause = async () => {
    setActionError(null);
    setActionLoading(true);
    try {
      await pauseRoundTimer(tournamentId, round.number);
      onTimerUpdated?.();
    } catch (err: any) {
      setActionError(err.message || 'Gagal menjeda timer');
    } finally {
      setActionLoading(false);
    }
  };

  const handleResume = async () => {
    setActionError(null);
    setActionLoading(true);
    try {
      await resumeRoundTimer(tournamentId, round.number);
      onTimerUpdated?.();
    } catch (err: any) {
      setActionError(err.message || 'Gagal melanjutkan timer');
    } finally {
      setActionLoading(false);
    }
  };

  const handleReset = async () => {
    setActionError(null);
    setActionLoading(true);
    try {
      await resetRoundTimer(tournamentId, round.number, inputMinutes);
      hasVibratedRef.current = false;
      onTimerUpdated?.();
    } catch (err: any) {
      setActionError(err.message || 'Gagal me-reset timer');
    } finally {
      setActionLoading(false);
    }
  };

  return (
    <Card
      variant="surface-high"
      className={`p-4 flex flex-col items-center justify-center gap-3 transition-colors ${
        category === 'expired'
          ? 'border-red-500/50 bg-red-950/20'
          : category === 'warning'
          ? 'border-amber-400/40 bg-amber-950/10'
          : 'border-dark-border'
      }`}
    >
      {/* Header Info Timer */}
      <div className="w-full flex items-center justify-between gap-2 border-b border-dark-border/60 pb-2 text-caption">
        <div className="flex items-center gap-1.5 font-medium text-dark-muted">
          <Clock size={15} className="text-accent" />
          <span>Timer Ronde {round.number}</span>
          <span className="text-[10px] px-1.5 py-0.2 rounded bg-dark-surface border border-dark-border text-dark-muted font-mono uppercase">
            {format}
          </span>
        </div>

        <div className="flex items-center gap-1.5">
          {timerStatus === 'running' && (
            <span className="flex items-center gap-1 text-[11px] font-mono text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 rounded-full">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping" />
              <span>Berjalan</span>
            </span>
          )}
          {timerStatus === 'paused' && (
            <span className="text-[11px] font-mono text-amber-300 bg-amber-400/10 border border-amber-400/20 px-2 py-0.5 rounded-full">
              Dijeda
            </span>
          )}
          {timerStatus === 'expired' && (
            <span className="text-[11px] font-mono text-red-400 bg-red-500/10 border border-red-500/20 px-2 py-0.5 rounded-full">
              Waktu Habis
            </span>
          )}
          {timerStatus === 'idle' && (
            <span className="text-[11px] font-mono text-dark-muted bg-dark-surface border border-dark-border px-2 py-0.5 rounded-full">
              Siap
            </span>
          )}
        </div>
      </div>

      {/* Hitung Mundur Besar (Angka 48px+ Tabular, Tanpa Dekorasi) */}
      <div className="flex flex-col items-center justify-center my-1 select-none">
        <div
          data-testid="round-timer-display"
          className={`font-mono tabular-nums font-bold text-5xl md:text-6xl tracking-wider ${timerTextColorClass}`}
          style={{ fontVariantNumeric: 'tabular-nums' }}
        >
          {formatTimerMs(currentRemainingMs)}
        </div>

        {category === 'warning' && timerStatus === 'running' && (
          <div className="flex items-center gap-1 text-[11px] font-medium text-amber-400 mt-1">
            <Flame size={13} />
            <span>Sisa waktu di bawah 5 menit!</span>
          </div>
        )}

        {category === 'expired' && (
          <div className="flex items-center gap-1 text-[11px] font-semibold text-red-400 mt-1">
            <AlertTriangle size={13} />
            <span>Waktu ronde telah habis!</span>
          </div>
        )}
      </div>

      {/* Pesan Error */}
      {actionError && (
        <div className="w-full p-2 rounded bg-status-red/10 border border-status-red/30 text-status-red text-caption text-center">
          {actionError}
        </div>
      )}

      {/* Kontrol Khusus Organizer */}
      {isOrganizer && (
        <div className="w-full flex flex-col gap-2.5 pt-2 border-t border-dark-border/60">
          {/* Input Durasi Manual (menit) */}
          <div className="flex items-center justify-between gap-2">
            <label className="text-caption text-dark-muted font-medium whitespace-nowrap">
              Durasi (menit):
            </label>
            <div className="flex items-center gap-1">
              {[25, 30, 45, 50].map((mins) => (
                <button
                  key={mins}
                  type="button"
                  disabled={actionLoading || timerStatus === 'running'}
                  onClick={() => setInputMinutes(mins)}
                  className={`text-[11px] font-mono px-2 py-0.5 rounded border transition-colors ${
                    inputMinutes === mins
                      ? 'bg-accent/20 border-accent text-accent font-semibold'
                      : 'bg-dark-surface border-dark-border text-dark-muted hover:text-dark-text'
                  } disabled:opacity-50`}
                >
                  {mins}m
                </button>
              ))}
              <input
                type="number"
                min="1"
                max="180"
                value={inputMinutes}
                disabled={actionLoading || timerStatus === 'running'}
                onChange={(e) => setInputMinutes(Math.max(1, parseInt(e.target.value) || 1))}
                className="w-14 bg-dark-surface border border-dark-border rounded px-2 py-1 text-caption text-center font-mono text-dark-text focus:outline-none focus:border-accent disabled:opacity-50"
              />
            </div>
          </div>

          {/* Tombol Kontrol: Mulai, Jeda, Lanjutkan, Reset */}
          <div className="grid grid-cols-3 gap-2">
            {/* Mulai / Lanjutkan */}
            {timerStatus === 'paused' ? (
              <Button
                variant="primary"
                className="!min-h-[36px] !px-2 !text-caption"
                onClick={handleResume}
                disabled={actionLoading || !canResumeTimer(round.timer)}
                icon={<Play size={14} />}
              >
                Lanjutkan
              </Button>
            ) : (
              <Button
                variant="primary"
                className="!min-h-[36px] !px-2 !text-caption"
                onClick={handleStart}
                disabled={actionLoading || timerStatus === 'running' || timerStatus === 'expired'}
                icon={<Play size={14} />}
              >
                Mulai
              </Button>
            )}

            {/* Jeda */}
            <Button
              variant="secondary"
              className="!min-h-[36px] !px-2 !text-caption"
              onClick={handlePause}
              disabled={actionLoading || !canPauseTimer(round.timer)}
              icon={<Pause size={14} />}
            >
              Jeda
            </Button>

            {/* Reset */}
            <Button
              variant="ghost"
              className="!min-h-[36px] !px-2 !text-caption border border-dark-border hover:bg-dark-surface"
              onClick={handleReset}
              disabled={actionLoading}
              icon={<RotateCcw size={14} />}
            >
              Reset
            </Button>
          </div>
        </div>
      )}
    </Card>
  );
};
