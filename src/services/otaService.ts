import { isUpdateAvailable, compareVersions } from './versionService.ts';
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
}

/**
 * Validasi ketat format objek manifest.json
 */
export function validateOtaManifest(raw: any): {
  valid: boolean;
  manifest?: OtaManifest;
  error?: string;
} {
  if (!raw || typeof raw !== 'object') {
    return { valid: false, error: 'Manifest bukan objek JSON yang valid.' };
  }

  const version = typeof raw.version === 'string' ? raw.version.trim() : '';
  const bundle = typeof raw.bundle === 'string' ? raw.bundle.trim() : '';
  const sha256 = typeof raw.sha256 === 'string' ? raw.sha256.trim() : '';
  const minNativeVersion = typeof raw.minNativeVersion === 'string' ? raw.minNativeVersion.trim() : '1.0';

  if (!version) {
    return { valid: false, error: 'Field "version" tidak ditemukan di manifest.' };
  }
  if (!bundle) {
    return { valid: false, error: 'Field "bundle" tidak ditemukan di manifest.' };
  }
  if (!sha256 || sha256.length < 32) {
    return { valid: false, error: 'Field "sha256" tidak valid di manifest.' };
  }

  return {
    valid: true,
    manifest: {
      version,
      bundle,
      sha256,
      minNativeVersion
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
 * Mengambil manifest rilis terbaru dan mengevaluasi mode pembaruan
 */
export async function fetchOtaManifestAndDecide(
  currentWebVersion: string,
  repoOwner = 'tieedd',
  repoName = 'DigiSwiss-Round-Manager'
): Promise<UpdateDecision> {
  const nativeVersion = await getNativeVersionNative();

  // 1. Coba ambil manifest via NativeBridge jika tersedia di Android
  if (isNativeBridgeAvailable()) {
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
  }

  // 2. Fallback pengambilan manifest via Web Fetch
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 8000);

    const res = await fetch(
      `https://github.com/${repoOwner}/${repoName}/releases/latest/download/manifest.json`,
      {
        headers: { Accept: 'application/json' },
        signal: controller.signal
      }
    );
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

  // Jika manifest tidak ditemukan atau offline
  return {
    mode: 'none',
    latestVersion: currentWebVersion,
    currentWebVersion,
    minNativeVersion: '1.0',
    nativeVersion,
    hasUpdate: false,
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
