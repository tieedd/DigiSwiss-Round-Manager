import {
  collection,
  doc,
  getDocs,
  getDoc,
  query,
  where,
  orderBy,
  limit,
  writeBatch,
  updateDoc,
  deleteField,
  serverTimestamp
} from 'firebase/firestore';
import { db } from '../firebaseConfig';
import {
  Tournament,
  TournamentFormat,
  TournamentRound,
  TournamentMatch,
  MatchStatus,
  AuditLog,
  TopCutSize,
  TournamentTopCut
} from '../types';
import { getClockOffset, recordAuditLog } from './authService';
import { calculateRemainingTime } from '../utils/timerLogic';
import {
  generateSwissPairing,
  PairingPlayer,
  PastMatchRecord,
  validateManualSwap
} from '../utils/swissPairing';
import { calculateMatchPoints } from '../utils/standingsLogic';
import {
  buildNextTopCutRoundMatches,
  buildTopCutSeeds,
  createTopCutInitialMatches,
  filterSwissMatches,
  getRoundDisplayLabel,
  getTopCutFinalRoundNumber,
  isSwissMatch
} from '../utils/topCutLogic';
import { getTournamentPlayers } from './tournamentService';

/**
 * Mengambil daftar seluruh ronde pada turnamen
 */
export async function getTournamentRounds(
  tournamentId: string,
  includeArchived: boolean = false
): Promise<TournamentRound[]> {
  const roundsCol = collection(db, 'tournaments', tournamentId, 'rounds');
  const snap = await getDocs(query(roundsCol, orderBy('number', 'asc')));
  const list = snap.docs.map((d) => d.data() as TournamentRound);
  if (includeArchived) return list;
  return list.filter((r) => !r.archived);
}

/**
 * Mengambil seluruh pertandingan pada ronde tertentu (hanya yang aktif/tidak diarsipkan secara default)
 */
export async function getMatchesForRound(
  tournamentId: string,
  roundNumber: number,
  includeArchived: boolean = false
): Promise<TournamentMatch[]> {
  const matchesCol = collection(db, 'tournaments', tournamentId, 'matches');
  const snap = await getDocs(
    query(matchesCol, where('round', '==', roundNumber), orderBy('table', 'asc'))
  );
  const list = snap.docs.map((d) => d.data() as TournamentMatch);
  if (includeArchived) return list;
  return list.filter((m) => !m.archived);
}

/**
 * Mengambil seluruh pertandingan di semua ronde pada turnamen (hanya yang aktif secara default)
 */
export async function getAllTournamentMatches(
  tournamentId: string,
  includeArchived: boolean = false
): Promise<TournamentMatch[]> {
  const matchesCol = collection(db, 'tournaments', tournamentId, 'matches');
  const snap = await getDocs(query(matchesCol, orderBy('round', 'asc'), orderBy('table', 'asc')));
  const list = snap.docs.map((d) => d.data() as TournamentMatch);
  if (includeArchived) return list;
  return list.filter((m) => !m.archived);
}

/**
 * Menghitung poin match setiap pemain dari pertandingan SWISS yang sudah terkonfirmasi (confirmed).
 * Pertandingan Top Cut diabaikan agar statistik Swiss tetap murni.
 */
export function calculatePlayerPointsFromMatches(
  matches: TournamentMatch[],
  format: TournamentFormat = 'BO3'
): Map<string, number> {
  const pointsMap = new Map<string, number>();

  for (const m of matches) {
    if (m.status !== 'confirmed' || !isSwissMatch(m)) continue;

    const p1Current = pointsMap.get(m.p1Id) || 0;

    // Kasus BYE
    if (m.p2Id === null) {
      pointsMap.set(m.p1Id, p1Current + 3);
      continue;
    }

    const p2Current = pointsMap.get(m.p2Id) || 0;

    const p1Pts = calculateMatchPoints(format, m.p1Score, m.p2Score, false);
    const p2Pts = calculateMatchPoints(format, m.p2Score, m.p1Score, false);

    pointsMap.set(m.p1Id, p1Current + p1Pts);
    pointsMap.set(m.p2Id, p2Current + p2Pts);
  }

  return pointsMap;
}

/**
 * Membuat Pairing untuk Ronde Swiss X dan menyimpan ronde + matches dalam SATU writeBatch.
 * Memastikan ronde sebelumnya sudah selesai (seluruh pertandingan confirmed).
 */
