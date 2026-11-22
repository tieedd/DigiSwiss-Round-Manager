import type {
  Tournament,
  TournamentFormat,
  TournamentSeason,
  TournamentStatus,
  TournamentType,
} from '../types/index.ts';
import { generateJoinCode } from './swissLogic.ts';
import {
  extractYearMonthFromDate,
  formatSeasonLabel,
  isLeagueTournament,
  validateSeasonInput,
} from './seasonLogic.ts';

export interface TournamentFormValues {
  name: string;
  date: string;
  location: string;
  format: TournamentFormat;
  type?: TournamentType;
  season?: TournamentSeason;
}

export type TournamentFieldKey = 'name' | 'date' | 'location' | 'format' | 'season';

export interface TournamentEditablePermissions {
  canEditName: boolean;
  canEditDate: boolean;
  canEditLocation: boolean;
  canEditFormat: boolean;
  canEditSeason: boolean;
  canEditSeasonNumber: boolean;
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
  updates: Partial<Pick<Tournament, 'name' | 'date' | 'location' | 'format' | 'season'>>;
  changes: TournamentFieldChange[];
  hasChanges: boolean;
  needsParticipationSync: boolean;
}

export const FORMAT_LOCKED_REASON =
  'Format terkunci karena turnamen sudah dimulai atau selesai dan memengaruhi skor serta perhitungan poin.';

export const FORMAT_LEAGUE_LOCKED_REASON =
  'Format Turnamen Liga terkunci ke Best of 3 (BO3).';

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
 * Menentukan field mana yang boleh diubah berdasarkan status dan jenis turnamen:
 * - Liga: format selalu TERKUNCI (BO3); nama, tanggal, lokasi, season boleh diubah
 * - Reguler registration: nama, tanggal, lokasi, format (BO1/BO3)
 * - Reguler running / finished: hanya nama, tanggal, lokasi; format TERKUNCI
 */
