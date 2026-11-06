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
 * Menyusun rencana operasi penautan pemain manual ke akun pemain:
 * 1. Ubah status akun target menjadi accepted bila perlu
 * 2. Ganti semua p1Id dan p2Id yang bernilai id manual menjadi UID pada seluruh pertandingan turnamen
 * 3. Hapus dokumen pemain manual
 * 4. Catat log audit PLAYER_LINKED
 */
export function planPlayerLink(
  tournamentId: string,
  manualPlayer: { id: string; name: string },
  targetAccount: { id?: string; uid?: string | null; name: string; status?: string },
  allMatches: any[],
  actor: { uid: string; name: string }
): LinkOperation[] {
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
