import { isUpdateAvailable, compareVersions, parseSemver } from './versionService.ts';
import type { AppReleaseInfo } from './versionService.ts';
import { constructReleaseDownloadUrl, isAllowedApkUrl } from '../utils/nativeHelpers.ts';
import {
  fetchOtaManifestNative,
  getNativeVersionNative,
  downloadOtaBundleNative,
  applyOtaNative,
  resetToDefaultAssetsNative,
  markBootOkNative,
  getCurrentOtaInfoNative,
  isNativeBridgeAvailable
} from './nativeBridge.ts';

export interface OtaManifest {
  version: string;
  bundle: string;
  sha256: string;
  minNativeVersion: string;
}

export type UpdateMode = 'none' | 'ota' | 'apk';

export interface UpdateDecision {
  mode: UpdateMode;
  latestVersion: string;
  currentWebVersion: string;
  minNativeVersion: string;
  nativeVersion: string;
  hasUpdate: boolean;
  reason: string;
  manifest?: OtaManifest;
  error?: boolean;
}

export interface UpdatePresentation {
  visible: boolean;
  latestVersion: string;
  currentVersionLabel: string;
  mode: UpdateMode;
  downloadSource: string;
}

const OTA_VERSION_REGEX = /^\d+\.\d+\.\d+$/;
const OTA_SHA256_REGEX = /^[0-9a-fA-F]{64}$/;

function cleanSemverString(v?: string | null): string {
  if (!v || typeof v !== 'string') return '';
  const clean = v.trim().replace(/^[vV]/, '').trim();
  return parseSemver(clean) ? clean : '';
}

export function getUpdateModeLabel(mode: UpdateMode): string {
  if (mode === 'ota') return 'Pembaruan Web Cepat (OTA)';
  if (mode === 'apk') return 'Pembaruan Aplikasi (Perlu APK Baru)';
  return '';
}

function resolveApkDownloadUrl(
  latestVersion: string,
  releaseInfo?: Partial<AppReleaseInfo> | null
): string {
  const fallback = constructReleaseDownloadUrl(latestVersion);
  if (
    releaseInfo &&
    !releaseInfo.error &&
    releaseInfo.downloadUrl &&
    isAllowedApkUrl(releaseInfo.downloadUrl) &&
    cleanSemverString(releaseInfo.latestVersion) === latestVersion
  ) {
    return releaseInfo.downloadUrl;
  }
  return fallback;
}

/**
 * Fungsi murni untuk memeriksa apakah objek manifest OTA valid sesuai spesifikasi:
 * - version cocok ^\d+\.\d+\.\d+$
 * - sha256 cocok ^[0-9a-fA-F]{64}$ (64 karakter hex)
 * - bundle berupa string berakhiran .zip tanpa "/" atau ".."
 * - minNativeVersion berformat versi (misal: "1.0", "1.0.0")
 */
export function isValidOtaManifest(m: any): boolean {
  if (!m || typeof m !== 'object') return false;

  const rawVer = typeof m.version === 'string' ? m.version.trim().replace(/^[vV]/, '') : '';
  if (!OTA_VERSION_REGEX.test(rawVer)) return false;

  const rawSha = typeof m.sha256 === 'string' ? m.sha256.trim() : '';
  if (!OTA_SHA256_REGEX.test(rawSha)) return false;

  const rawBundle = typeof m.bundle === 'string' ? m.bundle.trim() : '';
  if (!rawBundle.endsWith('.zip')) return false;
  if (rawBundle.includes('/') || rawBundle.includes('\\') || rawBundle.includes('..')) return false;

  const minNative = typeof m.minNativeVersion === 'string' ? m.minNativeVersion.trim().replace(/^[vV]/, '') : '1.0';
  if (!/^\d+(\.\d+)*$/.test(minNative)) return false;

  return true;
}

/**
 * Validasi ketat format objek manifest.json
 */
export function validateOtaManifest(raw: any): {
  valid: boolean;
  manifest?: OtaManifest;
  error?: string;
} {
  if (!isValidOtaManifest(raw)) {
    console.warn('Manifest OTA tidak valid dan diabaikan:', raw);
    return { valid: false, error: 'Manifest OTA tidak valid.' };
  }

  const cleanVer = String(raw.version).trim().replace(/^[vV]/, '');
  const cleanSha = String(raw.sha256).trim().toLowerCase();
  const cleanBundle = String(raw.bundle).trim();
  const cleanMinNative = typeof raw.minNativeVersion === 'string' ? raw.minNativeVersion.trim().replace(/^[vV]/, '') : '1.0';

  return {
    valid: true,
    manifest: {
      version: cleanVer,
      bundle: cleanBundle,
      sha256: cleanSha,
      minNativeVersion: cleanMinNative
    }
  };
}

