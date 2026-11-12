import { sanitizeFileName, isAllowedApkUrl } from '../utils/nativeHelpers.ts';

export { sanitizeFileName, isAllowedApkUrl };

declare global {
  interface Window {
    AndroidBridge?: {
      saveFile(fileName: string, mimeType: string, base64Data: string): string;
      copyText(text: string): string;
      downloadApk(url: string, fileName: string): string;
      installApk(): string;
      openExternal(url: string): string;
      setSystemBarsStyle(isDark: boolean): string;
      getLatestReleaseTag?(): string;
      getNativeVersion?(): string;
      fetchOtaManifest?(): string;
      downloadOtaBundle?(version: string, expectedSha256?: string): string;
      applyOta?(): string;
      markBootOk?(): string;
      resetToDefaultAssets?(): string;
      getCurrentOtaInfo?(): string;
    };
  }
}

export type NativeEventType =
  | 'download-started'
  | 'download-complete'
  | 'download-failed'
  | 'install-permission-needed'
  | 'ota-download-progress'
  | 'ota-download-complete'
  | 'ota-download-failed';

export interface NativeEventDetail {
  type: NativeEventType;
  fileName?: string;
  ok?: boolean;
  message?: string;
  reason?: string;
  downloadId?: number;
  version?: string;
  progress?: number;
  receivedBytes?: number;
  totalBytes?: number;
}

/**
 * Cek apakah antarmuka Android NativeBridge tersedia
 */
export function isNativeBridgeAvailable(): boolean {
  return typeof window !== 'undefined' && Boolean(window.AndroidBridge);
}

/**
 * Berlangganan event native ('digiswiss-native')
 */
export function addNativeEventListener(
  callback: (detail: NativeEventDetail) => void
): () => void {
  if (typeof window === 'undefined') return () => {};

  const handler = (evt: Event) => {
    const customEvt = evt as CustomEvent<NativeEventDetail>;
    if (customEvt && customEvt.detail) {
      callback(customEvt.detail);
    }
  };

  window.addEventListener('digiswiss-native', handler);
  return () => window.removeEventListener('digiswiss-native', handler);
}

/**
 * Unduh APK melalui DownloadManager native atau fallback browser
 */
export async function downloadApkNative(
  url: string,
  fileName: string
): Promise<{ ok: boolean; message: string }> {
  const safeName = sanitizeFileName(fileName);
  const fullName = safeName.endsWith('.apk') ? safeName : `${safeName}.apk`;

  if (isNativeBridgeAvailable() && window.AndroidBridge) {
    try {
      const raw = window.AndroidBridge.downloadApk(url, fullName);
      const parsed = JSON.parse(raw);
      return { ok: Boolean(parsed.ok), message: parsed.message || '' };
    } catch (e: any) {
      return { ok: false, message: e.message || 'Gagal memanggil antarmuka unduhan native' };
    }
  }

  // Fallback peramban web
  if (typeof window !== 'undefined') {
    window.open(url, '_blank');
    return { ok: true, message: 'Membuka unduhan di browser' };
  }

  return { ok: false, message: 'Lingkungan tidak mendukung unduhan' };
}

/**
 * Memasang file APK yang telah diunduh
 */
export async function installApkNative(): Promise<{ ok: boolean; message: string }> {
  if (isNativeBridgeAvailable() && window.AndroidBridge) {
    try {
      const raw = window.AndroidBridge.installApk();
      const parsed = JSON.parse(raw);
      return { ok: Boolean(parsed.ok), message: parsed.message || '' };
    } catch (e: any) {
      return { ok: false, message: e.message || 'Gagal memanggil penginstal native' };
    }
  }

  return {
    ok: false,
    message: 'Instalasi otomatis hanya tersedia di aplikasi Android.'
  };
}

/**
 * Helper mengonversi data ke base64 string
 */
async function toBase64(data: string | Blob): Promise<string> {
  if (typeof data === 'string') {
    if (data.startsWith('data:')) {
      return data;
    }
    // Plain text: encode ke base64 UTF-8
    try {
      if (typeof window !== 'undefined' && window.btoa) {
        return window.btoa(unescape(encodeURIComponent(data)));
      }
      return Buffer.from(data, 'utf-8').toString('base64');
    } catch {
      return data;
    }
  }

  // Blob to DataURL
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(data);
  });
}

/**
 * Menyimpan file (PNG, CSV, TXT) ke penyimpanan perangkat atau download di browser
 */
