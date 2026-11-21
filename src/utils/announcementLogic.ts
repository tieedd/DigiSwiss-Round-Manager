import type { TournamentAnnouncement } from '../types/index.ts';
import { formatIndonesianFullDate } from './exportFormatLogic.ts';

export const ANNOUNCEMENT_MAX_LENGTH = 500;

export interface AnnouncementValidationResult {
  valid: boolean;
  trimmed: string;
  error?: string;
}

/**
 * Memvalidasi isi pengumuman organizer: wajib diisi dan maksimal 500 karakter.
 */
export function validateAnnouncementMessage(
  rawMessage: string | null | undefined
): AnnouncementValidationResult {
  const trimmed = (rawMessage ?? '').trim();
  if (!trimmed) {
    return {
      valid: false,
      trimmed: '',
      error: 'Isi pengumuman tidak boleh kosong.',
    };
  }
  if (trimmed.length > ANNOUNCEMENT_MAX_LENGTH) {
    return {
      valid: false,
      trimmed,
      error: `Pengumuman maksimal ${ANNOUNCEMENT_MAX_LENGTH} karakter (saat ini ${trimmed.length}).`,
    };
  }
  return { valid: true, trimmed };
}

/**
 * Mengurutkan daftar pengumuman dengan yang terbaru di paling atas.
 */
export function sortAnnouncementsNewestFirst<
  T extends Pick<TournamentAnnouncement, 'createdAt' | 'id'>
>(items: ReadonlyArray<T>): T[] {
  return [...(items || [])].sort(
    (a, b) => (b.createdAt || 0) - (a.createdAt || 0) || b.id.localeCompare(a.id)
  );
}

/**
 * Memformat timestamp pengumuman menjadi waktu relatif Bahasa Indonesia.
 */
export function formatRelativeIndonesianTime(
  timestampMs: number | null | undefined,
  nowMs: number = Date.now()
): string {
  if (!timestampMs || !Number.isFinite(timestampMs)) return '-';
  const diffMs = Math.max(0, nowMs - timestampMs);

  const minuteMs = 60_000;
  const hourMs = 60 * minuteMs;
  const dayMs = 24 * hourMs;

  if (diffMs < minuteMs) {
    return 'Baru saja';
  }
  if (diffMs < hourMs) {
    return `${Math.floor(diffMs / minuteMs)} menit lalu`;
  }
  if (diffMs < dayMs) {
    return `${Math.floor(diffMs / hourMs)} jam lalu`;
  }
  if (diffMs < 7 * dayMs) {
    return `${Math.floor(diffMs / dayMs)} hari lalu`;
  }
  return formatIndonesianFullDate(timestampMs);
}
