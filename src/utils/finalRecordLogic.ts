import type { Participation, TopCutResultLabel, Tournament } from '../types/index.ts';
import { isLeagueTournament } from './seasonLogic.ts';
import {
  calculateMatchPoints,
  calculateTournamentStandings,
  type StandingMatchInput,
  type StandingPlayerInput,
  type TournamentFormat,
} from './standingsLogic.ts';
import { filterSwissMatches, isTopCutMatch } from './topCutLogic.ts';

export interface PlayerTopCutRecord {
  wins: number;
  losses: number;
  points: number;
}

export interface SwissRecordInput {
  wins: number;
  losses: number;
  points: number;
}

export interface MergedFinalRecord {
  wins: number;
  losses: number;
  points: number;
  swissWins?: number;
  swissLosses?: number;
  swissPoints?: number;
  topCutWins?: number;
  topCutLosses?: number;
  topCutPoints?: number;
}

export interface RecordBreakdownLike {
  swissWins?: number;
  swissLosses?: number;
  topCutWins?: number;
  topCutLosses?: number;
  topCutResult?: TopCutResultLabel | string;
}

export interface SwissStandingRecordLike {
  wins: number;
  losses: number;
  points?: number;
  swissWins?: number;
  swissLosses?: number;
  swissPoints?: number;
}

export interface RecalcParticipationCandidate {
  id: string;
  playerId: string;
  name: string;
  topCutResult?: TopCutResultLabel | string;
  swissWins?: number;
  swissLosses?: number;
  swissPoints?: number;
  topCutWins?: number;
  topCutLosses?: number;
  topCutPoints?: number;
}

export interface RecalculatedFinalRecordPatchItem {
  participationId: string;
  playerId: string;
  playerName: string;
  patch: {
    wins: number;
    losses: number;
    points: number;
    swissWins: number;
    swissLosses: number;
    swissPoints: number;
    topCutWins: number;
    topCutLosses: number;
    topCutPoints: number;
  };
}

/**
 * Menghitung rekor W/L dan poin babak Top Cut per pemain dari pertandingan
 * stage 'topcut' yang berstatus 'confirmed' dan tidak diarsipkan.
 */
export function calculateTopCutRecordsByPlayer(
  matches: ReadonlyArray<StandingMatchInput> | null | undefined,
  format: TournamentFormat
): Map<string, PlayerTopCutRecord> {
  const map = new Map<string, PlayerTopCutRecord>();
  if (!matches || !Array.isArray(matches)) return map;

  const ensureRecord = (playerId: string): PlayerTopCutRecord => {
    let rec = map.get(playerId);
    if (!rec) {
      rec = { wins: 0, losses: 0, points: 0 };
      map.set(playerId, rec);
    }
    return rec;
  };

  for (const m of matches) {
    if (!m || m.archived || !isTopCutMatch(m) || m.status !== 'confirmed') {
      continue;
    }

    const isBye = m.p2Id === null;
    const p1Rec = ensureRecord(m.p1Id);
    const p1Points = calculateMatchPoints(format, m.p1Score, m.p2Score, isBye);
    p1Rec.points += p1Points;
    if (isBye || m.p1Score > m.p2Score) {
      p1Rec.wins += 1;
    } else {
      p1Rec.losses += 1;
    }

    if (!isBye && m.p2Id) {
      const p2Rec = ensureRecord(m.p2Id);
      const p2Points = calculateMatchPoints(format, m.p2Score, m.p1Score, false);
      p2Rec.points += p2Points;
      if (m.p2Score > m.p1Score) {
        p2Rec.wins += 1;
      } else {
        p2Rec.losses += 1;
      }
    }
  }

  return map;
}

/**
 * Menggabungkan rekor Swiss dan Top Cut ke total wins/losses/points serta rinciannya.
 * Untuk turnamen tanpa Top Cut atau turnamen reguler (includeTopCut = false),
 * total = Swiss dan field rincian tidak ditambahkan.
 */
export function mergeSwissAndTopCutRecord(
  swiss: SwissRecordInput,
  topCutRecord: PlayerTopCutRecord | undefined,
  includeTopCut: boolean
): MergedFinalRecord {
  if (!includeTopCut) {
    return {
      wins: swiss.wins,
      losses: swiss.losses,
      points: swiss.points,
    };
  }

  const tcWins = topCutRecord?.wins ?? 0;
  const tcLosses = topCutRecord?.losses ?? 0;
  const tcPoints = topCutRecord?.points ?? 0;

  return {
    wins: swiss.wins + tcWins,
    losses: swiss.losses + tcLosses,
    points: swiss.points + tcPoints,
    swissWins: swiss.wins,
    swissLosses: swiss.losses,
    swissPoints: swiss.points,
    topCutWins: tcWins,
    topCutLosses: tcLosses,
    topCutPoints: tcPoints,
  };
}

