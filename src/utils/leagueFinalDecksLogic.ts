import type {
  DeckColor,
  LeagueDeckEntry,
  LeaguePlayerDecks,
  TournamentSeason,
  TournamentType,
} from '../types/index.ts';
import { OFFICIAL_DECK_COLORS } from './deckExportLogic.ts';
import {
  hasValidTwoLeagueDecks,
  validateLeagueDecksSubmission,
  validateSingleLeagueDeck,
} from './leagueDeckLogic.ts';

export interface ParticipationDeckLike {
  id: string;
  tournamentId?: string;
  tournamentName?: string;
  date?: string;
  tournamentType?: TournamentType;
  season?: TournamentSeason;
  playerId?: string;
  uid?: string | null;
  name?: string;
  deckName?: string;
  deckColors?: DeckColor[];
  decks?: ReadonlyArray<LeagueDeckEntry>;
  createdAt?: number;
}

export type LeagueDeckDocLookup =
  | Map<string, LeaguePlayerDecks>
  | Record<string, LeaguePlayerDecks | undefined>;

export interface LeagueDeckHistoryOption {
  deckName: string;
  deckColors: DeckColor[];
  tournamentName: string;
  date: string;
}

function sanitizeOfficialColors(colors?: ReadonlyArray<string> | null): DeckColor[] {
  if (!Array.isArray(colors)) return [];
  const seen = new Set<DeckColor>();
  for (const c of colors) {
    if (OFFICIAL_DECK_COLORS.includes(c as DeckColor)) {
      seen.add(c as DeckColor);
    }
  }
  return Array.from(seen);
}

/**
 * Menentukan apakah dokumen partisipasi berasal dari Turnamen Liga.
 */
export function isLeagueParticipation(
  p: Partial<ParticipationDeckLike> | null | undefined
): boolean {
  if (!p) return false;
  return (
    p.tournamentType === 'league' ||
    Boolean(p.season) ||
    (Array.isArray(p.decks) && p.decks.length === 2)
  );
}

/**
 * Memeriksa apakah partisipasi sudah memiliki 2 deck liga yang valid.
 */
export function hasValidParticipationTwoDecks(
  p: Partial<ParticipationDeckLike> | null | undefined
): boolean {
  if (!p || !Array.isArray(p.decks) || p.decks.length !== 2) {
    return false;
  }
  return validateLeagueDecksSubmission(p.decks[0], p.decks[1]).valid;
}

/**
 * Mengekstrak daftar deck valid dari satu partisipasi:
 * - Jika `decks` (2 deck liga) valid, mengembalikan 2 deck tersebut.
 * - Jika `decks` berupa array dengan entri valid (fallback), mengembalikan entri yang valid.
 * - Untuk turnamen reguler tanpa `decks`, mengembalikan 1 deck dari `deckName`/`deckColors` bila terisi.
 * - Untuk partisipasi liga tanpa `decks`, mengembalikan `[]`.
 */
export function getParticipationDecksList(
  p: Partial<ParticipationDeckLike> | null | undefined
): LeagueDeckEntry[] {
  if (!p) return [];

  if (Array.isArray(p.decks) && p.decks.length > 0) {
    const validTuple = validateLeagueDecksSubmission(p.decks[0], p.decks[1]);
    if (validTuple.valid && validTuple.sanitized) {
      return [
        { name: validTuple.sanitized[0].name, colors: [...validTuple.sanitized[0].colors] },
        { name: validTuple.sanitized[1].name, colors: [...validTuple.sanitized[1].colors] },
      ];
    }

    const validEntries: LeagueDeckEntry[] = [];
    for (const d of p.decks) {
      const check = validateSingleLeagueDeck(d, 'Deck');
      if (check.valid && check.sanitized) {
        validEntries.push({
          name: check.sanitized.name,
          colors: [...check.sanitized.colors],
        });
      }
    }
    if (validEntries.length > 0) {
      return validEntries;
    }
  }

  if (isLeagueParticipation(p)) {
    return [];
  }

  const trimmedName = (p.deckName || '').trim();
  if (!trimmedName) {
    return [];
  }

  return [
    {
      name: trimmedName,
      colors: sanitizeOfficialColors(p.deckColors),
    },
  ];
}

function lookupLeagueDeckDoc(
  lookup: LeagueDeckDocLookup | null | undefined,
  playerId: string
): LeaguePlayerDecks | undefined {
  if (!lookup || !playerId) return undefined;
  if (lookup instanceof Map) {
    return lookup.get(playerId);
  }
  return lookup[playerId];
}

/**
 * Menyusun tuple 2 deck liga yang sudah tersanitasi dan di-clone dari koleksi `decks`
 * berdasarkan `playerId`. Mengembalikan `undefined` bila peserta belum memiliki 2 deck valid.
 */
export function resolveLeagueParticipationDecks(
  playerId: string,
  deckDocs: LeagueDeckDocLookup | null | undefined
): [LeagueDeckEntry, LeagueDeckEntry] | undefined {
  const deckDoc = lookupLeagueDeckDoc(deckDocs, playerId);
  if (!hasValidTwoLeagueDecks(deckDoc) || !deckDoc) {
    return undefined;
  }

  const validated = validateLeagueDecksSubmission(deckDoc.decks[0], deckDoc.decks[1]);
  if (!validated.valid || !validated.sanitized) {
    return undefined;
  }

  return [
    {
      name: validated.sanitized[0].name,
      colors: [...validated.sanitized[0].colors],
    },
    {
      name: validated.sanitized[1].name,
      colors: [...validated.sanitized[1].colors],
    },
  ];
}

