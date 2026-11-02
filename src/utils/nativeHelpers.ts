/**
 * Validasi ketat URL APK pembaruan:
 * - Protokol wajib https
 * - Host: github.com (path mengandung /releases/download/ dan berakhiran .apk) ATAU objects.githubusercontent.com
 */
export function isAllowedApkUrl(url: string | null | undefined): boolean {
  if (!url || typeof url !== 'string') return false;
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'https:') return false;

    const host = parsed.hostname.toLowerCase();
    const pathname = parsed.pathname;

    if (host === 'github.com') {
      return (
        pathname.includes('/releases/download/') &&
        pathname.toLowerCase().endsWith('.apk')
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