/**
 * Memformat keterangan rincian "Swiss a-b • Top Cut c-d" khusus untuk pemain
 * yang memiliki data babak Top Cut.
 */
export function formatFinalRecordBreakdown(
  p: RecordBreakdownLike | null | undefined
): string | null {
  if (!p) return null;
  if (
    typeof p.swissWins !== 'number' ||
    typeof p.swissLosses !== 'number' ||
    typeof p.topCutWins !== 'number' ||
    typeof p.topCutLosses !== 'number'
  ) {
    return null;
  }

  const hasTopCutMatches = p.topCutWins + p.topCutLosses > 0;
  if (!hasTopCutMatches && !p.topCutResult) {
    return null;
  }

  return `Swiss ${p.swissWins}-${p.swissLosses} • Top Cut ${p.topCutWins}-${p.topCutLosses}`;
}

/**
 * Mengambil rekor Swiss untuk tabel "Klasemen Swiss (sebelum Top Cut)" pada ekspor.
 * Fallback ke total wins/losses/points bila data lama belum memiliki field swiss*.
 */
export function getSwissStandingRecord(
  p: SwissStandingRecordLike
): { wins: number; losses: number; points: number } {
  return {
    wins: typeof p.swissWins === 'number' ? p.swissWins : p.wins,
    losses: typeof p.swissLosses === 'number' ? p.swissLosses : p.losses,
    points: typeof p.swissPoints === 'number' ? p.swissPoints : (p.points ?? 0),
  };
}

/**
 * Mendeteksi apakah Turnamen Liga dengan Top Cut memiliki data partisipasi lama
 * yang belum menyimpan field rincian `swissWins` pada peserta Top Cut.
 */
export function needsLeagueFinalRecordRecalc(
  tournament: Pick<Tournament, 'type' | 'season' | 'topCut'> | null | undefined,
  participations: ReadonlyArray<RecalcParticipationCandidate> | null | undefined
): boolean {
  if (!tournament || !participations || participations.length === 0) {
    return false;
  }
  if (!isLeagueTournament(tournament) || !tournament.topCut) {
    return false;
  }
  return participations.some(
    (p) => Boolean(p.topCutResult) && typeof p.swissWins !== 'number'
  );
}

/**
 * Menyusun daftar patch pembaruan rekor final (total + rincian Swiss/Top Cut)
 * dari data pemain & pertandingan tanpa mengubah rank akhir, topCutResult, maupun metrik Swiss.
 */
export function buildRecalculatedFinalRecordsPlan(
  tournament: Pick<Tournament, 'type' | 'season' | 'topCut' | 'format'>,
  players: ReadonlyArray<StandingPlayerInput>,
  matches: ReadonlyArray<StandingMatchInput>,
  existingParticipations: ReadonlyArray<
    Pick<Participation, 'id' | 'playerId' | 'name'>
  >
): RecalculatedFinalRecordPatchItem[] {
  if (!isLeagueTournament(tournament) || !tournament.topCut) {
    return [];
  }

  const swissStandings = calculateTournamentStandings(
    [...players],
    filterSwissMatches([...matches]),
    tournament.format
  );
  const swissMap = new Map(swissStandings.map((s) => [s.playerId, s]));
  const topCutRecordsMap = calculateTopCutRecordsByPlayer(matches, tournament.format);

  const items: RecalculatedFinalRecordPatchItem[] = [];
  for (const p of existingParticipations) {
    const s = swissMap.get(p.playerId);
    if (!s) continue;

    const merged = mergeSwissAndTopCutRecord(
      { wins: s.matchWins, losses: s.matchLosses, points: s.points },
      topCutRecordsMap.get(p.playerId),
      true
    );

    items.push({
      participationId: p.id,
      playerId: p.playerId,
      playerName: p.name,
      patch: {
        wins: merged.wins,
        losses: merged.losses,
        points: merged.points,
        swissWins: merged.swissWins ?? s.matchWins,
        swissLosses: merged.swissLosses ?? s.matchLosses,
        swissPoints: merged.swissPoints ?? s.points,
        topCutWins: merged.topCutWins ?? 0,
        topCutLosses: merged.topCutLosses ?? 0,
        topCutPoints: merged.topCutPoints ?? 0,
      },
    });
  }

  return items;
}
