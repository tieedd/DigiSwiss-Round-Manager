import React, { useState, useEffect } from 'react';
import { checkLatestRelease, AppReleaseInfo } from '../../services/versionService';
import { Download, X, Sparkles } from 'lucide-react';

export const UpdateNotificationBanner: React.FC = () => {
  const [releaseInfo, setReleaseInfo] = useState<AppReleaseInfo | null>(null);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    let isMounted = true;
    checkLatestRelease()
      .then((info) => {
        if (isMounted && info.hasUpdate) {
          setReleaseInfo(info);
        }
      })
      .catch(() => {
        // Gagal diam-diam jika offline
      });

    return () => {
      isMounted = false;
    };
  }, []);

  if (!releaseInfo || !releaseInfo.hasUpdate || dismissed) {
    return null;
  }

  return (
    <div className="w-full bg-accent/15 border-b border-accent/30 text-dark-text px-4 py-2 flex items-center justify-between gap-3 text-caption animate-fade-in">
      <div className="flex items-center gap-2 min-w-0">
        <Sparkles size={16} className="text-accent flex-shrink-0 animate-pulse" />
        <span className="truncate">
          Versi baru <strong className="text-accent">v{releaseInfo.latestVersion}</strong> tersedia! (Saat ini: v{releaseInfo.currentVersion})
        </span>
      </div>

      <div className="flex items-center gap-2 flex-shrink-0">
        <a
          href={releaseInfo.downloadUrl || releaseInfo.htmlUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-1 px-2.5 py-1 rounded bg-accent text-dark-bg font-semibold text-[11px] hover:bg-accent/90 transition-colors shadow-sm"
        >
          <Download size={12} />
          <span>Unduh APK</span>
        </a>
        <button
          type="button"
          onClick={() => setDismissed(true)}
          className="text-dark-muted hover:text-dark-text p-1 transition-colors"
          title="Tutup pemberitahuan"
        >
          <X size={14} />
        </button>
      </div>
    </div>
  );
};
