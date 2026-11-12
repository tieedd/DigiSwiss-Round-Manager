import React, { useRef, useEffect, useState } from 'react';
import { useUpdate } from '../../context/UpdateContext.tsx';
import { isUpdateAvailable } from '../../services/versionService.ts';
import { Download, X, Sparkles, Loader2, RefreshCw, Zap } from 'lucide-react';

export const UpdateNotificationBanner: React.FC = () => {
  const {
    releaseInfo,
    updateDecision,
    isBannerDismissed,
    isDownloading,
    otaProgress,
    isOtaReadyToApply,
    dismissBanner,
    triggerUpdate,
    applyOta
  } = useUpdate();

  const textRef = useRef<HTMLSpanElement>(null);
  const [animationDuration, setAnimationDuration] = useState(16);

  const hasUpdate = Boolean(
    (releaseInfo?.hasUpdate && isUpdateAvailable(releaseInfo.latestVersion, releaseInfo.currentVersion)) ||
    updateDecision?.hasUpdate
  );

  const latestVer = updateDecision?.latestVersion || releaseInfo?.latestVersion || '';
  const currentVer = updateDecision?.currentWebVersion || releaseInfo?.currentVersion || '';
  const isOtaMode = updateDecision?.mode === 'ota';

  // Format teks berjalan
  const releaseNameExtra =
    releaseInfo?.releaseName &&
    releaseInfo.releaseName.toLowerCase() !== `versi ${latestVer}`.toLowerCase() &&
    releaseInfo.releaseName.toLowerCase() !== `v${latestVer}`.toLowerCase()
      ? ` — ${releaseInfo.releaseName}`
      : '';

  const marqueeText = hasUpdate
    ? `Versi baru v${latestVer} tersedia (${isOtaMode ? 'OTA web' : 'perlu APK baru'})! Versi Anda saat ini v${currentVer}. Perbarui sekarang untuk mendapat perbaikan dan fitur terbaru.${releaseNameExtra}`
    : '';

  // Hitung durasi animasi berdasarkan panjang teks agar kecepatan stabil ~40px per detik (minimal 12 detik)
  useEffect(() => {
    if (!marqueeText) return;
    if (textRef.current) {
      const measuredWidth = textRef.current.offsetWidth;
      const calculatedDuration = Math.max(12, Math.round(measuredWidth / 40));
      setAnimationDuration(calculatedDuration);
    } else {
      const approxWidth = marqueeText.length * 7.5 + 48;
      setAnimationDuration(Math.max(12, Math.round(approxWidth / 40)));
    }
  }, [marqueeText]);

  // Banner hanya dirender bila ada pembaruan dan belum ditutup
  if (!hasUpdate || isBannerDismissed) {
    return null;
  }

  return (
    <div
      role="alert"
      className="w-full bg-accent/15 border-b border-accent/30 text-dark-text px-3 flex items-center justify-between gap-2.5 text-caption h-11 max-h-11 min-h-[40px] flex-shrink-0 select-none animate-fade-in z-20"
    >
      {/* Ikon kiri diam */}
      <div className="flex-shrink-0 flex items-center pl-0.5">
        {isOtaMode ? (
          <Zap size={16} className="text-accent animate-pulse" />
        ) : (
          <Sparkles size={16} className="text-accent animate-pulse" />
        )}
      </div>

      {/* Kontainer Marquee overflow-hidden dengan efek pudar halus di tepi kiri dan kanan */}
      <div
        className="flex-1 overflow-hidden min-w-0 marquee-container relative h-full flex items-center"
        style={{
          WebkitMaskImage:
            'linear-gradient(to right, transparent, black 16px, black calc(100% - 16px), transparent)',
          maskImage:
            'linear-gradient(to right, transparent, black 16px, black calc(100% - 16px), transparent)',
        }}
      >
        <div
          className="marquee-track inline-flex whitespace-nowrap cursor-default"
          style={{
            animationDuration: `${animationDuration}s`,
          }}
        >
          {/* Salinan teks pertama */}
          <span
            ref={textRef}
            className="inline-block pr-12 text-caption text-dark-text font-normal"
          >
            {marqueeText}
          </span>
          {/* Salinan teks kedua */}
          <span
            aria-hidden="true"
            className="marquee-duplicate inline-block pr-12 text-caption text-dark-text font-normal"
          >
            {marqueeText}
          </span>
        </div>
      </div>

      {/* Tombol Aksi: Muat Ulang atau Update */}
      <div className="flex items-center gap-1.5 flex-shrink-0">
        {isOtaReadyToApply ? (
          <button
            type="button"
            onClick={applyOta}
            title="Muat ulang paket OTA yang telah diunduh"
            aria-label="Muat ulang aplikasi"
            className="flex items-center gap-1 px-2.5 py-1 rounded bg-accent text-dark-bg font-semibold text-[11px] hover:bg-accent/90 transition-colors shadow-sm active:scale-95"
          >
            <RefreshCw size={12} />
            <span>Muat Ulang</span>
          </button>
        ) : (
          <button
            type="button"
            onClick={triggerUpdate}
            disabled={isDownloading}
            title="Update aplikasi ke versi terbaru"
            aria-label="Update aplikasi"
            className={`flex items-center gap-1 px-2.5 py-1 rounded bg-accent text-dark-bg font-semibold text-[11px] hover:bg-accent/90 transition-colors shadow-sm active:scale-95 ${
              isDownloading ? 'opacity-70 cursor-not-allowed' : ''
            }`}
          >
            {isDownloading ? (
              <>
                <Loader2 size={12} className="animate-spin" />
                <span>
                  {isOtaMode && otaProgress !== null
                    ? `${otaProgress}%`
                    : 'Mengunduh...'}
                </span>
              </>
            ) : (
              <>
                <Download size={12} />
                <span>Update</span>
              </>
            )}
          </button>
        )}

        <button
          type="button"
          onClick={dismissBanner}
          className="text-dark-muted hover:text-dark-text p-1 transition-colors rounded-full hover:bg-white/5 active:bg-white/10"
          title="Tutup pemberitahuan"
          aria-label="Tutup pemberitahuan"
        >
          <X size={15} />
        </button>
      </div>
    </div>
  );
};
