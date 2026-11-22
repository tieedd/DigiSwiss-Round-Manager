export interface LinkOperation {
  type: 'update_player' | 'update_match' | 'delete_player' | 'audit_log';
  path: string;
  data?: any;
  matchId?: string;
  playerId?: string;
}

/**
 * Normalisasi nama pemain untuk perbandingan tanpa membedakan huruf besar-kecil dan spasi berlebih.
 */
export function normalizePlayerName(name: string | null | undefined): string {
  if (!name) return '';
  return name.trim().toLowerCase().replace(/\s+/g, ' ');
}

/**
 * Mencari pemain akun yang sudah mendaftar di turnamen ini dengan nama yang sama.
 * Status yang diperiksa: waiting, accepted, rejected.
 */
export function findAccountPlayerWithSameName(
  manualName: string | null | undefined,
  players: any[]
): any | null {
  const norm = normalizePlayerName(manualName);
  if (!norm) return null;

  const playerList = Array.isArray(players) ? players : [];
  return (
    playerList.find((p) => {
      // Hanya bandingkan dengan pemain akun (bukan manual)
      if (p.manual) return false;
      const pNorm = normalizePlayerName(p.name);
      const isRegistered = ['waiting', 'accepted', 'rejected'].includes(p.status);
      return pNorm === norm && isRegistered;
    }) || null
  );
}

/**
 * Mendeteksi nama ganda antara pemain manual dan pemain akun di dalam turnamen.
 */
export function detectDuplicatePlayerNames(
  players: any[]
): Array<{ manualPlayer: any; accountPlayer: any }> {
  const playerList = Array.isArray(players) ? players : [];
  const manualPlayers = playerList.filter((p) => p.manual);
  const accountPlayers = playerList.filter((p) => !p.manual);

  const duplicates: Array<{ manualPlayer: any; accountPlayer: any }> = [];

  for (const m of manualPlayers) {
    const mNorm = normalizePlayerName(m.name);
    if (!mNorm) continue;

    const matchedAccount = accountPlayers.find(
      (a) => normalizePlayerName(a.name) === mNorm
    );
    if (matchedAccount) {
      duplicates.push({
        manualPlayer: m,
        accountPlayer: matchedAccount,
      });
    }
  }

  return duplicates;
}

/**
 * Memeriksa masalah sebelum turnamen dimulai:
 * 1. Pemain akun yang masih berstatus waiting
 * 2. Nama ganda antara pemain manual dan akun
 */
export function detectPreflightIssues(players: any[]): {
  waitingAccountPlayers: any[];
  duplicatePairs: Array<{ manualPlayer: any; accountPlayer: any }>;
  hasIssues: boolean;
} {
  const playerList = Array.isArray(players) ? players : [];
  const waitingAccountPlayers = playerList.filter(
    (p) => !p.manual && p.status === 'waiting'
  );
  const duplicatePairs = detectDuplicatePlayerNames(playerList);

  return {
    waitingAccountPlayers,
    duplicatePairs,
    hasIssues: waitingAccountPlayers.length > 0 || duplicatePairs.length > 0,
  };
}

/**
 * Mengembalikan himpunan ID pemain (p1Id / p2Id) yang sudah tercatat di pertandingan mana pun.
 */
export function busyAccountIds(allMatches: any[]): Set<string> {
  const busy = new Set<string>();
  const matchList = Array.isArray(allMatches) ? allMatches : [];

  for (const m of matchList) {
    if (!m) continue;
    if (typeof m.p1Id === 'string' && m.p1Id.trim().length > 0) {
      busy.add(m.p1Id);
    }
    if (typeof m.p2Id === 'string' && m.p2Id.trim().length > 0) {
      busy.add(m.p2Id);
    }
  }

  return busy;
}

/**
 * Memeriksa apakah sebuah dokumen peserta memenuhi syarat sebagai tujuan tautan akun.
 */
export function isEligibleLinkTarget(
  player:
    | { id?: string; uid?: string | null; manual?: boolean; status?: string }
    | null
    | undefined,
  busyIds: Set<string> = new Set()
): boolean {
  if (!player || player.manual) return false;
  if (player.status !== 'waiting' && player.status !== 'accepted') return false;
  if (player.id && busyIds.has(player.id)) return false;
  if (player.uid && busyIds.has(player.uid)) return false;
  return true;
}

/**
 * Menyaring daftar peserta agar hanya menyisakan akun pendaftar yang valid dan belum bertanding.
 */
