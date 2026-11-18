import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  query,
  setDoc,
  updateDoc,
  where,
  writeBatch,
} from 'firebase/firestore';
import { db } from '../firebaseConfig';
import type { LeagueInvite, Tournament, TournamentPlayer } from '../types';
import { recordAuditLog } from './authService';
import { formatSeasonLabel } from '../utils/seasonLogic';
import {
  LEAGUE_INVITE_CLAIMS_VERSION,
  buildLeagueInviteClaimPayload,
  buildLeaguePlayerPayload,
  executeTwoStepLeagueRegistration,
  generateLeagueInviteCode,
  isValidLeagueInviteCodeFormat,
  normalizeLeagueInviteInput,
  validateLeagueInviteForRegistration,
} from '../utils/leagueInviteLogic';

/**
 * Menghasilkan kode undangan 8 karakter yang belum ada di koleksi leagueInvites.
 */
async function generateUniqueLeagueInviteCode(): Promise<string> {
  for (let attempt = 0; attempt < 8; attempt++) {
    const candidate = generateLeagueInviteCode();
    const existingSnap = await getDoc(doc(db, 'leagueInvites', candidate));
    if (!existingSnap.exists()) {
      return candidate;
    }
  }
  return generateLeagueInviteCode();
}

/**
 * Membuat dokumen leagueInvites/{kode} untuk Turnamen Liga yang baru dibuat.
 */
export async function createLeagueInviteForTournament(
  tournament: Pick<
    Tournament,
    'id' | 'name' | 'season' | 'organizerId' | 'organizerName'
  >
): Promise<LeagueInvite> {
  const code = await generateUniqueLeagueInviteCode();
  const now = Date.now();
  const seasonLabel = formatSeasonLabel(tournament.season) || '';

  const inviteData: LeagueInvite = {
    code,
    tournamentId: tournament.id,
    tournamentName: tournament.name,
    seasonLabel,
    organizerId: tournament.organizerId,
    organizerName: tournament.organizerName,
    active: true,
    inviteVersion: LEAGUE_INVITE_CLAIMS_VERSION,
    createdAt: now,
  };

  await setDoc(doc(db, 'leagueInvites', code), inviteData);
  return inviteData;
}

/**
 * Mengambil seluruh undangan liga milik turnamen tertentu.
 * Memakai query where('organizerId', '==', organizerId) + where('tournamentId', '==', tournamentId)
 * sesuai aturan security rules list leagueInvites tanpa memerlukan indeks komposit baru.
 */
export async function getLeagueInvitesForTournament(
  tournamentId: string,
  organizerId: string
): Promise<{
  invites: LeagueInvite[];
  activeInvite: LeagueInvite | null;
  latestInvite: LeagueInvite | null;
}> {
  if (!tournamentId || !organizerId) {
    return { invites: [], activeInvite: null, latestInvite: null };
  }

  const invitesCol = collection(db, 'leagueInvites');
  let list: LeagueInvite[] = [];

  try {
    const q = query(
      invitesCol,
      where('organizerId', '==', organizerId),
      where('tournamentId', '==', tournamentId)
    );
    const snap = await getDocs(q);
    list = snap.docs.map((d) => ({
      ...(d.data() as LeagueInvite),
      code: d.id,
    }));
  } catch (err: any) {
    if (err?.code === 'failed-precondition') {
      const fallbackQ = query(
        invitesCol,
        where('organizerId', '==', organizerId)
      );
      const snap = await getDocs(fallbackQ);
      list = snap.docs
        .map((d) => ({
          ...(d.data() as LeagueInvite),
          code: d.id,
        }))
        .filter((inv) => inv.tournamentId === tournamentId);
    } else {
      throw err;
    }
  }

  list.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));

  const activeInvite = list.find((inv) => inv.active === true) || null;
  const latestInvite = list[0] || null;

  return { invites: list, activeInvite, latestInvite };
}

/**
 * Membuat ulang kode undangan baru: kode lama dinonaktifkan dan kode baru aktif dalam satu batch.
 */
