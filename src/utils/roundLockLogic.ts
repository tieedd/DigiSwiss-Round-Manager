/**
 * Menentukan apakah suatu ronde dalam turnamen terkunci (read-only):
 * - Jika status turnamen bukan 'running' (misal: 'finished' atau 'registration'), seluruh ronde terkunci.
 * - Jika nomor ronde lebih kecil dari currentRound (round < currentRound), ronde tersebut terkunci.
 * - Hanya ronde saat ini (round === currentRound) pada turnamen yang berstatus 'running' yang terbuka.
 *
 * @param round Nomor ronde yang sedang dilihat
 * @param currentRound Nomor ronde aktif saat ini di turnamen
 * @param tournamentStatus Status turnamen ('registration' | 'running' | 'finished')
 * @returns true jika ronde terkunci (read-only), false jika terbuka untuk pengisian/koreksi skor langsung
 */
export function isRoundLocked(
  round: number,
  currentRound: number,
  tournamentStatus: string
): boolean {
  if (tournamentStatus !== 'running') {
    return true;
  }
  return round < currentRound;
}
