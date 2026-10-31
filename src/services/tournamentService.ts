import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  deleteDoc,
  query,
  where,
  orderBy,
  limit,
  writeBatch
} from 'firebase/firestore';
import { db } from '../firebaseConfig';
import { Tournament, TournamentFormat, TournamentPlayer, PlayerStatus } from '../types';
import { calculateSwissRounds, generateJoinCode } from '../utils/swissLogic';
import { recordAuditLog } from './authService';

export interface CreateTournamentParams {
  name: string;
  date: string;
  location: string;
  format: TournamentFormat;
}

/**
 * Membuat turnamen baru oleh Organizer
 */
export async function createTournament(
  params: CreateTournamentParams,
  organizer: { uid: string; name: string }
): Promise<Tournament> {
  const cleanName = params.name.trim();
  const cleanLocation = params.location.trim();

  if (!cleanName) throw new Error('Nama turnamen wajib diisi.');
  if (!params.date) throw new Error('Tanggal turnamen wajib diisi.');
  if (!cleanLocation) throw new Error('Lokasi turnamen wajib diisi.');
  if (!['BO1', 'BO3'].includes(params.format)) throw new Error('Format turnamen tidak valid (pilih BO1 atau BO3).');

  const joinCode = generateJoinCode();
  const tournamentsCol = collection(db, 'tournaments');
  const newDocRef = doc(tournamentsCol);
  const now = Date.now();

  const tournamentData: Tournament = {
    id: newDocRef.id,
    name: cleanName,
    date: params.date,
    location: cleanLocation,
    format: params.format,
    status: 'registration',
    organizerId: organizer.uid,
    organizerName: organizer.name,
    joinCode,
    createdAt: now,
  };

  await setDoc(newDocRef, tournamentData);

  // Catat ke audit log
  await recordAuditLog(
    organizer.uid,
    organizer.name,
    'TOURNAMENT_CREATED',
    `tournaments/${newDocRef.id}`,
    null,
    `${cleanName} (${params.format})`
  );

  return tournamentData;
}

/**
 * Mengambil daftar turnamen berstatus registration untuk pemain
 */
export async function getRegistrationTournaments(searchQuery?: string): Promise<Tournament[]> {
  const q = query(
    collection(db, 'tournaments'),
    where('status', '==', 'registration'),
    orderBy('createdAt', 'desc'),
    limit(40)
  );
  const snap = await getDocs(q);
  const list: Tournament[] = [];
  snap.forEach((d) => {
    list.push({ id: d.id, ...(d.data() as Tournament) });
  });

  if (!searchQuery || !searchQuery.trim()) return list;

  const filter = searchQuery.trim().toLowerCase();
  return list.filter((t) =>
    (t.name && t.name.toLowerCase().includes(filter)) ||
    (t.joinCode && t.joinCode.toLowerCase() === filter)
  );
}

/**
 * Mengambil turnamen milik Organizer tertentu
 */
export async function getOrganizerTournaments(organizerId: string): Promise<Tournament[]> {
  const q = query(
    collection(db, 'tournaments'),
    where('organizerId', '==', organizerId),
    orderBy('createdAt', 'desc'),
    limit(40)
  );
  const snap = await getDocs(q);
  const list: Tournament[] = [];
  snap.forEach((d) => {
    list.push({ id: d.id, ...(d.data() as Tournament) });
  });
  return list;
}

/**
 * Mengambil semua turnamen untuk Admin
 */
export async function getAllTournaments(): Promise<Tournament[]> {
  const q = query(collection(db, 'tournaments'), orderBy('createdAt', 'desc'), limit(50));
  const snap = await getDocs(q);
  const list: Tournament[] = [];
  snap.forEach((d) => {
    list.push({ id: d.id, ...(d.data() as Tournament) });
  });
  return list;
}

/**
 * Menghapus turnamen oleh Admin
 */
export async function deleteTournament(
  tid: string,
  tournamentName: string,
  admin: { uid: string; name: string }
): Promise<void> {
  const tournamentRef = doc(db, 'tournaments', tid);
  await deleteDoc(tournamentRef);

  await recordAuditLog(
    admin.uid,
    admin.name,
    'TOURNAMENT_DELETED',
    `tournaments/${tid}`,
    tournamentName,
    'DELETED'
  );
}

/**
 * Mengambil daftar pemain di suatu turnamen
 */
