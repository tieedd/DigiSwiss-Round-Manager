/**
 * Logika penentuan apakah kartu jeda sebelum ronde berikutnya harus ditampilkan:
 * - Seluruh pertandingan pada ronde saat ini berstatus 'confirmed'
 * - Ronde saat ini bukan ronde terakhir (round < totalRounds)
 * - Ronde berikutnya belum dibuat / belum ada (!nextRoundExists)
 */
export function shouldShowNextRoundPause(
  matches: { status: string }[] | null | undefined,
  round: number,
  totalRounds: number,
  nextRoundExists: boolean
): boolean {
  if (!matches || matches.length === 0) return false;
  if (round >= totalRounds) return false;
  if (nextRoundExists) return false;
  return matches.every((m) => m && m.status === 'confirmed');
}
