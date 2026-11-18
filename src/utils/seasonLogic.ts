import type {
  Tournament,
  TournamentSeason,
  TournamentType,
} from '../types/index.ts';

export const INDONESIAN_MONTHS_UPPER = [
  'JANUARI',
  'FEBRUARI',
  'MARET',
  'APRIL',
  'MEI',
  'JUNI',
  'JULI',
  'AGUSTUS',
  'SEPTEMBER',
  'OKTOBER',
  'NOVEMBER',
  'DESEMBER',
] as const;

export const INDONESIAN_MONTH_OPTIONS: ReadonlyArray<{
  value: number;
  label: string;
  upperLabel: string;
}> = INDONESIAN_MONTHS_UPPER.map((upper, idx) => ({
  value: idx + 1,
  label: upper.charAt(0) + upper.slice(1).toLowerCase(),
  upperLabel: upper,
}));

export type TournamentTypeFilter = 'all' | 'league' | 'regular';

export const MIN_PARTICIPANTS_REGULAR = 3;
export const MIN_PARTICIPANTS_LEAGUE = 4;

/**
 * Mengembalikan jenis turnamen ('league' atau 'regular').
 * Turnamen lama tanpa field `type` selalu dianggap 'regular'.
 */
export function getTournamentType(
  tournament?: Pick<Tournament, 'type'> | null
): TournamentType {
  return tournament?.type === 'league' ? 'league' : 'regular';
}

export function isLeagueTournament(
  tournament?: Pick<Tournament, 'type'> | null
): boolean {
  return getTournamentType(tournament) === 'league';
}

/**
 * Mengembalikan nama bulan bahasa Indonesia huruf kapital (1-12), atau null jika tidak valid.
 */
export function getIndonesianMonthUpper(month: number): string | null {
  if (!Number.isInteger(month) || month < 1 || month > 12) {
    return null;
  }
  return INDONESIAN_MONTHS_UPPER[month - 1];
}

/**
 * Memformat label season menjadi: "SEASON {nomor} {BULAN} {TAHUN}".
 * Contoh: "SEASON 3 NOVEMBER 2026".
 */
export function formatSeasonLabel(
  season?: Partial<TournamentSeason> | null
): string | null {
  if (!season) return null;
  const number = Number(season.number);
  const month = Number(season.month);
  const year = Number(season.year);

  if (
    !Number.isInteger(number) ||
    number < 1 ||
    !Number.isInteger(month) ||
    month < 1 ||
    month > 12 ||
    !Number.isInteger(year) ||
    year < 2000 ||
    year > 2100
  ) {
    return null;
  }

  const monthName = INDONESIAN_MONTHS_UPPER[month - 1];
  return `SEASON ${number} ${monthName} ${year}`;
}

/**
 * Mengambil bulan (1-12) dan tahun dari string tanggal YYYY-MM-DD,
 * dengan fallback ke tanggal referensi (default: hari ini).
 */
export function extractYearMonthFromDate(
  dateStr?: string | null,
  fallbackDate: Date = new Date()
): { month: number; year: number } {
  const match = (dateStr || '').trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (match) {
    const year = Number(match[1]);
    const month = Number(match[2]);
    if (
      Number.isInteger(year) &&
      year >= 2000 &&
      year <= 2100 &&
      Number.isInteger(month) &&
      month >= 1 &&
      month <= 12
    ) {
      return { month, year };
    }
  }

  return {
    month: fallbackDate.getMonth() + 1,
    year: fallbackDate.getFullYear(),
  };
}

/**
 * Menyarankan nomor season berikutnya = nomor season tertinggi dari turnamen liga
 * milik organizer dengan nama yang sama (case-insensitive & trimmed) + 1,
 * atau 1 jika belum ada.
 */
export function suggestNextSeasonNumber(
  existingTournaments: ReadonlyArray<
    Pick<Tournament, 'name' | 'type' | 'season'>
  >,
  leagueName: string
): number {
  const normalizedTarget = (leagueName || '').trim().toLowerCase();
  if (!normalizedTarget || !existingTournaments || existingTournaments.length === 0) {
    return 1;
  }

  let maxSeason = 0;
  for (const t of existingTournaments) {
    if (!isLeagueTournament(t)) continue;
    const normalizedName = (t.name || '').trim().toLowerCase();
    if (normalizedName !== normalizedTarget) continue;

    const seasonNum = Number(t.season?.number);
    if (Number.isInteger(seasonNum) && seasonNum > maxSeason) {
      maxSeason = seasonNum;
    }
  }

  return maxSeason + 1;
}

