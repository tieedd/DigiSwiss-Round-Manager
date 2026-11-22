import { useEffect, useRef } from 'react';
import type { UserRole } from '../types/index.ts';

export const DOUBLE_BACK_EXIT_WINDOW_MS = 2000;
export const EXIT_TOAST_MESSAGE = 'Tekan sekali lagi untuk keluar';

export interface BackLayerOptions {
  blocked?: boolean;
}

interface BackLayerEntry {
  id: string;
  onClose: () => void;
  blocked: boolean;
}

export interface BackStack {
  register: (onClose: () => void, options?: BackLayerOptions) => string;
  unregister: (id: string) => boolean;
  update: (id: string, patch: { onClose?: () => void; blocked?: boolean }) => boolean;
  handleBack: () => boolean;
  size: () => number;
  clear: () => void;
}

/**
 * Membuat instance stack LIFO penutup lapisan UI (modal, BottomSheet, overlay).
 */
export function createBackStack(): BackStack {
  const stack: BackLayerEntry[] = [];
  let seq = 0;

  const register = (onClose: () => void, options?: BackLayerOptions): string => {
    seq += 1;
    const id = `layer_${seq}`;
    stack.push({
      id,
      onClose,
      blocked: Boolean(options?.blocked),
    });
    return id;
  };

  const unregister = (id: string): boolean => {
    if (!id) return false;
    const idx = stack.findIndex((entry) => entry.id === id);
    if (idx === -1) return false;
    stack.splice(idx, 1);
    return true;
  };

  const update = (
    id: string,
    patch: { onClose?: () => void; blocked?: boolean }
  ): boolean => {
    const entry = stack.find((item) => item.id === id);
    if (!entry) return false;
    if (typeof patch.onClose === 'function') {
      entry.onClose = patch.onClose;
    }
    if (typeof patch.blocked === 'boolean') {
      entry.blocked = patch.blocked;
    }
    return true;
  };

  const handleBack = (): boolean => {
    if (stack.length === 0) {
      return false;
    }

    const top = stack[stack.length - 1];
    if (top.blocked) {
      return true;
    }

    stack.pop();
    top.onClose();
    return true;
  };

  const size = (): number => stack.length;

  const clear = (): void => {
    stack.length = 0;
  };

  return {
    register,
    unregister,
    update,
    handleBack,
    size,
    clear,
  };
}

export const defaultBackStack = createBackStack();

export function registerBackLayer(
  onClose: () => void,
  options?: BackLayerOptions
): string {
  return defaultBackStack.register(onClose, options);
}

export function unregisterBackLayer(id: string): boolean {
  return defaultBackStack.unregister(id);
}

export function updateBackLayer(
  id: string,
  patch: { onClose?: () => void; blocked?: boolean }
): boolean {
  return defaultBackStack.update(id, patch);
}

export function handleBack(): boolean {
  return defaultBackStack.handleBack();
}

export function clearBackStack(): void {
  defaultBackStack.clear();
}

/**
 * Mengembalikan tab beranda sesuai peran pengguna.
 */
export function getHomeTabForRole(role?: UserRole | null): string {
  if (role === 'admin') return 'users';
  if (role === 'organizer') return 'my_tournaments';
  return 'tournaments';
}

export interface RootBackDecision {
  handled: boolean;
  action: 'layer_closed' | 'switch_to_home' | 'show_exit_toast' | 'exit_app';
  nextTab?: string;
  toastMessage?: string;
}

/**
 * Pengontrol tombol Back Android di root aplikasi:
 * (a) tutup lapisan paling atas jika ada di backStack;
 * (b) jika sudah login dan berada di tab selain beranda, kembali ke tab beranda dan kembalikan handled=true;
 * (c) jika di beranda (atau layar belum login tanpa lapisan), tekan ke-1 tampilkan toast keluar & kembalikan handled=true,
 *     tekan ke-2 dalam 2 detik kembalikan handled=false agar aplikasi keluar.
 */
export function createRootBackController(options?: { exitWindowMs?: number }) {
  const exitWindowMs = options?.exitWindowMs ?? DOUBLE_BACK_EXIT_WINDOW_MS;
  let lastExitPromptAt: number | null = null;

  return {
    resetExitPrompt(): void {
      lastExitPromptAt = null;
    },
    handle(params: {
      stack?: Pick<BackStack, 'handleBack'>;
      isAuthenticated: boolean;
      activeTab?: string;
      homeTab?: string;
      nowMs?: number;
    }): RootBackDecision {
      const targetStack = params.stack ?? defaultBackStack;
      if (targetStack.handleBack()) {
        lastExitPromptAt = null;
        return { handled: true, action: 'layer_closed' };
      }

      const homeTab = params.homeTab || 'tournaments';
      if (
        params.isAuthenticated &&
        params.activeTab &&
        params.activeTab !== homeTab
      ) {
        lastExitPromptAt = null;
        return {
          handled: true,
          action: 'switch_to_home',
          nextTab: homeTab,
        };
      }

      const now = typeof params.nowMs === 'number' ? params.nowMs : Date.now();
      if (
        lastExitPromptAt !== null &&
        now >= lastExitPromptAt &&
        now - lastExitPromptAt <= exitWindowMs
      ) {
        lastExitPromptAt = null;
        return { handled: false, action: 'exit_app' };
      }

      lastExitPromptAt = now;
      return {
        handled: true,
        action: 'show_exit_toast',
        toastMessage: EXIT_TOAST_MESSAGE,
      };
    },
  };
}

/**
 * Hook React untuk mendaftarkan lapisan UI ke stack LIFO global saat isOpen=true
 * dan mencabutnya saat isOpen=false atau komponen unmount.
 * Pembaruan `onClose` dan `blocked` tidak mengubah posisi urutan di stack.
 */
export function useBackLayer(
  isOpen: boolean,
  onClose: () => void,
  options?: BackLayerOptions
): void {
  const onCloseRef = useRef(onClose);
  const blocked = Boolean(options?.blocked);
  const layerIdRef = useRef<string | null>(null);

  onCloseRef.current = onClose;

  useEffect(() => {
    if (!isOpen) {
      if (layerIdRef.current) {
        unregisterBackLayer(layerIdRef.current);
        layerIdRef.current = null;
      }
      return;
    }

    const id = registerBackLayer(
      () => {
        onCloseRef.current();
      },
      { blocked }
    );
    layerIdRef.current = id;

    return () => {
      unregisterBackLayer(id);
      if (layerIdRef.current === id) {
        layerIdRef.current = null;
      }
    };
  }, [isOpen]);

  useEffect(() => {
    if (layerIdRef.current) {
      updateBackLayer(layerIdRef.current, { blocked });
    }
  }, [blocked]);
}