export async function createRoundPairing(
  tournamentId: string,
  targetRoundNumber: number,
  format: TournamentFormat,
  totalRounds: number
): Promise<{ round: TournamentRound; matches: TournamentMatch[]; warning?: string }> {
  // 1. Ambil data turnamen & seluruh peserta
  const allPlayers = await getTournamentPlayers(tournamentId);
  const activePlayers = allPlayers.filter((p) => p.status === 'accepted');

  if (activePlayers.length < 2) {
    throw new Error('Jumlah peserta aktif kurang dari 2. Tidak dapat membuat pairing.');
  }

  // 2. Ambil seluruh riwayat pertandingan Swiss terdahulu
  const allPastMatches = filterSwissMatches(await getAllTournamentMatches(tournamentId));

  // Guard pencegahan klik ganda: jika ronde target sudah memiliki pertandingan aktif, jangan buat ulang
  const existingMatchesForRound = allPastMatches.filter((m) => m.round === targetRoundNumber);
  if (existingMatchesForRound.length > 0) {
    const rounds = await getTournamentRounds(tournamentId, false);
    const existingRound = rounds.find((r) => r.number === targetRoundNumber) || {
      number: targetRoundNumber,
      status: 'active' as const,
      stage: 'swiss' as const,
      timer: {
        durationMs: (format === 'BO1' ? 25 : 45) * 60 * 1000,
        remainingMs: (format === 'BO1' ? 25 : 45) * 60 * 1000,
        status: 'idle' as const
      }
    };
    return { round: existingRound as TournamentRound, matches: existingMatchesForRound };
  }

  // Jika ronde > 1, pastikan seluruh pertandingan di ronde sebelumnya sudah berstatus 'confirmed'
  if (targetRoundNumber > 1) {
    const prevRoundMatches = allPastMatches.filter((m) => m.round === targetRoundNumber - 1);
    if (prevRoundMatches.length === 0) {
      throw new Error(`Ronde ${targetRoundNumber - 1} belum dibuat.`);
    }
    const unconfirmed = prevRoundMatches.filter((m) => m.status !== 'confirmed');
    if (unconfirmed.length > 0) {
      throw new Error(
        `Ronde ${targetRoundNumber} belum bisa dibuat. Masih ada ${unconfirmed.length} pertandingan di Ronde ${
          targetRoundNumber - 1
        } yang belum berstatus 'confirmed'.`
      );
    }
  }

  // 3. Hitung poin untuk setiap peserta (hanya dari ronde Swiss)
  const pointsMap = calculatePlayerPointsFromMatches(allPastMatches, format);

  const pairingPlayers: PairingPlayer[] = allPlayers.map((p) => ({
    id: p.id,
    name: p.name,
    points: pointsMap.get(p.id) || 0,
    status: p.status === 'accepted' ? 'accepted' : 'dropped',
  }));

  const pastRecords: PastMatchRecord[] = allPastMatches.map((m) => ({
    round: m.round,
    p1Id: m.p1Id,
    p2Id: m.p2Id,
  }));

  // 4. Buat pairing menggunakan algoritma Swiss
  const pairingResult = generateSwissPairing(
    targetRoundNumber,
    pairingPlayers,
    pastRecords,
    format
  );

  // 5. Simpan dokumen ronde dan pertandingan dengan SATU writeBatch
  const batch = writeBatch(db);
  const now = Date.now();

  const roundDurationMs = format === 'BO1' ? 25 * 60 * 1000 : 45 * 60 * 1000;

  const roundData: TournamentRound = {
    number: targetRoundNumber,
    status: 'active',
    stage: 'swiss',
    timer: {
      status: 'idle',
      durationMs: roundDurationMs,
      remainingMs: roundDurationMs,
    },
  };

  const roundDocRef = doc(db, 'tournaments', tournamentId, 'rounds', String(targetRoundNumber));
  batch.set(roundDocRef, roundData);

  const createdMatches: TournamentMatch[] = [];

  for (const gm of pairingResult.matches) {
    const matchDocRef = doc(collection(db, 'tournaments', tournamentId, 'matches'));
    const matchData: TournamentMatch = {
      id: matchDocRef.id,
      round: targetRoundNumber,
      stage: 'swiss',
      table: gm.table,
      p1Id: gm.p1Id,
      p2Id: gm.p2Id,
      p1Name: gm.p1Name,
      p2Name: gm.p2Name,
      p1Score: gm.p1Score,
      p2Score: gm.p2Score,
      status: gm.status,
      updatedAt: now,
    };
    batch.set(matchDocRef, matchData);
    createdMatches.push(matchData);
  }

  // Update currentRound di turnamen
  const tournamentDocRef = doc(db, 'tournaments', tournamentId);
  batch.update(tournamentDocRef, {
    currentRound: targetRoundNumber,
  });

  // Eksekusi batch
  await batch.commit();

  return {
    round: roundData,
    matches: createdMatches,
    warning: pairingResult.warning,
  };
}

