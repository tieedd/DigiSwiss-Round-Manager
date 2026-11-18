import type {
  LeagueInvite,
  LeagueInviteClaim,
  Tournament,
  TournamentPlayer,
} from '../types/index.ts';
import { isLeagueTournament } from './seasonLogic.ts';

/**
 * Alfabet kode undangan liga: huruf kapital dan angka TANPA karakter ambigu (0, O, 1, I, L).
 */
export const LEAGUE_INVITE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
export const LEAGUE_INVITE_CODE_LENGTH = 8;
export const LEAGUE_INVITE_QR_PREFIX = 'digiswiss:liga:';
export const LEAGUE_INVITE_CLAIMS_VERSION = 2;

const VALID_INVITE_CODE_REGEX = /^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{8}$/;

/**
 * Menghasilkan kode undangan acak 8 karakter huruf besar & angka tanpa 0, O, 1, I, L.
 */
export function generateLeagueInviteCode(
  randomFn: () => number = Math.random
): string {
  let code = '';
  const alphabetLen = LEAGUE_INVITE_ALPHABET.length;
  for (let i = 0; i < LEAGUE_INVITE_CODE_LENGTH; i++) {
    const idx = Math.floor(randomFn() * alphabetLen) % alphabetLen;
    code += LEAGUE_INVITE_ALPHABET[idx];
  }
  return code;
}

/**
 * Memeriksa apakah string sesuai format kode undangan liga 8 karakter valid.
 */
export function isValidLeagueInviteCodeFormat(
  code?: string | null
): boolean {
  if (!code) return false;
  return VALID_INVITE_CODE_REGEX.test(code.trim().toUpperCase());
}

/**
 * Menormalisasi input undangan dari pemain:
 * - Mendukung input langsung kode ("AB23CD45")
 * - Mendukung tempel teks QR ("digiswiss:liga:AB23CD45", case-insensitive)
 * - Menghapus spasi atau tanda hubung pemisah di sekitar kode
 */
export function normalizeLeagueInviteInput(
  rawInput?: string | null
): string {
  if (!rawInput) return '';
  const trimmed = rawInput.trim();
  if (!trimmed) return '';

  // Cek apakah mengandung prefix digiswiss:liga:
  const prefixMatch = trimmed.match(/digiswiss:liga:\s*([A-Za-z0-9\-\s]+)/i);
  const candidate = prefixMatch ? prefixMatch[1] : trimmed;

  // Bersihkan spasi dan tanda hubung lalu ubah ke huruf besar
  return candidate.replace(/[\s-]+/g, '').toUpperCase();
}

/**
 * Membentuk string payload QR resmi: "digiswiss:liga:{KODE}"
 */
export function formatLeagueInviteQrPayload(code: string): string {
  const normalized = normalizeLeagueInviteInput(code);
  return `${LEAGUE_INVITE_QR_PREFIX}${normalized}`;
}

export interface LeagueInviteLookupValidationResult {
  valid: boolean;
  code: string;
  error?: string;
}

/**
 * Validasi murni kelayakan kode undangan liga untuk pendaftaran pemain.
 */
