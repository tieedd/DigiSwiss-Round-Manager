import {
  collection,
  collectionGroup,
  doc,
  getDoc,
  getDocs,
  query,
  where,
  documentId,
  writeBatch,
  limit,
  startAfter,
  QueryDocumentSnapshot,
  DocumentData
} from 'firebase/firestore';
import { db } from '../firebaseConfig';
import {
  planTournamentDeletion,
  chunkOperations,
  findOrphanInviteClaims,
  DeletionOperation
} from '../utils/cascadeDeleteLogic';
import { clearAllStandingsCache } from '../utils/finalStandingsLogic';
import { recordAuditLog } from './authService';

export interface DeleteTournamentResult {
  totalDeleted: number;
  matchesCount: number;
  roundsCount: number;
  playersCount: number;
  decksCount: number;
  inviteClaimsCount: number;
  announcementsCount: number;
  participationsCount: number;
  leagueInvitesCount: number;
}

export interface OrphanDocInfo {
  id: string;
  tournamentId: string;
  tournamentName: string;
  playerName: string;
  collectionType?: 'participations' | 'leagueInvites';
}

export interface OrphanLeagueInviteInfo {
  code: string;
  tournamentId: string;
  tournamentName: string;
  seasonLabel?: string;
}

export interface OrphanInviteClaimInfo {
  uid: string;
  tournamentId: string;
  path: string;
}

// In-memory cache sesi status keberadaan dokumen turnamen
const existingTournamentsCache = new Map<string, boolean>();

/**
 * Menghapus cache sesi turnamen
 */
export function clearExistingTournamentsCache(): void {
  existingTournamentsCache.clear();
}

/**
 * Mengosongkan seluruh cache memori di aplikasi (riwayat, klasemen, keberadaan turnamen)
 */
export function clearAllAppCaches(): void {
  clearExistingTournamentsCache();
  clearAllStandingsCache();
}

/**
 * Memeriksa keberadaan turnamen berdasarkan ID dengan cache sesi dan query `documentId()` per 30 ID.
 */
export async function checkExistingTournaments(
  tournamentIds: string[]
): Promise<Set<string>> {
  if (!tournamentIds || tournamentIds.length === 0) {
    return new Set<string>();
  }

  const uniqueIds = Array.from(new Set(tournamentIds.filter(Boolean)));
  const uncachedIds: string[] = [];

  for (const tid of uniqueIds) {
    if (!existingTournamentsCache.has(tid)) {
      uncachedIds.push(tid);
    }
  }

  if (uncachedIds.length > 0) {
    // Firestore `in` query maksimal 30 item
    const chunks = chunkOperations(uncachedIds, 30);
    for (const chunk of chunks) {
      try {
        const q = query(
          collection(db, 'tournaments'),
          where(documentId(), 'in', chunk)
        );
        const snap = await getDocs(q);
        const found = new Set(snap.docs.map((d) => d.id));

        for (const id of chunk) {
          existingTournamentsCache.set(id, found.has(id));
        }
      } catch (err) {
        console.error('Gagal memeriksa keberadaan turnamen:', err);
        // Jika gagal query, jangan simpan cache permanen agar bisa dicoba lagi
      }
    }
  }

  const existingSet = new Set<string>();
  for (const tid of uniqueIds) {
    if (existingTournamentsCache.get(tid) === true) {
      existingSet.add(tid);
    }
  }

  return existingSet;
}

/**
 * Menjalankan penghapusan berantai (cascade delete) sebuah turnamen oleh Admin.
 * Urutan penghapusan:
 * (1) matches (termasuk yang archived)
 * (2) rounds
 * (3) players
 * (4) decks (subkoleksi deck liga)
 * (5) inviteClaims (subkoleksi klaim undangan liga)
 * (6) participations (tournamentId == tid)
 * (7) leagueInvites (tournamentId == tid)
 * (8) TERAKHIR dokumen tournaments/{tid}
 */