/**
 * Menukar dua pemain antar meja secara manual sebelum ronde dimulai.
 * Dilengkapi validasi tanpa rematch.
 */
export async function swapPairingPlayers(
  tournamentId: string,
  matchA: TournamentMatch,
  playerAKey: 'p1' | 'p2',
  matchB: TournamentMatch,
  playerBKey: 'p1' | 'p2',
  force: boolean = false
): Promise<{ success: boolean; warning?: string }> {
  const allPastMatches = await getAllTournamentMatches(tournamentId);
  // Filter hanya pertandingan dari ronde-ronde SEBELUM ronde saat ini
  const pastMatchesBeforeCurrent = allPastMatches
    .filter((m) => m.round < matchA.round)
    .map((m) => ({ round: m.round, p1Id: m.p1Id, p2Id: m.p2Id }));

  const playerAId = playerAKey === 'p1' ? matchA.p1Id : matchA.p2Id;
  const playerAName = playerAKey === 'p1' ? matchA.p1Name : matchA.p2Name;

  const playerBId = playerBKey === 'p1' ? matchB.p1Id : matchB.p2Id;
  const playerBName = playerBKey === 'p1' ? matchB.p1Name : matchB.p2Name;

  if (!playerAId || !playerBId) {
    throw new Error('Tidak dapat menukar dengan slot kosong.');
  }

  // Lawan baru untuk Player A di meja B
  const opponentForA = playerBKey === 'p1' ? matchB.p2Id : matchB.p1Id;
  // Lawan baru untuk Player B di meja A
  const opponentForB = playerAKey === 'p1' ? matchA.p2Id : matchA.p1Id;

  const valA = validateManualSwap(playerAId, opponentForA, pastMatchesBeforeCurrent);
  const valB = validateManualSwap(playerBId, opponentForB, pastMatchesBeforeCurrent);

  let warning: string | undefined = undefined;
  if (!valA.isValid) warning = `Pemain ${playerAName}: ${valA.warning}`;
  if (!valB.isValid) warning = (warning ? `${warning}; ` : '') + `Pemain ${playerBName}: ${valB.warning}`;

  if (warning && !force) {
    return { success: false, warning };
  }

  // Lakukan penukaran di Firestore
  const batch = writeBatch(db);
  const now = Date.now();

  const matchARef = doc(db, 'tournaments', tournamentId, 'matches', matchA.id);
  const matchBRef = doc(db, 'tournaments', tournamentId, 'matches', matchB.id);

  const updateA: Partial<TournamentMatch> = {
    [playerAKey === 'p1' ? 'p1Id' : 'p2Id']: playerBId,
    [playerAKey === 'p1' ? 'p1Name' : 'p2Name']: playerBName,
    updatedAt: now,
  };

  const updateB: Partial<TournamentMatch> = {
    [playerBKey === 'p1' ? 'p1Id' : 'p2Id']: playerAId,
    [playerBKey === 'p1' ? 'p1Name' : 'p2Name']: playerAName,
    updatedAt: now,
  };

  batch.update(matchARef, updateA);
  batch.update(matchBRef, updateB);

  await batch.commit();

  return { success: true, warning };
}

/**
 * Memperbarui skor dan status pertandingan oleh Organizer
 */
export async function updateMatchScore(
  tournamentId: string,
  matchId: string,
  p1Score: number,
  p2Score: number,
  status: MatchStatus
): Promise<void> {
  const matchRef = doc(db, 'tournaments', tournamentId, 'matches', matchId);
  await updateDoc(matchRef, {
    p1Score,
    p2Score,
    status,
    updatedAt: Date.now(),
  });
}

/**
 * Player menginput hasil pertandingannya (status menjadi awaiting, reportedBy diisi uid pelapor)
 */
export async function reportMatchScoreByPlayer(
  tournamentId: string,
  matchId: string,
  p1Score: number,
  p2Score: number,
  reporterUid: string
): Promise<void> {
  const matchRef = doc(db, 'tournaments', tournamentId, 'matches', matchId);
  await updateDoc(matchRef, {
    p1Score,
    p2Score,
    status: 'awaiting',
    reportedBy: reporterUid,
    updatedAt: Date.now(),
  });
}

/**
 * Lawan merespons hasil pertandingan (approve -> confirmed, reject -> disputed)
 */
