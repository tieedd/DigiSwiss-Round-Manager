export type RoundTimerStatus = 'idle' | 'running' | 'paused' | 'expired';

export interface RoundTimer {
  status: RoundTimerStatus;
  durationMs: number;
  startedAt?: any;
  remainingMs: number;
}

/**
 * Menghitung sisa waktu timer ronde dalam milidetik (ms)
 * berdasarkan status timer, timestamp server dimulai, dan waktu sekarang server (sudah dikoreksi clockOffset)
 */
export function calculateRemainingTime(
  timer: RoundTimer | undefined | null,
  currentServerTimeMs: number
): number {
  if (!timer) return 0;

  if (timer.status === 'idle') {
    return Math.max(0, timer.remainingMs ?? timer.durationMs ?? 0);
  }

  if (timer.status === 'paused') {
    return Math.max(0, timer.remainingMs ?? 0);
  }

  if (timer.status === 'expired') {
    return 0;
  }

  if (timer.status === 'running') {
    let startedAtMs = currentServerTimeMs;
    if (timer.startedAt) {
      if (typeof timer.startedAt === 'number') {
        startedAtMs = timer.startedAt;
      } else if (typeof timer.startedAt.toMillis === 'function') {
        startedAtMs = timer.startedAt.toMillis();
      } else if (typeof timer.startedAt.seconds === 'number') {
        startedAtMs = timer.startedAt.seconds * 1000 + Math.round((timer.startedAt.nanoseconds || 0) / 1000000);
      }
    }

    const elapsed = Math.max(0, currentServerTimeMs - startedAtMs);
    const remaining = (timer.remainingMs ?? timer.durationMs) - elapsed;
    return Math.max(0, remaining);
  }

  return 0;
}

/**
 * Menentukan kategori warna teks timer:
 * - 'expired' (Merah) saat sisa waktu 0 ms
 * - 'warning' (Kuning) saat sisa waktu <= 5 menit (300.000 ms) dan > 0 ms
 * - 'normal' (Putih/Default) saat sisa waktu > 5 menit
 */
export function getTimerDisplayCategory(
  remainingMs: number,
  status: RoundTimerStatus
): 'normal' | 'warning' | 'expired' {
  if (status === 'expired' || remainingMs <= 0) {
    return 'expired';
  }
  if (remainingMs <= 5 * 60 * 1000) {
    return 'warning';
  }
  return 'normal';
}

/**
 * Format milidetik ke string waktu MM:SS
 */
export function formatTimerMs(ms: number): string {
  const safeMs = Math.max(0, ms);
  const totalSeconds = Math.ceil(safeMs / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

/**
 * Memvalidasi apakah timer dapat dilanjutkan (Resume)
 * Aturan: Lanjutkan hanya valid dari status dijeda ('paused') dan sisa waktu > 0;
 * timer yang habis hanya bisa di-reset.
 */
export function canResumeTimer(timer: RoundTimer | undefined | null): boolean {
  if (!timer) return false;
  return timer.status === 'paused' && timer.remainingMs > 0;
}

/**
 * Memvalidasi apakah timer dapat dijeda (Pause)
 */
export function canPauseTimer(timer: RoundTimer | undefined | null): boolean {
  if (!timer) return false;
  return timer.status === 'running';
}
