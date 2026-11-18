import { useState, useEffect, useCallback } from 'react';
import {
  calculateModalMaxHeight,
  DEFAULT_MODAL_BOTTOM_MARGIN,
  DEFAULT_MODAL_TOP_MARGIN,
  MIN_MODAL_MAX_HEIGHT,
  resolveModalMaxHeightCss,
} from './viewportSizing';

export interface VisibleViewportMetrics {
  viewportHeight: number;
  safeTop: number;
  safeBottom: number;
  maxHeightPx: number;
  maxHeightCss: string;
}

function readRawViewportHeight(): number {
  if (typeof window === 'undefined') return 0;
  const vvHeight = window.visualViewport?.height;
  if (typeof vvHeight === 'number' && Number.isFinite(vvHeight) && vvHeight > 0) {
    return vvHeight;
  }
  return typeof window.innerHeight === 'number' && Number.isFinite(window.innerHeight)
    ? window.innerHeight
    : 0;
}

function readSafeAreaInsetsPx(): { safeTop: number; safeBottom: number } {
  if (typeof window === 'undefined' || typeof document === 'undefined' || !document.body) {
    return { safeTop: 0, safeBottom: 0 };
  }
  try {
    const probe = document.createElement('div');
    probe.style.position = 'fixed';
    probe.style.visibility = 'hidden';
    probe.style.pointerEvents = 'none';
    probe.style.top = '0';
    probe.style.left = '0';
    probe.style.width = '0';
    probe.style.height = '0';
    probe.style.paddingTop = 'env(safe-area-inset-top, 0px)';
    probe.style.paddingBottom = 'env(safe-area-inset-bottom, 0px)';
    document.body.appendChild(probe);
    const computed = window.getComputedStyle(probe);
    const safeTop = parseFloat(computed.paddingTop) || 0;
    const safeBottom = parseFloat(computed.paddingBottom) || 0;
    document.body.removeChild(probe);
    return { safeTop, safeBottom };
  } catch {
    return { safeTop: 0, safeBottom: 0 };
  }
}

export function measureVisibleViewportMetrics(options?: {
  topMargin?: number;
  bottomMargin?: number;
  minHeight?: number;
}): VisibleViewportMetrics {
  const viewportHeight = readRawViewportHeight();
  const { safeTop, safeBottom } = readSafeAreaInsetsPx();
  const maxHeightPx = calculateModalMaxHeight({
    viewportHeight,
    safeTop,
    safeBottom,
    topMargin: options?.topMargin ?? DEFAULT_MODAL_TOP_MARGIN,
    bottomMargin: options?.bottomMargin ?? DEFAULT_MODAL_BOTTOM_MARGIN,
    minHeight: options?.minHeight ?? MIN_MODAL_MAX_HEIGHT,
  });

  return {
    viewportHeight,
    safeTop,
    safeBottom,
    maxHeightPx,
    maxHeightCss: viewportHeight > 0 ? resolveModalMaxHeightCss(maxHeightPx) : resolveModalMaxHeightCss(null),
  };
}

/**
 * Mengikuti perubahan tinggi viewport yang terlihat (termasuk saat keyboard WebView muncul/sembunyi
 * atau orientasi layar berubah) dan mengembalikan `maxHeightCss` untuk kartu modal.
 */
export function useVisibleViewportHeight(
  isOpen: boolean,
  options?: {
    topMargin?: number;
    bottomMargin?: number;
    minHeight?: number;
  }
): VisibleViewportMetrics {
  const topMargin = options?.topMargin ?? DEFAULT_MODAL_TOP_MARGIN;
  const bottomMargin = options?.bottomMargin ?? DEFAULT_MODAL_BOTTOM_MARGIN;
  const minHeight = options?.minHeight ?? MIN_MODAL_MAX_HEIGHT;

  const [metrics, setMetrics] = useState<VisibleViewportMetrics>(() =>
    measureVisibleViewportMetrics({ topMargin, bottomMargin, minHeight })
  );

  const updateMetrics = useCallback(() => {
    setMetrics(
      measureVisibleViewportMetrics({ topMargin, bottomMargin, minHeight })
    );
  }, [topMargin, bottomMargin, minHeight]);

  useEffect(() => {
    if (!isOpen || typeof window === 'undefined') return;

    updateMetrics();

    const vv = window.visualViewport;
    window.addEventListener('resize', updateMetrics);
    window.addEventListener('orientationchange', updateMetrics);
    vv?.addEventListener('resize', updateMetrics);

    return () => {
      window.removeEventListener('resize', updateMetrics);
      window.removeEventListener('orientationchange', updateMetrics);
      vv?.removeEventListener('resize', updateMetrics);
    };
  }, [isOpen, updateMetrics]);

  return metrics;
}

/**
 * Memastikan kolom input yang fokus tetap terlihat di tengah area scroll
 * termasuk setelah keyboard Android WebView selesai muncul.
 */
export function scrollFocusedInputIntoView(target: EventTarget | null): void {
  if (!(target instanceof HTMLElement)) return;
  try {
    target.scrollIntoView({ behavior: 'smooth', block: 'center' });
    if (typeof window !== 'undefined') {
      window.setTimeout(() => {
        if (target.isConnected) {
          target.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
      }, 200);
    }
  } catch {
    // Abaikan bila lingkungan tidak mendukung scrollIntoView options
  }
}
