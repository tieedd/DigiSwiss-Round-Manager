import { db } from '../firebaseConfig';
import {
  collection,
  doc,
  getDoc,
  getDocs,
  writeBatch,
  serverTimestamp,
} from 'firebase/firestore';
import type { TournamentPlayer, TournamentMatch } from '../types';
import {
  planPlayerLink,
  chunkOperations,
  validateLinkTarget,
} from '../utils/playerLinkLogic';

/**
 * Menautkan peserta manual ke akun pendaftar:
 * 1. Baca ulang dokumen pemain target dan seluruh pertandingan dari Firestore
 * 2. Validasi target (bukan manual, status waiting/accepted, belum punya pertandingan)
 * 3. Ubah status akun target menjadi accepted bila perlu
 * 4. Ganti semua p1Id dan p2Id yang bernilai id manual menjadi UID akun pada SEMUA pertandingan
 * 5. Hapus dokumen peserta manual (serta pindahkan/hapus dokumen deck liga bila ada)
 * 6. Catat auditLogs PLAYER_LINKED
 * Menggunakan potongan batch maksimal 400 operasi.
 */
export async function executeLinkManualPlayerToAccount(
  tournamentId: string,
  manualPlayer: TournamentPlayer,
  targetAccount: TournamentPlayer,
  actor: { uid: string; name: string }
): Promise<{ success: boolean; totalOps: number }> {
  const targetDocId = targetAccount.id || targetAccount.uid || '';
  if (!targetDocId) {
    throw new Error('Akun tujuan tautan tidak valid.');
  }

  // 1. Baca ulang dokumen target dan seluruh pertandingan terbaru dari Firestore
  const targetPlayerRef = doc(db, 'tournaments', tournamentId, 'players', targetDocId);
  const matchesCol = collection(db, 'tournaments', tournamentId, 'matches');
  const [targetPlayerSnap, matchesSnap] = await Promise.all([
    getDoc(targetPlayerRef),
    getDocs(matchesCol),
  ]);

  if (!targetPlayerSnap.exists()) {
    throw new Error(
      `Akun ${targetAccount.name || targetDocId} tidak ditemukan di daftar peserta turnamen ini.`
    );
  }

  const freshTargetAccount: TournamentPlayer = {
    ...(targetPlayerSnap.data() as any),
    id: targetPlayerSnap.id,
  };

  const allMatches: TournamentMatch[] = matchesSnap.docs.map((d) => ({
    id: d.id,
    ...(d.data() as any),
  }));

  // 2. Validasi sebelum menulis apa pun ke Firestore
  validateLinkTarget(manualPlayer, freshTargetAccount, allMatches);

  // 3. Susun urutan operasi
  const ops = planPlayerLink(
    tournamentId,
    manualPlayer,
    freshTargetAccount,
    allMatches,
    actor
  );

  // 4. Pecah operasi maksimal 400 per batch
  const chunks = chunkOperations(ops, 400);

  // 5. Eksekusi batch secara berurutan
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

  // 6. Sinkronkan/bersihkan dokumen deck liga milik peserta manual jika ada
  try {
    const targetUid = freshTargetAccount.uid || freshTargetAccount.id;
    const manualDeckRef = doc(db, 'tournaments', tournamentId, 'decks', manualPlayer.id);
    const manualDeckSnap = await getDoc(manualDeckRef);
    if (manualDeckSnap.exists()) {
      const targetDeckRef = doc(db, 'tournaments', tournamentId, 'decks', targetUid);
      const targetDeckSnap = await getDoc(targetDeckRef);
      const deckBatch = writeBatch(db);
      if (!targetDeckSnap.exists()) {
        deckBatch.set(targetDeckRef, {
          ...manualDeckSnap.data(),
          updatedAt: Date.now(),
        });
      }
      deckBatch.delete(manualDeckRef);
      await deckBatch.commit();
    }
  } catch (deckErr) {
    console.warn('Gagal menyinkronkan deck liga saat menautkan pemain:', deckErr);
  }

  return { success: true, totalOps: ops.length };
}
