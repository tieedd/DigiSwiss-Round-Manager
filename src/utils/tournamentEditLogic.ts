import type {
  Tournament,
  TournamentFormat,
  TournamentStatus,
} from '../types/index.ts';
import { generateJoinCode } from './swissLogic.ts';

export interface TournamentFormValues {
  name: string;
  date: string;
  location: string;
  format: TournamentFormat;
}

export type TournamentFieldKey = 'name' | 'date' | 'location' | 'format';

export interface TournamentEditablePermissions {
  canEditName: boolean;
  canEditDate: boolean;
  canEditLocation: boolean;
  canEditFormat: boolean;
  isFormatLocked: boolean;
  formatLockReason: string | null;
}

export interface TournamentFieldChange {
  field: TournamentFieldKey;
  label: string;
  oldValue: string;
  newValue: string;
}

export interface TournamentFormValidationResult {
  valid: boolean;
  error?: string;
  sanitized: TournamentFormValues;
}

export interface TournamentEditPlan {
  valid: boolean;
  error?: string;
  sanitizedValues: TournamentFormValues;
  updates: Partial<Pick<Tournament, 'name' | 'date' | 'location' | 'format'>>;
  changes: TournamentFieldChange[];
  hasChanges: boolean;
  needsParticipationSync: boolean;
}

export const FORMAT_LOCKED_REASON =
  'Format terkunci karena turnamen sudah dimulai atau selesai dan memengaruhi skor serta perhitungan poin.';

/**
 * Mengembalikan tanggal hari ini dalam format YYYY-MM-DD.
 */