export async function executeCascadeTournamentDeletion(
  tournamentId: string,
  tournamentName: string,
  admin: { uid: string; name: string },
  onProgress?: (deleted: number, total: number) => void
): Promise<DeleteTournamentResult> {
  // 1. Ambil seluruh data yang akan dihapus
  const matchesCol = collection(db, 'tournaments', tournamentId, 'matches');
  const roundsCol = collection(db, 'tournaments', tournamentId, 'rounds');
  const playersCol = collection(db, 'tournaments', tournamentId, 'players');
  const decksCol = collection(db, 'tournaments', tournamentId, 'decks');
  const inviteClaimsCol = collection(db, 'tournaments', tournamentId, 'inviteClaims');
  const announcementsCol = collection(db, 'tournaments', tournamentId, 'announcements');
  const participationsCol = collection(db, 'participations');
  const invitesCol = collection(db, 'leagueInvites');

  const [
    matchesSnap,
    roundsSnap,
    playersSnap,
    decksSnap,
    inviteClaimsSnap,
    announcementsSnap,
    participationsSnap,
    invitesSnap
  ] = await Promise.all([
    getDocs(matchesCol),
    getDocs(roundsCol),
    getDocs(playersCol),
    getDocs(decksCol),
    getDocs(inviteClaimsCol),
    getDocs(announcementsCol),
    getDocs(query(participationsCol, where('tournamentId', '==', tournamentId))),
    getDocs(query(invitesCol, where('tournamentId', '==', tournamentId)))
  ]);

  const matchesCount = matchesSnap.size;
  const roundsCount = roundsSnap.size;
  const playersCount = playersSnap.size;
  const decksCount = decksSnap.size;
  const inviteClaimsCount = inviteClaimsSnap.size;
  const announcementsCount = announcementsSnap.size;
  const participationsCount = participationsSnap.size;
  const leagueInvitesCount = invitesSnap.size;

  // 2. Susun urutan operasi murni
  const operations: DeletionOperation[] = planTournamentDeletion(tournamentId, {
    matches: matchesSnap.docs.map((d) => ({ id: d.id })),
    rounds: roundsSnap.docs.map((d) => ({ id: d.id })),
    players: playersSnap.docs.map((d) => ({ id: d.id })),
    decks: decksSnap.docs.map((d) => ({ id: d.id })),
    inviteClaims: inviteClaimsSnap.docs.map((d) => ({ id: d.id })),
    announcements: announcementsSnap.docs.map((d) => ({ id: d.id })),
    participations: participationsSnap.docs.map((d) => ({ id: d.id })),
    leagueInvites: invitesSnap.docs.map((d) => ({ id: d.id }))
  });

  const totalOperations = operations.length;
  let deletedOperations = 0;

  // Tampilkan progres awal
  onProgress?.(0, totalOperations);

  // 3. Eksekusi batch dalam potongan maksimal 400 operasi
  const operationChunks = chunkOperations(operations, 400);

  for (const chunk of operationChunks) {
    const batch = writeBatch(db);
    for (const op of chunk) {
      const ref = doc(db, op.path);
      batch.delete(ref);
    }
    await batch.commit();

    deletedOperations += chunk.length;
    onProgress?.(deletedOperations, totalOperations);
  }

  // 4. Catat jejak audit dengan rincian lengkap
  await recordAuditLog(
    admin.uid,
    admin.name,
    'TOURNAMENT_DELETED',
    `tournaments/${tournamentId}`,
    tournamentName,
    JSON.stringify({
      matchesCount,
      roundsCount,
      playersCount,
      decksCount,
      inviteClaimsCount,
      announcementsCount,
      participationsCount,
      leagueInvitesCount,
      totalDeleted: totalOperations
    })
  );

  // 5. Bersihkan seluruh cache aplikasi di memori
  clearAllAppCaches();

  return {
    totalDeleted: totalOperations,
    matchesCount,
    roundsCount,
    playersCount,
    decksCount,
    inviteClaimsCount,
    announcementsCount,
    participationsCount,
    leagueInvitesCount
  };
}

/**
 * Pindai koleksi participations, leagueInvites, dan collectionGroup inviteClaims secara bertahap
 * (200 per halaman, maks 2000 dokumen) untuk mendeteksi dokumen yatim.
 */
