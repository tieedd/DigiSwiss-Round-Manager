import {
  collection,
  doc,
  getDocs,
  getDoc,
  query,
  where,
  orderBy,
  writeBatch,
  updateDoc
} from 'firebase/firestore';
import { db } from '../firebaseConfig';
import {
  Tournament,
  TournamentPlayer,
  TournamentMatch,
  Participation,
  DeckColor,
  TournamentSeason,
  LeagueDeckEntry,
  LeaguePlayerDecks
} from '../types';
import { isLeagueTournament } from '../utils/seasonLogic';
import { calculateTournamentStandings } from '../utils/standingsLogic';
import {
  computeFinalRankingsWithTopCut,
  filterSwissMatches
} from '../utils/topCutLogic';
import { recordAuditLog } from './authService';
import { getAllTournamentLeagueDecks } from './leagueDeckService';
import {
  buildLeagueFinalDecksAssignment,
  detectLeagueParticipationsNeedingSync,
  mergePlayerDeckHistory
} from '../utils/leagueFinalDecksLogic';
import { filterParticipationsByExistingTournaments } from '../utils/cascadeDeleteLogic';
import { invalidateStandingsCache } from '../utils/finalStandingsLogic';
import { chunkBatchItems } from '../utils/tournamentEditLogic';
import { checkExistingTournaments } from './tournamentCleanupService';

/**
 * Melakukan finalisasi hasil turnamen:
 * 1. Menghitung klasemen Swiss (hanya dari ronde Swiss) dan rank akhir (termasuk Top Cut bila ada)
 * 2. Menyimpan seluruh dokumen participations/{tid}_{pid} dalam SATU writeBatch
 * 3. Memperbarui status turnamen menjadi finalized
 * 4. Mencatat log audit
 */
export async function finalizeTournamentResults(
  tournament: Tournament,
  players: TournamentPlayer[],
  matches: TournamentMatch[],
  actorId: string,
  actorName: string
): Promise<{
  success: boolean;
  count: number;
  participations: Participation[];
  missingDeckPlayers: string[];
}> {
  // Hitung klasemen Swiss murni (mengabaikan pertandingan Top Cut)
  const swissStandings = calculateTournamentStandings(
    players,
    filterSwissMatches(matches),
    tournament.format
  );
  if (swissStandings.length === 0) {
    throw new Error('Tidak ada data peserta untuk difinalisasi.');
  }

  // Jika ada fase Top Cut, sesuaikan rank akhir dan penanda topCutResult, sambil mempertahankan metrik Swiss
  const totalSwissRounds = tournament.totalRounds || 3;
  const finalStandings = tournament.topCut
    ? computeFinalRankingsWithTopCut(swissStandings, tournament.topCut, matches, totalSwissRounds)
    : swissStandings.map((s) => ({
        ...s,
        swissRank: s.rank,
        topCutResult: undefined
      }));

  const isLeague = isLeagueTournament(tournament);

  // Untuk Turnamen Liga, baca seluruh 2 deck dari subkoleksi decks sebagai sumber kebenaran
  let assignedLeagueDecksMap = new Map<string, [LeagueDeckEntry, LeagueDeckEntry]>();
  let missingDeckPlayers: string[] = [];
  if (isLeague) {
    const leagueDecksMap: Map<string, LeaguePlayerDecks> =
      await getAllTournamentLeagueDecks(tournament.id);
    const assignment = buildLeagueFinalDecksAssignment(finalStandings, leagueDecksMap);
    assignedLeagueDecksMap = assignment.assignedDecksMap;
    missingDeckPlayers = assignment.missingPlayers.map((m) => m.playerName);
  }

  // Ambil partisipasi yang mungkin sudah ada (untuk turnamen reguler agar deckName lama tetap terjaga)
  let existingMap = new Map<string, Participation>();
  try {
    const existing = await getTournamentParticipations(tournament.id);
    existing.forEach((p) => {
      existingMap.set(p.playerId, p);
    });
  } catch (err) {
    console.warn('Gagal mengecek partisipasi lama, melanjutkan pembuatan batch baru:', err);
  }

  const now = Date.now();
  const createdParticipations: Participation[] = [];
  const partEntries: Array<{ ref: ReturnType<typeof doc>; data: Participation }> = [];

  for (const s of finalStandings) {
    const originalPlayer = players.find((p) => p.id === s.playerId);
    const participationId = `${tournament.id}_${s.playerId}`;
    const partDocRef = doc(db, 'participations', participationId);
    const existing = existingMap.get(s.playerId);
    const assignedLeagueDecks = isLeague ? assignedLeagueDecksMap.get(s.playerId) : undefined;

    const partData: Participation = {
      id: participationId,
      tournamentId: tournament.id,
      tournamentName: tournament.name,
      date: tournament.date,
      format: tournament.format,
      ...(isLeague
        ? {
            tournamentType: 'league' as const,
            ...(tournament.season ? { season: tournament.season } : {})
          }
        : {}),
      playerId: s.playerId,
      uid: originalPlayer?.uid || existing?.uid || null,
      organizerId: tournament.organizerId,
      name: s.playerName,
      rank: s.rank,
      ...(s.swissRank !== undefined ? { swissRank: s.swissRank } : {}),
      ...(s.topCutResult ? { topCutResult: s.topCutResult } : {}),
      wins: s.matchWins,
      losses: s.matchLosses,
      gamesWon: s.gamesWon,
      gamesLost: s.gamesLost,
      points: s.points,
      omw: s.omw,
      gw: s.gw,
      ogw: s.ogw,
      // Liga: salin 2 deck ke field `decks` dan biarkan deckName/deckColors kosong; Reguler: pertahankan yang sudah ada
      deckName: isLeague ? '' : existing?.deckName || '',
      deckColors: isLeague ? [] : existing?.deckColors || [],
      ...(isLeague && assignedLeagueDecks ? { decks: assignedLeagueDecks } : {}),
      isManual: originalPlayer?.manual ?? existing?.isManual ?? false,
      createdAt: existing?.createdAt || now,
      updatedAt: now
    };

    partEntries.push({ ref: partDocRef, data: partData });
    createdParticipations.push(partData);
  }

  const tourneyDocRef = doc(db, 'tournaments', tournament.id);
  const chunks = chunkBatchItems(partEntries, 400);

  if (chunks.length === 0) {
    const batch = writeBatch(db);
    batch.update(tourneyDocRef, {
      finalized: true,
      finalizedAt: now
    });
    await batch.commit();
  } else {
    for (let idx = 0; idx < chunks.length; idx++) {
      const batch = writeBatch(db);
      chunks[idx].forEach((entry) => {
        batch.set(entry.ref, entry.data);
      });
      if (idx === chunks.length - 1) {
        batch.update(tourneyDocRef, {
          finalized: true,
          finalizedAt: now
        });
      }
      await batch.commit();
    }
  }

  invalidateStandingsCache(tournament.id);

  // Catat Audit Log (non-blocking)
  try {
    const missingNote =
      isLeague && missingDeckPlayers.length > 0
        ? ` (${missingDeckPlayers.length} peserta tanpa 2 deck: ${missingDeckPlayers.join(', ')})`
        : '';
    await recordAuditLog(
      actorId,
      actorName,
      'FINALIZE_TOURNAMENT',
      `Turnamen ${tournament.name} (${createdParticipations.length} peserta)`,
      null,
      `Finalized dengan ${createdParticipations.length} dokumen partisipasi${missingNote}`,
      tournament.id
    );
  } catch (auditErr) {
    console.warn('Gagal mencatat audit log finalisasi (non-blocking):', auditErr);
  }

  return {
    success: true,
    count: createdParticipations.length,
    participations: createdParticipations,
    missingDeckPlayers
  };
}

