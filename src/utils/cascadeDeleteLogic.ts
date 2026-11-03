import type { Participation } from '../types/index.ts';

export interface DeletionOperation {
  type: 'match' | 'round' | 'player' | 'participation' | 'tournament';
  id: string;
  path: string;
}

export interface TournamentSubcollectionItems {
  matches?: Array<{ id: string }>;
  rounds?: Array<{ id: string }>;
  players?: Array<{ id: string }>;
  participations?: Array<{ id: string }>;
}

/**
 * Menyusun daftar operasi penghapusan berantai turnamen secara berurutan:
 * (1) matches (termasuk yang archived)
 * (2) rounds
 * (3) players
 * (4) participations (tournamentId == tid)
 * (5) TERAKHIR: dokumen turnamen itu sendiri
 */
export function planTournamentDeletion(
  tournamentId: string,
  items: TournamentSubcollectionItems
): DeletionOperation[] {
  const operations: DeletionOperation[] = [];

  // 1. Matches
  if (items.matches && items.matches.length > 0) {
    for (const m of items.matches) {
      operations.push({
        type: 'match',
        id: m.id,
        path: `tournaments/${tournamentId}/matches/${m.id}`
      });
    }
  }

  // 2. Rounds
  if (items.rounds && items.rounds.length > 0) {
    for (const r of items.rounds) {
      operations.push({
        type: 'round',
        id: r.id,
        path: `tournaments/${tournamentId}/rounds/${r.id}`
      });
    }
  }

  // 3. Players
  if (items.players && items.players.length > 0) {
    for (const p of items.players) {
      operations.push({
        type: 'player',
        id: p.id,
        path: `tournaments/${tournamentId}/players/${p.id}`
      });
    }
  }

  // 4. Participations
  if (items.participations && items.participations.length > 0) {
    for (const part of items.participations) {
      operations.push({
        type: 'participation',
        id: part.id,
        path: `participations/${part.id}`
      });
    }
  }

  // 5. Dokumen turnamen utama (selalu paling akhir)
  operations.push({
    type: 'tournament',
    id: tournamentId,
    path: `tournaments/${tournamentId}`
  });

  return operations;
}

/**
 * Memecah daftar operasi menjadi potongan (chunks) dengan ukuran maksimal tertentu (bawaan 400).
 * Menjamin tidak pernah melebihi 400 operasi per potongan (batas Firestore 500) dan tidak kehilangan elemen.
 */
export function chunkOperations<T>(items: T[], chunkSize = 400): T[][] {
  if (!items || items.length === 0) return [];
  const safeChunkSize = Math.max(1, Math.min(chunkSize, 400));
  const chunks: T[][] = [];

  for (let i = 0; i < items.length; i += safeChunkSize) {
    chunks.push(items.slice(i, i + safeChunkSize));
  }

  return chunks;
}

/**
 * Menyaring data partisipasi agar hanya menyertakan turnamen yang masih ada.
 * Mendukung masukan Set<string> maupun string[].
 */
export function filterParticipationsByExistingTournaments(
  participations: Participation[],
  existingTournamentIds: Set<string> | string[]
): Participation[] {
  if (!participations || participations.length === 0) return [];
  const validSet =
    existingTournamentIds instanceof Set
      ? existingTournamentIds
      : new Set(existingTournamentIds || []);

  return participations.filter(
    (p) => p.tournamentId && validSet.has(p.tournamentId)
  );
}

/**
 * Mencari data partisipasi yatim (turnamennya sudah tidak ada di sistem)
 */
export function findOrphanParticipations(
  participations: Participation[],
  existingTournamentIds: Set<string> | string[]
): Participation[] {
  if (!participations || participations.length === 0) return [];
  const validSet =
    existingTournamentIds instanceof Set
      ? existingTournamentIds
      : new Set(existingTournamentIds || []);

  return participations.filter(
    (p) => !p.tournamentId || !validSet.has(p.tournamentId)
  );
}
