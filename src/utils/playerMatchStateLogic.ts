import type { PlayerStatus, TournamentMatch } from '../types';

export type PlayerMatchStateKey =
  | 'not_joined'
  | 'waiting'
  | 'rejected'
  | 'dropped'
  | 'no_rounds'
  | 'not_in_pairing'
  | 'not_in_pairing_name_matched'
  | 'has_matches';

export interface PlayerMatchStateResult {
  state: PlayerMatchStateKey;
  message: string;
  hasMatches: boolean;
  toString(): string;
}

function createMatchState(
  state: PlayerMatchStateKey,
  message: string,
  hasMatches: boolean
): PlayerMatchStateResult {
  return {
    state,
    message,
    hasMatches,
    toString() {
      return this.message;
    },
  };
}

/**
 * Fungsi murni untuk menentukan status pertandingan pemain pada turnamen yang dipilih.
 *
 * @param playerStatus - Status pemain di dokumen tournaments/{tid}/players/{uid} ('waiting', 'accepted', 'rejected', 'dropped', atau null bila tidak ikut)
 * @param rounds - Jumlah ronde turnamen (number) atau array ronde turnamen
 * @param matches - Seluruh pertandingan turnamen dari onSnapshot (termasuk ronde aktif dan lama)
 * @param uid - UID akun pengguna saat ini
 * @param displayName - Nama tampilan akun pengguna saat ini
 */
export function resolvePlayerMatchState(
  playerStatus: PlayerStatus | string | null | undefined,
  rounds: number | any[] | null | undefined,
  matches: TournamentMatch[] | any[] | null | undefined,
  uid?: string | null,
  displayName?: string | null
): PlayerMatchStateResult {
  // 1. Jika tidak ikut turnamen mana pun
  if (!playerStatus) {
    return createMatchState(
      'not_joined',
      'Belum ada turnamen aktif yang Anda ikuti. Daftarkan diri Anda di menu Turnamen.',
      false
    );
  }

  // 2. Status waiting
  if (playerStatus === 'waiting') {
    return createMatchState(
      'waiting',
      'Anda masih di Waiting List. Menunggu organizer menerima Anda.',
      false
    );
  }

  // 3. Status rejected
  if (playerStatus === 'rejected') {
    return createMatchState(
      'rejected',
      'Pendaftaran Anda ditolak organizer untuk turnamen ini.',
      false
    );
  }

  // 4. Status dropped
  if (playerStatus === 'dropped') {
    return createMatchState(
      'dropped',
      'Anda ditandai drop pada turnamen ini.',
      false
    );
  }

  // 5. Status accepted
  const matchList = Array.isArray(matches) ? matches : [];
  const activeMatches = matchList.filter((m) => !m?.archived);

  // Jika belum ada pertandingan atau belum ada ronde
  const roundCount =
    typeof rounds === 'number'
      ? rounds
      : Array.isArray(rounds)
      ? rounds.length
      : 0;

  if (activeMatches.length === 0 && roundCount === 0) {
    return createMatchState(
      'no_rounds',
      'Menunggu organizer membuat pairing ronde.',
      false
    );
  }

  if (activeMatches.length === 0) {
    return createMatchState(
      'no_rounds',
      'Menunggu organizer membuat pairing ronde.',
      false
    );
  }

  // Periksa apakah akun ada di pairing pertandingan
  const userUid = uid || '';
  const userMatches = activeMatches.filter(
    (m) => m?.p1Id === userUid || m?.p2Id === userUid
  );

  if (userMatches.length > 0) {
    return createMatchState('has_matches', '', true);
  }

  // Pairing sudah ada, tetapi tidak ada pertandingan untuk UID saya
  const normDisplayName = (displayName || '').trim().toLowerCase();
  const hasNameMatch =
    normDisplayName !== '' &&
    activeMatches.some((m) => {
      const p1NameNorm = (m?.p1Name || '').trim().toLowerCase();
      const p2NameNorm = (m?.p2Name || '').trim().toLowerCase();
      const p1Matched = p1NameNorm === normDisplayName && m?.p1Id !== userUid;
      const p2Matched = p2NameNorm === normDisplayName && m?.p2Id !== userUid;
      return p1Matched || p2Matched;
    });

  if (hasNameMatch) {
    return createMatchState(
      'not_in_pairing_name_matched',
      'Pairing sudah dibuat tetapi akun Anda tidak ada di dalamnya. Hubungi organizer. Nama Anda ada di pairing tetapi belum terhubung ke akun Anda. Minta organizer menautkan akun Anda.',
      false
    );
  }

  return createMatchState(
    'not_in_pairing',
    'Pairing sudah dibuat tetapi akun Anda tidak ada di dalamnya. Hubungi organizer.',
    false
  );
}
