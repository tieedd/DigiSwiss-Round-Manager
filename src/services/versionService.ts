import { constructReleaseDownloadUrl } from '../utils/nativeHelpers.ts';
import { getLatestReleaseTagNative, isNativeBridgeAvailable } from './nativeBridge.ts';

export interface AppReleaseInfo {
  hasUpdate: boolean;
  currentVersion: string;
  latestVersion: string;
  releaseName?: string;
  releaseNotes?: string;
  downloadUrl?: string;
  htmlUrl?: string;
  error?: boolean;
}

export const CURRENT_APP_VERSION = '1.0.0';

export interface ReleaseCacheData {
  latestTag: string;
  downloadUrl?: string;
  releaseName?: string;
  releaseNotes?: string;
  htmlUrl?: string;
  checkedAt: number;
}

const CACHE_KEY = 'dss_latest_release_cache';
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 menit

function getCachedRelease(): ReleaseCacheData | null {
  if (typeof window === 'undefined' || !window.localStorage) return null;
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function setCachedRelease(data: ReleaseCacheData) {
  if (typeof window === 'undefined' || !window.localStorage) return;
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(data));
  } catch {
    // Abaikan jika quota storage penuh
  }
}

/**
 * Parsing string versi semver (misal: "1.0.4", "v1.0.10", "1.0") menjadi array angka.
 * Mengembalikan null jika format tidak valid atau kosong.
 */
export function parseSemver(v: string | null | undefined): number[] | null {
  if (!v) return null;
  const clean = String(v).trim().replace(/^[vV]/, '').trim();
  if (!clean) return null;
  const parts = clean.split('.');
  const nums: number[] = [];
  for (const p of parts) {
    if (!/^\d+$/.test(p)) return null;
    const n = parseInt(p, 10);
    if (isNaN(n)) return null;
    nums.push(n);
  }
  return nums.length > 0 ? nums : null;
}

/**
 * Fungsi murni untuk memeriksa apakah pembaruan tersedia.
 * Membuang awalan "v", membandingkan angka mayor.minor.patch secara numerik.
 * Mengembalikan true HANYA jika versi GitHub lebih besar dari versi aplikasi.
 * Jika sama, lebih kecil, kosong, atau tidak valid, mengembalikan false.
 */
export function isUpdateAvailable(
  latestTag?: string | null,
  currentVersion?: string | null
): boolean {
  const latestParts = parseSemver(latestTag);
  const currentParts = parseSemver(currentVersion);

  if (!latestParts || !currentParts) {
    return false;
  }

  const length = Math.max(latestParts.length, currentParts.length);
  for (let i = 0; i < length; i++) {
    const l = latestParts[i] || 0;
    const c = currentParts[i] || 0;
    if (l > c) return true;
    if (l < c) return false;
  }

  return false;
}

/**
 * Membandingkan 2 string versi (A dan B)
 * Return 1 jika A > B, -1 jika A < B, 0 jika sama
 */
export function compareVersions(versionA: string, versionB: string): number {
  const partsA = parseSemver(versionA) || [];
  const partsB = parseSemver(versionB) || [];

  const length = Math.max(partsA.length, partsB.length);
  for (let i = 0; i < length; i++) {
    const a = partsA[i] || 0;
    const b = partsB[i] || 0;
    if (a > b) return 1;
    if (a < b) return -1;
  }
  return 0;
}

/**
 * Fungsi murni untuk memproses resolusi rilis dari tag (berguna untuk pengujian logika rilis)
 */
export function resolveReleaseFromTag(
  tag: string,
  currentVersion: string = CURRENT_APP_VERSION,
  repoOwner: string = 'tieedd',
  repoName: string = 'DigiSwiss-Round-Manager'
): AppReleaseInfo {
  const cleanLatest = tag.trim().replace(/^[vV]/, '').trim();
  const tagWithV = `v${cleanLatest}`;
  const downloadUrl = `https://github.com/${repoOwner}/${repoName}/releases/download/${tagWithV}/DigiSwiss-Round-${tagWithV}.apk`;
  const htmlUrl = `https://github.com/${repoOwner}/${repoName}/releases/tag/${tagWithV}`;
  const releaseName = `Versi ${cleanLatest}`;
  return {
    hasUpdate: isUpdateAvailable(cleanLatest, currentVersion),
    currentVersion,
    latestVersion: cleanLatest,
    releaseName,
    downloadUrl,
    htmlUrl
  };
}

/**
 * Memeriksa versi rilis terbaru dari GitHub Releases repo DigiSwiss-Round-Manager.
 * - Cache localStorage 5 menit.
 * - Retry hingga 2x (jeda 1s dan 3s, timeout 8s).
 * - Fallback ke NativeBridge getLatestReleaseTag jika REST API gagal (403, 429, timeout, dll).
 * - Tidak menimpa cache valid jika gagal mengambil data baru.
 */