export async function saveFileNative(
  fileName: string,
  mimeType: string,
  data: string | Blob
): Promise<{ ok: boolean; message: string; fileName: string }> {
  const safeName = sanitizeFileName(fileName);

  if (isNativeBridgeAvailable() && window.AndroidBridge) {
    try {
      const base64Data = await toBase64(data);
      const raw = window.AndroidBridge.saveFile(safeName, mimeType, base64Data);
      const parsed = JSON.parse(raw);
      return {
        ok: Boolean(parsed.ok),
        message: parsed.message || 'File berhasil disimpan',
        fileName: safeName
      };
    } catch (e: any) {
      console.warn('Fallback ke unduhan browser:', e);
    }
  }

  // Fallback web browser
  if (typeof document !== 'undefined') {
    let url: string;
    let shouldRevoke = false;

    if (data instanceof Blob) {
      url = URL.createObjectURL(data);
      shouldRevoke = true;
    } else if (typeof data === 'string' && data.startsWith('data:')) {
      url = data;
    } else {
      const blob = new Blob([data], { type: mimeType });
      url = URL.createObjectURL(blob);
      shouldRevoke = true;
    }

    const a = document.createElement('a');
    a.href = url;
    a.download = safeName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);

    if (shouldRevoke) {
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    }

    return {
      ok: true,
      message: `File ${safeName} tersimpan di folder Unduhan.`,
      fileName: safeName
    };
  }

  return { ok: false, message: 'Tidak dapat menyimpan file', fileName: safeName };
}

/**
 * Salin teks ke clipboard menggunakan bridge native atau API navigator.clipboard
 */
export async function copyTextNative(
  text: string
): Promise<{ ok: boolean; message: string }> {
  if (isNativeBridgeAvailable() && window.AndroidBridge) {
    try {
      const raw = window.AndroidBridge.copyText(text);
      const parsed = JSON.parse(raw);
      if (parsed.ok) {
        return { ok: true, message: parsed.message || 'Teks berhasil disalin' };
      }
    } catch (e) {
      console.warn('Gagal salin via native bridge, fallback ke navigator.clipboard:', e);
    }
  }

  if (typeof navigator !== 'undefined' && navigator.clipboard && navigator.clipboard.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return { ok: true, message: 'Teks berhasil disalin ke papan klip' };
    } catch {
      // lanjut fallback manual
    }
  }

  // Fallback manual document.execCommand
  if (typeof document !== 'undefined') {
    try {
      const textarea = document.createElement('textarea');
      textarea.value = text;
      textarea.style.position = 'fixed';
      textarea.style.left = '-9999px';
      textarea.style.top = '0';
      document.body.appendChild(textarea);
      textarea.focus();
      textarea.select();
      const success = document.execCommand('copy');
      document.body.removeChild(textarea);
      if (success) {
        return { ok: true, message: 'Teks berhasil disalin' };
      }
    } catch {
      // gagal
    }
  }

  return { ok: false, message: 'Gagal menyalin teks ke papan klip' };
}

/**
 * Membuka URL eksternal di peramban sistem
 */
export function openExternalNative(url: string): void {
  if (isNativeBridgeAvailable() && window.AndroidBridge) {
    try {
      window.AndroidBridge.openExternal(url);
      return;
    } catch {
      // fallback
    }
  }

  if (typeof window !== 'undefined') {
    window.open(url, '_blank', 'noopener,noreferrer');
  }
}

/**
 * Mengubah gaya icon dan warna status bar & navigation bar Android
 */
export function setSystemBarsStyleNative(isDark: boolean): void {
  if (isNativeBridgeAvailable() && window.AndroidBridge && typeof window.AndroidBridge.setSystemBarsStyle === 'function') {
    try {
      window.AndroidBridge.setSystemBarsStyle(isDark);
    } catch (e) {
      console.warn('Gagal mengubah gaya system bars:', e);
    }
  }
}

/**
 * Jalur cadangan: Meminta tag rilis terbaru langsung dari header redirect GitHub lewat HttpURLConnection native
 */
export async function getLatestReleaseTagNative(): Promise<{
  ok: boolean;
  tag?: string;
  location?: string;
  message?: string;
}> {
  if (
    isNativeBridgeAvailable() &&
    window.AndroidBridge &&
    typeof window.AndroidBridge.getLatestReleaseTag === 'function'
  ) {
    try {
      const raw = window.AndroidBridge.getLatestReleaseTag();
      const parsed = JSON.parse(raw);
      return {
        ok: Boolean(parsed.ok),
        tag: parsed.tag,
        location: parsed.location,
        message: parsed.message
      };
    } catch (e: any) {
      return { ok: false, message: e?.message || 'Gagal memanggil native getLatestReleaseTag' };
    }
  }
  return { ok: false, message: 'NativeBridge tidak tersedia' };
}