export async function respondToReportedScore(
  tournamentId: string,
  matchId: string,
  approve: boolean,
  opponentUid: string
): Promise<void> {
  const matchRef = doc(db, 'tournaments', tournamentId, 'matches', matchId);
  const newStatus: MatchStatus = approve ? 'confirmed' : 'disputed';
  await updateDoc(matchRef, {
    status: newStatus,
    updatedAt: Date.now(),
  });
}

/**
 * Organizer menginput atau menimpa hasil pertandingan (otomatis confirmed)
 */
/**
 * Organizer menginput atau menimpa hasil pertandingan (otomatis confirmed & catat audit log)
 */
export async function organizerSetMatchResult(
  tournamentId: string,
  match: TournamentMatch,
  p1Score: number,
  p2Score: number,
  organizer: { uid: string; name: string }
): Promise<void> {
  const matchRef = doc(db, 'tournaments', tournamentId, 'matches', match.id);
  const oldScoreStr = `${match.p1Score} - ${match.p2Score} (${match.status})`;
  const newScoreStr = `${p1Score} - ${p2Score} (confirmed)`;

  await updateDoc(matchRef, {
    p1Score,
    p2Score,
    status: 'confirmed',
    updatedAt: Date.now(),
  });

  // Catat ke audit log
  await recordAuditLog(
    organizer.uid,
    organizer.name,
    'KOREKSI_SKOR_PERTANDINGAN',
    `Meja #${match.table} (Ronde ${match.round}) - ${match.p1Name} vs ${match.p2Name}`,
    oldScoreStr,
    newScoreStr,
    tournamentId
  );
}

/**
 * Menandai ronde selesai jika seluruh pertandingan di ronde tersebut sudah confirmed.
 * Tidak lagi otomatis mengubah status turnamen menjadi 'finished' agar organizer dapat memilih
 * lanjut ke Top Cut (Top 4 / Top 8) atau mengakhiri turnamen secara eksplisit.
 */
export async function checkAndFinishTournamentIfComplete(
  tournamentId: string,
  currentRoundNumber: number,
  totalRounds: number
): Promise<{ allRoundsComplete: boolean; tournamentFinished: boolean }> {
  const currentMatches = await getMatchesForRound(tournamentId, currentRoundNumber);
  if (currentMatches.length === 0) {
    return { allRoundsComplete: false, tournamentFinished: false };
  }
  const unconfirmed = currentMatches.filter((m) => m.status !== 'confirmed');

  if (unconfirmed.length > 0) {
    return { allRoundsComplete: false, tournamentFinished: false };
  }

  // Tandai ronde ini status = 'completed'
  const roundRef = doc(db, 'tournaments', tournamentId, 'rounds', String(currentRoundNumber));
  await updateDoc(roundRef, { status: 'completed' });

  return { allRoundsComplete: true, tournamentFinished: false };
}

/**
 * Mengakhiri turnamen secara eksplisit oleh organizer (baik tanpa Top Cut maupun setelah Final Top Cut).
 */
export async function finishTournamentExplicit(
  tournamentId: string
): Promise<{ tournamentFinished: boolean }> {
  const tournamentRef = doc(db, 'tournaments', tournamentId);
  const tourneySnap = await getDoc(tournamentRef);
  if (!tourneySnap.exists()) {
    throw new Error('Data turnamen tidak ditemukan.');
  }

  const tourneyData = tourneySnap.data() as Tournament;
  const activeRounds = await getTournamentRounds(tournamentId, false);
  const targetRoundNum =
    tourneyData.currentRound ||
    (activeRounds.length > 0 ? activeRounds[activeRounds.length - 1].number : tourneyData.totalRounds || 1);

  const currentMatches = await getMatchesForRound(tournamentId, targetRoundNum, false);
  if (currentMatches.length === 0) {
    throw new Error('Belum ada pertandingan pada ronde terakhir untuk diselesaikan.');
  }
  const unconfirmed = currentMatches.filter((m) => m.status !== 'confirmed');
  if (unconfirmed.length > 0) {
    throw new Error('Belum semua pertandingan ronde terakhir terkonfirmasi.');
  }

  // Jika sedang dalam fase Top Cut, pastikan babak saat ini memang Final Top Cut
  if (tourneyData.topCut) {
    const finalTopCutRound = getTopCutFinalRoundNumber(
      tourneyData.totalRounds || 3,
      tourneyData.topCut.size
    );
    if (targetRoundNum < finalTopCutRound) {
      throw new Error('Fase Top Cut belum mencapai babak Final.');
    }
    const finalMatch = currentMatches[0];
    if (finalMatch && finalMatch.p2Id && finalMatch.p1Score === finalMatch.p2Score) {
      throw new Error('Pertandingan Final Top Cut tidak boleh berakhir seri.');
    }
  }

  const batch = writeBatch(db);
  const roundRef = doc(db, 'tournaments', tournamentId, 'rounds', String(targetRoundNum));
  batch.update(roundRef, { status: 'completed' });
  batch.update(tournamentRef, {
    status: 'finished',
    finishedAt: Date.now(),
  });
  await batch.commit();

  return { tournamentFinished: true };
}

