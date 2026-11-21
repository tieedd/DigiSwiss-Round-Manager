const INDONESIAN_FULL_MONTHS = [
  'Januari',
  'Februari',
  'Maret',
  'April',
  'Mei',
  'Juni',
  'Juli',
  'Agustus',
  'September',
  'Oktober',
  'November',
  'Desember',
] as const;

export const TOP_CUT_EXPORT_NOTE =
  'Peringkat akhir ditentukan hasil Top Cut; poin dan W-L = Swiss + Top Cut.';

/**
 * Memformat angka persentase tie-breaker secara seragam dengan 2 digit desimal.
 * Contoh: 100 -> "100.00%", 66.666 -> "66.67%", 60 -> "60.00%".
 */
export function formatPercent2Decimals(value: number | null | undefined): string {
  const num = typeof value === 'number' ? value : Number(value);
  const safe = Number.isFinite(num) ? num : 0;
  return `${safe.toFixed(2)}%`;
}

/**
 * Memformat tanggal ke format lengkap Bahasa Indonesia: "19 November 2026".
 * Mendukung string "YYYY-MM-DD" tanpa pergeseran zona waktu, string ISO, timestamp ms, atau Date.
 */
export function formatIndonesianFullDate(
  input?: string | number | Date | null
): string {
  if (input === undefined || input === null) return '-';

  if (typeof input === 'string') {
    const trimmed = input.trim();
    if (!trimmed || trimmed === '-') return '-';

    const ymdMatch = /^(\d{4})-(\d{1,2})-(\d{1,2})(?:[T\s].*)?$/.exec(trimmed);
    if (ymdMatch) {
      const year = Number(ymdMatch[1]);
      const month = Number(ymdMatch[2]);
      const day = Number(ymdMatch[3]);
      if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
        return `${String(day).padStart(2, '0')} ${INDONESIAN_FULL_MONTHS[month - 1]} ${year}`;
      }
    }

    const parsed = new Date(trimmed);
    if (!Number.isNaN(parsed.getTime())) {
      return `${String(parsed.getDate()).padStart(2, '0')} ${
        INDONESIAN_FULL_MONTHS[parsed.getMonth()]
      } ${parsed.getFullYear()}`;
    }

    return trimmed;
  }

  const date = input instanceof Date ? input : new Date(input);
  if (Number.isNaN(date.getTime())) return '-';

  return `${String(date.getDate()).padStart(2, '0')} ${
    INDONESIAN_FULL_MONTHS[date.getMonth()]
  } ${date.getFullYear()}`;
}
