import type {
  LeagueDeckEntry,
  LeagueDeckIndex,
  LeaguePlayerDecks,
  MatchGameRecord,
  MatchGameWinner,
  TournamentMatch,
} from '../types/index.ts';
import { hasValidTwoLeagueDecks } from './leagueDeckLogic.ts';

export interface DraftMatchGame {
  winner: MatchGameWinner | null;
  p1Deck: LeagueDeckIndex | null;
  p2Deck: LeagueDeckIndex | null;
}

export interface MatchGamesValidationResult {
  valid: boolean;
  error?: string;
  p1Score?: number;
  p2Score?: number;
  sanitized?: MatchGameRecord[];
}

export type LeagueDeckLookup =
  | Map<string, LeaguePlayerDecks>
  | Record<string, LeaguePlayerDecks | undefined>;

function lookupPlayerDeckDoc(
  lookup: LeagueDeckLookup | null | undefined,
  playerId: string
): LeaguePlayerDecks | undefined {
  if (!lookup) return undefined;
  if (lookup instanceof Map) {
    return lookup.get(playerId);
  }
  return lookup[playerId];
}

/**
 * Memeriksa apakah pertandingan menggunakan mekanisme per-game liga (memiliki 2 deck kedua pemain & bukan BYE).
 */
export function isLeaguePerGameMatch(
  match?: Pick<TournamentMatch, 'p2Id' | 'p1Decks' | 'p2Decks'> | null
): boolean {
  return Boolean(
    match &&
      match.p2Id !== null &&
      Array.isArray(match.p1Decks) &&
      match.p1Decks.length === 2 &&
      Array.isArray(match.p2Decks) &&
      match.p2Decks.length === 2
  );
}

/**
 * Menyalin pasangan 2 deck agar snapshot pada dokumen match terisolasi dari perubahan deck berikutnya.
 */
export function cloneLeagueDecksPair(
  decks: ReadonlyArray<LeagueDeckEntry>
): [LeagueDeckEntry, LeagueDeckEntry] {
  return [
    {
      name: String(decks[0].name).trim(),
      colors: [...(decks[0].colors || [])],
    },
    {
      name: String(decks[1].name).trim(),
      colors: [...(decks[1].colors || [])],
    },
  ];
}

export interface PairingDraftWithPlayers {
  p1Id: string;
  p2Id: string | null;
  p1Name: string;
  p2Name: string;
}

/**
 * Menyalin snapshot 2 deck kedua pemain ke setiap draft pairing non-BYE pada Turnamen Liga.
 * Pemain BYE tidak diberi p1Decks/p2Decks.
 * Jika ada pemain non-BYE yang tidak memiliki 2 deck valid, lempar Error dengan daftar nama pemainnya.
 */
export function attachLeagueDecksToPairingDrafts<T extends PairingDraftWithPlayers>(
  drafts: ReadonlyArray<T>,
  deckLookup: LeagueDeckLookup | null | undefined
): Array<
  T & {
    p1Decks?: [LeagueDeckEntry, LeagueDeckEntry];
    p2Decks?: [LeagueDeckEntry, LeagueDeckEntry];
  }
> {
  const missingPlayerNames: string[] = [];
  const missingIds = new Set<string>();

  const registerMissing = (playerId: string, playerName: string) => {
    if (!missingIds.has(playerId)) {
      missingIds.add(playerId);
      missingPlayerNames.push(playerName || playerId);
    }
  };

  const results: Array<
    T & {
      p1Decks?: [LeagueDeckEntry, LeagueDeckEntry];
      p2Decks?: [LeagueDeckEntry, LeagueDeckEntry];
    }
  > = [];

  for (const draft of drafts) {
    // BYE tidak memiliki snapshot deck
    if (draft.p2Id === null) {
      results.push({ ...draft });
      continue;
    }

    const p1Doc = lookupPlayerDeckDoc(deckLookup, draft.p1Id);
    const p2Doc = lookupPlayerDeckDoc(deckLookup, draft.p2Id);

    if (!hasValidTwoLeagueDecks(p1Doc)) {
      registerMissing(draft.p1Id, draft.p1Name);
    }
    if (!hasValidTwoLeagueDecks(p2Doc)) {
      registerMissing(draft.p2Id, draft.p2Name);
    }

    if (p1Doc && p2Doc && hasValidTwoLeagueDecks(p1Doc) && hasValidTwoLeagueDecks(p2Doc)) {
      results.push({
        ...draft,
        p1Decks: cloneLeagueDecksPair(p1Doc.decks),
        p2Decks: cloneLeagueDecksPair(p2Doc.decks),
      });
    } else {
      results.push({ ...draft });
    }
  }

  if (missingPlayerNames.length > 0) {
    throw new Error(
      `Pembuatan ronde dibatalkan karena pemain berikut belum memiliki 2 deck valid: ${missingPlayerNames.join(', ')}.`
    );
  }

  return results;
}