export function validateLeagueInviteForRegistration(params: {
  rawCode: string;
  invite: Partial<LeagueInvite> | null | undefined;
  tournament: Partial<Tournament> | null | undefined;
  existingPlayer?: Partial<TournamentPlayer> | null;
}): LeagueInviteLookupValidationResult {
  const code = normalizeLeagueInviteInput(params.rawCode);

  if (!code) {
    return {
      valid: false,
      code: '',
      error: 'Masukkan kode undangan liga terlebih dahulu.',
    };
  }

  if (!isValidLeagueInviteCodeFormat(code)) {
    return {
      valid: false,
      code,
      error:
        'Format kode undangan tidak valid. Kode terdiri dari 8 huruf besar/angka (tanpa 0, O, 1, I, L).',
    };
  }

  if (!params.invite) {
    return {
      valid: false,
      code,
      error: 'Kode undangan tidak ditemukan atau salah.',
    };
  }

  if (params.invite.active !== true) {
    return {
      valid: false,
      code,
      error: 'Kode undangan ini sudah dinonaktifkan oleh organizer.',
    };
  }

  if (!params.tournament || !isLeagueTournament(params.tournament as Pick<Tournament, 'type'>)) {
    return {
      valid: false,
      code,
      error: 'Turnamen liga untuk kode undangan ini tidak ditemukan.',
    };
  }

  if (params.invite.tournamentId && params.tournament.id && params.invite.tournamentId !== params.tournament.id) {
    return {
      valid: false,
      code,
      error: 'Kode undangan tidak cocok dengan turnamen liga ini.',
    };
  }

  if (params.tournament.status !== 'registration') {
    return {
      valid: false,
      code,
      error:
        params.tournament.status === 'running'
          ? 'Pendaftaran ditutup karena turnamen liga sudah dimulai.'
          : 'Pendaftaran ditutup karena turnamen liga sudah selesai.',
    };
  }

  if (params.existingPlayer) {
    if (params.existingPlayer.status === 'rejected') {
      return {
        valid: false,
        code,
        error: 'Pendaftaran Anda sebelumnya ditolak untuk turnamen ini.',
      };
    }
    if (
      params.existingPlayer.status === 'accepted' ||
      params.existingPlayer.status === 'waiting'
    ) {
      return {
        valid: false,
        code,
        error: 'Anda sudah terdaftar di turnamen liga ini.',
      };
    }
  }

  return {
    valid: true,
    code,
  };
}

/**
 * Membentuk payload dokumen klaim undangan privat: tournaments/{tid}/inviteClaims/{uid}.
 */
export function buildLeagueInviteClaimPayload(
  inviteCode: string,
  createdAt: number = Date.now()
): LeagueInviteClaim {
  return {
    inviteCode: normalizeLeagueInviteInput(inviteCode),
    createdAt,
  };
}

/**
 * Membentuk payload dokumen peserta liga TANPA field inviteCode agar tidak terbaca pengguna lain.
 */
export function buildLeaguePlayerPayload(
  player: { uid: string; name: string },
  joinedAt: number = Date.now()
): TournamentPlayer {
  return {
    id: player.uid,
    name: player.name,
    uid: player.uid,
    manual: false,
    status: 'accepted',
    joinedAt,
  };
}

/**
 * Menjalankan pendaftaran liga dua langkah secara aman:
 * 1) Buat klaim undangan (inviteClaims/{uid})
 * 2) Buat dokumen pemain tanpa inviteCode (players/{uid})
 * Jika langkah 2 gagal, hapus kembali klaim yang baru dibuat (rollback).
 */
export async function executeTwoStepLeagueRegistration(steps: {
  createClaim: () => Promise<void>;
  createPlayer: () => Promise<void>;
  rollbackClaim: () => Promise<void>;
}): Promise<{ claimCreated: boolean; playerCreated: boolean }> {
  await steps.createClaim();

  try {
    await steps.createPlayer();
    return { claimCreated: true, playerCreated: true };
  } catch (playerErr) {
    try {
      await steps.rollbackClaim();
    } catch (rollbackErr) {
      console.warn('Gagal menghapus klaim undangan setelah gagal membuat dokumen pemain:', rollbackErr);
    }
    throw playerErr;
  }
}

/**
 * Menentukan apakah peringatan "Buat Ulang Kode" perlu ditampilkan untuk liga lama
 * (yang dibuat sebelum pembaruan inviteClaims / inviteVersion v2).
 */
export function shouldShowLegacyInviteRegenerateWarning(
  currentInvite: Partial<LeagueInvite> | null | undefined
): boolean {
  if (!currentInvite) return false;
  if (currentInvite.active !== true) return false;
  return currentInvite.inviteVersion !== LEAGUE_INVITE_CLAIMS_VERSION;
}
