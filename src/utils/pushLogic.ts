import type {
  NotificationPrefs,
  NotifyPushInput,
  PushEventType,
  TournamentStatus,
  UserDeviceDoc,
  UserRole,
} from '../types/index.ts';

export const DEFAULT_NOTIF_PREFS: NotificationPrefs = {
  enabled: true,
  announcements: true,
  rounds: true,
  scores: true,
  registration: true,
};

export const ALLOWED_DEVICE_DOC_KEYS = [
  'token',
  'platform',
  'updatedAt',
  'appVersion',
] as const;

export const ALLOWED_PUSH_REQUEST_KEYS = [
  'type',
  'tournamentId',
  'announcementId',
  'roundNumber',
  'matchId',
  'playerId',
  'playerIds',
] as const;

export function normalizeNotifPrefs(
  raw?: Partial<NotificationPrefs> | null
): NotificationPrefs {
  if (!raw || typeof raw !== 'object') {
    return { ...DEFAULT_NOTIF_PREFS };
  }
  return {
    enabled: raw.enabled !== false,
    announcements: raw.announcements !== false,
    rounds: raw.rounds !== false,
    scores: raw.scores !== false,
    registration: raw.registration !== false,
  };
}

export function isPushEndpointConfigured(endpoint: string | null | undefined): boolean {
  if (typeof endpoint !== 'string') return false;
  const trimmed = endpoint.trim();
  return /^https:\/\/.+/.test(trimmed);
}

export function buildDeviceDocPayload(
  token: string,
  appVersion?: string,
  nowMs: number = Date.now()
): UserDeviceDoc {
  const cleanToken = String(token || '').trim();
  const cleanVersion = typeof appVersion === 'string' ? appVersion.trim().slice(0, 64) : '';
  const payload: UserDeviceDoc = {
    token: cleanToken,
    platform: 'android',
    updatedAt: Math.floor(nowMs),
  };
  if (cleanVersion) {
    payload.appVersion = cleanVersion;
  }
  return payload;
}

export function validateDeviceDocPayload(doc: unknown): {
  valid: boolean;
  error?: string;
} {
  if (!doc || typeof doc !== 'object' || Array.isArray(doc)) {
    return { valid: false, error: 'Dokumen perangkat harus berupa objek.' };
  }

  const record = doc as Record<string, unknown>;
  const keys = Object.keys(record);
  const allowedSet = new Set<string>(ALLOWED_DEVICE_DOC_KEYS);

  for (const key of keys) {
    if (!allowedSet.has(key)) {
      return { valid: false, error: `Field tidak diizinkan: ${key}` };
    }
  }

  if (typeof record.token !== 'string' || record.token.length < 1 || record.token.length > 4096) {
    return { valid: false, error: 'Token FCM harus berupa string 1-4096 karakter.' };
  }

  if (record.platform !== 'android') {
    return { valid: false, error: 'Platform wajib bernilai android.' };
  }

  if (typeof record.updatedAt !== 'number' || !Number.isInteger(record.updatedAt)) {
    return { valid: false, error: 'updatedAt wajib berupa integer.' };
  }

  if (
    'appVersion' in record &&
    (typeof record.appVersion !== 'string' || record.appVersion.length > 64)
  ) {
    return { valid: false, error: 'appVersion harus string maksimal 64 karakter.' };
  }

  return { valid: true };
}

export function isValidPushEventType(value: unknown): value is PushEventType {
  return (
    value === 'announcement' ||
    value === 'round_started' ||
    value === 'score_pending' ||
    value === 'score_disputed' ||
    value === 'registration_status'
  );
}

/**
 * Membangun payload permintaan push dari client.
 * Client HANYA boleh mengirim tipe dan ID referensi — tidak pernah daftar penerima, judul, atau isi pesan.
 */
export function buildNotifyPushRequestBody(
  input: NotifyPushInput & Record<string, unknown>
): Record<string, unknown> | null {
  if (!input || !isValidPushEventType(input.type)) return null;
  const tid = typeof input.tournamentId === 'string' ? input.tournamentId.trim() : '';
  if (!tid) return null;

  const body: Record<string, unknown> = {
    type: input.type,
    tournamentId: tid,
  };

  if (typeof input.announcementId === 'string' && input.announcementId.trim()) {
    body.announcementId = input.announcementId.trim();
  }
  if (typeof input.roundNumber === 'number' && Number.isInteger(input.roundNumber) && input.roundNumber >= 1) {
    body.roundNumber = input.roundNumber;
  }
  if (typeof input.matchId === 'string' && input.matchId.trim()) {
    body.matchId = input.matchId.trim();
  }
  if (typeof input.playerId === 'string' && input.playerId.trim()) {
    body.playerId = input.playerId.trim();
  }
  if (Array.isArray(input.playerIds)) {
    const cleanIds = input.playerIds
      .filter((id): id is string => typeof id === 'string' && id.trim().length > 0)
      .map((id) => id.trim())
      .slice(0, 100);
    if (cleanIds.length > 0) {
      body.playerIds = cleanIds;
    }
  }

  return body;
}

export function shouldPromptNotificationPermission(params: {
  isNativeSupported: boolean;
  permissionState: 'granted' | 'prompt' | 'denied' | 'permanently_denied';
  dismissedPrompt: boolean;
}): boolean {
  if (!params.isNativeSupported) return false;
  if (params.permissionState !== 'prompt') return false;
  return !params.dismissedPrompt;
}

export function resolveNotificationTarget(params: {
  role: UserRole;
  pushType?: string;
  tournamentStatus?: TournamentStatus;
}): {
  tab: 'tournaments' | 'my_matches' | 'my_tournaments' | 'rounds';
  openDetailModal: boolean;
} {
  const { role, pushType, tournamentStatus } = params;

  if (role === 'admin') {
    return { tab: 'tournaments', openDetailModal: true };
  }

  if (role === 'organizer') {
    if (pushType === 'score_disputed' || pushType === 'round_started') {
      return { tab: 'rounds', openDetailModal: false };
    }
    return { tab: 'my_tournaments', openDetailModal: true };
  }

  // Player
  if (
    (pushType === 'round_started' || pushType === 'score_pending') &&
    tournamentStatus === 'running'
  ) {
    return { tab: 'my_matches', openDetailModal: false };
  }

  return { tab: 'tournaments', openDetailModal: true };
}