/**
 * Memulai fase Top Cut (Top 4 atau Top 8) setelah ronde Swiss terakhir selesai:
 * - Menghitung seed dari klasemen Swiss akhir (pemain dropped dilewati)
 * - Membuat dokumen ronde Top Cut pertama (round = totalSwissRounds + 1, stage: 'topcut')
 * - Membuat pertandingan bracket awal (stage: 'topcut') dalam SATU writeBatch
 * - Mencatat audit log 'TOPCUT_STARTED'
 */
export async function startTopCutPhase(
  tournamentId: string,
  topCutSize: TopCutSize,
  format: TournamentFormat,
  totalSwissRounds: number,
  organizer: { uid: string; name: string }
): Promise<{
  topCut: TournamentTopCut;
  round: TournamentRound;
  matches: TournamentMatch[];
}> {
  const tournamentRef = doc(db, 'tournaments', tournamentId);
  const tourneySnap = await getDoc(tournamentRef);
  if (!tourneySnap.exists()) {
    throw new Error('Data turnamen tidak ditemukan.');
  }
  const tourneyData = tourneySnap.data() as Tournament;

  const targetRoundNumber = totalSwissRounds + 1;
  const allActiveMatches = await getAllTournamentMatches(tournamentId, false);

  // Guard double-tap jika Top Cut sudah dimulai
  const existingRoundMatches = allActiveMatches.filter((m) => m.round === targetRoundNumber);
  if (tourneyData.topCut && existingRoundMatches.length > 0) {
    const rounds = await getTournamentRounds(tournamentId, false);
    const existingRound = rounds.find((r) => r.number === targetRoundNumber) || {
      number: targetRoundNumber,
      status: 'active' as const,
      stage: 'topcut' as const,
      timer: {
        status: 'idle' as const,
        durationMs: (format === 'BO1' ? 25 : 45) * 60 * 1000,
        remainingMs: (format === 'BO1' ? 25 : 45) * 60 * 1000,
      },
    };
    return {
      topCut: tourneyData.topCut,
      round: existingRound,
      matches: existingRoundMatches,
    };
  }

  // Pastikan ronde Swiss terakhir sudah selesai dan terkonfirmasi semua
  const lastSwissMatches = filterSwissMatches(allActiveMatches).filter(
    (m) => m.round === totalSwissRounds
  );
  if (lastSwissMatches.length === 0) {
    throw new Error(`Ronde Swiss terakhir (Ronde ${totalSwissRounds}) belum dimainkan.`);
  }
  const unconfirmedSwiss = lastSwissMatches.filter((m) => m.status !== 'confirmed');
  if (unconfirmedSwiss.length > 0) {
    throw new Error(
      `Masih ada ${unconfirmedSwiss.length} pertandingan Ronde ${totalSwissRounds} yang belum terkonfirmasi.`
    );
  }

  // Hitung seed dari klasemen Swiss murni (melewati dropped)
  const players = await getTournamentPlayers(tournamentId);
  const seeds = buildTopCutSeeds(players, filterSwissMatches(allActiveMatches), format, topCutSize);
  const initialDrafts = createTopCutInitialMatches(seeds, topCutSize);

  const now = Date.now();
  const topCut: TournamentTopCut = {
    size: topCutSize,
    seeds,
    startedAt: now,
  };

  const roundDurationMs = format === 'BO1' ? 25 * 60 * 1000 : 45 * 60 * 1000;
  const roundData: TournamentRound = {
    number: targetRoundNumber,
    status: 'active',
    stage: 'topcut',
    timer: {
      status: 'idle',
      durationMs: roundDurationMs,
      remainingMs: roundDurationMs,
    },
  };

  const batch = writeBatch(db);

  // Tandai ronde Swiss terakhir sebagai completed
  const lastSwissRoundRef = doc(db, 'tournaments', tournamentId, 'rounds', String(totalSwissRounds));
  batch.update(lastSwissRoundRef, { status: 'completed' });

  // Simpan ronde Top Cut pertama
  const roundDocRef = doc(db, 'tournaments', tournamentId, 'rounds', String(targetRoundNumber));
  batch.set(roundDocRef, roundData);

  // Simpan pertandingan Top Cut awal
  const createdMatches: TournamentMatch[] = [];
  for (const draft of initialDrafts) {
    const matchDocRef = doc(collection(db, 'tournaments', tournamentId, 'matches'));
    const matchData: TournamentMatch = {
      id: matchDocRef.id,
      round: targetRoundNumber,
      stage: 'topcut',
      table: draft.table,
      p1Id: draft.p1Id,
      p2Id: draft.p2Id,
      p1Name: draft.p1Name,
      p2Name: draft.p2Name,
      p1Score: 0,
      p2Score: 0,
      status: 'pending',
      updatedAt: now,
    };
    batch.set(matchDocRef, matchData);
    createdMatches.push(matchData);
  }

  // Update turnamen
  batch.update(tournamentRef, {
    topCut,
    currentRound: targetRoundNumber,
    status: 'running',
  });

  await batch.commit();

  // Catat log audit
  try {
    const firstLabel = getRoundDisplayLabel(targetRoundNumber, totalSwissRounds, topCutSize);
    await recordAuditLog(
      organizer.uid,
      organizer.name,
      'TOPCUT_STARTED',
      `Top ${topCutSize} (${firstLabel}) - ${tourneyData.name}`,
      `Ronde ${totalSwissRounds} (Swiss)`,
      seeds.map((s, idx) => `#${idx + 1} ${s.name}`).join(', '),
      tournamentId
    );
  } catch (err) {
    console.warn('Gagal mencatat audit log TOPCUT_STARTED:', err);
  }

  return { topCut, round: roundData, matches: createdMatches };
}