export async function scanOrphanParticipations(
  maxTotal = 2000,
  pageSize = 200
): Promise<{
  orphanDocs: OrphanDocInfo[];
  orphanInvites: OrphanLeagueInviteInfo[];
  orphanClaims: OrphanInviteClaimInfo[];
  totalScanned: number;
  totalInvitesScanned: number;
  totalClaimsScanned: number;
}> {
  const partsCol = collection(db, 'participations');
  const invitesCol = collection(db, 'leagueInvites');
  const claimsGroup = collectionGroup(db, 'inviteClaims');
  const orphanDocs: OrphanDocInfo[] = [];
  const orphanInvites: OrphanLeagueInviteInfo[] = [];
  const orphanClaims: OrphanInviteClaimInfo[] = [];
  let totalScanned = 0;
  let totalInvitesScanned = 0;
  let totalClaimsScanned = 0;
  let lastVisibleDoc: QueryDocumentSnapshot<DocumentData> | null = null;
  let hasMore = true;

  const tournamentIdSet = new Set<string>();
  const scannedParticipations: Array<{
    id: string;
    tournamentId: string;
    tournamentName: string;
    name: string;
  }> = [];

  while (hasMore && totalScanned < maxTotal) {
    const fetchLimit = Math.min(pageSize, maxTotal - totalScanned);
    let q = query(partsCol, limit(fetchLimit));
    if (lastVisibleDoc) {
      q = query(partsCol, startAfter(lastVisibleDoc), limit(fetchLimit));
    }

    const snap = await getDocs(q);
    if (snap.empty) {
      hasMore = false;
      break;
    }

    totalScanned += snap.size;
    lastVisibleDoc = snap.docs[snap.docs.length - 1];

    for (const d of snap.docs) {
      const data = d.data();
      const tId = data.tournamentId || '';
      if (tId) {
        tournamentIdSet.add(tId);
      }
      scannedParticipations.push({
        id: d.id,
        tournamentId: tId,
        tournamentName: data.tournamentName || 'Tanpa Nama Turnamen',
        name: data.name || '-'
      });
    }

    if (snap.size < fetchLimit) {
      hasMore = false;
    }
  }

  // Pindai juga koleksi leagueInvites untuk mendeteksi undangan yatim tanpa turnamen
  const scannedInvites: Array<{
    code: string;
    tournamentId: string;
    tournamentName: string;
    seasonLabel: string;
  }> = [];
  let lastInviteDoc: QueryDocumentSnapshot<DocumentData> | null = null;
  let hasMoreInvites = true;

  while (hasMoreInvites && totalInvitesScanned < maxTotal) {
    const fetchLimit = Math.min(pageSize, maxTotal - totalInvitesScanned);
    let q = query(invitesCol, limit(fetchLimit));
    if (lastInviteDoc) {
      q = query(invitesCol, startAfter(lastInviteDoc), limit(fetchLimit));
    }

    const snap = await getDocs(q);
    if (snap.empty) {
      hasMoreInvites = false;
      break;
    }

    totalInvitesScanned += snap.size;
    lastInviteDoc = snap.docs[snap.docs.length - 1];

    for (const d of snap.docs) {
      const data = d.data();
      const tId = data.tournamentId || '';
      if (tId) {
        tournamentIdSet.add(tId);
      }
      scannedInvites.push({
        code: d.id,
        tournamentId: tId,
        tournamentName: data.tournamentName || 'Tanpa Nama Turnamen',
        seasonLabel: data.seasonLabel || ''
      });
    }

    if (snap.size < fetchLimit) {
      hasMoreInvites = false;
    }
  }

  // Pindai juga collectionGroup inviteClaims untuk mendeteksi klaim yatim
  const scannedClaims: Array<{
    uid: string;
    tournamentId: string;
    path: string;
    createdAt?: number;
  }> = [];
  let lastClaimDoc: QueryDocumentSnapshot<DocumentData> | null = null;
  let hasMoreClaims = true;

  while (hasMoreClaims && totalClaimsScanned < maxTotal) {
    const fetchLimit = Math.min(pageSize, maxTotal - totalClaimsScanned);
    let q = query(claimsGroup, limit(fetchLimit));
    if (lastClaimDoc) {
      q = query(claimsGroup, startAfter(lastClaimDoc), limit(fetchLimit));
    }

    const snap = await getDocs(q);
    if (snap.empty) {
      hasMoreClaims = false;
      break;
    }

    totalClaimsScanned += snap.size;
    lastClaimDoc = snap.docs[snap.docs.length - 1];

    for (const d of snap.docs) {
      const data = d.data();
      const tId = d.ref.parent.parent?.id || '';
      if (tId) {
        tournamentIdSet.add(tId);
      }
      scannedClaims.push({
        uid: d.id,
        tournamentId: tId,
        path: d.ref.path,
        createdAt: typeof data.createdAt === 'number' ? data.createdAt : undefined
      });
    }

    if (snap.size < fetchLimit) {
      hasMoreClaims = false;
    }
  }

  // Periksa turnamen mana yang masih ada
  const allTournamentIds = Array.from(tournamentIdSet);
  const existingSet = await checkExistingTournaments(allTournamentIds);

  // Untuk klaim pada turnamen yang masih ada, cek apakah dokumen pemainnya juga masih ada
  const existingPlayerKeys = new Set<string>();
  const claimsInExistingTournaments = scannedClaims.filter(
    (c) => c.tournamentId && existingSet.has(c.tournamentId)
  );
  if (claimsInExistingTournaments.length > 0) {
    const checkChunks = chunkOperations(claimsInExistingTournaments, 25);
    for (const chunk of checkChunks) {
      await Promise.all(
        chunk.map(async (c) => {
          try {
            const pSnap = await getDoc(
              doc(db, 'tournaments', c.tournamentId, 'players', c.uid)
            );
            if (pSnap.exists()) {
              existingPlayerKeys.add(`${c.tournamentId}/${c.uid}`);
            }
          } catch (err) {
            // Jika gagal membaca status pemain, anggap masih ada agar tidak salah hapus
            console.warn('Gagal memeriksa pemain untuk inviteClaim:', c.path, err);
            existingPlayerKeys.add(`${c.tournamentId}/${c.uid}`);
          }
        })
      );
    }
  }

  for (const item of scannedParticipations) {
    if (!item.tournamentId || !existingSet.has(item.tournamentId)) {
      orphanDocs.push({
        id: item.id,
        tournamentId: item.tournamentId,
        tournamentName: item.tournamentName,
        playerName: item.name,
        collectionType: 'participations'
      });
    }
  }

  for (const inv of scannedInvites) {
    if (!inv.tournamentId || !existingSet.has(inv.tournamentId)) {
      orphanInvites.push({
        code: inv.code,
        tournamentId: inv.tournamentId,
        tournamentName: inv.tournamentName,
        seasonLabel: inv.seasonLabel
      });
    }
  }

  const detectedOrphanClaims = findOrphanInviteClaims(
    scannedClaims.map((c) => ({ ...c, id: c.uid })),
    existingSet,
    existingPlayerKeys
  );
  for (const c of detectedOrphanClaims) {
    orphanClaims.push({
      uid: c.uid,
      tournamentId: c.tournamentId,
      path: c.path
    });
  }

  return {
    orphanDocs,
    orphanInvites,
    orphanClaims,
    totalScanned,
    totalInvitesScanned,
    totalClaimsScanned
  };
}

