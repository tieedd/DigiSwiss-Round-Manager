import React, { useEffect, useState } from 'react';
import { Wifi, WifiOff } from 'lucide-react';

interface OnlineIndicatorProps {
  className?: string;
  showText?: boolean;
}

export const OnlineIndicator: React.FC<OnlineIndicatorProps> = ({ className = '', showText = false }) => {
  const [isOnline, setIsOnline] = useState<boolean>(
    typeof navigator !== 'undefined' ? navigator.onLine : true
  );

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  return (
    <div
      className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-md text-caption ${
        isOnline ? 'text-status-green bg-status-green/10' : 'text-status-yellow bg-status-yellow/10'
      } ${className}`}
      title={isOnline ? 'Terhubung (Online)' : 'Mode Offline (Cache Aktif)'}
    >
      <span className={`w-1.5 h-1.5 rounded-full ${isOnline ? 'bg-status-green' : 'bg-status-yellow'}`} />
      {isOnline ? (
        <Wifi size={14} className="stroke-[1.5]" />
      ) : (
        <WifiOff size={14} className="stroke-[1.5]" />
      )}
      {showText && (
        <span className="font-medium text-[11px] leading-none">
          {isOnline ? 'Online' : 'Offline'}
        </span>
      )}
    </div>
  );
};