/**
 * Membuat babak Top Cut berikutnya (Semifinal atau Final) secara manual dari pemenang babak saat ini.
 */
export async function createNextTopCutRound(
  tournamentId: string,
  targetRoundNumber: number,
  format: TournamentFormat,
  totalSwissRounds: number,
  topCutSize: TopCutSize,
  organizer: { uid: string; name: string }
): Promise<{ round: TournamentRound; matches: TournamentMatch[] }> {
  const finalRoundNumber = getTopCutFinalRoundNumber(totalSwissRounds, topCutSize);
  if (targetRoundNumber > finalRoundNumber) {
    throw new Error('Tidak ada babak Top Cut berikutnya setelah Final.');
  }

  const allActiveMatches = await getAllTournamentMatches(tournamentId, false);

  // Guard klik ganda
  const existingTargetMatches = allActiveMatches.filter((m) => m.round === targetRoundNumber);
  if (existingTargetMatches.length > 0) {
    const rounds = await getTournamentRounds(tournamentId, false);
    const existingRound = rounds.find((r) => r.number === targetRoundNumber) || {
      number: targetRoundNumber,
      status: 'active' as const,
      stage: 'topcut' as const,
      timer: {
        status: 'idle' as const,
        durationMs: (format === 'BO1' ? 25 : 45) * 60 * 1000,
        remainingMs: (format === 'BO1' ? 25 : 45) * 60 * 1000,
      },
    };
    return { round: existingRound, matches: existingTargetMatches };
  }

  const prevRoundNumber = targetRoundNumber - 1;
  const prevMatches = allActiveMatches.filter((m) => m.round === prevRoundNumber);
  if (prevMatches.length === 0) {
    throw new Error('Pertandingan babak sebelumnya tidak ditemukan.');
  }

  const nextDrafts = buildNextTopCutRoundMatches(prevMatches);
  const now = Date.now();
  const roundDurationMs = format === 'BO1' ? 25 * 60 * 1000 : 45 * 60 * 1000;

  const roundData: TournamentRound = {
    number: targetRoundNumber,
    status: 'active',
    stage: 'topcut',
    timer: {
      status: 'idle',
      durationMs: roundDurationMs,
      remainingMs: roundDurationMs,
    },
  };

  const batch = writeBatch(db);

  // Tandai babak sebelumnya completed
  const prevRoundRef = doc(db, 'tournaments', tournamentId, 'rounds', String(prevRoundNumber));
  batch.update(prevRoundRef, { status: 'completed' });

  // Buat babak baru
  const nextRoundRef = doc(db, 'tournaments', tournamentId, 'rounds', String(targetRoundNumber));
  batch.set(nextRoundRef, roundData);

  const createdMatches: TournamentMatch[] = [];
  for (const draft of nextDrafts) {
    const matchDocRef = doc(collection(db, 'tournaments', tournamentId, 'matches'));
    const matchData: TournamentMatch = {
      id: matchDocRef.id,
      round: targetRoundNumber,
      stage: 'topcut',
      table: draft.table,
      p1Id: draft.p1Id,
      p2Id: draft.p2Id,
      p1Name: draft.p1Name,
      p2Name: draft.p2Name,
      p1Score: 0,
      p2Score: 0,
      status: 'pending',
      updatedAt: now,
    };
    batch.set(matchDocRef, matchData);
    createdMatches.push(matchData);
  }

  const tournamentRef = doc(db, 'tournaments', tournamentId);
  batch.update(tournamentRef, {
    currentRound: targetRoundNumber,
    status: 'running',
  });

  await batch.commit();

  // Catat log audit
  try {
    const prevLabel = getRoundDisplayLabel(prevRoundNumber, totalSwissRounds, topCutSize);
    const nextLabel = getRoundDisplayLabel(targetRoundNumber, totalSwissRounds, topCutSize);
    await recordAuditLog(
      organizer.uid,
      organizer.name,
      'TOPCUT_ROUND_CREATED',
      `Babak ${nextLabel} (Top ${topCutSize})`,
      prevLabel,
      nextLabel,
      tournamentId
    );
  } catch (err) {
    console.warn('Gagal mencatat audit log TOPCUT_ROUND_CREATED:', err);
  }

  return { round: roundData, matches: createdMatches };
}