export function getEligibleLinkAccounts<
  T extends { id?: string; uid?: string | null; manual?: boolean; status?: string }
>(players: T[], busyIds: Set<string> = new Set()): T[] {
  const playerList = Array.isArray(players) ? players : [];
  return playerList.filter((p) => isEligibleLinkTarget(p, busyIds));
}

/**
 * Memvalidasi apakah peserta manual aman ditautkan ke akun target berdasarkan seluruh pertandingan.
 * Melempar Error berbahasa Indonesia jika target tidak valid atau sudah punya pertandingan.
 */
export function validateLinkTarget(
  manualPlayer: { id?: string; uid?: string | null; name?: string } | null | undefined,
  targetAccount:
    | {
        id?: string;
        uid?: string | null;
        name?: string;
        status?: string;
        manual?: boolean;
      }
    | null
    | undefined,
  allMatches: any[]
): void {
  if (!targetAccount || targetAccount.manual) {
    throw new Error('Tujuan tautan harus berupa akun.');
  }

  const targetName = targetAccount.name || targetAccount.id || 'terpilih';
  if (targetAccount.status !== 'waiting' && targetAccount.status !== 'accepted') {
    throw new Error(
      `Akun ${targetName} berstatus ${targetAccount.status || 'tidak diketahui'} dan tidak dapat ditautkan.`
    );
  }

  const targetIds = new Set<string>();
  if (typeof targetAccount.id === 'string' && targetAccount.id.trim().length > 0) {
    targetIds.add(targetAccount.id);
  }
  if (typeof targetAccount.uid === 'string' && targetAccount.uid.trim().length > 0) {
    targetIds.add(targetAccount.uid);
  }

  const manualIds = new Set<string>();
  if (typeof manualPlayer?.id === 'string' && manualPlayer.id.trim().length > 0) {
    manualIds.add(manualPlayer.id);
  }
  if (typeof manualPlayer?.uid === 'string' && manualPlayer.uid.trim().length > 0) {
    manualIds.add(manualPlayer.uid);
  }

  const matchList = Array.isArray(allMatches) ? allMatches : [];
  const manualRounds = new Set<number>();
  const targetMatches: any[] = [];

  for (const m of matchList) {
    if (!m) continue;
    const roundNum = typeof m.round === 'number' ? m.round : -1;
    const hasManual =
      (typeof m.p1Id === 'string' && manualIds.has(m.p1Id)) ||
      (typeof m.p2Id === 'string' && manualIds.has(m.p2Id));
    if (hasManual && roundNum >= 0) {
      manualRounds.add(roundNum);
    }

    const hasTarget =
      (typeof m.p1Id === 'string' && targetIds.has(m.p1Id)) ||
      (typeof m.p2Id === 'string' && targetIds.has(m.p2Id));
    if (hasTarget) {
      targetMatches.push(m);
    }
  }

  if (targetMatches.length > 0) {
    const sameRoundMatch = targetMatches.find(
      (m) => typeof m.round === 'number' && manualRounds.has(m.round)
    );
    if (sameRoundMatch) {
      throw new Error(
        `Akun ${targetName} sudah memiliki pertandingan di turnamen ini pada ronde yang sama (Ronde ${sameRoundMatch.round}), sehingga tidak bisa ditautkan.`
      );
    }

    throw new Error(
      `Akun ${targetName} sudah memiliki pertandingan di turnamen ini, sehingga tidak bisa ditautkan.`
    );
  }
}

export interface DuplicatePlayerInRound {
  round: number;
  playerId: string;
  name: string;
  count: number;
  tables: number[];
}

/**
 * Mendeteksi ID pemain yang muncul lebih dari satu kali dalam ronde yang sama pada pertandingan aktif.
 */