export async function regenerateLeagueInviteCode(
  tournament: Pick<
    Tournament,
    'id' | 'name' | 'season' | 'organizerId' | 'organizerName'
  >,
  actor: { uid: string; name: string }
): Promise<LeagueInvite> {
  const { invites } = await getLeagueInvitesForTournament(
    tournament.id,
    tournament.organizerId
  );

  let newCode = await generateUniqueLeagueInviteCode();
  const existingCodes = new Set(invites.map((i) => i.code));
  let guard = 0;
  while (existingCodes.has(newCode) && guard < 8) {
    newCode = await generateUniqueLeagueInviteCode();
    guard++;
  }

  const now = Date.now();
  const seasonLabel = formatSeasonLabel(tournament.season) || '';
  const newInvite: LeagueInvite = {
    code: newCode,
    tournamentId: tournament.id,
    tournamentName: tournament.name,
    seasonLabel,
    organizerId: tournament.organizerId,
    organizerName: tournament.organizerName,
    active: true,
    inviteVersion: LEAGUE_INVITE_CLAIMS_VERSION,
    createdAt: now,
  };

  const batch = writeBatch(db);
  const deactivatedCodes: string[] = [];

  for (const oldInv of invites) {
    if (oldInv.active) {
      deactivatedCodes.push(oldInv.code);
      batch.update(doc(db, 'leagueInvites', oldInv.code), {
        active: false,
        updatedAt: now,
      });
    }
  }

  batch.set(doc(db, 'leagueInvites', newCode), newInvite);
  await batch.commit();

  try {
    await recordAuditLog(
      actor.uid,
      actor.name,
      'LEAGUE_INVITE_REGENERATED',
      `tournaments/${tournament.id}`,
      deactivatedCodes.length > 0 ? deactivatedCodes.join(', ') : null,
      newCode,
      tournament.id
    );
  } catch (auditErr) {
    console.warn('Gagal mencatat audit log buat ulang kode liga:', auditErr);
  }

  return newInvite;
}

/**
 * Mengaktifkan atau menonaktifkan kode undangan liga yang ada.
 */
export async function toggleLeagueInviteActive(
  code: string,
  nextActive: boolean,
  tournamentId: string,
  actor: { uid: string; name: string }
): Promise<void> {
  const cleanCode = normalizeLeagueInviteInput(code);
  if (!isValidLeagueInviteCodeFormat(cleanCode)) {
    throw new Error('Kode undangan tidak valid.');
  }

  await updateDoc(doc(db, 'leagueInvites', cleanCode), {
    active: nextActive,
    updatedAt: Date.now(),
  });

  try {
    await recordAuditLog(
      actor.uid,
      actor.name,
      'LEAGUE_INVITE_TOGGLED',
      `leagueInvites/${cleanCode}`,
      nextActive ? 'Nonaktif' : 'Aktif',
      nextActive ? 'Aktif' : 'Nonaktif',
      tournamentId
    );
  } catch (auditErr) {
    console.warn('Gagal mencatat audit log status kode liga:', auditErr);
  }
}

/**
 * Menyinkronkan nama liga & label season pada dokumen leagueInvites saat metadata turnamen diedit.
 */
export async function syncLeagueInvitesMetadata(
  tournamentId: string,
  organizerId: string,
  updates: { tournamentName?: string; seasonLabel?: string }
): Promise<void> {
  const { invites } = await getLeagueInvitesForTournament(
    tournamentId,
    organizerId
  );
  if (invites.length === 0) return;

  const patch: Record<string, any> = { updatedAt: Date.now() };
  if (updates.tournamentName !== undefined) {
    patch.tournamentName = updates.tournamentName;
  }
  if (updates.seasonLabel !== undefined) {
    patch.seasonLabel = updates.seasonLabel;
  }

  const batch = writeBatch(db);
  invites.forEach((inv) => {
    batch.update(doc(db, 'leagueInvites', inv.code), patch);
  });
  await batch.commit();
}

