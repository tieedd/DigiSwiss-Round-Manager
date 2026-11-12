import React from 'react';
import { useUpdate } from '../../context/UpdateContext.tsx';
import { compareVersions } from '../../services/versionService.ts';
import { getUpdateModeLabel } from '../../services/otaService.ts';
import { Button } from './Button.tsx';
import { Sparkles, Download, RefreshCw, Zap } from 'lucide-react';

export const UpdateModal: React.FC = () => {
  const {
    releaseInfo,
    presentation,
    isPopupDismissed,
    isDownloading,
    otaProgress,
    isOtaReadyToApply,
    dismissPopup,
    triggerUpdate,
    applyOta
  } = useUpdate();

  // Hanya tampil bila presentation menyatakan ada pembaruan valid dan belum ditutup di sesi ini
  if (!presentation.visible || presentation.mode === 'none' || isPopupDismissed) {
    return null;
  }

  const latestVer = presentation.latestVersion;
  const currentVer = presentation.currentVersionLabel;
  const isOtaMode = presentation.mode === 'ota';
  const modeLabel = getUpdateModeLabel(presentation.mode);

  const showReleaseNotes = Boolean(
    releaseInfo &&
      !releaseInfo.error &&
      releaseInfo.releaseNotes &&
      releaseInfo.releaseNotes.trim() &&
      compareVersions(releaseInfo.latestVersion || '', latestVer) === 0
  );

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="update-dialog-title"
      className="fixed inset-0 z-50 bg-black/75 backdrop-blur-xs flex items-center justify-center p-4 animate-fade-in"
      onClick={(e) => e.stopPropagation()}
    >
      <div
        className="w-full max-w-sm bg-dark-surface border border-dark-border rounded-2xl p-5 shadow-2xl flex flex-col gap-4 text-center select-none"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Ikon Header */}
        <div className="w-12 h-12 rounded-full bg-accent/15 text-accent border border-accent/30 mx-auto flex items-center justify-center flex-shrink-0">
          {isOtaMode ? (
            <Zap size={24} className="stroke-[1.75] text-accent animate-pulse" />
          ) : (
            <Sparkles size={24} className="stroke-[1.75] animate-pulse" />
          )}
        </div>

        {/* Teks Judul dan Versi */}
        <div className="flex flex-col gap-1">
          <h3 id="update-dialog-title" className="text-section-title font-bold text-dark-text">
            Versi terbaru telah rilis
          </h3>
          <p className="text-body text-dark-muted">
            v{latestVer} tersedia. Versi Anda: v{currentVer}
          </p>
          <div className="mt-1">
            {isOtaMode ? (
              <span className="inline-block px-2.5 py-0.5 rounded-full text-[11px] font-medium bg-info/10 text-info border border-info/30">
                {modeLabel}
              </span>
            ) : (
              <span className="inline-block px-2.5 py-0.5 rounded-full text-[11px] font-medium bg-accent/10 text-accent border border-accent/30">
                {modeLabel}
              </span>
            )}
          </div>
        </div>

        {/* Progress bar OTA saat sedang mengunduh */}
        {isDownloading && isOtaMode && typeof otaProgress === 'number' && (
          <div className="flex flex-col gap-1.5 p-3 rounded-xl bg-dark-surface-high/70 border border-dark-border text-left">
            <div className="flex items-center justify-between text-caption">
              <span className="text-dark-text font-medium">Mengunduh paket web...</span>
              <span className="font-mono text-accent font-semibold">{otaProgress}%</span>
            </div>
            <div className="w-full h-2 rounded-full bg-dark-border overflow-hidden">
              <div
                className="h-full bg-accent transition-all duration-200 rounded-full"
                style={{ width: `${Math.max(5, otaProgress)}%` }}
              />
            </div>
          </div>
        )}

        {/* Catatan Rilis Singkat (Maks 3 baris bisa digulir) */}
        {showReleaseNotes && (
          <div className="bg-dark-surface-high/60 border border-dark-border/80 rounded-lg p-2.5 text-left text-caption text-dark-muted max-h-20 overflow-y-auto whitespace-pre-wrap leading-relaxed">
            {releaseInfo!.releaseNotes!.trim()}
          </div>
        )}

        {/* Tombol Aksi */}
        <div className="flex flex-col gap-2 mt-1">
          {isOtaReadyToApply ? (
            <Button
              variant="primary"
              fullWidth
              onClick={applyOta}
              icon={<RefreshCw size={18} />}
            >
              Muat Ulang Sekarang
            </Button>
          ) : (
            <Button
              variant="primary"
              fullWidth
              onClick={triggerUpdate}
              disabled={isDownloading}
              isLoading={isDownloading}
              icon={!isDownloading ? <Download size={18} /> : undefined}
            >
              {isDownloading
                ? isOtaMode
                  ? `Mengunduh... ${otaProgress !== null ? `${otaProgress}%` : ''}`
                  : 'Mengunduh APK...'
                : 'Update'}
            </Button>
          )}

          {!isOtaReadyToApply && (
            <Button
              variant="secondary"
              fullWidth
              onClick={dismissPopup}
              disabled={isDownloading}
            >
              Lain kali
            </Button>
          )}
        </div>
      </div>
    </div>
  );
};