/**
 * Game 3 hanya muncul bila Game 1 dan Game 2 dimenangkan oleh pemain yang berbeda (1 - 1).
 */
export function needsGame3(
  game1Winner: MatchGameWinner | null | undefined,
  game2Winner: MatchGameWinner | null | undefined
): boolean {
  if (
    (game1Winner !== 'p1' && game1Winner !== 'p2') ||
    (game2Winner !== 'p1' && game2Winner !== 'p2')
  ) {
    return false;
  }
  return game1Winner !== game2Winner;
}

/**
 * Membuat state awal 3 slot Game untuk form input skor per game.
 * Jika tidak ada `existingGames`, Game 1 dimulai tanpa pilihan deck (null) untuk kedua pemain.
 */
export function createInitialDraftGames(
  existingGames?: ReadonlyArray<MatchGameRecord> | null
): [DraftMatchGame, DraftMatchGame, DraftMatchGame] {
  const empty = (): DraftMatchGame => ({ winner: null, p1Deck: null, p2Deck: null });
  if (!existingGames || existingGames.length === 0) {
    return [empty(), empty(), empty()];
  }

  const toDraft = (g?: MatchGameRecord): DraftMatchGame =>
    g
      ? {
          winner: g.winner === 'p1' || g.winner === 'p2' ? g.winner : null,
          p1Deck: g.p1Deck === 0 || g.p1Deck === 1 ? g.p1Deck : null,
          p2Deck: g.p2Deck === 0 || g.p2Deck === 1 ? g.p2Deck : null,
        }
      : empty();

  return [
    toDraft(existingGames[0]),
    toDraft(existingGames[1]),
    toDraft(existingGames[2]),
  ];
}

/**
 * Mengembalikan daftar game yang aktif ditampilkan (2 game jika 2-0/0-2 atau belum 1-1, 3 game jika 1-1).
 */
export function getVisibleDraftGames(
  draftGames: ReadonlyArray<DraftMatchGame>
): DraftMatchGame[] {
  const g1 = draftGames[0] || { winner: null, p1Deck: null, p2Deck: null };
  const g2 = draftGames[1] || { winner: null, p1Deck: null, p2Deck: null };
  if (needsGame3(g1.winner, g2.winner)) {
    const g3 = draftGames[2] || { winner: null, p1Deck: null, p2Deck: null };
    return [g1, g2, g3];
  }
  return [g1, g2];
}

/**
 * Menurunkan skor total p1Score dan p2Score dari daftar game.
 */
export function deriveMatchScoresFromGames(
  games: ReadonlyArray<Pick<DraftMatchGame, 'winner'>>
): { p1Score: number; p2Score: number } {
  let p1Score = 0;
  let p2Score = 0;
  for (const g of games) {
    if (g.winner === 'p1') p1Score += 1;
    else if (g.winner === 'p2') p2Score += 1;
  }
  return { p1Score, p2Score };
}

/**
 * Memeriksa apakah semua game yang ditampilkan sudah lengkap (kedua deck & pemenang terisi)
 * dan menghasilkan pemenang BO3 yang sah (tanpa seri).
 */
export function isMatchGamesFormComplete(
  draftGames: ReadonlyArray<DraftMatchGame>
): boolean {
  const visible = getVisibleDraftGames(draftGames);
  if (visible.length !== 2 && visible.length !== 3) return false;

  for (const g of visible) {
    if (g.winner !== 'p1' && g.winner !== 'p2') return false;
    if (g.p1Deck !== 0 && g.p1Deck !== 1) return false;
    if (g.p2Deck !== 0 && g.p2Deck !== 1) return false;
  }

  const { p1Score, p2Score } = deriveMatchScoresFromGames(visible);
  return (
    (p1Score === 2 && (p2Score === 0 || p2Score === 1)) ||
    (p2Score === 2 && (p1Score === 0 || p1Score === 1))
  );
}

/**
 * Mengonversi draft form menjadi array MatchGameRecord yang siap disimpan (Game 3 dibuang jika 2-0/0-2).
 */
export function toSubmittedMatchGames(
  draftGames: ReadonlyArray<DraftMatchGame>
): MatchGameRecord[] {
  const visible = getVisibleDraftGames(draftGames);
  return visible.map((g) => ({
    winner: g.winner as MatchGameWinner,
    p1Deck: g.p1Deck as LeagueDeckIndex,
    p2Deck: g.p2Deck as LeagueDeckIndex,
  }));
}

/**
 * Validasi ketat array `games` pada layer service & aturan BO3 liga.
 */