/**
 * Fungsi murni untuk menentukan mode pembaruan:
 * - Jika tidak ada versi baru: mode "none"
 * - Jika versi web lebih baru DAN nativeVersion >= minNativeVersion: mode "ota"
 * - Jika nativeVersion < minNativeVersion: mode "apk" (memerlukan instalasi APK baru)
 */
export function resolveUpdateMode(params: {
  latestWebVersion?: string | null;
  currentWebVersion?: string | null;
  minNativeVersion?: string | null;
  currentNativeVersion?: string | null;
}): UpdateDecision {
  const latest = String(params.latestWebVersion || '').trim().replace(/^[vV]/, '');
  const currentWeb = String(params.currentWebVersion || '').trim().replace(/^[vV]/, '');
  const minNative = String(params.minNativeVersion || '1.0').trim().replace(/^[vV]/, '');
  const currentNative = String(params.currentNativeVersion || '1.0').trim().replace(/^[vV]/, '');

  if (!latest || !currentWeb || !isUpdateAvailable(latest, currentWeb)) {
    return {
      mode: 'none',
      latestVersion: latest,
      currentWebVersion: currentWeb,
      minNativeVersion: minNative,
      nativeVersion: currentNative,
      hasUpdate: false,
      reason: 'Versi web sudah yang terbaru.'
    };
  }

  // Bandingkan nativeVersion dengan minNativeVersion
  // Jika currentNative >= minNative, cukup OTA
  // Jika currentNative < minNative, wajib APK
  const isNativeSufficient = compareVersions(currentNative, minNative) >= 0;

  if (isNativeSufficient) {
    return {
      mode: 'ota',
      latestVersion: latest,
      currentWebVersion: currentWeb,
      minNativeVersion: minNative,
      nativeVersion: currentNative,
      hasUpdate: true,
      reason: `Pembaruan web OTA v${latest} tersedia (versi aplikasi v${currentNative} memenuhi syarat minimal v${minNative}).`
    };
  } else {
    return {
      mode: 'apk',
      latestVersion: latest,
      currentWebVersion: currentWeb,
      minNativeVersion: minNative,
      nativeVersion: currentNative,
      hasUpdate: true,
      reason: `Pembaruan v${latest} memerlukan instalasi APK baru karena kode native berubah (minimal v${minNative}, saat ini v${currentNative}).`
    };
  }
}

/**
 * Satu sumber kebenaran murni untuk tampilan pembaruan (modal, banner, dan cek pembaruan manual).
 */
export function buildUpdatePresentation(params: {
  releaseInfo?: Partial<AppReleaseInfo> | null;
  decision?: Partial<UpdateDecision> | null;
  currentWebVersion?: string | null;
  nativeVersion?: string | null;
}): UpdatePresentation {
  const cleanWeb = cleanSemverString(params.currentWebVersion);
  const cleanNative = cleanSemverString(params.nativeVersion || params.decision?.nativeVersion);

  const validManifest =
    params.decision?.manifest && isValidOtaManifest(params.decision.manifest)
      ? {
          version: cleanSemverString(params.decision.manifest.version),
          bundle: String(params.decision.manifest.bundle).trim(),
          sha256: String(params.decision.manifest.sha256).trim().toLowerCase(),
          minNativeVersion:
            cleanSemverString(params.decision.manifest.minNativeVersion) || '1.0'
        }
      : null;

  const manifestVer = validManifest ? validManifest.version : '';
  const releaseVer =
    params.releaseInfo && !params.releaseInfo.error
      ? cleanSemverString(params.releaseInfo.latestVersion)
      : '';

  let latestVersion = '';
  if (manifestVer && releaseVer) {
    latestVersion =
      compareVersions(manifestVer, releaseVer) >= 0 ? manifestVer : releaseVer;
  } else {
    latestVersion = manifestVer || releaseVer;
  }

  if (!latestVersion) {
    return {
      visible: false,
      latestVersion: '',
      currentVersionLabel: cleanWeb,
      mode: 'none',
      downloadSource: ''
    };
  }

  const manifestMatchesLatest = Boolean(
    validManifest && compareVersions(validManifest.version, latestVersion) === 0
  );
  const webNeedsUpdate = cleanWeb ? isUpdateAvailable(latestVersion, cleanWeb) : true;
  const nativeBelowMin = Boolean(
    validManifest &&
      manifestMatchesLatest &&
      cleanNative &&
      compareVersions(cleanNative, validManifest.minNativeVersion) < 0
  );
  const nativeSatisfiesMin = Boolean(
    validManifest &&
      cleanNative &&
      compareVersions(cleanNative, validManifest.minNativeVersion) >= 0
  );

  // Mode OTA hanya jika manifest valid, sinkron dengan latestVersion, web lebih lama, dan native >= minNative
  if (validManifest && manifestMatchesLatest && webNeedsUpdate && nativeSatisfiesMin) {
    const visible = isUpdateAvailable(latestVersion, cleanWeb);
    if (!visible) {
      return {
        visible: false,
        latestVersion,
        currentVersionLabel: cleanWeb,
        mode: 'none',
        downloadSource: ''
      };
    }
    return {
      visible: true,
      latestVersion,
      currentVersionLabel: cleanWeb,
      mode: 'ota',
      downloadSource: `https://github.com/tieedd/DigiSwiss-Round-Manager/releases/download/v${latestVersion}/${validManifest.bundle}`
    };
  }

  // Mode APK jika native < minNativeVersion, ATAU manifest tidak tersedia/tidak sinkron (saat ada pembaruan)
  const needsApkForMinNative = nativeBelowMin;
  const needsApkDueToManifest = !manifestMatchesLatest && webNeedsUpdate;

  if (needsApkForMinNative || needsApkDueToManifest) {
    const currentVersionLabel = cleanNative || cleanWeb;
    const visible = Boolean(
      currentVersionLabel && isUpdateAvailable(latestVersion, currentVersionLabel)
    );
    if (!visible) {
      return {
        visible: false,
        latestVersion,
        currentVersionLabel,
        mode: 'none',
        downloadSource: ''
      };
    }
    return {
      visible: true,
      latestVersion,
      currentVersionLabel,
      mode: 'apk',
      downloadSource: resolveApkDownloadUrl(latestVersion, params.releaseInfo)
    };
  }

  return {
    visible: false,
    latestVersion,
    currentVersionLabel: cleanWeb,
    mode: 'none',
    downloadSource: ''
  };
}

