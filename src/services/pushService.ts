import { deleteDoc, doc, setDoc, updateDoc } from 'firebase/firestore';
import { auth, db } from '../firebaseConfig';
import { PUSH_NOTIFY_ENDPOINT } from '../config/pushConfig';
import { NotificationPrefs, NotifyPushInput } from '../types';
import {
  buildDeviceDocPayload,
  buildNotifyPushRequestBody,
  isPushEndpointConfigured,
  normalizeNotifPrefs,
} from '../utils/pushLogic';
import { CURRENT_APP_VERSION } from './versionService';

const DEVICE_ID_STORAGE_KEY = 'dss_push_device_id';
const NOTIF_PROMPT_DISMISSED_KEY = 'dss_push_prompt_dismissed_';

export function getOrCreatePushDeviceId(): string {
  if (typeof window !== 'undefined' && window.localStorage) {
    try {
      const existing = localStorage.getItem(DEVICE_ID_STORAGE_KEY);
      if (existing && /^[a-zA-Z0-9_-]{8,64}$/.test(existing)) {
        return existing;
      }
    } catch {
      // Abaikan jika localStorage gagal
    }
  }

  let generated = '';
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    generated = 'dev_' + crypto.randomUUID().replace(/-/g, '').slice(0, 24);
  } else {
    generated = 'dev_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 10);
  }

  if (typeof window !== 'undefined' && window.localStorage) {
    try {
      localStorage.setItem(DEVICE_ID_STORAGE_KEY, generated);
    } catch {
      // Abaikan
    }
  }
  return generated;
}

export function isNotifPromptDismissed(uid: string): boolean {
  if (typeof window === 'undefined' || !window.localStorage || !uid) return false;
  try {
    return localStorage.getItem(`${NOTIF_PROMPT_DISMISSED_KEY}${uid}`) === '1';
  } catch {
    return false;
  }
}

export function setNotifPromptDismissed(uid: string): void {
  if (typeof window === 'undefined' || !window.localStorage || !uid) return;
  try {
    localStorage.setItem(`${NOTIF_PROMPT_DISMISSED_KEY}${uid}`, '1');
  } catch {
    // Abaikan
  }
}

/**
 * Menyimpan atau memperbarui token FCM perangkat saat ini pada users/{uid}/devices/{deviceId}.
 */
export async function registerDeviceToken(uid: string, token: string): Promise<void> {
  const cleanUid = String(uid || '').trim();
  const cleanToken = String(token || '').trim();
  if (!cleanUid || !cleanToken) return;

  try {
    const deviceId = getOrCreatePushDeviceId();
    const payload = buildDeviceDocPayload(cleanToken, CURRENT_APP_VERSION);
    await setDoc(doc(db, 'users', cleanUid, 'devices', deviceId), payload);
  } catch (err) {
    console.warn('Gagal menyimpan token perangkat FCM:', err);
  }
}

/**
 * Menghapus dokumen perangkat FCM saat logout (harus dipanggil sebelum signOut).
 */
export async function unregisterCurrentDevice(uid: string): Promise<void> {
  const cleanUid = String(uid || '').trim();
  if (!cleanUid) return;

  try {
    const deviceId = getOrCreatePushDeviceId();
    await deleteDoc(doc(db, 'users', cleanUid, 'devices', deviceId));
  } catch {
    // Jangan menghalangi proses logout
  }
}

/**
 * Memperbarui preferensi notifikasi pengguna pada users/{uid}.
 */
export async function updateUserNotifPrefs(
  uid: string,
  prefs: NotificationPrefs
): Promise<NotificationPrefs> {
  const normalized = normalizeNotifPrefs(prefs);
  await updateDoc(doc(db, 'users', uid), {
    notifPrefs: normalized,
  });
  return normalized;
}

/**
 * Memicu Apps Script pengirim push notification secara fire-and-forget.
 * Tidak pernah melempar error atau memblokir aksi utama pengguna.
 */
export function notifyPush(input: NotifyPushInput): void {
  if (!isPushEndpointConfigured(PUSH_NOTIFY_ENDPOINT)) {
    return;
  }

  const requestBody = buildNotifyPushRequestBody(
    input as NotifyPushInput & Record<string, unknown>
  );
  if (!requestBody) {
    return;
  }

  const user = auth.currentUser;
  if (!user) {
    return;
  }

  void (async () => {
    try {
      const idToken = await user.getIdToken();
      if (!idToken) return;

      const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
      const timer = controller ? setTimeout(() => controller.abort(), 15_000) : null;

      try {
        await fetch(PUSH_NOTIFY_ENDPOINT.trim(), {
          method: 'POST',
          headers: {
            'Content-Type': 'text/plain;charset=utf-8',
          },
          redirect: 'follow',
          body: JSON.stringify({
            idToken,
            ...requestBody,
          }),
          ...(controller ? { signal: controller.signal } : {}),
        });
      } finally {
        if (timer !== null) {
          clearTimeout(timer);
        }
      }
    } catch {
      // Fire-and-forget: gagal kirim push tidak boleh memengaruhi alur utama
    }
  })();
}