export interface LeagueInviteLookupResult {
  valid: boolean;
  code: string;
  error?: string;
  invite?: LeagueInvite;
  tournament?: Tournament;
  existingPlayer?: TournamentPlayer | null;
}

/**
 * Mencari dan memvalidasi kode undangan liga untuk pendaftaran pemain.
 */
export async function lookupLeagueInviteForPlayer(
  rawInput: string,
  playerUid: string
): Promise<LeagueInviteLookupResult> {
  const normalizedCode = normalizeLeagueInviteInput(rawInput);

  if (!isValidLeagueInviteCodeFormat(normalizedCode)) {
    const basicCheck = validateLeagueInviteForRegistration({
      rawCode: rawInput,
      invite: null,
      tournament: null,
    });
    return {
      valid: false,
      code: basicCheck.code,
      error: basicCheck.error,
    };
  }

  const inviteSnap = await getDoc(doc(db, 'leagueInvites', normalizedCode));
  const invite = inviteSnap.exists()
    ? ({ ...(inviteSnap.data() as LeagueInvite), code: inviteSnap.id })
    : null;

  let tournament: Tournament | null = null;
  let existingPlayer: TournamentPlayer | null = null;

  if (invite?.tournamentId) {
    const tourneySnap = await getDoc(doc(db, 'tournaments', invite.tournamentId));
    if (tourneySnap.exists()) {
      tournament = {
        ...(tourneySnap.data() as Tournament),
        id: tourneySnap.id,
      };
    }

    if (playerUid) {
      try {
        const playerSnap = await getDoc(
          doc(db, 'tournaments', invite.tournamentId, 'players', playerUid)
        );
        if (playerSnap.exists()) {
          existingPlayer = {
            ...(playerSnap.data() as TournamentPlayer),
            id: playerSnap.id,
          };
        }
      } catch {
        // Abaikan bila belum bisa membaca
      }
    }
  }

  const validation = validateLeagueInviteForRegistration({
    rawCode: normalizedCode,
    invite,
    tournament,
    existingPlayer,
  });

  return {
    valid: validation.valid,
    code: validation.code,
    error: validation.error,
    invite: invite || undefined,
    tournament: tournament || undefined,
    existingPlayer,
  };
}

/**
 * Mendaftarkan pemain ke Turnamen Liga dengan kode undangan yang valid melalui 2 langkah:
 * 1. Buat dokumen klaim privat tournaments/{tid}/inviteClaims/{uid} berisi { inviteCode, createdAt }.
 * 2. Buat dokumen peserta tournaments/{tid}/players/{uid} TANPA field inviteCode.
 * Jika langkah 2 gagal, hapus kembali dokumen klaim yang baru dibuat.
 */
export async function registerPlayerWithLeagueInvite(
  tournamentId: string,
  inviteCode: string,
  player: { uid: string; name: string }
): Promise<TournamentPlayer> {
  const cleanCode = normalizeLeagueInviteInput(inviteCode);
  if (!isValidLeagueInviteCodeFormat(cleanCode)) {
    throw new Error('Kode undangan liga tidak valid.');
  }

  const playerRef = doc(db, 'tournaments', tournamentId, 'players', player.uid);
  const playerSnap = await getDoc(playerRef);
  if (playerSnap.exists()) {
    const existing = playerSnap.data() as TournamentPlayer;
    if (existing.status === 'rejected') {
      throw new Error('Pendaftaran Anda sebelumnya ditolak untuk turnamen ini.');
    }
    throw new Error('Anda sudah terdaftar di turnamen liga ini.');
  }

  const claimRef = doc(db, 'tournaments', tournamentId, 'inviteClaims', player.uid);
  const now = Date.now();
  const claimData = buildLeagueInviteClaimPayload(cleanCode, now);
  const playerData = buildLeaguePlayerPayload(player, now);

  await executeTwoStepLeagueRegistration({
    createClaim: () => setDoc(claimRef, claimData),
    createPlayer: () => setDoc(playerRef, playerData),
    rollbackClaim: () => deleteDoc(claimRef),
  });

  return playerData;
}
