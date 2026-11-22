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
import { Tournament, TournamentFormat, TournamentPlayer, PlayerStatus, Participation, TournamentType, TournamentSeason } from '../types';
import { calculateSwissRounds, generateJoinCode } from '../utils/swissLogic';
import { recordAuditLog } from './authService';
import { executeCascadeTournamentDeletion } from './tournamentCleanupService';
import { syncParticipationsTournamentInfo } from './participationService';
import {
  computeTournamentChanges,
  formatAuditDiffSummary,
  TournamentFieldChange,
  TournamentFormValues
} from '../utils/tournamentEditLogic';
import {
  checkUniqueLeagueSeasonNumber,
  computeNextSeasonNumber,
  extractYearMonthFromDate,
  formatSeasonLabel,
  getMinParticipantsToStart,
  isLeagueTournament,
  validateSeasonInput
} from '../utils/seasonLogic';
import {
  HistoryPlayerCandidate,
  preparePlayersToAdd
} from '../utils/playerHistoryImportLogic';
import { validateLeagueStartRequirements } from '../utils/leagueDeckLogic';
import {
  createLeagueInviteForTournament,
  syncLeagueInvitesMetadata
} from './leagueInviteService';
import { getAllTournamentLeagueDecks } from './leagueDeckService';
import { notifyPush } from './pushService';

export interface CreateTournamentParams {
  name: string;
  date: string;
  location: string;
  format: TournamentFormat;
  type?: TournamentType;
  season?: TournamentSeason;
  organizerId?: string;
}

/**
 * Mengambil seluruh Turnamen Liga milik organizer tertentu dari Firestore
 * untuk perhitungan dan validasi nomor season yang akurat.
 */
export async function getOrganizerLeagueTournaments(organizerId: string): Promise<Tournament[]> {
  const cleanOrgId = (organizerId || '').trim();
  if (!cleanOrgId) return [];

  const tournamentsCol = collection(db, 'tournaments');
  let list: Tournament[] = [];

  try {
    const q = query(
      tournamentsCol,
      where('organizerId', '==', cleanOrgId),
      where('type', '==', 'league')
    );
    const snap = await getDocs(q);
    list = snap.docs.map((d) => ({ ...(d.data() as Tournament), id: d.id }));
  } catch (err: any) {
    if (err?.code === 'failed-precondition') {
      const fallbackQ = query(
        tournamentsCol,
        where('organizerId', '==', cleanOrgId)
      );
      const snap = await getDocs(fallbackQ);
      list = snap.docs
        .map((d) => ({ ...(d.data() as Tournament), id: d.id }))
        .filter((t) => isLeagueTournament(t));
    } else {
      throw err;
    }
  }

  return list;
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
  const isLeague = params.type === 'league';
  const effectiveFormat: TournamentFormat = isLeague ? 'BO3' : params.format;
  const targetOrganizerId = (params.organizerId || organizer.uid || '').trim();

  if (!cleanName) throw new Error(isLeague ? 'Nama liga wajib diisi.' : 'Nama turnamen wajib diisi.');
  if (!params.date) throw new Error('Tanggal turnamen wajib diisi.');
  if (!cleanLocation) throw new Error('Lokasi turnamen wajib diisi.');
  if (!['BO1', 'BO3'].includes(effectiveFormat)) throw new Error('Format turnamen tidak valid (pilih BO1 atau BO3).');

  let validatedSeason: TournamentSeason | undefined;
  if (isLeague) {
    const fallbackDateParts = extractYearMonthFromDate(params.date);
    const candidateSeason: Partial<TournamentSeason> = {
      number: params.season?.number && params.season.number >= 1 ? params.season.number : 1,
      month: params.season?.month ?? fallbackDateParts.month,
      year: params.season?.year ?? fallbackDateParts.year,
    };
    const seasonRes = validateSeasonInput(candidateSeason);
    if (!seasonRes.valid || !seasonRes.sanitized) {
      throw new Error(seasonRes.error || 'Data Season Liga tidak valid.');
    }

    // Hitung ulang nomor season dari data segar Firestore milik organizer terkait
    const freshLeagues = await getOrganizerLeagueTournaments(targetOrganizerId);
    const recalculatedNumber = computeNextSeasonNumber(freshLeagues, targetOrganizerId);

    validatedSeason = {
      number: recalculatedNumber,
      month: seasonRes.sanitized.month,
      year: seasonRes.sanitized.year,
    };
  }

  const joinCode = generateJoinCode();
  const tournamentsCol = collection(db, 'tournaments');
  const newDocRef = doc(tournamentsCol);
  const now = Date.now();

  const tournamentData: Tournament = {
    id: newDocRef.id,
    name: cleanName,
    date: params.date,
    location: cleanLocation,
    format: effectiveFormat,
    ...(isLeague && validatedSeason
      ? { type: 'league' as const, season: validatedSeason }
      : {}),
    status: 'registration',
    organizerId: targetOrganizerId,
    organizerName: organizer.name,
    joinCode,
    createdAt: now,
  };

  await setDoc(newDocRef, tournamentData);

  if (isLeague) {
    await createLeagueInviteForTournament(tournamentData);
  }

  const seasonTag = validatedSeason ? ` • ${formatSeasonLabel(validatedSeason)}` : '';

  // Catat ke audit log
  await recordAuditLog(
    organizer.uid,
    organizer.name,
    'TOURNAMENT_CREATED',
    `tournaments/${newDocRef.id}`,
    null,
    `${cleanName} (${effectiveFormat}${seasonTag})`
  );

  return tournamentData;
}