/**
 * Membangun peta assignment 2 deck untuk finalisasi Turnamen Liga beserta daftar
 * peserta yang tidak memiliki data 2 deck valid di koleksi `decks`.
 */
export function buildLeagueFinalDecksAssignment(
  standings: ReadonlyArray<{ playerId: string; playerName?: string; name?: string }>,
  deckDocs: LeagueDeckDocLookup | null | undefined
): {
  assignedDecksMap: Map<string, [LeagueDeckEntry, LeagueDeckEntry]>;
  missingPlayers: Array<{ playerId: string; playerName: string }>;
} {
  const assignedDecksMap = new Map<string, [LeagueDeckEntry, LeagueDeckEntry]>();
  const missingPlayers: Array<{ playerId: string; playerName: string }> = [];

  for (const s of standings) {
    const resolved = resolveLeagueParticipationDecks(s.playerId, deckDocs);
    if (resolved) {
      assignedDecksMap.set(s.playerId, resolved);
    } else {
      missingPlayers.push({
        playerId: s.playerId,
        playerName: s.playerName || s.name || s.playerId,
      });
    }
  }

  return { assignedDecksMap, missingPlayers };
}

export interface LeagueParticipationSyncItem<T extends ParticipationDeckLike> {
  participation: T;
  decks: [LeagueDeckEntry, LeagueDeckEntry];
}

/**
 * Mendeteksi dokumen partisipasi Turnamen Liga yang belum memiliki `decks` valid
 * dan memetakannya dengan data 2 deck dari koleksi pendaftaran `decks`.
 */
export function detectLeagueParticipationsNeedingSync<T extends ParticipationDeckLike>(
  participations: ReadonlyArray<T>,
  deckDocs: LeagueDeckDocLookup | null | undefined,
  options?: { treatAllAsLeague?: boolean }
): {
  needingSync: Array<LeagueParticipationSyncItem<T>>;
  missingDeckDocs: T[];
  unfilledCount: number;
} {
  const needingSync: Array<LeagueParticipationSyncItem<T>> = [];
  const missingDeckDocs: T[] = [];
  let unfilledCount = 0;

  for (const p of participations) {
    const isLeague = options?.treatAllAsLeague ?? isLeagueParticipation(p);
    if (!isLeague) continue;

    if (hasValidParticipationTwoDecks(p)) {
      continue;
    }

    unfilledCount += 1;
    const pid = p.playerId || '';
    const resolved = pid ? resolveLeagueParticipationDecks(pid, deckDocs) : undefined;
    if (resolved) {
      needingSync.push({ participation: p, decks: resolved });
    } else {
      missingDeckDocs.push(p);
    }
  }

  return { needingSync, missingDeckDocs, unfilledCount };
}

/**
 * Menggabungkan riwayat deck pemain dari partisipasi Reguler (`deckName`/`deckColors`)
 * maupun Turnamen Liga (`decks` 1 dan 2), dengan deduplikasi case-insensitive
 * berdasarkan nama deck yang sudah di-trim.
 */
export function mergePlayerDeckHistory(
  participations: ReadonlyArray<ParticipationDeckLike>
): LeagueDeckHistoryOption[] {
  if (!participations || participations.length === 0) return [];

  const sorted = [...participations].sort(
    (a, b) => (b.createdAt || 0) - (a.createdAt || 0)
  );

  const historyMap = new Map<string, LeagueDeckHistoryOption>();

  for (const p of sorted) {
    const decks = getParticipationDecksList(p);
    for (const d of decks) {
      const cleanName = d.name.trim();
      const colors = sanitizeOfficialColors(d.colors);
      if (cleanName.length === 0 || colors.length === 0) continue;

      const normalizedKey = cleanName.toLowerCase();
      if (!historyMap.has(normalizedKey)) {
        historyMap.set(normalizedKey, {
          deckName: cleanName,
          deckColors: colors,
          tournamentName: p.tournamentName || '-',
          date: p.date || '-',
        });
      }
    }
  }

  return Array.from(historyMap.values());
}

/**
 * Memformat 1 atau 2 deck untuk ekspor Teks Ringkasan.
 */
export function formatParticipationDecksText(
  p: ParticipationDeckLike,
  formatColorsEmoji: (colors?: string[] | null) => string
): string {
  const decks = getParticipationDecksList(p);
  if (decks.length === 0) {
    return 'Deck belum diisi';
  }
  return decks
    .map((d) => {
      const emoji = formatColorsEmoji(d.colors);
      return `${d.name}${emoji ? ` ${emoji}` : ''}`;
    })
    .join(' & ');
}

/**
 * Memformat ringkasan 2 deck untuk label teks sederhana (mis. juara di HistoryView).
 */
export function formatParticipationDecksInlineNames(
  p: ParticipationDeckLike | null | undefined
): string {
  if (!p) return '';
  const decks = getParticipationDecksList(p);
  if (decks.length === 0) return '';
  return decks.map((d) => d.name).join(' / ');
}