/**
 * Menghapus data partisipasi, leagueInvites, dan inviteClaims yatim dalam potongan batch maksimal 400 dokumen.
 */
export async function cleanOrphanParticipations(
  orphanDocIds: string[],
  admin: { uid: string; name: string },
  orphanInviteCodes: string[] = [],
  orphanClaimPaths: string[] = []
): Promise<number> {
  const paths: string[] = [
    ...(orphanDocIds || []).map((id) => `participations/${id}`),
    ...(orphanInviteCodes || []).map((code) => `leagueInvites/${code}`),
    ...(orphanClaimPaths || [])
  ];
  if (paths.length === 0) return 0;

  const chunks = chunkOperations(paths, 400);
  let deletedCount = 0;

  for (const chunk of chunks) {
    const batch = writeBatch(db);
    for (const docPath of chunk) {
      batch.delete(doc(db, docPath));
    }
    await batch.commit();
    deletedCount += chunk.length;
  }

  // Catat audit log
  await recordAuditLog(
    admin.uid,
    admin.name,
    'ORPHAN_DATA_CLEANED',
    'participations, leagueInvites, inviteClaims',
    null,
    `Membersihkan ${orphanDocIds?.length || 0} dokumen partisipasi yatim, ${orphanInviteCodes?.length || 0} kode undangan liga yatim, dan ${orphanClaimPaths?.length || 0} klaim undangan yatim`
  );

  // Bersihkan cache
  clearAllAppCaches();

  return deletedCount;
}
