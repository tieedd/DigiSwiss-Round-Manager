import type {
  DeckColor,
  LeagueDeckEntry,
  LeaguePlayerDecks,
  TournamentPlayer,
} from '../types/index.ts';
import { OFFICIAL_DECK_COLORS } from './deckExportLogic.ts';
import { MIN_PARTICIPANTS_LEAGUE } from './seasonLogic.ts';

export const MAX_LEAGUE_DECK_NAME_LENGTH = 40;

export interface SingleLeagueDeckValidationResult {
  valid: boolean;
  error?: string;
  sanitized?: LeagueDeckEntry;
}

export interface LeagueTwoDecksValidationResult {
  valid: boolean;
  error?: string;
  sanitized?: [LeagueDeckEntry, LeagueDeckEntry];
}

function sanitizeColors(colors?: ReadonlyArray<string> | null): DeckColor[] {
  if (!colors || !Array.isArray(colors)) return [];
  const validSet = new Set<DeckColor>();
  for (const c of colors) {
    if (OFFICIAL_DECK_COLORS.includes(c as DeckColor)) {
      validSet.add(c as DeckColor);
    }
  }
  return Array.from(validSet);
}

/**
 * Validasi 1 entri deck liga (nama wajib <= 40 karakter, minimal 1 warna resmi).
 */
export function validateSingleLeagueDeck(
  deck: Partial<LeagueDeckEntry> | null | undefined,
  label: string = 'Deck'
): SingleLeagueDeckValidationResult {
  const cleanName = (deck?.name || '').trim();
  if (!cleanName) {
    return {
      valid: false,
      error: `Nama ${label} tidak boleh kosong.`,
    };
  }
  if (cleanName.length > MAX_LEAGUE_DECK_NAME_LENGTH) {
    return {
      valid: false,
      error: `Nama ${label} maksimal ${MAX_LEAGUE_DECK_NAME_LENGTH} karakter.`,
    };
  }

  const rawColors = Array.isArray(deck?.colors) ? deck.colors : [];
  if (rawColors.length === 0) {
    return {
      valid: false,
      error: `Pilih minimal 1 warna untuk ${label}.`,
    };
  }

  const invalidColor = rawColors.find(
    (c) => !OFFICIAL_DECK_COLORS.includes(c as DeckColor)
  );
  if (invalidColor) {
    return {
      valid: false,
      error: `Warna "${invalidColor}" pada ${label} tidak valid.`,
    };
  }

  return {
    valid: true,
    sanitized: {
      name: cleanName,
      colors: sanitizeColors(rawColors),
    },
  };
}

/**
 * Validasi 2 deck liga:
 * - Deck 1 & Deck 2 masing-masing wajib punya nama (1..40) dan >= 1 warna resmi
 * - Nama Deck 1 dan Deck 2 tidak boleh sama (case-insensitive)
 */
export function validateLeagueDecksSubmission(
  deck1: Partial<LeagueDeckEntry> | null | undefined,
  deck2: Partial<LeagueDeckEntry> | null | undefined
): LeagueTwoDecksValidationResult {
  const res1 = validateSingleLeagueDeck(deck1, 'Deck 1');
  if (!res1.valid || !res1.sanitized) {
    return { valid: false, error: res1.error };
  }

  const res2 = validateSingleLeagueDeck(deck2, 'Deck 2');
  if (!res2.valid || !res2.sanitized) {
    return { valid: false, error: res2.error };
  }

  if (
    res1.sanitized.name.toLowerCase() === res2.sanitized.name.toLowerCase()
  ) {
    return {
      valid: false,
      error:
        'Nama Deck 1 dan Deck 2 tidak boleh sama (tanpa membedakan huruf besar/kecil).',
    };
  }

  return {
    valid: true,
    sanitized: [res1.sanitized, res2.sanitized],
  };
}

/**
 * Memeriksa apakah dokumen deck liga milik peserta lengkap dan valid (2 deck valid).
 */