/**
 * Mengambil seluruh data partisipasi turnamen
 */
export async function getTournamentParticipations(
  tournamentId: string
): Promise<Participation[]> {
  const partsCol = collection(db, 'participations');
  const q = query(
    partsCol,
    where('tournamentId', '==', tournamentId),
    orderBy('rank', 'asc')
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => d.data() as Participation);
}

/**
 * Mengambil riwayat deck unik yang pernah digunakan oleh seorang pemain (berdasarkan UID)
 */
export interface PlayerDeckHistory {
  deckName: string;
  deckColors: DeckColor[];
  tournamentName: string;
  date: string;
}

export async function getPlayerDeckHistory(uid: string): Promise<PlayerDeckHistory[]> {
  if (!uid) return [];
  const partsCol = collection(db, 'participations');
  const q = query(partsCol, where('uid', '==', uid));
  const snap = await getDocs(q);

  const rawList = snap.docs.map((d) => d.data() as Participation);
  const tourneyIds = rawList.map((p) => p.tournamentId).filter(Boolean);
  const existingSet = await checkExistingTournaments(tourneyIds);
  const validList = filterParticipationsByExistingTournaments(rawList, existingSet);

  return mergePlayerDeckHistory(validList);
}

/**
 * Memperbarui nama deck dan warna deck pada dokumen partisipasi
 */
export async function updateParticipationDeck(
  participationId: string,
  deckName: string,
  deckColors: DeckColor[],
  actorId: string,
  actorName: string,
  tournamentId?: string
): Promise<void> {
  const partDocRef = doc(db, 'participations', participationId);
  const snap = await getDoc(partDocRef);
  if (!snap.exists()) {
    throw new Error('Dokumen partisipasi tidak ditemukan.');
  }

  const prevData = snap.data() as Participation;
  const now = Date.now();

  await updateDoc(partDocRef, {
    deckName: deckName.trim(),
    deckColors: deckColors,
    updatedAt: now
  });

  // Catat Audit Log jika diubah (non-blocking)
  try {
    await recordAuditLog(
      actorId,
      actorName,
      'UPDATE_PARTICIPATION_DECK',
      `Peserta ${prevData.name} di turnamen ${prevData.tournamentName}`,
      prevData.deckName ? `${prevData.deckName} [${(prevData.deckColors || []).join('/')}]` : 'Belum diisi',
      `${deckName.trim()} [${deckColors.join('/')}]`,
      tournamentId || prevData.tournamentId
    );
  } catch (auditErr) {
    console.warn('Gagal mencatat audit log deck (non-blocking):', auditErr);
  }
}