export interface UpdateTournamentDetailsResult {
  updatedTournament: Tournament;
  changes: TournamentFieldChange[];
  syncedParticipationsCount: number;
}

/**
 * Memperbarui metadata turnamen (nama, tanggal, lokasi, dan format jika status 'registration').
 * - Tidak pernah mengubah joinCode, organizerId, status, atau totalRounds.
 * - Jika turnamen sudah finalized dan nama/tanggal berubah, menyinkronkan koleksi participations.
 * - Mencatat audit log TOURNAMENT_EDITED dengan nilai lama dan baru.
 */
export async function updateTournamentDetails(
  currentTournament: Tournament,
  input: TournamentFormValues,
  actor: { uid: string; name: string }
): Promise<UpdateTournamentDetailsResult> {
  const plan = computeTournamentChanges(currentTournament, input);
  if (!plan.valid) {
    throw new Error(plan.error || 'Data turnamen tidak valid.');
  }

  if (!plan.hasChanges) {
    return {
      updatedTournament: currentTournament,
      changes: [],
      syncedParticipationsCount: 0,
    };
  }

  // Validasi keunikan nomor season terhadap liga lain milik organizer turnamen (bukan uid admin pelaku)
  if (
    isLeagueTournament(currentTournament) &&
    currentTournament.status === 'registration' &&
    plan.updates.season &&
    plan.updates.season.number !== currentTournament.season?.number
  ) {
    const targetOrganizerId = currentTournament.organizerId;
    const freshLeagues = await getOrganizerLeagueTournaments(targetOrganizerId);
    const uniqueness = checkUniqueLeagueSeasonNumber({
      seasonNumber: plan.updates.season.number,
      organizerLeagues: freshLeagues,
      organizerId: targetOrganizerId,
      excludeTournamentId: currentTournament.id,
    });
    if (!uniqueness.unique) {
      throw new Error(
        uniqueness.error ||
          `Season ${plan.updates.season.number} sudah dipakai di liga lain milik Anda.`
      );
    }
  }

  const tournamentRef = doc(db, 'tournaments', currentTournament.id);
  await updateDoc(tournamentRef, plan.updates);

  let syncedParticipationsCount = 0;
  if (
    currentTournament.finalized &&
    (plan.updates.name !== undefined ||
      plan.updates.date !== undefined ||
      plan.updates.season !== undefined)
  ) {
    syncedParticipationsCount = await syncParticipationsTournamentInfo(
      currentTournament.id,
      {
        ...(plan.updates.name !== undefined
          ? { tournamentName: plan.updates.name }
          : {}),
        ...(plan.updates.date !== undefined ? { date: plan.updates.date } : {}),
        ...(plan.updates.season !== undefined
          ? { season: plan.updates.season }
          : {}),
      }
    );
  }

  if (
    currentTournament.type === 'league' &&
    (plan.updates.name !== undefined || plan.updates.season !== undefined)
  ) {
    try {
      const nextSeason = plan.updates.season || currentTournament.season;
      await syncLeagueInvitesMetadata(
        currentTournament.id,
        currentTournament.organizerId,
        {
          ...(plan.updates.name !== undefined
            ? { tournamentName: plan.updates.name }
            : {}),
          ...(plan.updates.season !== undefined
            ? { seasonLabel: formatSeasonLabel(nextSeason) || '' }
            : {}),
        }
      );
    } catch (syncErr) {
      console.warn('Gagal menyinkronkan metadata leagueInvites:', syncErr);
    }
  }

  const { oldValue, newValue } = formatAuditDiffSummary(plan.changes);
  await recordAuditLog(
    actor.uid,
    actor.name,
    'TOURNAMENT_EDITED',
    `tournaments/${currentTournament.id}`,
    oldValue,
    newValue,
    currentTournament.id
  );

  return {
    updatedTournament: {
      ...currentTournament,
      ...plan.updates,
    },
    changes: plan.changes,
    syncedParticipationsCount,
  };
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
    list.push({ ...(d.data() as Tournament), id: d.id });
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
    list.push({ ...(d.data() as Tournament), id: d.id });
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
    list.push({ ...(d.data() as Tournament), id: d.id });
  });
  return list;
}