export function hasValidTwoLeagueDecks(
  deckDoc?: Partial<LeaguePlayerDecks> | null
): boolean {
  if (!deckDoc || !Array.isArray(deckDoc.decks) || deckDoc.decks.length !== 2) {
    return false;
  }
  return validateLeagueDecksSubmission(deckDoc.decks[0], deckDoc.decks[1]).valid;
}

type DeckLookup =
  | Map<string, LeaguePlayerDecks>
  | Record<string, LeaguePlayerDecks | undefined>;

function lookupPlayerDecks(
  lookup: DeckLookup | null | undefined,
  playerId: string
): LeaguePlayerDecks | undefined {
  if (!lookup) return undefined;
  if (lookup instanceof Map) {
    return lookup.get(playerId);
  }
  return lookup[playerId];
}

/**
 * Mengembalikan daftar peserta berstatus 'accepted' (termasuk manual)
 * yang belum melengkapi 2 deck valid.
 */
export function getPlayersWithIncompleteLeagueDecks(
  players: ReadonlyArray<TournamentPlayer>,
  deckDocs: DeckLookup | null | undefined
): TournamentPlayer[] {
  if (!players || players.length === 0) return [];
  return players.filter((p) => {
    if (p.status !== 'accepted') return false;
    const deckDoc = lookupPlayerDecks(deckDocs, p.id);
    return !hasValidTwoLeagueDecks(deckDoc);
  });
}

export interface LeagueStartValidationResult {
  canStart: boolean;
  acceptedCount: number;
  minRequired: number;
  missingDeckPlayers: TournamentPlayer[];
  errorMessage?: string;
}

/**
 * Memeriksa seluruh syarat memulai Turnamen Liga:
 * 1. Minimal 4 peserta berstatus 'accepted'
 * 2. Seluruh peserta 'accepted' (termasuk manual) wajib memiliki 2 deck valid
 */
export function validateLeagueStartRequirements(
  players: ReadonlyArray<TournamentPlayer>,
  deckDocs: DeckLookup | null | undefined
): LeagueStartValidationResult {
  const acceptedPlayers = (players || []).filter(
    (p) => p.status === 'accepted'
  );
  const acceptedCount = acceptedPlayers.length;
  const missingDeckPlayers = getPlayersWithIncompleteLeagueDecks(
    acceptedPlayers,
    deckDocs
  );

  if (acceptedCount < MIN_PARTICIPANTS_LEAGUE) {
    return {
      canStart: false,
      acceptedCount,
      minRequired: MIN_PARTICIPANTS_LEAGUE,
      missingDeckPlayers,
      errorMessage: `Minimal ${MIN_PARTICIPANTS_LEAGUE} peserta accepted diperlukan untuk memulai turnamen Liga (saat ini: ${acceptedCount}).`,
    };
  }

  if (missingDeckPlayers.length > 0) {
    const names = missingDeckPlayers.map((p) => p.name).join(', ');
    return {
      canStart: false,
      acceptedCount,
      minRequired: MIN_PARTICIPANTS_LEAGUE,
      missingDeckPlayers,
      errorMessage: `Turnamen Liga belum dapat dimulai. Peserta berikut belum mengisi 2 deck valid: ${names}.`,
    };
  }

  return {
    canStart: true,
    acceptedCount,
    minRequired: MIN_PARTICIPANTS_LEAGUE,
    missingDeckPlayers: [],
  };
}

/**
 * Ringkasan teks untuk log audit DECK_EDITED.
 */
export function formatLeagueDecksAuditSummary(
  deckDoc?: Partial<LeaguePlayerDecks> | null
): string {
  const deckList: ReadonlyArray<LeagueDeckEntry> =
    deckDoc && Array.isArray(deckDoc.decks) ? deckDoc.decks : [];
  if (deckList.length === 0) {
    return 'Belum isi deck';
  }
  const d1 = deckList[0];
  const d2 = deckList[1];
  const part1 = d1?.name
    ? `Deck 1: ${d1.name} [${(d1.colors || []).join('/')}]`
    : 'Deck 1: -';
  const part2 = d2?.name
    ? `Deck 2: ${d2.name} [${(d2.colors || []).join('/')}]`
    : 'Deck 2: -';
  return `${part1} | ${part2}`;
}