/**
 * Mengambil versi native APK (versionName)
 */
export async function getNativeVersionNative(): Promise<string> {
  if (
    isNativeBridgeAvailable() &&
    window.AndroidBridge &&
    typeof window.AndroidBridge.getNativeVersion === 'function'
  ) {
    try {
      return window.AndroidBridge.getNativeVersion();
    } catch {
      return '1.0';
    }
  }
  return '1.0';
}

/**
 * Mengambil manifest.json OTA dari GitHub Release via NativeBridge
 */
export async function fetchOtaManifestNative(): Promise<{
  ok: boolean;
  manifest?: any;
  message?: string;
}> {
  if (
    isNativeBridgeAvailable() &&
    window.AndroidBridge &&
    typeof window.AndroidBridge.fetchOtaManifest === 'function'
  ) {
    try {
      const raw = window.AndroidBridge.fetchOtaManifest();
      return JSON.parse(raw);
    } catch (e: any) {
      return { ok: false, message: e?.message || 'Gagal memanggil fetchOtaManifest' };
    }
  }
  return { ok: false, message: 'NativeBridge tidak tersedia' };
}

/**
 * Mengunduh bundle OTA zip, memverifikasi SHA-256, dan mengekstraknya
 */
export async function downloadOtaBundleNative(
  version: string,
  expectedSha256 = ''
): Promise<{ ok: boolean; message: string; version?: string; dir?: string }> {
  if (
    isNativeBridgeAvailable() &&
    window.AndroidBridge &&
    typeof window.AndroidBridge.downloadOtaBundle === 'function'
  ) {
    try {
      const raw = window.AndroidBridge.downloadOtaBundle(version, expectedSha256);
      return JSON.parse(raw);
    } catch (e: any) {
      return { ok: false, message: e?.message || 'Gagal memanggil downloadOtaBundle' };
    }
  }
  return { ok: false, message: 'Fitur OTA hanya tersedia di aplikasi Android.' };
}

/**
 * Memuat ulang WebView dari paket OTA aktif tanpa menutup aplikasi
 */
export async function applyOtaNative(): Promise<{ ok: boolean; message: string }> {
  if (
    isNativeBridgeAvailable() &&
    window.AndroidBridge &&
    typeof window.AndroidBridge.applyOta === 'function'
  ) {
    try {
      const raw = window.AndroidBridge.applyOta();
      return JSON.parse(raw);
    } catch (e: any) {
      return { ok: false, message: e?.message || 'Gagal memanggil applyOta' };
    }
  }
  return { ok: false, message: 'Fitur OTA hanya didukung pada aplikasi Android.' };
}

/**
 * Menandai bahwa boot aplikasi berhasil setelah render awal (reset crash counter)
 */
export async function markBootOkNative(): Promise<{ ok: boolean }> {
  if (
    isNativeBridgeAvailable() &&
    window.AndroidBridge &&
    typeof window.AndroidBridge.markBootOk === 'function'
  ) {
    try {
      const raw = window.AndroidBridge.markBootOk();
      return JSON.parse(raw);
    } catch {
      return { ok: false };
    }
  }
  return { ok: false };
}

/**
 * Menghapus konfigurasi OTA dan kembali ke bundle aset APK bawaan
 */
export async function resetToDefaultAssetsNative(): Promise<{ ok: boolean; message: string }> {
  if (
    isNativeBridgeAvailable() &&
    window.AndroidBridge &&
    typeof window.AndroidBridge.resetToDefaultAssets === 'function'
  ) {
    try {
      const raw = window.AndroidBridge.resetToDefaultAssets();
      return JSON.parse(raw);
    } catch (e: any) {
      return { ok: false, message: e?.message || 'Gagal reset ke versi bawaan' };
    }
  }
  return { ok: false, message: 'Fitur reset hanya didukung pada aplikasi Android.' };
}

/**
 * Memeriksa status OTA saat ini (apakah sedang berjalan dengan paket OTA atau bawaan)
 */
export async function getCurrentOtaInfoNative(): Promise<{
  isOta: boolean;
  otaVersion?: string;
  nativeVersion?: string;
  dir?: string;
}> {
  if (
    isNativeBridgeAvailable() &&
    window.AndroidBridge &&
    typeof window.AndroidBridge.getCurrentOtaInfo === 'function'
  ) {
    try {
      const raw = window.AndroidBridge.getCurrentOtaInfo();
      return JSON.parse(raw);
    } catch {
      return { isOta: false, nativeVersion: '1.0' };
    }
  }
  return { isOta: false, nativeVersion: '1.0' };
}