/**
 * Revert ke Ronde X:
 * Mengarsipkan (archived = true, JANGAN hapus permanen) ronde dan pertandingan SETELAH ronde X.
 * Bila revert kembali ke ronde Swiss sementara fase Top Cut aktif/selesai, field `topCut` juga dihapus.
 * Status turnamen kembali running dan currentRound menjadi X.
 */
export async function revertTournamentToRound(
  tournamentId: string,
  targetRoundNumber: number,
  currentRoundNumber: number,
  organizer: { uid: string; name: string }
): Promise<void> {
  const tournamentRef = doc(db, 'tournaments', tournamentId);
  const tourneySnap = await getDoc(tournamentRef);
  const tourneyData = tourneySnap.exists() ? (tourneySnap.data() as Tournament) : null;
  const totalSwissRounds = tourneyData?.totalRounds || 3;
  const hadTopCut = Boolean(tourneyData?.topCut);
  const isRevertingToSwiss = targetRoundNumber <= totalSwissRounds;

  const batch = writeBatch(db);
  const now = Date.now();

  // 1. Ambil seluruh ronde
  const roundsCol = collection(db, 'tournaments', tournamentId, 'rounds');
  const allRoundsSnap = await getDocs(roundsCol);

  allRoundsSnap.forEach((d) => {
    const rData = d.data() as TournamentRound;
    if (rData.number > targetRoundNumber) {
      batch.update(d.ref, {
        archived: true,
        status: 'active',
      });
    } else if (rData.number === targetRoundNumber) {
      batch.update(d.ref, {
        status: 'active',
        archived: false,
      });
    }
  });

  // 2. Ambil seluruh pertandingan
  const matchesCol = collection(db, 'tournaments', tournamentId, 'matches');
  const allMatchesSnap = await getDocs(matchesCol);

  allMatchesSnap.forEach((d) => {
    const mData = d.data() as TournamentMatch;
    if (mData.round > targetRoundNumber) {
      batch.update(d.ref, {
        archived: true,
      });
    }
  });

  // 3. Update dokumen turnamen
  const tourneyPatch: Record<string, any> = {
    currentRound: targetRoundNumber,
    status: 'running',
    finishedAt: null,
    finalized: false,
  };
  if (hadTopCut && isRevertingToSwiss) {
    tourneyPatch.topCut = deleteField();
  }
  batch.update(tournamentRef, tourneyPatch);

  // 4. Catat peristiwa revert ke koleksi auditLogs
  const oldLabel =
    hadTopCut && currentRoundNumber > totalSwissRounds
      ? getRoundDisplayLabel(currentRoundNumber, totalSwissRounds, tourneyData?.topCut?.size)
      : `Ronde ${currentRoundNumber}`;
  const newLabel =
    hadTopCut && !isRevertingToSwiss
      ? getRoundDisplayLabel(targetRoundNumber, totalSwissRounds, tourneyData?.topCut?.size)
      : `Ronde ${targetRoundNumber}`;

  const auditDocRef = doc(collection(db, 'auditLogs'));
  batch.set(auditDocRef, {
    id: auditDocRef.id,
    actorId: organizer.uid,
    actorName: organizer.name,
    action: 'REVERT_RONDE',
    target: `Turnamen #${tournamentId}`,
    tournamentId: tournamentId,
    oldValue: oldLabel,
    newValue: hadTopCut && isRevertingToSwiss ? `${newLabel} (Top Cut dibatalkan)` : newLabel,
    createdAt: now,
  });

  await batch.commit();
}

