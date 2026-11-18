import type {
  TopCutResultLabel,
  TopCutSeed,
  TopCutSize,
  TournamentTopCut
} from '../types/index.ts';
import {
  calculateTournamentStandings,
  type PlayerStanding,
  type StandingMatchInput,
  type StandingPlayerInput,
  type TournamentFormat
} from './standingsLogic.ts';

export interface StageScopedItem {
  stage?: string | null;
  archived?: boolean;
}

export interface TopCutMatchLike {
  id?: string;
  round: number;
  stage?: string | null;
  table: number;
  p1Id: string;
  p2Id: string | null;
  p1Name: string;
  p2Name: string;
  p1Score: number;
  p2Score: number;
  status: string;
  archived?: boolean;
}

export interface TopCutPairingDraft {
  table: number;
  p1Id: string;
  p2Id: string;
  p1Name: string;
  p2Name: string;
  p1Score: 0;
  p2Score: 0;
  status: 'pending';
}

export interface FinalStandingWithTopCut extends PlayerStanding {
  swissRank: number;
  topCutResult?: TopCutResultLabel;
}

/**
 * Dokumen tanpa field `stage` diperlakukan sebagai ronde/pertandingan Swiss (backward-compatible).
 */
export function isSwissMatch(item: { stage?: string | null } | null | undefined): boolean {
  if (!item) return false;
  return !item.stage || item.stage === 'swiss';
}

export function isTopCutMatch(item: { stage?: string | null } | null | undefined): boolean {
  if (!item) return false;
  return item.stage === 'topcut';
}

export function filterSwissMatches<T extends { stage?: string | null }>(matches: T[]): T[] {
  return (matches || []).filter((m) => isSwissMatch(m));
}

export function filterTopCutMatches<T extends { stage?: string | null }>(matches: T[]): T[] {
  return (matches || []).filter((m) => isTopCutMatch(m));
}

/**
 * Mengecek kelayakan peserta aktif (accepted dan bukan dropped) untuk memulai Top 4 / Top 8.
 */
export function checkTopCutEligibility(
  players: StandingPlayerInput[]
): { activeCount: number; canStartTop4: boolean; canStartTop8: boolean } {
  const activeCount = (players || []).filter(
    (p) => p && p.status !== 'dropped' && p.status !== 'waiting' && p.status !== 'rejected'
  ).length;
  return {
    activeCount,
    canStartTop4: activeCount >= 4,
    canStartTop8: activeCount >= 8,
  };
}

export function getTopCutRoundCount(topCutSize: TopCutSize): number {
  return topCutSize === 8 ? 3 : 2;
}

export function getTopCutFinalRoundNumber(
  totalSwissRounds: number,
  topCutSize: TopCutSize
): number {
  return totalSwissRounds + getTopCutRoundCount(topCutSize);
}

/**
 * Mengembalikan label babak untuk ditampilkan di UI:
 * - Ronde Swiss -> "Ronde X"
 * - Top 4: R+1 -> "Semifinal", R+2 -> "Final"
 * - Top 8: R+1 -> "Perempat Final", R+2 -> "Semifinal", R+3 -> "Final"
 */
export function getRoundDisplayLabel(
  roundNumber: number,
  totalSwissRounds: number,
  topCutSize?: TopCutSize | null
): string {
  if (!topCutSize || roundNumber <= totalSwissRounds) {
    return `Ronde ${roundNumber}`;
  }

  const offset = roundNumber - totalSwissRounds;
  if (topCutSize === 4) {
    if (offset === 1) return 'Semifinal';
    if (offset === 2) return 'Final';
    return 'Top 4';
  }

  if (offset === 1) return 'Perempat Final';
  if (offset === 2) return 'Semifinal';
  if (offset === 3) return 'Final';
  return 'Top 8';
}

export function getNextTopCutRoundLabel(
  currentRoundNumber: number,
  totalSwissRounds: number,
  topCutSize: TopCutSize
): string | null {
  const finalRound = getTopCutFinalRoundNumber(totalSwissRounds, topCutSize);
  const nextRound = currentRoundNumber + 1;
  if (nextRound > finalRound) return null;
  return getRoundDisplayLabel(nextRound, totalSwissRounds, topCutSize);
}

