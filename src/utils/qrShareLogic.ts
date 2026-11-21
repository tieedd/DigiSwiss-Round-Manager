import {
  isValidLeagueInviteCodeFormat,
  normalizeLeagueInviteInput,
} from './leagueInviteLogic.ts';

export const QR_SHARE_CANVAS_WIDTH = 900;
export const QR_SHARE_CANVAS_HEIGHT = 1140;
export const QR_SHARE_MIN_QUIET_ZONE_MODULES = 4;
export const QR_SHARE_BOX_SIZE = 540;
export const QR_SHARE_BOX_PADDING = 28;
export const QR_FOREGROUND_HEX = '#000000';
export const QR_BACKGROUND_HEX = '#FFFFFF';
export const NON_DIGISWISS_QR_MESSAGE = 'QR ini bukan undangan DigiSwiss';

export interface LeagueInviteQrCardLayout {
  canvasWidth: number;
  canvasHeight: number;
  quietZoneModules: number;
  totalModules: number;
  modulePx: number;
  qrRenderSize: number;
  boxSize: number;
  qrForeground: string;
  qrBackground: string;
}

/**
 * Menghitung ukuran kanvas dan quiet zone kartu QR undangan liga.
 * QR code wajib memiliki quiet zone >= 4 modul dengan modul hitam di atas latar putih.
 */
export function getLeagueInviteQrCardLayout(
  moduleCount: number
): LeagueInviteQrCardLayout {
  const safeModuleCount =
    Number.isFinite(moduleCount) && moduleCount > 0
      ? Math.floor(moduleCount)
      : 21;
  const quietZoneModules = Math.max(4, QR_SHARE_MIN_QUIET_ZONE_MODULES);
  const totalModules = safeModuleCount + quietZoneModules * 2;
  const modulePx = Math.max(1, Math.floor(QR_SHARE_BOX_SIZE / totalModules));
  const qrRenderSize = modulePx * totalModules;
  const boxSize = qrRenderSize + QR_SHARE_BOX_PADDING * 2;

  return {
    canvasWidth: QR_SHARE_CANVAS_WIDTH,
    canvasHeight: QR_SHARE_CANVAS_HEIGHT,
    quietZoneModules,
    totalModules,
    modulePx,
    qrRenderSize,
    boxSize,
    qrForeground: QR_FOREGROUND_HEX,
    qrBackground: QR_BACKGROUND_HEX,
  };
}

/**
 * Membentuk nama file PNG kartu QR undangan liga.
 */
export function buildLeagueInviteQrFileName(
  tournamentName: string,
  seasonLabel?: string | null
): string {
  const cleanTournament = (tournamentName || 'Turnamen-Liga')
    .trim()
    .replace(/\s+/g, '_')
    .replace(/[^a-zA-Z0-9_-]/g, '');
  const tourneySlug = cleanTournament || 'Turnamen_Liga';

  if (seasonLabel && seasonLabel.trim()) {
    const cleanSeason = seasonLabel
      .trim()
      .replace(/\s+/g, '_')
      .replace(/[^a-zA-Z0-9_-]/g, '');
    if (cleanSeason) {
      return `QR-Undangan-${tourneySlug}-${cleanSeason}.png`;
    }
  }

  return `QR-Undangan-${tourneySlug}.png`;
}

/**
 * Membentuk teks caption saat membagikan kartu QR undangan liga.
 */
export function buildLeagueInviteShareCaption(params: {
  tournamentName: string;
  seasonLabel?: string | null;
  organizerName?: string | null;
  inviteCode: string;
}): string {
  const normalizedCode = normalizeLeagueInviteInput(params.inviteCode);
  const lines: string[] = [];
  lines.push(`Undangan Turnamen Liga: ${params.tournamentName || 'Turnamen Liga'}`);
  if (params.seasonLabel && params.seasonLabel.trim()) {
    lines.push(params.seasonLabel.trim());
  }
  if (params.organizerName && params.organizerName.trim()) {
    lines.push(`Organizer: ${params.organizerName.trim()}`);
  }
  if (normalizedCode) {
    lines.push(`Kode Undangan: ${normalizedCode}`);
  }
  lines.push('Scan QR atau masukkan kode di aplikasi DigiSwiss-Round.');
  return lines.join('\n');
}

export interface ScannedInviteValidationResult {
  valid: boolean;
  code: string;
  error?: string;
}

/**
 * Memvalidasi hasil scan/decode QR undangan DigiSwiss setelah dilewatkan ke normalizeLeagueInviteInput.
 */
export function validateScannedLeagueInviteText(
  rawText?: string | null
): ScannedInviteValidationResult {
  const trimmed = (rawText || '').trim();
  if (!trimmed) {
    return {
      valid: false,
      code: '',
      error: NON_DIGISWISS_QR_MESSAGE,
    };
  }

  const hasDigiSwissPrefix = /digiswiss:liga:/i.test(trimmed);
  if (
    !hasDigiSwissPrefix &&
    /^(https?:\/\/|wifi:|begin:vcard|begin:vevent|mailto:|tel:|smsto:)/i.test(
      trimmed
    )
  ) {
    return {
      valid: false,
      code: '',
      error: NON_DIGISWISS_QR_MESSAGE,
    };
  }

  const normalized = normalizeLeagueInviteInput(trimmed);
  if (!isValidLeagueInviteCodeFormat(normalized)) {
    return {
      valid: false,
      code: '',
      error: NON_DIGISWISS_QR_MESSAGE,
    };
  }

  return {
    valid: true,
    code: normalized,
  };
}

/**
 * Memetakan kode galat native QR ke pesan Bahasa Indonesia yang jelas bagi pemain.
 */
export function mapQrBridgeErrorToIndonesianMessage(
  errorCode?: string | null,
  source: 'camera' | 'gallery' = 'camera'
): string {
  switch ((errorCode || '').trim().toLowerCase()) {
    case 'cancelled':
      return source === 'gallery'
        ? 'Pemilihan gambar dari galeri dibatalkan.'
        : 'Pemindaian QR dibatalkan.';
    case 'unavailable':
      return 'Pemindai QR kamera tidak tersedia karena Layanan Google Play belum tersedia di perangkat ini. Gunakan "Pilih dari Galeri" atau masukkan kode secara manual.';
    case 'no_qr':
      return 'Tidak ditemukan QR code pada gambar yang dipilih. Pastikan gambar QR jelas dan tidak terpotong.';
    case 'timeout':
      return 'Waktu pemindaian QR habis. Silakan coba lagi.';
    case 'unsupported':
      return 'Fitur ini hanya tersedia di aplikasi Android versi terbaru.';
    default:
      return 'Gagal membaca QR code. Silakan coba lagi atau masukkan kode secara manual.';
  }
}