export function getEditableFieldsForStatus(
  status: TournamentStatus,
  tournamentType?: TournamentType
): TournamentEditablePermissions {
  if (tournamentType === 'league') {
    return {
      canEditName: true,
      canEditDate: true,
      canEditLocation: true,
      canEditFormat: false,
      canEditSeason: true,
      canEditSeasonNumber: status === 'registration',
      isFormatLocked: true,
      formatLockReason: FORMAT_LEAGUE_LOCKED_REASON,
    };
  }

  if (status === 'registration') {
    return {
      canEditName: true,
      canEditDate: true,
      canEditLocation: true,
      canEditFormat: true,
      canEditSeason: false,
      canEditSeasonNumber: false,
      isFormatLocked: false,
      formatLockReason: null,
    };
  }

  return {
    canEditName: true,
    canEditDate: true,
    canEditLocation: true,
    canEditFormat: false,
    canEditSeason: false,
    canEditSeasonNumber: false,
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
  const isLeague = values.type === 'league';
  const format = values.format;

  const baseSanitized: TournamentFormValues = isLeague
    ? {
        name: cleanName,
        date: cleanDate,
        location: cleanLocation,
        format,
        type: 'league',
        ...(values.season ? { season: values.season } : {}),
      }
    : {
        name: cleanName,
        date: cleanDate,
        location: cleanLocation,
        format,
      };

  if (!cleanName) {
    return {
      valid: false,
      error: isLeague ? 'Nama liga wajib diisi.' : 'Nama turnamen wajib diisi.',
      sanitized: baseSanitized,
    };
  }
  if (!cleanDate) {
    return {
      valid: false,
      error: 'Tanggal turnamen wajib diisi.',
      sanitized: baseSanitized,
    };
  }
  if (!cleanLocation) {
    return {
      valid: false,
      error: 'Lokasi turnamen wajib diisi.',
      sanitized: baseSanitized,
    };
  }

  if (isLeague) {
    if (format !== 'BO3') {
      return {
        valid: false,
        error: 'Format Turnamen Liga terkunci ke BO3.',
        sanitized: baseSanitized,
      };
    }
    const seasonRes = validateSeasonInput(values.season);
    if (!seasonRes.valid || !seasonRes.sanitized) {
      return {
        valid: false,
        error: seasonRes.error || 'Data Season Liga tidak valid.',
        sanitized: baseSanitized,
      };
    }

    return {
      valid: true,
      sanitized: {
        name: cleanName,
        date: cleanDate,
        location: cleanLocation,
        format: 'BO3',
        type: 'league',
        season: seasonRes.sanitized,
      },
    };
  }

  if (!['BO1', 'BO3'].includes(format)) {
    return {
      valid: false,
      error: 'Format turnamen tidak valid (pilih BO1 atau BO3).',
      sanitized: baseSanitized,
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
 * sekaligus memastikan field terkunci (format saat running/finished atau liga) serta field tetap
 * (joinCode, organizerId, status, totalRounds) tidak ikut berubah.
 */
export function computeTournamentChanges(
  current: Pick<Tournament, 'name' | 'date' | 'location' | 'format' | 'status'> & {
    finalized?: boolean;
    type?: TournamentType;
    season?: TournamentSeason;
  },
  input: TournamentFormValues
): TournamentEditPlan {
  const isLeague = isLeagueTournament(current);
  const permissions = getEditableFieldsForStatus(
    current.status,
    isLeague ? 'league' : 'regular'
  );
  const lockedSeasonNumber =
    isLeague &&
    !permissions.canEditSeasonNumber &&
    typeof current.season?.number === 'number' &&
    current.season.number >= 1
      ? current.season.number
      : undefined;

  const effectiveSeason =
    isLeague && (input.season || current.season)
      ? {
          number:
            lockedSeasonNumber ??
            (input.season?.number ?? current.season?.number ?? 1),
          month: input.season?.month ?? current.season?.month ?? 1,
          year:
            input.season?.year ??
            current.season?.year ??
            new Date().getFullYear(),
        }
      : undefined;

  const effectiveInput: TournamentFormValues = isLeague
    ? {
        ...input,
        type: 'league',
        format: 'BO3',
        season: effectiveSeason,
      }
    : {
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

  const updates: Partial<Pick<Tournament, 'name' | 'date' | 'location' | 'format' | 'season'>> = {};
  const changes: TournamentFieldChange[] = [];

  if (sanitized.name !== oldName) {
    updates.name = sanitized.name;
    changes.push({
      field: 'name',
      label: isLeague ? 'Nama Liga' : 'Nama Turnamen',
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

  if (isLeague && permissions.canEditSeason && sanitized.season) {
    const oldSeason = current.season;
    const isSeasonChanged =
      !oldSeason ||
      sanitized.season.number !== oldSeason.number ||
      sanitized.season.month !== oldSeason.month ||
      sanitized.season.year !== oldSeason.year;

    if (isSeasonChanged) {
      updates.season = sanitized.season;
      changes.push({
        field: 'season',
        label: 'Season',
        oldValue: formatSeasonLabel(oldSeason) || '-',
        newValue: formatSeasonLabel(sanitized.season) || '-',
      });
    }
  }

  const needsParticipationSync =
    Boolean(current.finalized) &&
    (updates.name !== undefined ||
      updates.date !== undefined ||
      updates.season !== undefined);

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
 * - jika turnamen Liga: season.number otomatis = source.season.number + 1,
 *   bulan dan tahun mengikuti tanggal baru (hari ini)
 */
export function buildDuplicateTournamentDraft(
  source: Pick<Tournament, 'name' | 'location' | 'format' | 'type' | 'season'>,
  todayDate?: string
): TournamentFormValues {
  const targetDate = todayDate || getTodayDateString();

  if (isLeagueTournament(source)) {
    const { month, year } = extractYearMonthFromDate(targetDate);
    const prevNum =
      typeof source.season?.number === 'number' && source.season.number >= 1
        ? source.season.number
        : 0;
    return {
      name: (source.name || '').trim(),
      date: targetDate,
      location: (source.location || '').trim(),
      format: 'BO3',
      type: 'league',
      season: {
        number: prevNum + 1,
        month,
        year,
      },
    };
  }

  return {
    name: (source.name || '').trim(),
    date: targetDate,
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

  const isLeague = validation.sanitized.type === 'league';

  return {
    id: options.id || '',
    name: validation.sanitized.name,
    date: validation.sanitized.date,
    location: validation.sanitized.location,
    format: validation.sanitized.format,
    ...(isLeague && validation.sanitized.season
      ? { type: 'league' as const, season: validation.sanitized.season }
      : {}),
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
