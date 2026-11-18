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
  DeckColor
} from '../types';
import { calculateTournamentStandings } from '../utils/standingsLogic';
import {
  computeFinalRankingsWithTopCut,
  filterSwissMatches
} from '../utils/topCutLogic';
import { recordAuditLog } from './authService';
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
): Promise<{ success: boolean; count: number; participations: Participation[] }> {
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

  // Ambil partisipasi yang mungkin sudah ada (idempoten: jangan buat ulang / jangan menimpa deck yang sudah terisi)
  let existingMap = new Map<string, Participation>();
  try {
    const existing = await getTournamentParticipations(tournament.id);
    existing.forEach((p) => {
      existingMap.set(p.playerId, p);
    });
  } catch (err) {
    console.warn('Gagal mengecek partisipasi lama, melanjutkan pembuatan batch baru:', err);
  }

  const batch = writeBatch(db);
  const now = Date.now();
  const createdParticipations: Participation[] = [];

  for (const s of finalStandings) {
    const originalPlayer = players.find((p) => p.id === s.playerId);
    const participationId = `${tournament.id}_${s.playerId}`;
    const partDocRef = doc(db, 'participations', participationId);
    const existing = existingMap.get(s.playerId);

    const partData: Participation = {
      id: participationId,
      tournamentId: tournament.id,
      tournamentName: tournament.name,
      date: tournament.date,
      format: tournament.format,
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
      // Pertahankan deck dan warna yang sudah diisi bila sebelumnya sudah ada
      deckName: existing?.deckName || '',
      deckColors: existing?.deckColors || [],
      isManual: originalPlayer?.manual ?? existing?.isManual ?? false,
      createdAt: existing?.createdAt || now,
      updatedAt: now
    };

    batch.set(partDocRef, partData);
    createdParticipations.push(partData);
  }

  // Tandai turnamen sebagai finalized
  const tourneyDocRef = doc(db, 'tournaments', tournament.id);
  batch.update(tourneyDocRef, {
    finalized: true,
    finalizedAt: now
  });

  // Commit batch secara atomik
  await batch.commit();

  // Catat Audit Log (non-blocking)
  try {
    await recordAuditLog(
      actorId,
      actorName,
      'FINALIZE_TOURNAMENT',
      `Turnamen ${tournament.name} (${createdParticipations.length} peserta)`,
      null,
      `Finalized dengan ${createdParticipations.length} dokumen partisipasi`,
      tournament.id
    );
  } catch (auditErr) {
    console.warn('Gagal mencatat audit log finalisasi (non-blocking):', auditErr);
  }

  return {
    success: true,
    count: createdParticipations.length,
    participations: createdParticipations
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

  const historyMap = new Map<string, PlayerDeckHistory>();

  validList.forEach((data) => {
    if (data.deckName && data.deckName.trim().length > 0 && Array.isArray(data.deckColors) && data.deckColors.length > 0) {
      const normalizedKey = data.deckName.trim().toLowerCase();
      if (!historyMap.has(normalizedKey)) {
        historyMap.set(normalizedKey, {
          deckName: data.deckName.trim(),
          deckColors: data.deckColors as DeckColor[],
          tournamentName: data.tournamentName,
          date: data.date
        });
      }
    }
  });

  return Array.from(historyMap.values());
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
  updates: { tournamentName?: string; date?: string }
): Promise<number> {
  if (!tournamentId) return 0;

  const patch: Record<string, any> = {};
  if (updates.tournamentName !== undefined) {
    patch.tournamentName = updates.tournamentName;
  }
  if (updates.date !== undefined) {
    patch.date = updates.date;
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