export function isFinalTopCutRound(
  roundNumber: number,
  totalSwissRounds: number,
  topCutSize?: TopCutSize | null
): boolean {
  if (!topCutSize) return false;
  return roundNumber === getTopCutFinalRoundNumber(totalSwissRounds, topCutSize);
}

/**
 * Mengambil seed Top 4 atau Top 8 dari klasemen Swiss akhir (melewati pemain dropped).
 */
export function buildTopCutSeeds(
  players: StandingPlayerInput[],
  matches: StandingMatchInput[],
  format: TournamentFormat,
  topCutSize: TopCutSize
): TopCutSeed[] {
  const playerStatusMap = new Map<string, string | undefined>();
  for (const p of players) {
    playerStatusMap.set(p.id, p.status);
  }

  const swissStandings = calculateTournamentStandings(
    players,
    filterSwissMatches(matches),
    format
  );

  const eligibleStandings = swissStandings.filter((s) => {
    const status = playerStatusMap.get(s.playerId);
    if (s.isDropped) return false;
    if (status === 'dropped' || status === 'waiting' || status === 'rejected') return false;
    return true;
  });

  if (eligibleStandings.length < topCutSize) {
    throw new Error(
      `Peserta aktif tidak mencukupi untuk Top ${topCutSize} (tersedia ${eligibleStandings.length}, minimal ${topCutSize}).`
    );
  }

  return eligibleStandings.slice(0, topCutSize).map((s) => ({
    playerId: s.playerId,
    name: s.playerName,
    swissRank: s.rank,
  }));
}

/**
 * Membentuk pasangan babak pertama Top Cut:
 * - Top 4: (1 vs 4), (2 vs 3)
 * - Top 8: (1 vs 8), (4 vs 5), (2 vs 7), (3 vs 6)
 */
export function createTopCutInitialMatches(
  seeds: TopCutSeed[],
  topCutSize: TopCutSize
): TopCutPairingDraft[] {
  if (!seeds || seeds.length < topCutSize) {
    throw new Error(`Jumlah seed (${seeds?.length || 0}) kurang untuk Top ${topCutSize}.`);
  }

  const pairIndices: Array<[number, number]> =
    topCutSize === 4
      ? [
          [0, 3], // Seed 1 vs 4
          [1, 2], // Seed 2 vs 3
        ]
      : [
          [0, 7], // Seed 1 vs 8 -> Pemenang bertemu Pemenang (4 vs 5) di Semifinal 1
          [3, 4], // Seed 4 vs 5
          [1, 6], // Seed 2 vs 7 -> Pemenang bertemu Pemenang (3 vs 6) di Semifinal 2
          [2, 5], // Seed 3 vs 6
        ];

  return pairIndices.map(([idx1, idx2], idx) => {
    const p1 = seeds[idx1];
    const p2 = seeds[idx2];
    return {
      table: idx + 1,
      p1Id: p1.playerId,
      p2Id: p2.playerId,
      p1Name: p1.name,
      p2Name: p2.name,
      p1Score: 0,
      p2Score: 0,
      status: 'pending',
    };
  });
}

/**
 * Mengambil pemenang dan yang kalah dari satu pertandingan Top Cut yang sudah terkonfirmasi.
 */
export function getTopCutMatchOutcome(match: TopCutMatchLike): {
  winnerId: string;
  winnerName: string;
  loserId: string | null;
  loserName: string | null;
} {
  if (match.status !== 'confirmed') {
    throw new Error('Semua pertandingan pada babak Top Cut harus terkonfirmasi sebelum lanjut.');
  }

  if (match.p2Id === null) {
    return {
      winnerId: match.p1Id,
      winnerName: match.p1Name,
      loserId: null,
      loserName: null,
    };
  }

  if (match.p1Score === match.p2Score) {
    throw new Error(
      `Pertandingan Meja #${match.table} (${match.p1Name} vs ${match.p2Name}) tidak boleh berakhir seri.`
    );
  }

  if (match.p1Score > match.p2Score) {
    return {
      winnerId: match.p1Id,
      winnerName: match.p1Name,
      loserId: match.p2Id,
      loserName: match.p2Name,
    };
  }

  return {
    winnerId: match.p2Id,
    winnerName: match.p2Name,
    loserId: match.p1Id,
    loserName: match.p1Name,
  };
}