export interface SeasonValidationResult {
  valid: boolean;
  error?: string;
  sanitized?: TournamentSeason;
}

/**
 * Validasi input Season Liga (nomor >= 1, bulan 1-12, tahun 2000-2100).
 */
export function validateSeasonInput(
  season?: Partial<TournamentSeason> | null
): SeasonValidationResult {
  if (!season) {
    return { valid: false, error: 'Data Season wajib diisi untuk Turnamen Liga.' };
  }

  const number = Number(season.number);
  const month = Number(season.month);
  const year = Number(season.year);

  if (!Number.isInteger(number) || number < 1) {
    return {
      valid: false,
      error: 'Nomor Season harus berupa angka bulat minimal 1.',
    };
  }

  if (!Number.isInteger(month) || month < 1 || month > 12) {
    return {
      valid: false,
      error: 'Bulan Season harus dipilih antara 1 sampai 12.',
    };
  }

  if (!Number.isInteger(year) || year < 2000 || year > 2100) {
    return {
      valid: false,
      error: 'Tahun Season harus antara 2000 sampai 2100.',
    };
  }

  return {
    valid: true,
    sanitized: { number, month, year },
  };
}

function resolveTypeArg(
  tournamentOrType?: Pick<Tournament, 'type'> | TournamentType | null
): TournamentType {
  if (!tournamentOrType) return 'regular';
  if (typeof tournamentOrType === 'string') {
    return tournamentOrType === 'league' ? 'league' : 'regular';
  }
  return getTournamentType(tournamentOrType);
}

/**
 * Aturan jumlah minimum peserta accepted untuk memulai turnamen:
 * - Liga: 4 peserta
 * - Reguler: 3 peserta
 */
export function getMinParticipantsToStart(
  tournamentOrType?: Pick<Tournament, 'type'> | TournamentType | null
): number {
  return resolveTypeArg(tournamentOrType) === 'league'
    ? MIN_PARTICIPANTS_LEAGUE
    : MIN_PARTICIPANTS_REGULAR;
}

/**
 * Timer ronde disembunyikan pada Turnamen Liga (bebas dimainkan kapan saja).
 */
export function isRoundTimerEnabledForTournament(
  tournamentOrType?: Pick<Tournament, 'type'> | TournamentType | null
): boolean {
  return resolveTypeArg(tournamentOrType) !== 'league';
}

/**
 * Top Cut wajib pada Turnamen Liga (opsi "Akhiri Tanpa Top Cut" disembunyikan).
 */
export function isTopCutMandatoryForTournament(
  tournamentOrType?: Pick<Tournament, 'type'> | TournamentType | null
): boolean {
  return resolveTypeArg(tournamentOrType) === 'league';
}

/**
 * Memfilter daftar turnamen berdasarkan jenis ('all' | 'league' | 'regular').
 */
export function filterTournamentsByType<T extends Pick<Tournament, 'type'>>(
  tournaments: ReadonlyArray<T>,
  filter: TournamentTypeFilter
): T[] {
  if (filter === 'all') return [...tournaments];
  if (filter === 'league') {
    return tournaments.filter((t) => isLeagueTournament(t));
  }
  return tournaments.filter((t) => !isLeagueTournament(t));
}

/**
 * Membentuk nama berkas ekspor (PNG, CSV, TXT) yang menyertakan label Season
 * bila turnamen adalah Turnamen Liga.
 */
export function buildTournamentExportFileName(
  tournament: Pick<Tournament, 'name' | 'type' | 'season'>,
  extension: 'png' | 'csv' | 'txt'
): string {
  const cleanName = (tournament.name || 'Turnamen')
    .trim()
    .replace(/\s+/g, '_')
    .replace(/[^a-zA-Z0-9_-]/g, '');
  const baseName = cleanName || 'Turnamen';

  if (isLeagueTournament(tournament)) {
    const seasonLabel = formatSeasonLabel(tournament.season);
    if (seasonLabel) {
      const seasonSlug = seasonLabel.replace(/\s+/g, '_');
      return `Hasil-${baseName}-${seasonSlug}.${extension}`;
    }
  }

  return `Hasil-${baseName}.${extension}`;
}