/**
 * Menghapus turnamen oleh Admin secara berantai (cascade):
 * matches -> rounds -> players -> participations -> tournaments/{tid}
 */
export async function deleteTournament(
  tid: string,
  tournamentName: string,
  admin: { uid: string; name: string },
  onProgress?: (deleted: number, total: number) => void
) {
  return executeCascadeTournamentDeletion(tid, tournamentName, admin, onProgress);
}

/**
 * Mengambil daftar pemain di suatu turnamen
 */
export async function getTournamentPlayers(tid: string): Promise<TournamentPlayer[]> {
  const playersCol = collection(db, 'tournaments', tid, 'players');
  const snap = await getDocs(playersCol);
  const list: TournamentPlayer[] = [];
  snap.forEach((d) => {
    list.push({ ...(d.data() as TournamentPlayer), id: d.id });
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
 * Pemain membatalkan pendaftaran / Organizer menghapus peserta:
 * menghapus dokumen player, dokumen deck privatnya, dan klaim undangan liga secara atomik dalam writeBatch.
 */
export async function cancelRegistration(tid: string, uid: string): Promise<void> {
  const batch = writeBatch(db);
  const playerRef = doc(db, 'tournaments', tid, 'players', uid);
  const deckRef = doc(db, 'tournaments', tid, 'decks', uid);
  const claimRef = doc(db, 'tournaments', tid, 'inviteClaims', uid);
  batch.delete(playerRef);
  batch.delete(deckRef);
  batch.delete(claimRef);
  await batch.commit();
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
  if (status === 'accepted' || status === 'rejected') {
    notifyPush({
      type: 'registration_status',
      tournamentId: tid,
      playerId: pid,
    });
  }
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

  const uidPlayerIds = waitingPlayers
    .filter((p) => Boolean(p.uid))
    .map((p) => p.id);
  if (uidPlayerIds.length > 0) {
    notifyPush({
      type: 'registration_status',
      tournamentId: tid,
      playerIds: uidPlayerIds,
    });
  }
}

/**
 * Organizer memulai turnamen:
 * - Reguler: minimal 3 peserta berstatus 'accepted'
 * - Liga: minimal 4 peserta berstatus 'accepted'
 * - Format terkunci
 * - Jumlah ronde otomatis dihitung: max(3, ceil(log2(jumlah pemain)))
 * - Status turnamen menjadi 'running'
 */
export async function startTournament(
  tid: string,
  acceptedCount: number,
  organizer: { uid: string; name: string },
  tournamentType?: TournamentType
): Promise<{ totalRounds: number }> {
  const tournamentRef = doc(db, 'tournaments', tid);
  const tourneySnap = await getDoc(tournamentRef);
  const resolvedType: TournamentType = tourneySnap.exists()
    ? ((tourneySnap.data() as Tournament).type === 'league' ? 'league' : 'regular')
    : tournamentType === 'league'
    ? 'league'
    : 'regular';

  const minParticipants = getMinParticipantsToStart(resolvedType);
  if (acceptedCount < minParticipants) {
    throw new Error(
      `Minimal ${minParticipants} peserta accepted diperlukan untuk memulai turnamen${resolvedType === 'league' ? ' Liga' : ''}.`
    );
  }

  if (resolvedType === 'league') {
    const [players, decksMap] = await Promise.all([
      getTournamentPlayers(tid),
      getAllTournamentLeagueDecks(tid),
    ]);
    const leagueStartCheck = validateLeagueStartRequirements(players, decksMap);
    if (!leagueStartCheck.canStart) {
      throw new Error(
        leagueStartCheck.errorMessage ||
          'Seluruh peserta Liga harus melengkapi 2 deck valid sebelum turnamen dimulai.'
      );
    }
  }

  const totalRounds = calculateSwissRounds(acceptedCount);
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

/**
 * Mengambil seluruh partisipasi dari turnamen-turnamen milik organizer yang sedang login.
 * Alur: Ambil turnamen milik organizer (organizerId) lalu participations per tournamentId.
 * Memakai indeks yang sudah ada tanpa memerlukan indeks komposit baru.
 */
export async function fetchOrganizerPastParticipations(
  organizerId: string
): Promise<Participation[]> {
  if (!organizerId) return [];
  const orgTourneys = await getOrganizerTournaments(organizerId);
  if (!orgTourneys || orgTourneys.length === 0) return [];

  const partsCol = collection(db, 'participations');
  const results = await Promise.all(
    orgTourneys.map(async (t) => {
      try {
        const q = query(partsCol, where('tournamentId', '==', t.id));
        const snap = await getDocs(q);
        return snap.docs.map((d) => d.data() as Participation);
      } catch (err) {
        console.warn(`Gagal memuat partisipasi turnamen ${t.id}:`, err);
        return [];
      }
    })
  );

  const allParts: Participation[] = [];
  results.forEach((list) => allParts.push(...list));
  return allParts;
}

/**
 * Menambahkan sejumlah peserta dari histori ke turnamen yang masih berstatus registration.
 * - Pemain berakun ditambahkan dengan uid aslinya, status accepted.
 * - Pemain manual ditambahkan dengan ID berawalan m_, status accepted.
 * - Dicatat ke log audit.
 */
export async function addPlayersFromHistory(
  tid: string,
  tournamentName: string,
  candidates: HistoryPlayerCandidate[],
  actor: { uid: string; name: string }
): Promise<number> {
  if (!candidates || candidates.length === 0) return 0;

  const payloads = preparePlayersToAdd(candidates);
  const batch = writeBatch(db);

  payloads.forEach((p) => {
    const playerRef = doc(db, 'tournaments', tid, 'players', p.id);
    batch.set(playerRef, p);
  });

  await batch.commit();

  // Catat ke log audit (non-blocking)
  try {
    const names = payloads.map((p) => p.name).join(', ');
    await recordAuditLog(
      actor.uid,
      actor.name,
      'ADD_PLAYERS_FROM_HISTORY',
      `tournaments/${tid}/players`,
      null,
      `Menambahkan ${payloads.length} peserta dari histori (${names}) ke turnamen ${tournamentName}`,
      tid
    );
  } catch (auditErr) {
    console.warn('Gagal mencatat audit log tambah pemain histori:', auditErr);
  }

  return payloads.length;
}