/**
 * Membentuk pertandingan babak Top Cut berikutnya dari pemenang babak saat ini
 * sesuai urutan meja bagan standar:
 * - Meja 1 vs Meja 2 -> Semifinal/Final Meja 1
 * - Meja 3 vs Meja 4 -> Semifinal Meja 2
 */
export function buildNextTopCutRoundMatches(
  currentRoundMatches: TopCutMatchLike[]
): TopCutPairingDraft[] {
  const activeMatches = [...(currentRoundMatches || [])]
    .filter((m) => !m.archived)
    .sort((a, b) => a.table - b.table);

  if (activeMatches.length < 2 || activeMatches.length % 2 !== 0) {
    throw new Error('Jumlah pertandingan Top Cut tidak valid untuk membentuk babak berikutnya.');
  }

  const winners = activeMatches.map((m) => getTopCutMatchOutcome(m));
  const nextMatches: TopCutPairingDraft[] = [];

  for (let i = 0; i < winners.length; i += 2) {
    const w1 = winners[i];
    const w2 = winners[i + 1];
    nextMatches.push({
      table: nextMatches.length + 1,
      p1Id: w1.winnerId,
      p2Id: w2.winnerId,
      p1Name: w1.winnerName,
      p2Name: w2.winnerName,
      p1Score: 0,
      p2Score: 0,
      status: 'pending',
    });
  }

  return nextMatches;
}

/**
 * Menghitung peringkat akhir (rank) dan penanda Top Cut (topCutResult) setelah fase Top Cut selesai,
 * sambil mempertahankan metrik Swiss murni pada setiap pemain.
 */
