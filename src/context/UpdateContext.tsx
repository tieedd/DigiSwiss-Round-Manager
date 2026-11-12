import React, { createContext, useContext, useState, useEffect, useCallback, useRef, useMemo } from 'react';
import {
  checkLatestRelease,
  AppReleaseInfo,
  CURRENT_APP_VERSION,
  compareVersions,
  parseSemver
} from '../services/versionService.ts';
import {
  UpdateDecision,
  UpdatePresentation,
  buildUpdatePresentation,
  isValidOtaManifest,
  fetchOtaManifestAndDecide,
  downloadOtaBundleNative,
  applyOtaNative,
  resetToDefaultAssetsNative,
  markBootOkNative,
  getCurrentOtaInfoNative
} from '../services/otaService.ts';
import { constructReleaseDownloadUrl } from '../utils/nativeHelpers.ts';
import {
  downloadApkNative,
  installApkNative,
  addNativeEventListener,
  isNativeBridgeAvailable,
  getNativeVersionNative
} from '../services/nativeBridge.ts';
import { useToast } from './ToastContext.tsx';

export interface UpdateContextType {
  releaseInfo: AppReleaseInfo | null;
  updateDecision: UpdateDecision | null;
  presentation: UpdatePresentation;
  isChecking: boolean;
  isDownloading: boolean;
  otaProgress: number | null;
  isOtaReadyToApply: boolean;
  isOtaActive: boolean;
  nativeVersion: string;
  isPopupDismissed: boolean;
  isBannerDismissed: boolean;
  dismissPopup: () => void;
  dismissBanner: () => void;
  checkForUpdate: (forceRefresh?: boolean) => Promise<{
    releaseInfo: AppReleaseInfo | null;
    decision: UpdateDecision;
    presentation: UpdatePresentation;
    error: boolean;
  }>;
  triggerUpdate: () => Promise<void>;
  applyOta: () => Promise<void>;
  resetToDefault: () => Promise<void>;
  resetPopupOnNewLogin: () => void;
}

const UpdateContext = createContext<UpdateContextType | null>(null);

