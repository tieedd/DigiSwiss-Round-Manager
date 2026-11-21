import {
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  orderBy,
  query,
  setDoc,
  updateDoc,
} from 'firebase/firestore';
import { db } from '../firebaseConfig';
import { TournamentAnnouncement } from '../types';
import {
  sortAnnouncementsNewestFirst,
  validateAnnouncementMessage,
} from '../utils/announcementLogic';
import { recordAuditLog } from './authService';
import { notifyPush } from './pushService';

/**
 * Berlangganan daftar pengumuman turnamen secara real-time (terbaru di atas).
 */
export function subscribeTournamentAnnouncements(
  tournamentId: string,
  onData: (items: TournamentAnnouncement[]) => void,
  onError?: (err: Error) => void
): () => void {
  const colRef = collection(db, 'tournaments', tournamentId, 'announcements');
  const q = query(colRef, orderBy('createdAt', 'desc'));

  return onSnapshot(
    q,
    (snapshot) => {
      const items: TournamentAnnouncement[] = [];
      snapshot.forEach((docSnap) => {
        const data = docSnap.data() as TournamentAnnouncement;
        items.push({
          ...data,
          id: docSnap.id,
        });
      });
      onData(sortAnnouncementsNewestFirst(items));
    },
    (err) => {
      console.error('Snapshot pengumuman gagal:', err);
      onError?.(err);
    }
  );
}

/**
 * Membuat pengumuman baru pada tournaments/{tid}/announcements/{aid}
 * serta mencatat audit log ANNOUNCEMENT_CREATED dengan tournamentId.
 */
export async function createTournamentAnnouncement(
  tournamentId: string,
  rawMessage: string,
  actor: { uid: string; name: string }
): Promise<TournamentAnnouncement> {
  const validation = validateAnnouncementMessage(rawMessage);
  if (!validation.valid) {
    throw new Error(validation.error || 'Pengumuman tidak valid.');
  }

  const colRef = collection(db, 'tournaments', tournamentId, 'announcements');
  const newRef = doc(colRef);
  const now = Date.now();

  const payload: TournamentAnnouncement = {
    id: newRef.id,
    message: validation.trimmed,
    authorId: actor.uid,
    authorName: (actor.name || 'Organizer').trim() || 'Organizer',
    createdAt: now,
    updatedAt: now,
  };

  await setDoc(newRef, payload);

  await recordAuditLog(
    actor.uid,
    actor.name,
    'ANNOUNCEMENT_CREATED',
    `tournaments/${tournamentId}/announcements/${newRef.id}`,
    null,
    validation.trimmed,
    tournamentId
  );

  notifyPush({
    type: 'announcement',
    tournamentId,
    announcementId: newRef.id,
  });

  return payload;
}

/**
 * Memperbarui isi pengumuman milik turnamen.
 */
export async function updateTournamentAnnouncement(
  tournamentId: string,
  announcementId: string,
  rawMessage: string
): Promise<void> {
  const validation = validateAnnouncementMessage(rawMessage);
  if (!validation.valid) {
    throw new Error(validation.error || 'Pengumuman tidak valid.');
  }

  const docRef = doc(db, 'tournaments', tournamentId, 'announcements', announcementId);
  await updateDoc(docRef, {
    message: validation.trimmed,
    updatedAt: Date.now(),
  });
}

/**
 * Menghapus pengumuman turnamen serta mencatat audit log ANNOUNCEMENT_DELETED dengan tournamentId.
 */
export async function deleteTournamentAnnouncement(
  tournamentId: string,
  announcement: Pick<TournamentAnnouncement, 'id' | 'message'>,
  actor: { uid: string; name: string }
): Promise<void> {
  const docRef = doc(db, 'tournaments', tournamentId, 'announcements', announcement.id);
  await deleteDoc(docRef);

  await recordAuditLog(
    actor.uid,
    actor.name,
    'ANNOUNCEMENT_DELETED',
    `tournaments/${tournamentId}/announcements/${announcement.id}`,
    announcement.message,
    null,
    tournamentId
  );
}