export function computeFinalRankingsWithTopCut(
  swissStandings: PlayerStanding[],
  topCut: TournamentTopCut | null | undefined,
  matches: TopCutMatchLike[],
  totalSwissRounds: number
): FinalStandingWithTopCut[] {
  if (!topCut) {
    return swissStandings.map((s) => ({
      ...s,
      swissRank: s.rank,
    }));
  }

  const standingMap = new Map<string, PlayerStanding>();
  for (const s of swissStandings) {
    standingMap.set(s.playerId, s);
  }

  const seedSwissRankMap = new Map<string, number>();
  for (const seed of topCut.seeds || []) {
    seedSwissRankMap.set(seed.playerId, seed.swissRank);
  }

  const getSwissRank = (playerId: string): number => {
    return standingMap.get(playerId)?.rank ?? seedSwissRankMap.get(playerId) ?? Number.MAX_SAFE_INTEGER;
  };

  const activeTopCutMatches = (matches || []).filter(
    (m) => !m.archived && isTopCutMatch(m) && m.status === 'confirmed'
  );

  const quarterfinalRound = topCut.size === 8 ? totalSwissRounds + 1 : null;
  const semifinalRound = topCut.size === 8 ? totalSwissRounds + 2 : totalSwissRounds + 1;
  const finalRound = topCut.size === 8 ? totalSwissRounds + 3 : totalSwissRounds + 2;

  const assignedRankMap = new Map<string, { rank: number; topCutResult: TopCutResultLabel }>();

  // 1. Final: rank 1 = Juara, rank 2 = Runner-up
  const finalMatches = activeTopCutMatches.filter((m) => m.round === finalRound);
  for (const fm of finalMatches) {
    if (fm.p2Id && fm.p1Score !== fm.p2Score) {
      const outcome = getTopCutMatchOutcome(fm);
      assignedRankMap.set(outcome.winnerId, { rank: 1, topCutResult: 'Juara' });
      if (outcome.loserId) {
        assignedRankMap.set(outcome.loserId, { rank: 2, topCutResult: 'Runner-up' });
      }
    }
  }

  // 2. Semifinal losers: rank 3..4 diurutkan menurut swissRank ascending
  const semifinalLoserIds: string[] = [];
  const sfMatches = activeTopCutMatches.filter((m) => m.round === semifinalRound);
  for (const sfm of sfMatches) {
    if (sfm.p2Id && sfm.p1Score !== sfm.p2Score) {
      const outcome = getTopCutMatchOutcome(sfm);
      if (outcome.loserId && !assignedRankMap.has(outcome.loserId)) {
        semifinalLoserIds.push(outcome.loserId);
      }
    }
  }
  semifinalLoserIds.sort((a, b) => getSwissRank(a) - getSwissRank(b));
  let nextRank = 3;
  for (const pid of semifinalLoserIds) {
    assignedRankMap.set(pid, { rank: nextRank++, topCutResult: 'Semifinal' });
  }

  // 3. Perempat Final losers (khusus Top 8): rank 5..8 diurutkan menurut swissRank ascending
  if (quarterfinalRound !== null) {
    const qfLoserIds: string[] = [];
    const qfMatches = activeTopCutMatches.filter((m) => m.round === quarterfinalRound);
    for (const qfm of qfMatches) {
      if (qfm.p2Id && qfm.p1Score !== qfm.p2Score) {
        const outcome = getTopCutMatchOutcome(qfm);
        if (outcome.loserId && !assignedRankMap.has(outcome.loserId)) {
          qfLoserIds.push(outcome.loserId);
        }
      }
    }
    qfLoserIds.sort((a, b) => getSwissRank(a) - getSwissRank(b));
    nextRank = Math.max(nextRank, 5);
    for (const pid of qfLoserIds) {
      assignedRankMap.set(pid, { rank: nextRank++, topCutResult: 'Perempat Final' });
    }
  }

  // Jaga-jaga bila ada seed yang belum masuk peta (misal sebelum final selesai)
  const remainingSeeds = (topCut.seeds || [])
    .filter((seed) => !assignedRankMap.has(seed.playerId))
    .sort((a, b) => a.swissRank - b.swissRank);

  // Bila Final belum selesai, peringkat 1..N masih mengikuti urutan aktif / swiss;
  // saat Final selesai seluruh seed sudah masuk assignedRankMap.
  const hasChampion = Array.from(assignedRankMap.values()).some((v) => v.rank === 1);
  if (!hasChampion && assignedRankMap.size === 0) {
    return swissStandings.map((s) => ({
      ...s,
      swissRank: s.rank,
    }));
  }

  let tailRank = Math.max(nextRank, assignedRankMap.size + 1);
  const result: FinalStandingWithTopCut[] = [];

  // Tambahkan semua yang sudah memiliki rank Top Cut terlebih dahulu
  for (const s of swissStandings) {
    const tc = assignedRankMap.get(s.playerId);
    if (tc) {
      result.push({
        ...s,
        rank: tc.rank,
        swissRank: s.rank,
        topCutResult: tc.topCutResult,
      });
    }
  }

  // Tambahkan seed sisa (jika ada) diurutkan berdasar swissRank
  for (const seed of remainingSeeds) {
    const s = standingMap.get(seed.playerId);
    if (s) {
      result.push({
        ...s,
        rank: tailRank++,
        swissRank: s.rank,
      });
    }
  }

  // Tambahkan peserta non-Top-Cut berurutan berdasarkan klasemen Swiss
  for (const s of swissStandings) {
    const inSeeds = (topCut.seeds || []).some((seed) => seed.playerId === s.playerId);
    if (!assignedRankMap.has(s.playerId) && !inSeeds) {
      result.push({
        ...s,
        rank: tailRank++,
        swissRank: s.rank,
      });
    }
  }

  result.sort((a, b) => a.rank - b.rank || a.swissRank - b.swissRank);
  return result;
}