export async function checkLatestRelease(
  repoOwner: string = 'tieedd',
  repoName: string = 'DigiSwiss-Round-Manager',
  forceRefresh: boolean = false
): Promise<AppReleaseInfo> {
  const cached = getCachedRelease();
  const now = Date.now();

  // Gunakan cache jika masih valid (< 5 menit) dan bukan force refresh
  if (!forceRefresh && cached && now - cached.checkedAt < CACHE_TTL_MS) {
    const cleanLatest = cached.latestTag.replace(/^[vV]/, '').trim();
    return {
      hasUpdate: isUpdateAvailable(cleanLatest, CURRENT_APP_VERSION),
      currentVersion: CURRENT_APP_VERSION,
      latestVersion: cleanLatest,
      releaseName: cached.releaseName,
      releaseNotes: cached.releaseNotes,
      downloadUrl: cached.downloadUrl,
      htmlUrl: cached.htmlUrl
    };
  }

  // Percobaan fetch ke GitHub REST API (maksimal 2x retry, timeout 8 detik)
  const maxRetries = 2;
  const retryDelays = [1000, 3000];
  let apiData: any = null;
  let lastApiError: any = null;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    if (attempt > 0) {
      const delay = retryDelays[attempt - 1] || 1000;
      await new Promise((r) => setTimeout(r, delay));
    }

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 8000); // 8 detik per percobaan

      const res = await fetch(
        `https://api.github.com/repos/${repoOwner}/${repoName}/releases/latest`,
        {
          headers: { Accept: 'application/vnd.github.v3+json' },
          signal: controller.signal
        }
      );

      clearTimeout(timeoutId);

      if (res.ok) {
        apiData = await res.json();
        break;
      } else {
        lastApiError = new Error(`GitHub API HTTP ${res.status}`);
      }
    } catch (err: any) {
      lastApiError = err;
    }
  }

  // 1. Jika GitHub REST API berhasil
  if (apiData) {
    const tagName = apiData.tag_name || apiData.name || '';
    const cleanLatest = tagName.replace(/^[vV]/, '').trim();

    let downloadUrl = apiData.html_url;
    if (Array.isArray(apiData.assets)) {
      const apkAsset = apiData.assets.find((a: any) =>
        a.name?.endsWith('.apk')
      );
      if (apkAsset?.browser_download_url) {
        downloadUrl = apkAsset.browser_download_url;
      }
    }

    const releaseName = apiData.name || `Versi ${cleanLatest}`;
    const releaseNotes = apiData.body || '';

    // Simpan ke cache localStorage
    setCachedRelease({
      latestTag: cleanLatest,
      downloadUrl,
      releaseName,
      releaseNotes,
      htmlUrl: apiData.html_url,
      checkedAt: now
    });

    const hasUpdate = isUpdateAvailable(cleanLatest, CURRENT_APP_VERSION);
    return {
      hasUpdate,
      currentVersion: CURRENT_APP_VERSION,
      latestVersion: cleanLatest,
      releaseName,
      releaseNotes,
      downloadUrl,
      htmlUrl: apiData.html_url
    };
  }

  // 2. Jalur cadangan NativeBridge jika GitHub REST API gagal (misal kena rate-limit atau timeout)
  console.warn('Pengecekan versi via GitHub REST API gagal, mencoba jalur cadangan NativeBridge:', lastApiError);

  try {
    if (isNativeBridgeAvailable()) {
      const nativeRes = await getLatestReleaseTagNative();
      if (nativeRes.ok && nativeRes.tag) {
        const cleanLatest = nativeRes.tag.replace(/^[vV]/, '').trim();
        if (cleanLatest) {
          const downloadUrl = constructReleaseDownloadUrl(cleanLatest);
          const htmlUrl = `https://github.com/${repoOwner}/${repoName}/releases/tag/v${cleanLatest}`;
          const releaseName = `Versi ${cleanLatest}`;

          // Simpan ke cache
          setCachedRelease({
            latestTag: cleanLatest,
            downloadUrl,
            releaseName,
            releaseNotes: '',
            htmlUrl,
            checkedAt: now
          });

          return {
            hasUpdate: isUpdateAvailable(cleanLatest, CURRENT_APP_VERSION),
            currentVersion: CURRENT_APP_VERSION,
            latestVersion: cleanLatest,
            releaseName,
            downloadUrl,
            htmlUrl
          };
        }
      }
    }
  } catch (nativeErr) {
    console.warn('Jalur cadangan NativeBridge juga gagal:', nativeErr);
  }

  // 3. Jika semua jalur gagal: jangan menimpa cache valid!
  console.warn('Semua jalur pengecekan pembaruan gagal.');
  if (cached) {
    const cleanLatest = cached.latestTag.replace(/^[vV]/, '').trim();
    return {
      hasUpdate: isUpdateAvailable(cleanLatest, CURRENT_APP_VERSION),
      currentVersion: CURRENT_APP_VERSION,
      latestVersion: cleanLatest,
      releaseName: cached.releaseName,
      releaseNotes: cached.releaseNotes,
      downloadUrl: cached.downloadUrl,
      htmlUrl: cached.htmlUrl,
      error: true
    };
  }

  return {
    hasUpdate: false,
    currentVersion: CURRENT_APP_VERSION,
    latestVersion: CURRENT_APP_VERSION,
    error: true
  };
}

export { isValidOtaManifest, validateOtaManifest } from './otaService.ts';

