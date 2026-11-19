import type { Participation, DeckColor, LeagueDeckEntry } from '../types/index.ts';
import { OFFICIAL_DECK_COLORS } from './deckExportLogic.ts';

export interface FinalStandingsRowItem {
  participationId: string;
  rank: number;
  swissRank?: number;
  topCutResult?: 'Juara' | 'Runner-up' | 'Semifinal' | 'Perempat Final';
  name: string;
  uid: string | null;
  wins: number;
  losses: number;
  swissWins?: number;
  swissLosses?: number;
  swissPoints?: number;
  topCutWins?: number;
  topCutLosses?: number;
  topCutPoints?: number;
  points: number;
  omw: number;
  gw: number;
  ogw: number;
  deckName?: string;
  deckColors?: DeckColor[];
  decks?: [LeagueDeckEntry, LeagueDeckEntry];
  isLeague?: boolean;
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
      swissRank: p.swissRank,
      topCutResult: p.topCutResult,
      name: p.name,
      uid: p.uid || null,
      wins: p.wins || 0,
      losses: p.losses || 0,
      ...(typeof p.swissWins === 'number' ? { swissWins: p.swissWins } : {}),
      ...(typeof p.swissLosses === 'number' ? { swissLosses: p.swissLosses } : {}),
      ...(typeof p.swissPoints === 'number' ? { swissPoints: p.swissPoints } : {}),
      ...(typeof p.topCutWins === 'number' ? { topCutWins: p.topCutWins } : {}),
      ...(typeof p.topCutLosses === 'number' ? { topCutLosses: p.topCutLosses } : {}),
      ...(typeof p.topCutPoints === 'number' ? { topCutPoints: p.topCutPoints } : {}),
      points: p.points || 0,
      omw: p.omw || 0,
      gw: p.gw || 0,
      ogw: p.ogw || 0,
      deckName: p.deckName ? p.deckName.trim() : '',
      deckColors: Array.isArray(p.deckColors) ? (p.deckColors as DeckColor[]) : [],
      ...(Array.isArray(p.decks) && p.decks.length === 2 ? { decks: p.decks } : {}),
      isLeague:
        p.tournamentType === 'league' ||
        Boolean(p.season) ||
        (Array.isArray(p.decks) && p.decks.length === 2),
      isMe,
      isTop3,
      isDropped
    };
  });
}

/**
 * Menghitung jumlah partisipasi turnamen reguler milik user yang belum mengisi nama deck
 */
export function countUnfilledDecks(participations: Participation[], myUid?: string): number {
  if (!participations || !Array.isArray(participations)) return 0;
  return participations.filter((p) => {
    const isLeague =
      p.tournamentType === 'league' ||
      Boolean(p.season) ||
      (Array.isArray(p.decks) && p.decks.length > 0);
    if (isLeague) return false;
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
    const entries: Array<{ name: string; colors: DeckColor[] }> = [];
    if (Array.isArray(p.decks) && p.decks.length > 0) {
      p.decks.forEach((d) => {
        if (d && typeof d.name === 'string') {
          entries.push({
            name: d.name.trim(),
            colors: Array.isArray(d.colors) ? (d.colors as DeckColor[]) : []
          });
        }
      });
    } else {
      const name = p.deckName ? p.deckName.trim() : '';
      const colors = Array.isArray(p.deckColors) ? (p.deckColors as DeckColor[]) : [];
      if (name) {
        entries.push({ name, colors });
      }
    }

    for (const entry of entries) {
      if (entry.name.length > 0 && entry.colors.length > 0) {
        const key = entry.name.toLowerCase();
        if (!map.has(key)) {
          map.set(key, {
            deckName: entry.name,
            deckColors: entry.colors,
            lastUsedAt: p.createdAt || 0
          });
        }
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
