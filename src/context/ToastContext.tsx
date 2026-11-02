import React, { createContext, useContext, useState, useRef, useEffect, useCallback } from 'react';
import { CheckCircle2, AlertCircle, Info, X } from 'lucide-react';

export type ToastType = 'success' | 'error' | 'info';

export interface ToastAction {
  label: string;
  onClick: () => void;
}

export interface ToastData {
  id: string;
  type: ToastType;
  title: string;
  description?: string;
  action?: ToastAction;
  durationMs?: number;
}

interface ToastContextType {
  toast: ToastData | null;
  showToast: (data: Omit<ToastData, 'id'>) => void;
  success: (title: string, description?: string, action?: ToastAction) => void;
  error: (title: string, description?: string, action?: ToastAction) => void;
  info: (title: string, description?: string, action?: ToastAction) => void;
  dismissToast: () => void;
}

const ToastContext = createContext<ToastContextType | undefined>(undefined);

export const useToast = (): ToastContextType => {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error('useToast harus digunakan di dalam ToastProvider');
  }
  return context;
};

export const AppToastProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [toast, setToast] = useState<ToastData | null>(null);
  const [isPaused, setIsPaused] = useState(false);
  const remainingTimeRef = useRef<number>(5000);
  const startTimeRef = useRef<number>(Date.now());
  const timerRef = useRef<any>(null);

  const dismissToast = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    setToast(null);
    setIsPaused(false);
  }, []);

  const startTimer = useCallback((duration: number) => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
    }
    remainingTimeRef.current = duration;
    startTimeRef.current = Date.now();

    timerRef.current = setTimeout(() => {
      dismissToast();
    }, duration);
  }, [dismissToast]);

  const showToast = useCallback(
    (data: Omit<ToastData, 'id'>) => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }

      const duration = data.durationMs || 5000;
      const newToast: ToastData = {
        ...data,
        id: `toast_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
        durationMs: duration
      };

      setToast(newToast);
      setIsPaused(false);
      startTimer(duration);
    },
    [startTimer]
  );

  const success = useCallback(
    (title: string, description?: string, action?: ToastAction) => {
      showToast({ type: 'success', title, description, action });
    },
    [showToast]
  );

  const error = useCallback(
    (title: string, description?: string, action?: ToastAction) => {
      showToast({ type: 'error', title, description, action });
    },
    [showToast]
  );

  const info = useCallback(
    (title: string, description?: string, action?: ToastAction) => {
      showToast({ type: 'info', title, description, action });
    },
    [showToast]
  );

  const pauseTimer = () => {
    if (isPaused || !toast) return;
    setIsPaused(true);
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    const elapsed = Date.now() - startTimeRef.current;
    remainingTimeRef.current = Math.max(200, remainingTimeRef.current - elapsed);
  };

  const resumeTimer = () => {
    if (!isPaused || !toast) return;
    setIsPaused(false);
    startTimer(remainingTimeRef.current);
  };

  useEffect(() => {
    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }
    };
  }, []);

  return (
    <ToastContext.Provider value={{ toast, showToast, success, error, info, dismissToast }}>
      {children}
      {/* Toast Render Component */}
      {toast && (
        <div
          role="status"
          aria-live="polite"
          className="fixed left-4 right-4 max-w-md mx-auto pointer-events-none z-[70] transition-all duration-200"
          style={{
            bottom: 'calc(4.5rem + env(safe-area-inset-bottom, 0px))'
          }}
        >
          <div
            onMouseEnter={pauseTimer}
            onMouseLeave={resumeTimer}
            onTouchStart={pauseTimer}
            onTouchEnd={resumeTimer}
            className="pointer-events-auto relative overflow-hidden bg-dark-surface/95 backdrop-blur border border-dark-border rounded-xl shadow-2xl p-3.5 flex flex-col gap-2.5 animate-fade-in"
          >
            <div className="flex items-start justify-between gap-3">
              {/* Ikon Status */}
              <div className="flex-shrink-0 mt-0.5">
                {toast.type === 'success' && (
                  <CheckCircle2 size={18} className="text-status-green" />
                )}
                {toast.type === 'error' && (
                  <AlertCircle size={18} className="text-status-red" />
                )}
                {toast.type === 'info' && (
                  <Info size={18} className="text-accent" />
                )}
              </div>

              {/* Teks: Judul & Keterangan */}
              <div className="flex-1 min-w-0">
                <p className="text-caption font-semibold text-dark-text leading-tight">
                  {toast.title}
                </p>
                {toast.description && (
                  <p className="text-[12px] text-dark-muted mt-0.5 leading-snug line-clamp-2">
                    {toast.description}
                  </p>
                )}
              </div>

              {/* Tombol Tutup (X) */}
              <button
                type="button"
                onClick={dismissToast}
                className="text-dark-muted hover:text-dark-text p-1 -mr-1 -mt-1 rounded-full transition-colors flex-shrink-0 hover:bg-white/5 active:bg-white/10"
                aria-label="Tutup notifikasi"
              >
                <X size={15} />
              </button>
            </div>

            {/* Tombol Aksi Opsional */}
            {toast.action && (
              <div className="flex justify-end pt-0.5">
                <button
                  type="button"
                  onClick={() => {
                    toast.action?.onClick();
                    dismissToast();
                  }}
                  className="px-3 py-1.5 rounded bg-accent text-dark-bg font-semibold text-[11px] hover:bg-accent/90 active:scale-95 transition-all shadow-sm"
                >
                  {toast.action.label}
                </button>
              </div>
            )}

            {/* Bilah waktu tipis di tepi bawah */}
            <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-dark-border/40 overflow-hidden">
              <div
                className={`h-full bg-accent transition-all ${
                  isPaused ? 'opacity-70' : 'opacity-100'
                }`}
                style={{
                  width: '100%',
                  animationName: 'toast-shrink',
                  animationDuration: `${toast.durationMs || 5000}ms`,
                  animationTimingFunction: 'linear',
                  animationFillMode: 'forwards',
                  animationPlayState: isPaused ? 'paused' : 'running'
                }}
              />
            </div>
          </div>
        </div>
      )}
    </ToastContext.Provider>
  );
};
