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

/**
 * Memeriksa versi rilis terbaru dari GitHub Releases repo DigiSwiss-Round.
 * Gagal diam-diam jika perangkat sedang offline atau API tidak terjangkau.
 */
export async function checkLatestRelease(
  repoOwner: string = 'tieedd',
  repoName: string = 'DigiSwiss-Round-Manager'
): Promise<AppReleaseInfo> {
  const defaultResult: AppReleaseInfo = {
    hasUpdate: false,
    currentVersion: CURRENT_APP_VERSION,
    latestVersion: CURRENT_APP_VERSION
  };

  try {
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      return defaultResult; // Offline, gagal diam-diam
    }

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
      return defaultResult;
    }

    const data = await res.json();
    const tagName = data.tag_name || data.name || '';
    const cleanLatest = tagName.replace(/^v/i, '').trim();

    // Bandingkan semver sederhana (mayor.minor.patch)
    const isNewer = compareVersions(cleanLatest, CURRENT_APP_VERSION) > 0;

    // Temukan aset APK jika ada
    let downloadUrl = data.html_url;
    if (Array.isArray(data.assets)) {
      const apkAsset = data.assets.find((a: any) =>
        a.name?.endsWith('.apk')
      );
      if (apkAsset?.browser_download_url) {
        downloadUrl = apkAsset.browser_download_url;
      }
    }

    return {
      hasUpdate: isNewer,
      currentVersion: CURRENT_APP_VERSION,
      latestVersion: cleanLatest,
      releaseName: data.name || `Versi ${cleanLatest}`,
      releaseNotes: data.body || '',
      downloadUrl,
      htmlUrl: data.html_url
    };
  } catch (e) {
    // Gagal diam-diam jika offline atau error jaringan
    return defaultResult;
  }
}

/**
 * Membandingkan 2 string versi (A dan B)
 * Return 1 jika A > B, -1 jika A < B, 0 jika sama
 */
export function compareVersions(versionA: string, versionB: string): number {
  const partsA = versionA.split('.').map((p) => parseInt(p, 10) || 0);
  const partsB = versionB.split('.').map((p) => parseInt(p, 10) || 0);

  const length = Math.max(partsA.length, partsB.length);
  for (let i = 0; i < length; i++) {
    const a = partsA[i] || 0;
    const b = partsB[i] || 0;
    if (a > b) return 1;
    if (a < b) return -1;
  }
  return 0;
}
