import type { Participation } from '../types/index.ts';

export interface DeletionOperation {
  type: 'match' | 'round' | 'player' | 'deck' | 'inviteClaim' | 'announcement' | 'participation' | 'leagueInvite' | 'tournament';
  id: string;
  path: string;
}

export interface TournamentSubcollectionItems {
  matches?: Array<{ id: string }>;
  rounds?: Array<{ id: string }>;
  players?: Array<{ id: string }>;
  decks?: Array<{ id: string }>;
  inviteClaims?: Array<{ id: string }>;
  announcements?: Array<{ id: string }>;
  participations?: Array<{ id: string }>;
  leagueInvites?: Array<{ id: string }>;
}

/**
 * Menyusun daftar operasi penghapusan berantai turnamen secara berurutan:
 * (1) matches (termasuk yang archived)
 * (2) rounds
 * (3) players
 * (4) decks (subkoleksi deck liga)
 * (5) inviteClaims (subkoleksi klaim undangan liga)
 * (6) participations (tournamentId == tid)
 * (7) leagueInvites (tournamentId == tid)
 * (8) TERAKHIR: dokumen turnamen itu sendiri
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

  // 4. Decks
  if (items.decks && items.decks.length > 0) {
    for (const d of items.decks) {
      operations.push({
        type: 'deck',
        id: d.id,
        path: `tournaments/${tournamentId}/decks/${d.id}`
      });
    }
  }

  // 5. Invite Claims
  if (items.inviteClaims && items.inviteClaims.length > 0) {
    for (const claim of items.inviteClaims) {
      operations.push({
        type: 'inviteClaim',
        id: claim.id,
        path: `tournaments/${tournamentId}/inviteClaims/${claim.id}`
      });
    }
  }

  // 5b. Announcements
  if (items.announcements && items.announcements.length > 0) {
    for (const ann of items.announcements) {
      operations.push({
        type: 'announcement',
        id: ann.id,
        path: `tournaments/${tournamentId}/announcements/${ann.id}`
      });
    }
  }

  // 6. Participations
  if (items.participations && items.participations.length > 0) {
    for (const part of items.participations) {
      operations.push({
        type: 'participation',
        id: part.id,
        path: `participations/${part.id}`
      });
    }
  }

  // 6. League Invites
  if (items.leagueInvites && items.leagueInvites.length > 0) {
    for (const inv of items.leagueInvites) {
      operations.push({
        type: 'leagueInvite',
        id: inv.id,
        path: `leagueInvites/${inv.id}`
      });
    }
  }

  // 7. Dokumen turnamen utama (selalu paling akhir)
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

/**
 * Mencari dokumen leagueInvites yatim (turnamennya sudah tidak ada di sistem)
 */
export function findOrphanLeagueInvites<
  T extends { id?: string; code?: string; tournamentId?: string | null }
>(
  invites: T[],
  existingTournamentIds: Set<string> | string[]
): T[] {
  if (!invites || invites.length === 0) return [];
  const validSet =
    existingTournamentIds instanceof Set
      ? existingTournamentIds
      : new Set(existingTournamentIds || []);

  return invites.filter(
    (inv) => !inv.tournamentId || !validSet.has(inv.tournamentId)
  );
}

/**
 * Mencari dokumen inviteClaims yatim:
 * - Turnamen induknya sudah tidak ada di sistem, ATAU
 * - (Bila existingPlayerKeys diberikan) dokumen pemainnya di turnamen tersebut sudah tidak ada
 *   dan melewati masa tenggang (gracePeriodMs) agar tidak mengganggu proses daftar yang sedang berjalan.
 */
export function findOrphanInviteClaims<
  T extends {
    id?: string;
    uid?: string;
    tournamentId?: string | null;
    createdAt?: number;
  }
>(
  claims: T[],
  existingTournamentIds: Set<string> | string[],
  existingPlayerKeys?: Set<string> | string[],
  nowMs: number = Date.now(),
  gracePeriodMs: number = 60_000
): T[] {
  if (!claims || claims.length === 0) return [];
  const validTournaments =
    existingTournamentIds instanceof Set
      ? existingTournamentIds
      : new Set(existingTournamentIds || []);

  const validPlayers =
    existingPlayerKeys === undefined
      ? null
      : existingPlayerKeys instanceof Set
      ? existingPlayerKeys
      : new Set(existingPlayerKeys || []);

  return claims.filter((claim) => {
    const tid = claim.tournamentId || '';
    if (!tid || !validTournaments.has(tid)) {
      return true;
    }

    if (validPlayers !== null) {
      const pid = claim.uid || claim.id || '';
      const playerKey = `${tid}/${pid}`;
      if (!pid || !validPlayers.has(playerKey)) {
        const ageMs =
          typeof claim.createdAt === 'number' ? nowMs - claim.createdAt : Number.POSITIVE_INFINITY;
        return ageMs > gracePeriodMs;
      }
    }

    return false;
  });
}
