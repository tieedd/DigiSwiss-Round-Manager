import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
} from 'firebase/firestore';
import { db } from '../firebaseConfig';
import type { LeagueDeckEntry, LeaguePlayerDecks } from '../types';
import { recordAuditLog } from './authService';
import {
  formatLeagueDecksAuditSummary,
  validateLeagueDecksSubmission,
} from '../utils/leagueDeckLogic';

/**
 * Membaca dokumen 2 deck privat milik peserta tertentu di subkoleksi tournaments/{tid}/decks/{pid}.
 */
export async function getPlayerLeagueDecks(
  tournamentId: string,
  playerId: string
): Promise<LeaguePlayerDecks | null> {
  if (!tournamentId || !playerId) return null;
  const deckRef = doc(db, 'tournaments', tournamentId, 'decks', playerId);
  const snap = await getDoc(deckRef);
  if (!snap.exists()) return null;
  return snap.data() as LeaguePlayerDecks;
}

/**
 * Mengambil seluruh dokumen 2 deck peserta untuk organizer pemilik atau admin.
 * Pemain biasa tidak boleh memanggil fungsi ini (diblokir oleh Firestore rules).
 */
export async function getAllTournamentLeagueDecks(
  tournamentId: string
): Promise<Map<string, LeaguePlayerDecks>> {
  const result = new Map<string, LeaguePlayerDecks>();
  if (!tournamentId) return result;

  const decksCol = collection(db, 'tournaments', tournamentId, 'decks');
  const snap = await getDocs(decksCol);
  snap.forEach((d) => {
    result.set(d.id, d.data() as LeaguePlayerDecks);
  });
  return result;
}

/**
 * Menyimpan 2 deck milik pemain sendiri saat turnamen berstatus 'registration'.
 * Field `revealedTo` dijaga tetap kosong saat create atau sama dengan sebelumnya saat update.
 */
export async function savePlayerOwnLeagueDecks(
  tournamentId: string,
  playerId: string,
  deck1: LeagueDeckEntry,
  deck2: LeagueDeckEntry
): Promise<LeaguePlayerDecks> {
  const validation = validateLeagueDecksSubmission(deck1, deck2);
  if (!validation.valid || !validation.sanitized) {
    throw new Error(validation.error || 'Data 2 deck liga tidak valid.');
  }

  const deckRef = doc(db, 'tournaments', tournamentId, 'decks', playerId);
  let preservedRevealedTo: string[] = [];

  try {
    const existingSnap = await getDoc(deckRef);
    if (existingSnap.exists()) {
      const existing = existingSnap.data() as Partial<LeaguePlayerDecks>;
      if (Array.isArray(existing.revealedTo)) {
        preservedRevealedTo = existing.revealedTo;
      }
    }
  } catch {
    preservedRevealedTo = [];
  }

  const payload: LeaguePlayerDecks = {
    decks: validation.sanitized,
    revealedTo: preservedRevealedTo,
    updatedAt: Date.now(),
  };

  await setDoc(deckRef, payload);
  return payload;
}

/**
 * Organizer pemilik atau admin mengisi/mengoreksi 2 deck peserta mana pun (termasuk setelah turnamen dimulai)
 * dan mencatat audit log DECK_EDITED dengan nilai lama dan baru.
 */
export async function saveParticipantLeagueDecksByOrganizer(
  tournamentId: string,
  player: { id: string; name: string },
  deck1: LeagueDeckEntry,
  deck2: LeagueDeckEntry,
  actor: { uid: string; name: string }
): Promise<LeaguePlayerDecks> {
  const validation = validateLeagueDecksSubmission(deck1, deck2);
  if (!validation.valid || !validation.sanitized) {
    throw new Error(validation.error || 'Data 2 deck liga tidak valid.');
  }

  const deckRef = doc(db, 'tournaments', tournamentId, 'decks', player.id);
  const existingSnap = await getDoc(deckRef);
  const existingData = existingSnap.exists()
    ? (existingSnap.data() as Partial<LeaguePlayerDecks>)
    : null;

  const oldSummary = formatLeagueDecksAuditSummary(existingData);
  const preservedRevealedTo = Array.isArray(existingData?.revealedTo)
    ? existingData!.revealedTo
    : [];

  const payload: LeaguePlayerDecks = {
    decks: validation.sanitized,
    revealedTo: preservedRevealedTo,
    updatedAt: Date.now(),
  };

  await setDoc(deckRef, payload);

  const newSummary = formatLeagueDecksAuditSummary(payload);
  await recordAuditLog(
    actor.uid,
    actor.name,
    'DECK_EDITED',
    `Peserta ${player.name} (tournaments/${tournamentId}/decks/${player.id})`,
    oldSummary,
    newSummary,
    tournamentId
  );

  return payload;
}
