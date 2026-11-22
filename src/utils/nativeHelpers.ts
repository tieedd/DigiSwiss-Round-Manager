/**
 * Validasi ketat URL APK pembaruan:
 * - Protokol wajib https
 * - Host: github.com (wajib diawali /tieedd/DigiSwiss-Round-Manager/, mengandung /releases/download/ dan berakhiran .apk)
 *   ATAU objects.githubusercontent.com (host redirect unduhan resmi GitHub Release Asset)
 */
export function isAllowedApkUrl(url: string | null | undefined): boolean {
  if (!url || typeof url !== 'string') return false;
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'https:') return false;

    const host = parsed.hostname.toLowerCase();
    const pathname = parsed.pathname;

    if (host === 'github.com') {
      const lower = pathname.toLowerCase();
      return (
        lower.startsWith('/tieedd/digiswiss-round-manager/') &&
        lower.includes('/releases/download/') &&
        lower.endsWith('.apk')
      );
    }

    if (host === 'objects.githubusercontent.com') {
      return true;
    }

    return false;
  } catch {
    return false;
  }
}

/**
 * Membentuk URL unduhan APK resmi dari tag versi
 */
export function constructReleaseDownloadUrl(tag: string): string {
  const clean = String(tag || '').trim().replace(/^[vV]/, '').trim();
  const tagWithV = `v${clean}`;
  return `https://github.com/tieedd/DigiSwiss-Round-Manager/releases/download/${tagWithV}/DigiSwiss-Round-${tagWithV}.apk`;
}

/**
 * Evaluasi murni apakah modal popup pembaruan harus ditampilkan
 * Hanya tampil jika ada update, belum ditutup pada sesi saat ini, dan berada di layar utama yang diizinkan
 */
export function shouldShowUpdatePopup(params: {
  hasUpdate: boolean;
  isPopupDismissed: boolean;
  isAllowedScreen: boolean;
}): boolean {
  return Boolean(params.hasUpdate && !params.isPopupDismissed && params.isAllowedScreen);
}

/**
 * Sanitasi nama file untuk penyimpanan aman (mencegah path traversal dan karakter ilegal):
 * - Hapus ../, ..\, ganti / dan \ dengan _
 * - Hanya mengizinkan huruf, angka, tanda hubung (-), garis bawah (_), dan titik (.)
 */
export function sanitizeFileName(name: string | null | undefined): string {
  if (!name || typeof name !== 'string') return 'file';
  const clean = name
    .replace(/\.\.\//g, '')
    .replace(/\.\.\\/g, '')
    .replace(/[\/\\]/g, '_')
    .trim();
  const sanitized = clean
    .replace(/[^a-zA-Z0-9._-]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '');
  return sanitized.length > 0 ? sanitized : 'file';
}

export interface RendererGoneStats {
  count: number;
  lastReason: string;
  lastAt: number;
}

export function parseRendererGoneStatsJson(raw: string | null | undefined): RendererGoneStats {
  if (!raw || typeof raw !== 'string') {
    return { count: 0, lastReason: '', lastAt: 0 };
  }
  try {
    const parsed = JSON.parse(raw);
    const rawCount = Number(parsed?.count);
    const rawAt = Number(parsed?.lastAt);
    return {
      count: Number.isFinite(rawCount) && rawCount > 0 ? Math.floor(rawCount) : 0,
      lastReason: typeof parsed?.lastReason === 'string' ? parsed.lastReason : '',
      lastAt: Number.isFinite(rawAt) && rawAt > 0 ? Math.floor(rawAt) : 0,
    };
  } catch {
    return { count: 0, lastReason: '', lastAt: 0 };
  }
}

export function formatRendererDiagnosticsLine(
  stats: RendererGoneStats | null | undefined,
  formatDateTimeFn: (ts: number) => string
): string {
  const count =
    stats && Number.isFinite(stats.count) && stats.count > 0
      ? Math.floor(stats.count)
      : 0;
  const lastAt =
    stats && Number.isFinite(stats.lastAt) && stats.lastAt > 0
      ? Math.floor(stats.lastAt)
      : 0;
  const waktu = count > 0 && lastAt > 0 ? formatDateTimeFn(lastAt) : 'belum pernah';
  return `Diagnostik tampilan: renderer dimatikan sistem ${count} kali, terakhir ${waktu}`;
}

