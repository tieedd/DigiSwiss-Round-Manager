export const DEFAULT_MODAL_TOP_MARGIN = 8;
export const DEFAULT_MODAL_BOTTOM_MARGIN = 12;
export const MIN_MODAL_MAX_HEIGHT = 200;

export const MODAL_MAX_HEIGHT_CSS_FALLBACK =
  'calc(100dvh - env(safe-area-inset-top, 0px) - env(safe-area-inset-bottom, 0px) - 20px)';

export interface ModalViewportSizingInput {
  viewportHeight: number;
  safeTop?: number;
  safeBottom?: number;
  topMargin?: number;
  bottomMargin?: number;
  minHeight?: number;
}

function sanitizeNonNegative(value: number | undefined | null, fallback = 0): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return fallback;
  }
  return Math.max(0, value);
}

/**
 * Menghitung tinggi maksimum kartu modal (dalam piksel) berdasarkan tinggi viewport
 * yang terlihat (visualViewport / innerHeight), dikurangi inset aman atas/bawah
 * serta margin atas/bawah.
 *
 * Aturan keamanan nilai:
 * - Hasil tidak pernah negatif maupun NaN/Infinity.
 * - Nilai inset/margin negatif dianggap 0 agar tidak melampaui viewport.
 * - Jika tinggi viewport <= 0 atau tidak valid, kembalikan batas minimum yang masuk akal.
 * - Jika viewport positif tetapi sempit karena inset besar, hasil dibatasi minimal
 *   `minHeight` selama tidak melebihi `viewportHeight`.
 */
export function calculateModalMaxHeight(input: ModalViewportSizingInput): number {
  const minHeight = sanitizeNonNegative(input.minHeight, MIN_MODAL_MAX_HEIGHT);
  const effectiveMin = minHeight > 0 ? minHeight : MIN_MODAL_MAX_HEIGHT;

  if (
    typeof input.viewportHeight !== 'number' ||
    !Number.isFinite(input.viewportHeight) ||
    input.viewportHeight <= 0
  ) {
    return effectiveMin;
  }

  const viewportHeight = Math.floor(input.viewportHeight);
  const safeTop = sanitizeNonNegative(input.safeTop, 0);
  const safeBottom = sanitizeNonNegative(input.safeBottom, 0);
  const topMargin = sanitizeNonNegative(
    input.topMargin,
    DEFAULT_MODAL_TOP_MARGIN
  );
  const bottomMargin = sanitizeNonNegative(
    input.bottomMargin,
    DEFAULT_MODAL_BOTTOM_MARGIN
  );

  const rawAvailable = Math.floor(
    viewportHeight - safeTop - safeBottom - topMargin - bottomMargin
  );

  const boundedMin = Math.min(viewportHeight, effectiveMin);
  return Math.max(boundedMin, rawAvailable);
}

/**
 * Memformat tinggi maksimum menjadi nilai CSS px, atau fallback `100dvh`
 * apabila ukuran piksel belum tersedia.
 */
export function resolveModalMaxHeightCss(maxHeightPx: number | null | undefined): string {
  if (
    typeof maxHeightPx === 'number' &&
    Number.isFinite(maxHeightPx) &&
    maxHeightPx > 0
  ) {
    return `${Math.floor(maxHeightPx)}px`;
  }
  return MODAL_MAX_HEIGHT_CSS_FALLBACK;
}