/**
 * Menyinkronkan nama dan/atau tanggal turnamen ke seluruh dokumen participations
 * milik turnamen tersebut dalam writeBatch (dipecah per 400 operasi).
 */
export async function syncParticipationsTournamentInfo(
  tournamentId: string,
  updates: { tournamentName?: string; date?: string; season?: TournamentSeason }
): Promise<number> {
  if (!tournamentId) return 0;

  const patch: Record<string, any> = {};
  if (updates.tournamentName !== undefined) {
    patch.tournamentName = updates.tournamentName;
  }
  if (updates.date !== undefined) {
    patch.date = updates.date;
  }
  if (updates.season !== undefined) {
    patch.season = updates.season;
  }

  if (Object.keys(patch).length === 0) {
    return 0;
  }

  patch.updatedAt = Date.now();

  const partsCol = collection(db, 'participations');
  const q = query(partsCol, where('tournamentId', '==', tournamentId));
  const snap = await getDocs(q);

  invalidateStandingsCache(tournamentId);

  if (snap.empty) {
    return 0;
  }

  const chunks = chunkBatchItems(snap.docs, 400);
  let updatedCount = 0;

  for (const chunk of chunks) {
    const batch = writeBatch(db);
    chunk.forEach((docSnap) => {
      batch.update(docSnap.ref, patch);
    });
    await batch.commit();
    updatedCount += chunk.length;
  }

  return updatedCount;
}

/**
 * Menyinkronkan `decks` pada dokumen participations Turnamen Liga yang sudah
 * terlanjur finalized dari koleksi `tournaments/{tid}/decks` lewat writeBatch (per 400).
 */
export async function syncLeagueParticipationsDecksFromRegistration(
  tournament: Tournament,
  participations: Participation[],
  actor: { uid: string; name: string }
): Promise<{ syncedCount: number; missingPlayers: string[] }> {
  if (!tournament?.id || !isLeagueTournament(tournament)) {
    return { syncedCount: 0, missingPlayers: [] };
  }

  const leagueDecksMap = await getAllTournamentLeagueDecks(tournament.id);
  const { needingSync, missingDeckDocs, unfilledCount } =
    detectLeagueParticipationsNeedingSync(participations, leagueDecksMap, {
      treatAllAsLeague: true
    });

  const now = Date.now();
  if (needingSync.length > 0) {
    const chunks = chunkBatchItems(needingSync, 400);
    for (const chunk of chunks) {
      const batch = writeBatch(db);
      chunk.forEach((item) => {
        const partRef = doc(db, 'participations', item.participation.id);
        batch.update(partRef, {
          decks: item.decks,
          deckName: '',
          deckColors: [],
          updatedAt: now
        });
      });
      await batch.commit();
    }
    invalidateStandingsCache(tournament.id);
  }

  const missingNames = missingDeckDocs.map((p) => p.name);
  try {
    await recordAuditLog(
      actor.uid,
      actor.name,
      'DECK_SYNCED_FINAL',
      `Turnamen Liga ${tournament.name} (${tournament.id})`,
      `${unfilledCount} partisipasi belum memiliki 2 deck`,
      `${needingSync.length} partisipasi disinkronkan dari koleksi decks${
        missingNames.length > 0
          ? ` (${missingNames.length} tanpa data deck: ${missingNames.join(', ')})`
          : ''
      }`,
      tournament.id
    );
  } catch (auditErr) {
    console.warn('Gagal mencatat audit log DECK_SYNCED_FINAL (non-blocking):', auditErr);
  }

  return {
    syncedCount: needingSync.length,
    missingPlayers: missingNames
  };
}

/**
 * Memperbarui field `decks` pada dokumen `participations/{tid}_{pid}` bila sudah ada
 * (dipakai ketika organizer/admin mengoreksi 2 deck peserta di turnamen liga yang sudah difinalisasi).
 */
export async function updateParticipationLeagueDecksIfExists(
  tournamentId: string,
  playerId: string,
  decks: [LeagueDeckEntry, LeagueDeckEntry]
): Promise<boolean> {
  if (!tournamentId || !playerId) return false;
  const participationId = `${tournamentId}_${playerId}`;
  const partRef = doc(db, 'participations', participationId);
  const snap = await getDoc(partRef);
  if (!snap.exists()) return false;

  await updateDoc(partRef, {
    decks,
    deckName: '',
    deckColors: [],
    updatedAt: Date.now()
  });
  invalidateStandingsCache(tournamentId);
  return true;
}

