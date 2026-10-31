/**
 * Menghitung match points sesuai standar Digimon TCG:
 * Menang = 3 poin, Seri/Draw = 1 poin, Kalah = 0 poin.
 */
export function calculateMatchPoints(wins: number, losses: number, draws: number = 0): number {
  return Math.max(0, wins) * 3 + Math.max(0, draws) * 1;
}

/**
 * Menghitung Game Win % (GW%) atau Match Win % (MW%).
 * Di turnamen resmi Bandai Digimon TCG, rasio kemenangan minimum dibatasi 33.33% (0.3333)
 * untuk perhitungan OMW% agar tidak mematikan penalti tiebreaker lawan.
 */
export function calculateWinPercentage(won: number, total: number, useMinimumFloor: boolean = false): number {
  if (total <= 0) return useMinimumFloor ? 33.33 : 0;
  const pct = (won / total) * 100;
  if (useMinimumFloor) {
    return Math.max(33.33, Math.round(pct * 100) / 100);
  }
  return Math.round(pct * 100) / 100;
}

/**
 * Menghitung Opponent Match Win % (OMW%) dari daftar persentase kemenangan match lawan.
 */
export function calculateOMW(opponentMatchWinRates: number[]): number {
  if (!opponentMatchWinRates || opponentMatchWinRates.length === 0) return 33.33;
  const sum = opponentMatchWinRates.reduce((acc, rate) => acc + Math.max(33.33, rate), 0);
  return Math.round((sum / opponentMatchWinRates.length) * 100) / 100;
}

/**
 * Menentukan jumlah ronde Swiss berdasarkan rumus resmi:
 * max(3, ceil(log2(jumlah pemain)))
 * Contoh:
 * 3 sampai 8 pemain = 3 ronde
 * 9 sampai 16 pemain = 4 ronde
 * 17 sampai 32 pemain = 5 ronde
 * 33 sampai 64 pemain = 6 ronde
 * 20 pemain = 5 ronde
 */
export function calculateSwissRounds(playerCount: number): number {
  if (playerCount <= 0) return 0;
  return Math.max(3, Math.ceil(Math.log2(playerCount)));
}

/**
 * Kompatibilitas alias untuk calculateSwissRounds
 */
export function getRecommendedSwissRounds(playerCount: number): number {
  return calculateSwissRounds(playerCount);
}

/**
 * Menghasilkan joinCode acak 6 karakter huruf kapital & angka
 * (contoh: "X8K9P2")
 */
export function generateJoinCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // Menghindari karakter ambigu O/0 dan I/1
  let code = '';
  for (let i = 0; i < 6; i++) {
    const randomIndex = Math.floor(Math.random() * chars.length);
    code += chars[randomIndex];
  }
  return code;
}

/**
 * Validasi kode turnamen (4-8 karakter alfanumerik)
 */
export function isValidJoinCode(code: string): boolean {
  if (!code) return false;
  return /^[A-Z0-9]{4,8}$/i.test(code.trim());
}