export function getTodayDateString(now: Date = new Date()): string {
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Menentukan field mana yang boleh diubah berdasarkan status turnamen:
 * - registration: nama, tanggal, lokasi, format (BO1/BO3)
 * - running / finished: hanya nama, tanggal, lokasi; format TERKUNCI
 */
export function getEditableFieldsForStatus(
  status: TournamentStatus
): TournamentEditablePermissions {
  if (status === 'registration') {
    return {
      canEditName: true,
      canEditDate: true,
      canEditLocation: true,
      canEditFormat: true,
      isFormatLocked: false,
      formatLockReason: null,
    };
  }

  return {
    canEditName: true,
    canEditDate: true,
    canEditLocation: true,
    canEditFormat: false,
    isFormatLocked: true,
    formatLockReason: FORMAT_LOCKED_REASON,
  };
}

/**
 * Validasi murni form pembuatan/edit/duplikat turnamen (konsisten dengan createTournament).
 */
export function validateTournamentFormInput(
  values: TournamentFormValues
): TournamentFormValidationResult {
  const cleanName = (values.name || '').trim();
  const cleanDate = (values.date || '').trim();
  const cleanLocation = (values.location || '').trim();
  const format = values.format;

  if (!cleanName) {
    return {
      valid: false,
      error: 'Nama turnamen wajib diisi.',
      sanitized: { name: cleanName, date: cleanDate, location: cleanLocation, format },
    };
  }
  if (!cleanDate) {
    return {
      valid: false,
      error: 'Tanggal turnamen wajib diisi.',
      sanitized: { name: cleanName, date: cleanDate, location: cleanLocation, format },
    };
  }
  if (!cleanLocation) {
    return {
      valid: false,
      error: 'Lokasi turnamen wajib diisi.',
      sanitized: { name: cleanName, date: cleanDate, location: cleanLocation, format },
    };
  }
  if (!['BO1', 'BO3'].includes(format)) {
    return {
      valid: false,
      error: 'Format turnamen tidak valid (pilih BO1 atau BO3).',
      sanitized: { name: cleanName, date: cleanDate, location: cleanLocation, format },
    };
  }

  return {
    valid: true,
    sanitized: {
      name: cleanName,
      date: cleanDate,
      location: cleanLocation,
      format,
    },
  };
}

/**
 * Menghitung perubahan yang sah antara nilai turnamen saat ini dan input baru,
 * sekaligus memastikan field terkunci (format saat running/finished) serta field tetap
 * (joinCode, organizerId, status, totalRounds) tidak ikut berubah.
 */
export function computeTournamentChanges(
  current: Pick<Tournament, 'name' | 'date' | 'location' | 'format' | 'status'> & {
    finalized?: boolean;
  },
  input: TournamentFormValues
): TournamentEditPlan {
  const permissions = getEditableFieldsForStatus(current.status);
  const effectiveInput: TournamentFormValues = {
    ...input,
    format: permissions.canEditFormat ? input.format : current.format,
  };

  const validation = validateTournamentFormInput(effectiveInput);
  if (!validation.valid) {
    return {
      valid: false,
      error: validation.error,
      sanitizedValues: validation.sanitized,
      updates: {},
      changes: [],
      hasChanges: false,
      needsParticipationSync: false,
    };
  }

  const sanitized = validation.sanitized;
  const oldName = (current.name || '').trim();
  const oldDate = (current.date || '').trim();
  const oldLocation = (current.location || '').trim();
  const oldFormat = current.format;

  const updates: Partial<Pick<Tournament, 'name' | 'date' | 'location' | 'format'>> = {};
  const changes: TournamentFieldChange[] = [];

  if (sanitized.name !== oldName) {
    updates.name = sanitized.name;
    changes.push({
      field: 'name',
      label: 'Nama Turnamen',
      oldValue: oldName,
      newValue: sanitized.name,
    });
  }

  if (sanitized.date !== oldDate) {
    updates.date = sanitized.date;
    changes.push({
      field: 'date',
      label: 'Tanggal',
      oldValue: oldDate,
      newValue: sanitized.date,
    });
  }

  if (sanitized.location !== oldLocation) {
    updates.location = sanitized.location;
    changes.push({
      field: 'location',
      label: 'Lokasi',
      oldValue: oldLocation,
      newValue: sanitized.location,
    });
  }

  if (permissions.canEditFormat && sanitized.format !== oldFormat) {
    updates.format = sanitized.format;
    changes.push({
      field: 'format',
      label: 'Format',
      oldValue: oldFormat,
      newValue: sanitized.format,
    });
  }

  const needsParticipationSync =
    Boolean(current.finalized) &&
    (updates.name !== undefined || updates.date !== undefined);

  return {
    valid: true,
    sanitizedValues: sanitized,
    updates,
    changes,
    hasChanges: changes.length > 0,
    needsParticipationSync,
  };
}

/**
 * Memformat daftar perubahan menjadi string oldValue & newValue untuk recordAuditLog.
 */
export function formatAuditDiffSummary(changes: ReadonlyArray<TournamentFieldChange>): {
  oldValue: string;
  newValue: string;
} {
  if (!changes || changes.length === 0) {
    return { oldValue: '-', newValue: '-' };
  }
  return {
    oldValue: changes.map((c) => `${c.label}: ${c.oldValue}`).join(' | '),
    newValue: changes.map((c) => `${c.label}: ${c.newValue}`).join(' | '),
  };
}

/**
 * Menyusun nilai awal form untuk fitur Duplikat Turnamen:
 * - nama, lokasi, format disalin dari turnamen sumber
 * - tanggal diisi hari ini
 */
export function buildDuplicateTournamentDraft(
  source: Pick<Tournament, 'name' | 'location' | 'format'>,
  todayDate?: string
): TournamentFormValues {
  return {
    name: (source.name || '').trim(),
    date: todayDate || getTodayDateString(),
    location: (source.location || '').trim(),
    format: source.format,
  };
}

/**
 * Menyusun objek data turnamen hasil duplikasi (tanpa peserta, ronde, pertandingan, atau deck;
 * status = 'registration'; joinCode baru; organizerId & organizerName = pengguna pelaku).
 */
export function buildDuplicateTournamentPayload(
  input: TournamentFormValues,
  actor: { uid: string; name: string },
  options: {
    id?: string;
    joinCode?: string;
    createdAt?: number;
    previousJoinCode?: string;
  } = {}
): Tournament {
  const validation = validateTournamentFormInput(input);
  if (!validation.valid) {
    throw new Error(validation.error || 'Data turnamen duplikat tidak valid.');
  }

  let joinCode = options.joinCode || generateJoinCode();
  if (!options.joinCode && options.previousJoinCode) {
    let attempts = 0;
    while (joinCode === options.previousJoinCode && attempts < 10) {
      joinCode = generateJoinCode();
      attempts++;
    }
  }

  return {
    id: options.id || '',
    name: validation.sanitized.name,
    date: validation.sanitized.date,
    location: validation.sanitized.location,
    format: validation.sanitized.format,
    status: 'registration',
    organizerId: actor.uid,
    organizerName: actor.name,
    joinCode,
    createdAt: options.createdAt ?? Date.now(),
  };
}

/**
 * Memecah array item menjadi beberapa potongan batch dengan ukuran maksimal tertentu (default 400).
 */
export function chunkBatchItems<T>(
  items: ReadonlyArray<T>,
  maxBatchSize: number = 400
): T[][] {
  if (!items || items.length === 0) return [];
  const safeSize = Math.max(1, Math.floor(maxBatchSize));
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += safeSize) {
    chunks.push(items.slice(i, i + safeSize));
  }
  return chunks;
}
