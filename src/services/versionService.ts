export interface AppReleaseInfo {
  hasUpdate: boolean;
  currentVersion: string;
  latestVersion: string;
  releaseName?: string;
  releaseNotes?: string;
  downloadUrl?: string;
  htmlUrl?: string;
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
const CACHE_TTL_MS = 30 * 60 * 1000; // 30 menit

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
 * Memeriksa versi rilis terbaru dari GitHub Releases repo DigiSwiss-Round-Manager.
 * Menghemat panggilan GitHub API dengan cache localStorage 30 menit.
 * Gagal diam-diam jika perangkat sedang offline atau API tidak terjangkau.
 */
export async function checkLatestRelease(
  repoOwner: string = 'tieedd',
  repoName: string = 'DigiSwiss-Round-Manager',
  forceRefresh: boolean = false
): Promise<AppReleaseInfo> {
  const defaultResult: AppReleaseInfo = {
    hasUpdate: false,
    currentVersion: CURRENT_APP_VERSION,
    latestVersion: CURRENT_APP_VERSION
  };

  const cached = getCachedRelease();
  const now = Date.now();

  // Gunakan cache jika masih valid (< 30 menit) dan bukan force refresh
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

  // Jika sedang offline di browser, fallback ke cache jika ada
  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    if (cached) {
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
    return defaultResult;
  }

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 4000); // Batas timeout 4 detik

    const res = await fetch(
      `https://api.github.com/repos/${repoOwner}/${repoName}/releases/latest`,
      {
        headers: { Accept: 'application/vnd.github.v3+json' },
        signal: controller.signal
      }
    );

    clearTimeout(timeoutId);

    if (!res.ok) {
      // Jika respons gagal (misal rate-limit atau offline), gunakan cache lama jika ada
      if (cached) {
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
      return defaultResult;
    }

    const data = await res.json();
    const tagName = data.tag_name || data.name || '';
    const cleanLatest = tagName.replace(/^[vV]/, '').trim();

    // Temukan tautan unduhan APK jika tersedia di assets rilis
    let downloadUrl = data.html_url;
    if (Array.isArray(data.assets)) {
      const apkAsset = data.assets.find((a: any) =>
        a.name?.endsWith('.apk')
      );
      if (apkAsset?.browser_download_url) {
        downloadUrl = apkAsset.browser_download_url;
      }
    }

    const releaseName = data.name || `Versi ${cleanLatest}`;
    const releaseNotes = data.body || '';

    // Simpan ke cache localStorage
    setCachedRelease({
      latestTag: cleanLatest,
      downloadUrl,
      releaseName,
      releaseNotes,
      htmlUrl: data.html_url,
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
      htmlUrl: data.html_url
    };
  } catch {
    // Gagal diam-diam jika offline atau error jaringan; gunakan cache jika ada
    if (cached) {
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
    return defaultResult;
  }
}