/**
 * Mengambil manifest rilis terbaru dan mengevaluasi mode pembaruan
 */
export async function fetchOtaManifestAndDecide(
  currentWebVersion: string,
  repoOwner = 'tieedd',
  repoName = 'DigiSwiss-Round-Manager',
  options?: { cacheBust?: boolean }
): Promise<UpdateDecision> {
  const nativeVersion = await getNativeVersionNative();
  const useCacheBust = Boolean(options?.cacheBust);

  const fetchViaWeb = async (cacheBust: boolean): Promise<UpdateDecision | null> => {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 8000);
      const baseUrl = `https://github.com/${repoOwner}/${repoName}/releases/latest/download/manifest.json`;
      const targetUrl = cacheBust ? `${baseUrl}?t=${Date.now()}` : baseUrl;

      const res = await fetch(targetUrl, {
        headers: {
          Accept: 'application/json',
          ...(cacheBust ? { 'Cache-Control': 'no-cache', Pragma: 'no-cache' } : {})
        },
        cache: 'no-store',
        signal: controller.signal
      });
      clearTimeout(timeoutId);

      if (res.ok) {
        const rawJson = await res.json();
        const val = validateOtaManifest(rawJson);
        if (val.valid && val.manifest) {
          const decision = resolveUpdateMode({
            latestWebVersion: val.manifest.version,
            currentWebVersion,
            minNativeVersion: val.manifest.minNativeVersion,
            currentNativeVersion: nativeVersion
          });
          decision.manifest = val.manifest;
          return decision;
        }
      }
    } catch (err) {
      console.warn('Gagal mengambil manifest OTA via web fetch:', err);
    }
    return null;
  };

  const fetchViaNative = async (): Promise<UpdateDecision | null> => {
    if (!isNativeBridgeAvailable()) return null;
    try {
      const nativeRes = await fetchOtaManifestNative();
      if (nativeRes.ok && nativeRes.manifest) {
        const val = validateOtaManifest(nativeRes.manifest);
        if (val.valid && val.manifest) {
          const decision = resolveUpdateMode({
            latestWebVersion: val.manifest.version,
            currentWebVersion,
            minNativeVersion: val.manifest.minNativeVersion,
            currentNativeVersion: nativeVersion
          });
          decision.manifest = val.manifest;
          return decision;
        }
      }
    } catch (err) {
      console.warn('Gagal mengambil manifest via native bridge:', err);
    }
    return null;
  };

  // Saat cache-busting (retry manifest basi), prioritaskan web fetch dengan parameter query ?t=...
  if (useCacheBust) {
    const webDecision = await fetchViaWeb(true);
    if (webDecision) return webDecision;
    const nativeDecision = await fetchViaNative();
    if (nativeDecision) return nativeDecision;
  } else {
    const nativeDecision = await fetchViaNative();
    if (nativeDecision) return nativeDecision;
    const webDecision = await fetchViaWeb(false);
    if (webDecision) return webDecision;
  }

  // Jika manifest tidak ditemukan, tidak valid, atau offline
  return {
    mode: 'none',
    latestVersion: '',
    currentWebVersion,
    minNativeVersion: '1.0',
    nativeVersion,
    hasUpdate: false,
    error: true,
    reason: 'Tidak dapat mengambil manifest rilis.'
  };
}

export {
  downloadOtaBundleNative,
  applyOtaNative,
  resetToDefaultAssetsNative,
  markBootOkNative,
  getCurrentOtaInfoNative
};

