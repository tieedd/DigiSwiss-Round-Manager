import { setSystemBarsStyleNative } from '../services/nativeBridge.ts';

export type AppTheme = 'dark' | 'light';

export const THEME_STORAGE_KEY = 'digiswiss-theme';

/**
 * Menentukan tema awal berdasarkan preferensi yang tersimpan atau preferensi sistem operasi
 */
export function determineInitialTheme(
  storedTheme: string | null | undefined,
  systemPrefersLight = false
): AppTheme {
  if (storedTheme === 'light' || storedTheme === 'dark') {
    return storedTheme;
  }
  return systemPrefersLight ? 'light' : 'dark';
}

/**
 * Menerapkan tema ke elemen DOM root, meta theme-color, localStorage, dan status bar Android
 */
export function applyThemeToDom(theme: AppTheme): void {
  if (typeof document === 'undefined') return;

  const isLight = theme === 'light';
  if (isLight) {
    document.documentElement.setAttribute('data-theme', 'light');
  } else {
    document.documentElement.removeAttribute('data-theme');
  }

  // Update meta theme-color
  const metaThemeColor = document.querySelector('meta[name="theme-color"]');
  if (metaThemeColor) {
    metaThemeColor.setAttribute('content', isLight ? '#F6F8FB' : '#0B0F14');
  }

  // Simpan ke localStorage
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(THEME_STORAGE_KEY, theme);
    }
  } catch (e) {
    console.warn('Gagal menyimpan tema ke localStorage:', e);
  }

  // Sinkronkan ke bilah sistem Android
  setSystemBarsStyleNative(!isLight);
}

/**
 * Mengambil tema yang sedang aktif saat ini
 */
export function getCurrentTheme(): AppTheme {
  if (typeof document === 'undefined') return 'dark';
  return document.documentElement.getAttribute('data-theme') === 'light' ? 'light' : 'dark';
}