export async function getTournamentPlayers(tid: string): Promise<TournamentPlayer[]> {
  const playersCol = collection(db, 'tournaments', tid, 'players');
  const snap = await getDocs(playersCol);
  const list: TournamentPlayer[] = [];
  snap.forEach((d) => {
    list.push({ id: d.id, ...(d.data() as TournamentPlayer) });
  });
  // Urutkan berdasarkan waktu bergabung
  return list.sort((a, b) => a.joinedAt - b.joinedAt);
}

/**
 * Pemain mendaftar ke turnamen (Waiting List)
 */
export async function registerPlayer(
  tid: string,
  player: { uid: string; name: string }
): Promise<void> {
  const playerRef = doc(db, 'tournaments', tid, 'players', player.uid);
  const playerSnap = await getDoc(playerRef);

  if (playerSnap.exists()) {
    const existing = playerSnap.data() as TournamentPlayer;
    if (existing.status === 'rejected') {
      throw new Error('Pendaftaran Anda sebelumnya ditolak untuk turnamen ini.');
    }
    throw new Error('Anda sudah terdaftar di turnamen ini.');
  }

  const playerData: TournamentPlayer = {
    id: player.uid,
    name: player.name,
    uid: player.uid,
    manual: false,
    status: 'waiting',
    joinedAt: Date.now(),
  };

  await setDoc(playerRef, playerData);
}

/**
 * Pemain membatalkan pendaftaran
 */
export async function cancelRegistration(tid: string, uid: string): Promise<void> {
  const playerRef = doc(db, 'tournaments', tid, 'players', uid);
  await deleteDoc(playerRef);
}

/**
 * Organizer menambahkan peserta manual (tanpa akun)
 */
export async function addManualPlayer(tid: string, name: string): Promise<TournamentPlayer> {
  const cleanName = name.trim();
  if (!cleanName) throw new Error('Nama peserta manual wajib diisi.');

  const pid = 'm_' + Date.now().toString(36) + Math.random().toString(36).substring(2, 6);
  const playerRef = doc(db, 'tournaments', tid, 'players', pid);

  const playerData: TournamentPlayer = {
    id: pid,
    name: cleanName,
    uid: null,
    manual: true,
    status: 'accepted',
    joinedAt: Date.now(),
  };

  await setDoc(playerRef, playerData);
  return playerData;
}

/**
 * Organizer mengubah status pemain (terima/tolak)
 */
export async function updatePlayerStatus(
  tid: string,
  pid: string,
  status: PlayerStatus
): Promise<void> {
  const playerRef = doc(db, 'tournaments', tid, 'players', pid);
  await updateDoc(playerRef, { status });
}

/**
 * Organizer menerima semua pemain di waiting list
 */
export async function acceptAllWaitingPlayers(
  tid: string,
  waitingPlayers: TournamentPlayer[]
): Promise<void> {
  if (waitingPlayers.length === 0) return;

  const batch = writeBatch(db);
  waitingPlayers.forEach((p) => {
    const playerRef = doc(db, 'tournaments', tid, 'players', p.id);
    batch.update(playerRef, { status: 'accepted' });
  });

  await batch.commit();
}

/**
 * Organizer memulai turnamen:
 * - Butuh minimal 3 peserta berstatus 'accepted'
 * - Format terkunci
 * - Jumlah ronde otomatis dihitung: max(3, ceil(log2(jumlah pemain)))
 * - Status turnamen menjadi 'running'
 */
export async function startTournament(
  tid: string,
  acceptedCount: number,
  organizer: { uid: string; name: string }
): Promise<{ totalRounds: number }> {
  if (acceptedCount < 3) {
    throw new Error('Minimal 3 peserta accepted diperlukan untuk memulai turnamen.');
  }

  const totalRounds = calculateSwissRounds(acceptedCount);
  const tournamentRef = doc(db, 'tournaments', tid);
  const now = Date.now();

  await updateDoc(tournamentRef, {
    status: 'running',
    currentRound: 1,
    totalRounds,
    startedAt: now,
  });

  await recordAuditLog(
    organizer.uid,
    organizer.name,
    'TOURNAMENT_STARTED',
    `tournaments/${tid}`,
    'registration',
    `running (${totalRounds} ronde)`
  );

  return { totalRounds };
}

/**
 * Menandai peserta dropped saat running (tidak mengubah totalRounds)
 */
export async function dropPlayer(tid: string, pid: string): Promise<void> {
  const playerRef = doc(db, 'tournaments', tid, 'players', pid);
  await updateDoc(playerRef, { status: 'dropped' });
}