export function validateMatchGames(
  games: ReadonlyArray<Partial<MatchGameRecord>> | null | undefined,
  p1Decks?: ReadonlyArray<LeagueDeckEntry> | null,
  p2Decks?: ReadonlyArray<LeagueDeckEntry> | null
): MatchGamesValidationResult {
  if (!Array.isArray(games)) {
    return { valid: false, error: 'Data hasil per game wajib diisi.' };
  }

  if (p1Decks && p1Decks.length !== 2) {
    return { valid: false, error: 'Snapshot 2 deck Pemain 1 tidak lengkap.' };
  }
  if (p2Decks && p2Decks.length !== 2) {
    return { valid: false, error: 'Snapshot 2 deck Pemain 2 tidak lengkap.' };
  }

  if (games.length < 2 || games.length > 3) {
    return {
      valid: false,
      error: 'Pertandingan BO3 harus memiliki 2 game (2-0 / 0-2) atau 3 game (2-1 / 1-2).',
    };
  }

  const sanitized: MatchGameRecord[] = [];
  for (let i = 0; i < games.length; i++) {
    const g = games[i];
    if (!g || (g.winner !== 'p1' && g.winner !== 'p2')) {
      return {
        valid: false,
        error: `Pemenang Game ${i + 1} belum dipilih dengan valid.`,
      };
    }
    if (g.p1Deck !== 0 && g.p1Deck !== 1) {
      return {
        valid: false,
        error: `Pilihan deck Pemain 1 pada Game ${i + 1} tidak valid.`,
      };
    }
    if (g.p2Deck !== 0 && g.p2Deck !== 1) {
      return {
        valid: false,
        error: `Pilihan deck Pemain 2 pada Game ${i + 1} tidak valid.`,
      };
    }
    if (p1Decks && !p1Decks[g.p1Deck]) {
      return {
        valid: false,
        error: `Deck Pemain 1 pada Game ${i + 1} tidak ditemukan.`,
      };
    }
    if (p2Decks && !p2Decks[g.p2Deck]) {
      return {
        valid: false,
        error: `Deck Pemain 2 pada Game ${i + 1} tidak ditemukan.`,
      };
    }

    sanitized.push({
      winner: g.winner,
      p1Deck: g.p1Deck,
      p2Deck: g.p2Deck,
    });
  }

  const g1Winner = sanitized[0].winner;
  const g2Winner = sanitized[1].winner;

  if (sanitized.length === 2 && g1Winner !== g2Winner) {
    return {
      valid: false,
      error: 'Skor 1 - 1 memerlukan Game 3 karena tidak ada hasil seri.',
    };
  }

  if (sanitized.length === 3 && g1Winner === g2Winner) {
    return {
      valid: false,
      error: 'Game 3 tidak boleh diisi jika pertandingan sudah berakhir 2 - 0.',
    };
  }

  const { p1Score, p2Score } = deriveMatchScoresFromGames(sanitized);
  const validScore =
    (p1Score === 2 && (p2Score === 0 || p2Score === 1)) ||
    (p2Score === 2 && (p1Score === 0 || p1Score === 1));

  if (!validScore) {
    return {
      valid: false,
      error: 'Hasil akhir BO3 harus 2-0, 2-1, 1-2, atau 0-2.',
    };
  }

  return {
    valid: true,
    p1Score,
    p2Score,
    sanitized,
  };
}

/**
 * Memformat ringkasan per-game (pemenang & nama deck) untuk audit log & tampilan ringkas.
 */
export function formatMatchGamesAuditSummary(
  games: ReadonlyArray<MatchGameRecord>,
  p1Name: string,
  p2Name: string,
  p1Decks?: ReadonlyArray<LeagueDeckEntry> | null,
  p2Decks?: ReadonlyArray<LeagueDeckEntry> | null
): string {
  return games
    .map((g, idx) => {
      const winnerName = g.winner === 'p1' ? p1Name : p2Name;
      const d1Name = p1Decks?.[g.p1Deck]?.name || `Deck ${g.p1Deck + 1}`;
      const d2Name = p2Decks?.[g.p2Deck]?.name || `Deck ${g.p2Deck + 1}`;
      return `G${idx + 1}: ${winnerName} menang (${p1Name}: ${d1Name} vs ${p2Name}: ${d2Name})`;
    })
    .join('; ');
}

export function buildMatchAuditLogValues(
  match: Pick<
    TournamentMatch,
    'p1Score' | 'p2Score' | 'status' | 'p1Name' | 'p2Name' | 'p1Decks' | 'p2Decks' | 'games'
  >,
  newP1Score: number,
  newP2Score: number,
  newGames?: ReadonlyArray<MatchGameRecord>
): { oldValue: string; newValue: string } {
  const baseOld = `${match.p1Score} - ${match.p2Score} (${match.status})`;
  const oldValue =
    match.games && match.games.length > 0
      ? `${baseOld} | ${formatMatchGamesAuditSummary(
          match.games,
          match.p1Name,
          match.p2Name,
          match.p1Decks,
          match.p2Decks
        )}`
      : baseOld;

  const baseNew = `${newP1Score} - ${newP2Score} (confirmed)`;
  const newValue =
    newGames && newGames.length > 0
      ? `${baseNew} | ${formatMatchGamesAuditSummary(
          newGames,
          match.p1Name,
          match.p2Name,
          match.p1Decks,
          match.p2Decks
        )}`
      : baseNew;

  return { oldValue, newValue };
}