export const UpdateProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { success, error, info } = useToast();
  const [releaseInfo, setReleaseInfo] = useState<AppReleaseInfo | null>(null);
  const [updateDecision, setUpdateDecision] = useState<UpdateDecision | null>(null);
  const [isChecking, setIsChecking] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  const [otaProgress, setOtaProgress] = useState<number | null>(null);
  const [isOtaReadyToApply, setIsOtaReadyToApply] = useState(false);
  const [isOtaActive, setIsOtaActive] = useState(false);
  const [nativeVersion, setNativeVersion] = useState('1.0');

  // Status sudah ditutup disimpan di memori sesi saja (bukan di localStorage permanen)
  const [isPopupDismissed, setIsPopupDismissed] = useState(false);
  const [isBannerDismissed, setIsBannerDismissed] = useState(false);

  const updateDecisionRef = useRef<UpdateDecision | null>(null);
  updateDecisionRef.current = updateDecision;

  const releaseInfoRef = useRef<AppReleaseInfo | null>(null);
  releaseInfoRef.current = releaseInfo;

  const nativeVersionRef = useRef<string>(nativeVersion);
  nativeVersionRef.current = nativeVersion;

  const isDownloadingRef = useRef(false);
  isDownloadingRef.current = isDownloading;

  const presentation = useMemo(
    () =>
      buildUpdatePresentation({
        releaseInfo,
        decision: updateDecision,
        currentWebVersion: CURRENT_APP_VERSION,
        nativeVersion
      }),
    [releaseInfo, updateDecision, nativeVersion]
  );

  const presentationRef = useRef<UpdatePresentation>(presentation);
  presentationRef.current = presentation;

  const dismissPopup = useCallback(() => {
    setIsPopupDismissed(true);
  }, []);

  const dismissBanner = useCallback(() => {
    setIsBannerDismissed(true);
  }, []);

  const resetPopupOnNewLogin = useCallback(() => {
    setIsPopupDismissed(false);
  }, []);

  // Tandai boot sukses setelah aplikasi render dan inisialisasi status OTA
  useEffect(() => {
    const initOtaStatus = async () => {
      try {
        await markBootOkNative();
        const otaInfo = await getCurrentOtaInfoNative();
        setIsOtaActive(Boolean(otaInfo.isOta));
        const nv = otaInfo.nativeVersion || (await getNativeVersionNative());
        if (nv) {
          setNativeVersion(nv);
        }
      } catch (err) {
        console.warn('Gagal membaca info OTA awal:', err);
      }
    };
    initOtaStatus();
  }, []);

  // Pasang pendengar event native 'digiswiss-native'
  useEffect(() => {
    const unsubscribe = addNativeEventListener((detail) => {
      if (detail.type === 'download-started') {
        setIsDownloading(true);
      } else if (detail.type === 'download-complete') {
        setIsDownloading(false);
        if (detail.ok) {
          const fileName = detail.fileName || 'aplikasi';
          success(
            'Unduhan berhasil',
            `File ${fileName} tersimpan di folder Unduhan.`,
            {
              label: 'Pasang sekarang',
              onClick: () => {
                installApkNative();
              }
            }
          );
        } else {
          error('Unduhan gagal. Periksa koneksi lalu coba lagi.');
        }
      } else if (detail.type === 'download-failed') {
        setIsDownloading(false);
        error('Unduhan gagal. Periksa koneksi lalu coba lagi.');
      } else if (detail.type === 'install-permission-needed') {
        info('Izinkan DigiSwiss-Round memasang aplikasi, lalu kembali dan tekan Pasang.');
      } else if (detail.type === 'ota-download-progress') {
        if (typeof detail.progress === 'number' && detail.progress >= 0) {
          setOtaProgress(detail.progress);
        }
      } else if (detail.type === 'ota-download-complete') {
        setIsDownloading(false);
        setOtaProgress(null);
        setIsOtaReadyToApply(true);
        success(
          'Pembaruan OTA Siap',
          `Paket web v${detail.version || ''} berhasil dipasang. Tekan Muat Ulang untuk menerapkan.`,
          {
            label: 'Muat Ulang',
            onClick: async () => {
              await applyOtaNative();
            }
          }
        );
      } else if (detail.type === 'ota-download-failed') {
        setIsDownloading(false);
        setOtaProgress(null);
        error(detail.message || 'Gagal mengunduh atau mengekstrak paket OTA.');
      }
    });

    return () => {
      unsubscribe();
    };
  }, [success, error, info]);

  // Pemeriksaan versi terpadu (OTA manifest + GitHub Release) dengan satu sumber kebenaran
  const checkForUpdate = useCallback(
    async (forceRefresh = false): Promise<{
      releaseInfo: AppReleaseInfo | null;
      decision: UpdateDecision;
      presentation: UpdatePresentation;
      error: boolean;
    }> => {
      setIsChecking(true);
      try {
        const [relInfo, initialDecision] = await Promise.all([
          checkLatestRelease(undefined, undefined, forceRefresh),
          fetchOtaManifestAndDecide(CURRENT_APP_VERSION)
        ]);

        const releaseOk = Boolean(
          relInfo && !relInfo.error && parseSemver(relInfo.latestVersion)
        );
        const initialManifestOk = Boolean(
          initialDecision.manifest && isValidOtaManifest(initialDecision.manifest)
        );

        let finalDecision = initialDecision;

        // Jika manifest.version < releaseInfo.latestVersion (manifest kemungkinan basi akibat cache),
        // ulangi pengambilan manifest satu kali setelah 3 detik dengan parameter cache-busting
        if (
          initialManifestOk &&
          releaseOk &&
          compareVersions(initialDecision.manifest!.version, relInfo.latestVersion) < 0
        ) {
          await new Promise((resolve) => setTimeout(resolve, 3000));
          const retriedDecision = await fetchOtaManifestAndDecide(
            CURRENT_APP_VERSION,
            undefined,
            undefined,
            { cacheBust: true }
          );
          if (
            retriedDecision.manifest &&
            isValidOtaManifest(retriedDecision.manifest) &&
            compareVersions(retriedDecision.manifest.version, initialDecision.manifest!.version) >= 0
          ) {
            finalDecision = retriedDecision;
          }
        }

        const effectiveNativeVersion =
          finalDecision.nativeVersion ||
          (await getNativeVersionNative()) ||
          nativeVersionRef.current;
        if (effectiveNativeVersion) {
          setNativeVersion(effectiveNativeVersion);
        }

        const finalManifestOk = Boolean(
          finalDecision.manifest && isValidOtaManifest(finalDecision.manifest)
        );

        // Jika semua sumber gagal, jangan timpa data valid sebelumnya dengan nilai "versi saat ini"
        if (!releaseOk && !finalManifestOk) {
          const preservedPresentation = buildUpdatePresentation({
            releaseInfo: releaseInfoRef.current,
            decision: updateDecisionRef.current,
            currentWebVersion: CURRENT_APP_VERSION,
            nativeVersion: effectiveNativeVersion
          });
          return {
            releaseInfo: releaseInfoRef.current,
            decision: finalDecision,
            presentation: preservedPresentation,
            error: true
          };
        }

        const nextReleaseInfo = releaseOk ? relInfo : releaseInfoRef.current;
        const nextDecision = finalDecision;

        if (releaseOk) {
          setReleaseInfo(relInfo);
        }
        setUpdateDecision(nextDecision);

        const nextPresentation = buildUpdatePresentation({
          releaseInfo: nextReleaseInfo,
          decision: nextDecision,
          currentWebVersion: CURRENT_APP_VERSION,
          nativeVersion: effectiveNativeVersion
        });

        return {
          releaseInfo: nextReleaseInfo,
          decision: nextDecision,
          presentation: nextPresentation,
          error: false
        };
      } catch (err) {
        console.warn('Pengecekan versi error:', err);
        const fallbackDecision: UpdateDecision = {
          mode: 'none',
          latestVersion: '',
          currentWebVersion: CURRENT_APP_VERSION,
          minNativeVersion: '1.0',
          nativeVersion: nativeVersionRef.current,
          hasUpdate: false,
          error: true,
          reason: 'Pemeriksaan gagal.'
        };
        const preservedPresentation = buildUpdatePresentation({
          releaseInfo: releaseInfoRef.current,
          decision: updateDecisionRef.current,
          currentWebVersion: CURRENT_APP_VERSION,
          nativeVersion: nativeVersionRef.current
        });
        return {
          releaseInfo: releaseInfoRef.current,
          decision: fallbackDecision,
          presentation: preservedPresentation,
          error: true
        };
      } finally {
        setIsChecking(false);
      }
    },
    []
  );

  // Alur aksi "Update" berdasarkan presentation (OTA atau APK)
  const triggerUpdate = useCallback(async () => {
    if (isDownloadingRef.current) return;

    const currentPresentation = presentationRef.current;
    if (!currentPresentation.visible || currentPresentation.mode === 'none') {
      return;
    }

    const currentDecision = updateDecisionRef.current;

    // Jika mode adalah OTA dan berjalan di Android
    if (currentPresentation.mode === 'ota' && isNativeBridgeAvailable()) {
      setIsDownloading(true);
      setOtaProgress(0);
      try {
        const targetVer = currentDecision?.manifest?.version || currentPresentation.latestVersion;
        const targetSha = currentDecision?.manifest?.sha256 || '';
        info(`Memulai pengunduhan paket web OTA v${targetVer}...`);

        const res = await downloadOtaBundleNative(targetVer, targetSha);
        if (!res.ok) {
          setIsDownloading(false);
          setOtaProgress(null);
          error(res.message || 'Gagal memproses pembaruan OTA.');
        }
      } catch (err: any) {
        setIsDownloading(false);
        setOtaProgress(null);
        error(err?.message || 'Terjadi kesalahan saat mengunduh paket OTA.');
      }
      return;
    }

    // Mode APK
    const downloadUrl =
      currentPresentation.downloadSource ||
      constructReleaseDownloadUrl(currentPresentation.latestVersion);
    if (!downloadUrl) return;

    const fileName = `DigiSwiss-Round-v${currentPresentation.latestVersion}.apk`;

    if (isNativeBridgeAvailable()) {
      setIsDownloading(true);
      const res = await downloadApkNative(downloadUrl, fileName);
      if (!res.ok) {
        setIsDownloading(false);
        error('Unduhan gagal. Periksa koneksi lalu coba lagi.');
      }
    } else {
      // Fallback web browser
      await downloadApkNative(downloadUrl, fileName);
    }
  }, [error, info]);

  // Memuat ulang aplikasi dengan paket OTA aktif
  const applyOta = useCallback(async () => {
    try {
      const res = await applyOtaNative();
      if (!res.ok) {
        error(res.message || 'Gagal memuat ulang paket OTA');
      }
    } catch (err: any) {
      error(err?.message || 'Gagal memuat ulang paket OTA');
    }
  }, [error]);

  // Kembali ke versi bawaan APK
  const resetToDefault = useCallback(async () => {
    try {
      const res = await resetToDefaultAssetsNative();
      if (res.ok) {
        success('Berhasil', 'Aplikasi dimuat ulang menggunakan aset bawaan APK.');
        setIsOtaActive(false);
      } else {
        error(res.message || 'Gagal mereset ke versi bawaan');
      }
    } catch (err: any) {
      error(err?.message || 'Gagal mereset ke versi bawaan');
    }
  }, [success, error]);

  // Pengecekan saat aplikasi dibuka dan saat kembali aktif (visibilitychange)
  useEffect(() => {
    checkForUpdate(false);

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        checkForUpdate(false);
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [checkForUpdate]);

  return (
    <UpdateContext.Provider
      value={{
        releaseInfo,
        updateDecision,
        presentation,
        isChecking,
        isDownloading,
        otaProgress,
        isOtaReadyToApply,
        isOtaActive,
        nativeVersion,
        isPopupDismissed,
        isBannerDismissed,
        dismissPopup,
        dismissBanner,
        checkForUpdate,
        triggerUpdate,
        applyOta,
        resetToDefault,
        resetPopupOnNewLogin
      }}
    >
      {children}
    </UpdateContext.Provider>
  );
};

export const useUpdate = (): UpdateContextType => {
  const context = useContext(UpdateContext);
  if (!context) {
    throw new Error('useUpdate must be used within an UpdateProvider');
  }
  return context;
};