export function findDuplicatePlayersInRound(
  matches: any[]
): DuplicatePlayerInRound[] {
  const matchList = Array.isArray(matches) ? matches : [];
  const countsByRoundAndId = new Map<
    string,
    { round: number; playerId: string; name: string; count: number; tables: number[] }
  >();

  const recordAppearance = (
    round: number,
    table: number,
    playerId: unknown,
    playerName: unknown
  ) => {
    if (typeof playerId !== 'string' || playerId.trim().length === 0) return;
    const key = `${round}::${playerId}`;
    const existing = countsByRoundAndId.get(key);
    const resolvedName =
      typeof playerName === 'string' && playerName.trim().length > 0
        ? playerName.trim()
        : playerId;

    if (existing) {
      existing.count += 1;
      if (typeof table === 'number' && !existing.tables.includes(table)) {
        existing.tables.push(table);
      }
    } else {
      countsByRoundAndId.set(key, {
        round,
        playerId,
        name: resolvedName,
        count: 1,
        tables: typeof table === 'number' ? [table] : [],
      });
    }
  };

  for (const m of matchList) {
    if (!m || m.archived) continue;
    const roundNum = typeof m.round === 'number' ? m.round : 0;
    const tableNum = typeof m.table === 'number' ? m.table : 0;
    recordAppearance(roundNum, tableNum, m.p1Id, m.p1Name);
    recordAppearance(roundNum, tableNum, m.p2Id, m.p2Name);
  }

  return Array.from(countsByRoundAndId.values())
    .filter((entry) => entry.count > 1)
    .sort((a, b) => a.round - b.round || a.name.localeCompare(b.name));
}

/**
 * Menyusun rencana operasi penautan pemain manual ke akun pemain:
 * 1. Ubah status akun target menjadi accepted bila perlu
 * 2. Ganti semua p1Id dan p2Id yang bernilai id manual menjadi UID pada seluruh pertandingan turnamen
 * 3. Hapus dokumen pemain manual
 * 4. Catat log audit PLAYER_LINKED
 */
export function planPlayerLink(
  tournamentId: string,
  manualPlayer: { id: string; name: string },
  targetAccount: {
    id?: string;
    uid?: string | null;
    name: string;
    status?: string;
    manual?: boolean;
  },
  allMatches: any[],
  actor: { uid: string; name: string }
): LinkOperation[] {
  validateLinkTarget(manualPlayer, targetAccount, allMatches);

  const operations: LinkOperation[] = [];
  const targetUid = targetAccount.uid || targetAccount.id || '';
  const targetDocId = targetAccount.id || targetAccount.uid || '';

  // 1. Ubah status dokumen players/{uid} menjadi accepted jika belum accepted
  if (targetAccount.status !== 'accepted') {
    operations.push({
      type: 'update_player',
      path: `tournaments/${tournamentId}/players/${targetDocId}`,
      playerId: targetDocId,
      data: {
        status: 'accepted',
      },
    });
  }

  // 2. Ganti p1Id dan p2Id pada SEMUA pertandingan turnamen (termasuk ronde lama dan archived)
  const matchList = Array.isArray(allMatches) ? allMatches : [];
  let matchesUpdatedCount = 0;

  for (const m of matchList) {
    let needsUpdate = false;
    const updateData: any = {};

    if (m.p1Id === manualPlayer.id) {
      updateData.p1Id = targetUid;
      updateData.p1Name = targetAccount.name;
      needsUpdate = true;
    }
    if (m.p2Id === manualPlayer.id) {
      updateData.p2Id = targetUid;
      updateData.p2Name = targetAccount.name;
      needsUpdate = true;
    }

    if (needsUpdate) {
      matchesUpdatedCount++;
      operations.push({
        type: 'update_match',
        path: `tournaments/${tournamentId}/matches/${m.id}`,
        matchId: m.id,
        data: updateData,
      });
    }
  }

  // 3. Hapus dokumen pemain manual
  operations.push({
    type: 'delete_player',
    path: `tournaments/${tournamentId}/players/${manualPlayer.id}`,
    playerId: manualPlayer.id,
  });

  // 4. Catat auditLogs PLAYER_LINKED
  operations.push({
    type: 'audit_log',
    path: 'auditLogs',
    data: {
      action: 'PLAYER_LINKED',
      tournamentId,
      actorId: actor.uid,
      actorName: actor.name,
      details: {
        manualPlayerId: manualPlayer.id,
        manualPlayerName: manualPlayer.name,
        targetAccountUid: targetUid,
        targetAccountName: targetAccount.name,
        matchesUpdatedCount,
      },
    },
  });

  return operations;
}

/**
 * Memecah daftar operasi menjadi potongan maksimal chunkSize (bawaan 400).
 */
export function chunkOperations<T>(operations: T[], chunkSize: number = 400): T[][] {
  if (!operations || operations.length === 0) return [];
  const safeSize = Math.max(1, chunkSize);
  const chunks: T[][] = [];
  for (let i = 0; i < operations.length; i += safeSize) {
    chunks.push(operations.slice(i, i + safeSize));
  }
  return chunks;
}