/**
 * Mengambil log audit khusus turnamen tertentu untuk organizer dan admin (dibatasi 200)
 */
export async function getTournamentAuditLogs(tournamentId: string): Promise<AuditLog[]> {
  const auditCol = collection(db, 'auditLogs');
  const q = query(
    auditCol,
    where('tournamentId', '==', tournamentId),
    orderBy('createdAt', 'desc'),
    limit(200)
  );
  try {
    const snap = await getDocs(q);
    return snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) } as AuditLog));
  } catch (err) {
    // Fallback jika query index belum siap
    const allSnap = await getDocs(query(auditCol, orderBy('createdAt', 'desc'), limit(200)));
    return allSnap.docs
      .map((d) => ({ id: d.id, ...(d.data() as any) } as AuditLog))
      .filter((l) => l.tournamentId === tournamentId);
  }
}

/**
 * Mengambil log audit sistem untuk admin dengan batas limit(200)
 */
export async function getAdminAuditLogs(maxLogs: number = 200): Promise<AuditLog[]> {
  const auditCol = collection(db, 'auditLogs');
  const q = query(auditCol, orderBy('createdAt', 'desc'), limit(maxLogs));
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) } as AuditLog));
}

/**
 * Memulai timer ronde dengan durasi (menit) yang diatur organizer
 */
export async function startRoundTimer(
  tournamentId: string,
  roundNumber: number,
  durationMinutes: number
): Promise<void> {
  const roundDocRef = doc(db, 'tournaments', tournamentId, 'rounds', String(roundNumber));
  const durationMs = Math.max(1, durationMinutes) * 60 * 1000;

  await updateDoc(roundDocRef, {
    'timer.status': 'running',
    'timer.durationMs': durationMs,
    'timer.remainingMs': durationMs,
    'timer.startedAt': serverTimestamp(),
  });
}

/**
 * Menjeda timer ronde
 */
export async function pauseRoundTimer(
  tournamentId: string,
  roundNumber: number
): Promise<void> {
  const roundDocRef = doc(db, 'tournaments', tournamentId, 'rounds', String(roundNumber));
  const snap = await getDoc(roundDocRef);
  if (!snap.exists()) return;

  const roundData = snap.data() as TournamentRound;
  const currentServerTime = Date.now() + getClockOffset();
  const remaining = calculateRemainingTime(roundData.timer, currentServerTime);

  const newStatus = remaining <= 0 ? 'expired' : 'paused';

  await updateDoc(roundDocRef, {
    'timer.status': newStatus,
    'timer.remainingMs': Math.max(0, remaining),
    'timer.startedAt': null,
  });
}

/**
 * Melanjutkan timer ronde dari status dijeda (paused).
 * Lanjutkan hanya valid dari status dijeda; timer yang habis hanya bisa di-reset.
 */
export async function resumeRoundTimer(
  tournamentId: string,
  roundNumber: number
): Promise<void> {
  const roundDocRef = doc(db, 'tournaments', tournamentId, 'rounds', String(roundNumber));
  const snap = await getDoc(roundDocRef);
  if (!snap.exists()) return;

  const roundData = snap.data() as TournamentRound;
  if (roundData.timer.status !== 'paused' || roundData.timer.remainingMs <= 0) {
    throw new Error('Timer hanya dapat dilanjutkan jika berstatus dijeda dan sisa waktu masih ada.');
  }

  await updateDoc(roundDocRef, {
    'timer.status': 'running',
    'timer.startedAt': serverTimestamp(),
  });
}

/**
 * Me-reset timer ronde ke durasi awal atau durasi kustom baru
 */
export async function resetRoundTimer(
  tournamentId: string,
  roundNumber: number,
  customDurationMinutes?: number
): Promise<void> {
  const roundDocRef = doc(db, 'tournaments', tournamentId, 'rounds', String(roundNumber));
  const snap = await getDoc(roundDocRef);
  if (!snap.exists()) return;

  const roundData = snap.data() as TournamentRound;
  const durationMs = customDurationMinutes
    ? Math.max(1, customDurationMinutes) * 60 * 1000
    : roundData.timer?.durationMs || 45 * 60 * 1000;

  await updateDoc(roundDocRef, {
    'timer.status': 'idle',
    'timer.durationMs': durationMs,
    'timer.remainingMs': durationMs,
    'timer.startedAt': null,
  });
}

