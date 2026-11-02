import React, { useState, useEffect, useRef } from 'react';
import { checkLatestRelease, AppReleaseInfo, isUpdateAvailable } from '../../services/versionService';
import { Download, X, Sparkles } from 'lucide-react';

export const UpdateNotificationBanner: React.FC = () => {
  const [releaseInfo, setReleaseInfo] = useState<AppReleaseInfo | null>(null);
  const [dismissed, setDismissed] = useState(false);
  const textRef = useRef<HTMLSpanElement>(null);
  const [animationDuration, setAnimationDuration] = useState(16);

  useEffect(() => {
    let isMounted = true;

    const performCheck = async () => {
      try {
        const info = await checkLatestRelease();
        if (isMounted) {
          if (info.hasUpdate && isUpdateAvailable(info.latestVersion, info.currentVersion)) {
            setReleaseInfo(info);
          } else {
            setReleaseInfo(null);
          }
        }
      } catch {
        // Gagal diam-diam jika offline atau ada kesalahan jaringan
      }
    };

    // Pengecekan saat aplikasi dibuka
    performCheck();

    // Pengecekan saat aplikasi kembali aktif dari latar belakang (visibilitychange)
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        performCheck();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      isMounted = false;
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, []);

  // Format teks berjalan
  const releaseNameExtra =
    releaseInfo?.releaseName &&
    releaseInfo.releaseName.toLowerCase() !== `versi ${releaseInfo.latestVersion}`.toLowerCase() &&
    releaseInfo.releaseName.toLowerCase() !== `v${releaseInfo.latestVersion}`.toLowerCase()
      ? ` — ${releaseInfo.releaseName}`
      : '';

  const marqueeText = releaseInfo
    ? `Versi baru v${releaseInfo.latestVersion} tersedia! Versi Anda saat ini v${releaseInfo.currentVersion}. Perbarui sekarang untuk mendapat perbaikan dan fitur terbaru.${releaseNameExtra}`
    : '';

  // Hitung durasi animasi berdasarkan panjang teks agar kecepatan stabil ~40px per detik (minimal 12 detik)
  useEffect(() => {
    if (!marqueeText) return;
    if (textRef.current) {
      const measuredWidth = textRef.current.offsetWidth;
      // 40 piksel per detik, minimal 12 detik
      const calculatedDuration = Math.max(12, Math.round(measuredWidth / 40));
      setAnimationDuration(calculatedDuration);
    } else {
      // Estimasi kasar berdasarkan karakter jika ref belum terukur (~7.5px per karakter + 48px gap)
      const approxWidth = marqueeText.length * 7.5 + 48;
      setAnimationDuration(Math.max(12, Math.round(approxWidth / 40)));
    }
  }, [marqueeText]);

  // Banner hanya dirender bila isUpdateAvailable bernilai true dan belum ditutup
  if (
    !releaseInfo ||
    !releaseInfo.hasUpdate ||
    !isUpdateAvailable(releaseInfo.latestVersion, releaseInfo.currentVersion) ||
    dismissed
  ) {
    return null;
  }

  return (
    <div
      role="alert"
      className="w-full bg-accent/15 border-b border-accent/30 text-dark-text px-3 flex items-center justify-between gap-2.5 text-caption h-11 max-h-11 min-h-[40px] flex-shrink-0 select-none animate-fade-in z-20"
    >
      {/* Ikon kiri diam */}
      <div className="flex-shrink-0 flex items-center pl-0.5">
        <Sparkles size={16} className="text-accent animate-pulse" />
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
          {/* Salinan teks kedua (dipisah jarak tetap pr-12 untuk perulangan mulus tanpa jeda) */}
          <span
            aria-hidden="true"
            className="marquee-duplicate inline-block pr-12 text-caption text-dark-text font-normal"
          >
            {marqueeText}
          </span>
        </div>
      </div>

      {/* Tombol "Unduh APK" dan tutup (X) tetap diam di kanan */}
      <div className="flex items-center gap-1.5 flex-shrink-0">
        <a
          href={releaseInfo.downloadUrl || releaseInfo.htmlUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-1 px-2.5 py-1 rounded bg-accent text-dark-bg font-semibold text-[11px] hover:bg-accent/90 transition-colors shadow-sm active:scale-95"
        >
          <Download size={12} />
          <span>Unduh APK</span>
        </a>
        <button
          type="button"
          onClick={() => setDismissed(true)}
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
