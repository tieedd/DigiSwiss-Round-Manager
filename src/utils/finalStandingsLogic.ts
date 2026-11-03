import type { Participation, DeckColor } from '../types/index.ts';
import { OFFICIAL_DECK_COLORS } from './deckExportLogic.ts';

export interface FinalStandingsRowItem {
  participationId: string;
  rank: number;
  name: string;
  uid: string | null;
  wins: number;
  losses: number;
  points: number;
  omw: number;
  gw: number;
  ogw: number;
  deckName?: string;
  deckColors?: DeckColor[];
  isMe: boolean;
  isTop3: boolean;
  isDropped?: boolean;
}

/**
 * Menyusun dan mengurutkan baris klasemen akhir berdasarkan peringkat,
 * serta menandai isMe, isTop3, dan isDropped.
 */
export function buildFinalStandingsRows(
  participations: Participation[],
  myUid?: string
): FinalStandingsRowItem[] {
  if (!participations || !Array.isArray(participations)) return [];

  // Urutkan berdasarkan peringkat (rank) ascending
  const sorted = [...participations].sort((a, b) => a.rank - b.rank);

  return sorted.map((p) => {
    const isMe = Boolean(myUid && p.uid && p.uid === myUid);
    const isTop3 = p.rank <= 3;
    const isDropped = Boolean(p.isDropped);

    return {
      participationId: p.id,
      rank: p.rank,
      name: p.name,
      uid: p.uid || null,
      wins: p.wins || 0,
      losses: p.losses || 0,
      points: p.points || 0,
      omw: p.omw || 0,
      gw: p.gw || 0,
      ogw: p.ogw || 0,
      deckName: p.deckName ? p.deckName.trim() : '',
      deckColors: Array.isArray(p.deckColors) ? (p.deckColors as DeckColor[]) : [],
      isMe,
      isTop3,
      isDropped
    };
  });
}

/**
 * Menghitung jumlah partisipasi milik user yang belum mengisi nama deck
 */
export function countUnfilledDecks(participations: Participation[], myUid?: string): number {
  if (!participations || !Array.isArray(participations)) return 0;
  return participations.filter((p) => {
    const isMyDoc = myUid ? p.uid === myUid : true;
    const isDeckEmpty = !p.deckName || p.deckName.trim() === '';
    return isMyDoc && isDeckEmpty;
  }).length;
}

/**
 * Mengambil daftar deck unik dari riwayat partisipasi pemain, diurutkan terbaru di atas
 */
export interface UniqueDeckOption {
  deckName: string;
  deckColors: DeckColor[];
  lastUsedAt?: number;
}

export function buildDeckHistoryOptions(participations: Participation[]): UniqueDeckOption[] {
  if (!participations || !Array.isArray(participations)) return [];

  // Urutkan riwayat dari yang paling baru
  const sorted = [...participations].sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));

  const map = new Map<string, UniqueDeckOption>();

  for (const p of sorted) {
    const name = p.deckName ? p.deckName.trim() : '';
    const colors = Array.isArray(p.deckColors) ? (p.deckColors as DeckColor[]) : [];

    if (name.length > 0 && colors.length > 0) {
      const key = name.toLowerCase();
      if (!map.has(key)) {
        map.set(key, {
          deckName: name,
          deckColors: colors,
          lastUsedAt: p.createdAt || 0
        });
      }
    }
  }

  return Array.from(map.values());
}

/**
 * Validasi murni masukan deck:
 * - Nama deck wajib 1 sampai 40 karakter
 * - Warna deck minimal 1 dan maksimal 7 dari daftar resmi
 */
export function validatePlayerDeckInput(
  deckName: string,
  deckColors: string[]
): { valid: boolean; error?: string } {
  const trimmed = (deckName || '').trim();
  if (trimmed.length < 1) {
    return { valid: false, error: 'Nama deck tidak boleh kosong (minimal 1 karakter).' };
  }
  if (trimmed.length > 40) {
    return { valid: false, error: 'Nama deck maksimal 40 karakter.' };
  }

  if (!deckColors || !Array.isArray(deckColors) || deckColors.length < 1) {
    return { valid: false, error: 'Pilih minimal satu warna deck.' };
  }
  if (deckColors.length > 7) {
    return { valid: false, error: 'Warna deck maksimal 7 warna.' };
  }

  const validOfficialColors = new Set(OFFICIAL_DECK_COLORS as readonly string[]);
  for (const c of deckColors) {
    if (!validOfficialColors.has(c)) {
      return { valid: false, error: `Warna deck "${c}" tidak dikenal.` };
    }
  }

  return { valid: true };
}

// In-memory cache selama sesi aplikasi per tournamentId
const standingsSessionCache = new Map<string, Participation[]>();

export function getCachedStandings(tournamentId: string): Participation[] | undefined {
  return standingsSessionCache.get(tournamentId);
}

export function setCachedStandings(tournamentId: string, data: Participation[]): void {
  standingsSessionCache.set(tournamentId, data);
}

export function invalidateStandingsCache(tournamentId: string): void {
  standingsSessionCache.delete(tournamentId);
}

export function clearAllStandingsCache(): void {
  standingsSessionCache.clear();
}
