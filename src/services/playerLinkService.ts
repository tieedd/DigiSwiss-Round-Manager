import { db } from '../firebaseConfig';
import {
  collection,
  doc,
  getDocs,
  writeBatch,
  serverTimestamp,
} from 'firebase/firestore';
import type { TournamentPlayer, TournamentMatch } from '../types';
import { planPlayerLink, chunkOperations } from '../utils/playerLinkLogic';

/**
 * Menautkan peserta manual ke akun pendaftar:
 * 1. Ubah status akun target menjadi accepted bila perlu
 * 2. Ganti semua p1Id dan p2Id yang bernilai id manual menjadi UID akun pada SEMUA pertandingan
 * 3. Hapus dokumen peserta manual
 * 4. Catat auditLogs PLAYER_LINKED
 * Menggunakan potongan batch maksimal 400 operasi.
 */
export async function executeLinkManualPlayerToAccount(
  tournamentId: string,
  manualPlayer: TournamentPlayer,
  targetAccount: TournamentPlayer,
  actor: { uid: string; name: string }
): Promise<{ success: boolean; totalOps: number }> {
  // 1. Ambil seluruh pertandingan turnamen (aktif & arsip)
  const matchesCol = collection(db, 'tournaments', tournamentId, 'matches');
  const matchesSnap = await getDocs(matchesCol);
  const allMatches: TournamentMatch[] = matchesSnap.docs.map((d) => ({
    id: d.id,
    ...(d.data() as any),
  }));

  // 2. Susun urutan operasi
  const ops = planPlayerLink(
    tournamentId,
    manualPlayer,
    targetAccount,
    allMatches,
    actor
  );

  // 3. Pecah operasi maksimal 400 per batch
  const chunks = chunkOperations(ops, 400);

  // 4. Eksekusi batch secara berurutan
  for (const chunk of chunks) {
    const batch = writeBatch(db);
    for (const op of chunk) {
      if (op.type === 'update_player') {
        const pRef = doc(db, op.path);
        batch.update(pRef, op.data);
      } else if (op.type === 'update_match') {
        const mRef = doc(db, op.path);
        batch.update(mRef, op.data);
      } else if (op.type === 'delete_player') {
        const pRef = doc(db, op.path);
        batch.delete(pRef);
      } else if (op.type === 'audit_log') {
        const logRef = doc(collection(db, 'auditLogs'));
        batch.set(logRef, {
          ...op.data,
          timestamp: serverTimestamp(),
        });
      }
    }
    await batch.commit();
  }

  return { success: true, totalOps: ops.length };
}
