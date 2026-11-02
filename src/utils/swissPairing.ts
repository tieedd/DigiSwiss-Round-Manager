/**
 * DigiSwiss-Round: Modul Logika Murni Pairing Sistem Swiss (Tahap 5)
 * Mematuhi aturan resmi turnamen kartu (TCG / Bandai Swiss-Draw):
 * 1. Tidak ada tanding ulang (No Rematch) antara dua peserta yang sudah pernah bertemu.
 * 2. Algoritma Backtracking untuk menjamin ditemukannya pairing valid jika ada solusi graf.
 * 3. Ronde 1 acak penuh; Ronde berikutnya dikelompokkan berdasarkan poin (Score Brackets).
 * 4. Peserta ganjil mendapatkan tepat 1 BYE per ronde (otomatis menang: BO1 1-0, BO3 2-0).
 * 5. Peserta yang sudah pernah mendapat BYE tidak boleh mendapat BYE lagi.
 * 6. BYE diprioritaskan untuk peserta dengan poin terendah yang belum pernah BYE.
 * 7. Peserta 'dropped' tidak dipasangkan lagi.
 */

export type TournamentFormat = 'BO1' | 'BO3';

export interface PairingPlayer {
  id: string;
  name: string;
  points: number;
  status: 'accepted' | 'dropped';
  byeHistory?: boolean; // pernah BYE di ronde sebelumnya
}

export interface PastMatchRecord {
  round: number;
  p1Id: string;
  p2Id: string | null; // null jika BYE
}

export interface GeneratedMatch {
  table: number;
  p1Id: string;
  p2Id: string | null;
  p1Name: string;
  p2Name: string;
  p1Score: number;
  p2Score: number;
  status: 'pending' | 'confirmed';
  isBye: boolean;
}

export interface PairingResult {
  round: number;
  matches: GeneratedMatch[];
  hasSolution: boolean;
  warning?: string;
  byePlayerId?: string | null;
}

/**
 * Memeriksa apakah dua pemain sudah pernah bertanding di ronde-ronde sebelumnya.
 */
export function hasPlayedBefore(p1Id: string, p2Id: string, pastMatches: PastMatchRecord[]): boolean {
  if (!p1Id || !p2Id || p1Id === p2Id) return true;
  return pastMatches.some(
    (m) =>
      m.p2Id !== null &&
      ((m.p1Id === p1Id && m.p2Id === p2Id) || (m.p1Id === p2Id && m.p2Id === p1Id))
  );
}

/**
 * Mengambil himpunan ID pemain yang pernah mendapatkan BYE di ronde sebelumnya.
 */
export function getPlayersWithPastBye(pastMatches: PastMatchRecord[]): Set<string> {
  const byePlayers = new Set<string>();
  for (const m of pastMatches) {
    if (m.p2Id === null) {
      byePlayers.add(m.p1Id);
    }
  }
  return byePlayers;
}

/**
 * Algoritma pengelompokan peserta aktif (Score Brackets) dan pengacakan dalam kelompok.
 */
function shuffleArray<T>(array: T[], seedRandom?: () => number): T[] {
  const arr = [...array];
  const rand = seedRandom || Math.random;
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

/**
 * Backtracking Solver untuk pairing 2-by-2 tanpa tanding ulang.
 * Input: list of players ordered by score brackets (descending), shuffled within bracket.
 */
function backtrackPairing(
  players: PairingPlayer[],
  pastMatches: PastMatchRecord[],
  currentPairs: [PairingPlayer, PairingPlayer][]
): [PairingPlayer, PairingPlayer][] | null {
  if (players.length === 0) {
    return currentPairs;
  }

  // Ambil pemain pertama (skor tertinggi yang belum dipasangkan)
  const p1 = players[0];
  const candidates = players.slice(1);

  for (let i = 0; i < candidates.length; i++) {
    const p2 = candidates[i];
    // Periksa apakah kedua pemain pernah bertemu
    if (!hasPlayedBefore(p1.id, p2.id, pastMatches)) {
      currentPairs.push([p1, p2]);
      const remaining = [
        ...candidates.slice(0, i),
        ...candidates.slice(i + 1)
      ];

      const result = backtrackPairing(remaining, pastMatches, currentPairs);
      if (result !== null) {
        return result;
      }

      // Backtrack
      currentPairs.pop();
    }
  }

  return null;
}

/**
 * Fallback pairing jika graf tidak memiliki solusi sempurna tanpa tanding ulang.
 * Meminimalkan jumlah rematch.
 */
function fallbackGreedyPairing(
  players: PairingPlayer[],
  pastMatches: PastMatchRecord[]
): [PairingPlayer, PairingPlayer][] {
  const remaining = [...players];
  const pairs: [PairingPlayer, PairingPlayer][] = [];

  while (remaining.length >= 2) {
    const p1 = remaining.shift()!;
    // Cari lawan tanpa rematch dulu
    let bestIndex = remaining.findIndex((c) => !hasPlayedBefore(p1.id, c.id, pastMatches));
    if (bestIndex === -1) {
      // Jika terpaksa, pasangkan dengan siapa saja yang terdekat di kelompok poin
      bestIndex = 0;
    }
    const [p2] = remaining.splice(bestIndex, 1);
    pairs.push([p1, p2]);
  }

  return pairs;
}

/**
 * Fungsi Utama: Membuat Pairing Ronde Swiss
 * 
 * @param roundNumber Nomor ronde yang dibuat (1, 2, ...)
 * @param allPlayers Seluruh peserta turnamen (akan difilter yang berstatus 'accepted')
 * @param pastMatches Riwayat seluruh pertandingan ronde-ronde sebelumnya
 * @param format Format pertandingan ('BO1' | 'BO3')
 * @param rng Fungsi pengacak opsional (berguna untuk deterministic test jika diperlukan)
 */
export function generateSwissPairing(
  roundNumber: number,
  allPlayers: PairingPlayer[],
  pastMatches: PastMatchRecord[],
  format: TournamentFormat,
  rng?: () => number
): PairingResult {
  // 1. Filter hanya peserta aktif (status 'accepted', bukan 'dropped')
  const activePlayers = allPlayers.filter((p) => p.status === 'accepted');

  if (activePlayers.length < 2) {
    return {
      round: roundNumber,
      matches: [],
      hasSolution: false,
      warning: 'Jumlah peserta aktif kurang dari 2. Tidak dapat membuat pairing.',
    };
  }

  const pastByePlayers = getPlayersWithPastBye(pastMatches);

  let playersToPair = [...activePlayers];
  let byePlayer: PairingPlayer | null = null;

  // 2. Tangani peserta ganjil -> Pilih 1 peserta untuk BYE
  if (playersToPair.length % 2 !== 0) {
    // Cari peserta yang BELUM pernah mendapatkan BYE
    const eligibleForBye = playersToPair.filter((p) => !pastByePlayers.has(p.id));

    if (eligibleForBye.length === 0) {
      // Kasus sangat langka (semua sudah pernah BYE karena ronde melebihi jumlah peserta)
      // Urutkan berdasarkan poin terendah
      eligibleForBye.push(...playersToPair);
    }

    // "BYE diberikan ke peserta berpoin terendah yang memenuhi syarat"
    // Kelompokkan kandidat berpoin terendah
    const minPoints = Math.min(...eligibleForBye.map((p) => p.points));
    const lowestTier = eligibleForBye.filter((p) => p.points === minPoints);

    // Jika ada beberapa peserta di poin terendah yang sama, acak
    const shuffledLowest = shuffleArray(lowestTier, rng);

    // Kita coba kandidat BYE dari shuffledLowest satu per satu hingga sisa pemain bisa dipasangkan
    let foundByeAndPairing = false;
    let successfulPairs: [PairingPlayer, PairingPlayer][] | null = null;
    let chosenBye: PairingPlayer | null = null;

    for (const candidate of shuffledLowest) {
      const rest = playersToPair.filter((p) => p.id !== candidate.id);
      const orderedRest = orderPlayersForPairing(roundNumber, rest, rng);
      const pairs = backtrackPairing(orderedRest, pastMatches, []);
      if (pairs !== null) {
        foundByeAndPairing = true;
        successfulPairs = pairs;
        chosenBye = candidate;
        break;
      }
    }

    if (!foundByeAndPairing) {
      // Jika tidak ada kandidat terendah yang menghasilkan pairing valid sempurna,
      // pilih kandidat pertama dan lakukan fallback
      chosenBye = shuffledLowest[0];
      const rest = playersToPair.filter((p) => p.id !== chosenBye!.id);
      const orderedRest = orderPlayersForPairing(roundNumber, rest, rng);
      successfulPairs = fallbackGreedyPairing(orderedRest, pastMatches);
    }

    byePlayer = chosenBye;
    playersToPair = playersToPair.filter((p) => p.id !== chosenBye!.id);

    // Buat daftar pertandingan
    const matches: GeneratedMatch[] = [];
    let tableNumber = 1;

    for (const [p1, p2] of successfulPairs!) {
      matches.push({
        table: tableNumber++,
        p1Id: p1.id,
        p2Id: p2.id,
        p1Name: p1.name,
        p2Name: p2.name,
        p1Score: 0,
        p2Score: 0,
        status: 'pending',
        isBye: false,
      });
    }

    // Tambahkan BYE match (otomatis menang, status confirmed)
    matches.push({
      table: tableNumber++,
      p1Id: byePlayer!.id,
      p2Id: null,
      p1Name: byePlayer!.name,
      p2Name: 'BYE',
      p1Score: format === 'BO1' ? 1 : 2,
      p2Score: 0,
      status: 'confirmed',
      isBye: true,
    });

    const hasRematch = successfulPairs!.some(([p1, p2]) => hasPlayedBefore(p1.id, p2.id, pastMatches));

    return {
      round: roundNumber,
      matches,
      hasSolution: !hasRematch,
      warning: hasRematch
        ? 'Tidak ditemukan solusi pairing otomatis tanpa tanding ulang. Anda dapat menukar pairing secara manual.'
        : undefined,
      byePlayerId: byePlayer!.id,
    };
  }

  // 3. Jumlah peserta GENAP
  const orderedPlayers = orderPlayersForPairing(roundNumber, playersToPair, rng);
  let pairs = backtrackPairing(orderedPlayers, pastMatches, []);
  let hasSolution = true;
  let warning: string | undefined = undefined;

  if (pairs === null) {
    hasSolution = false;
    warning = 'Tidak ditemukan solusi pairing otomatis tanpa tanding ulang. Anda dapat menukar pairing secara manual.';
    pairs = fallbackGreedyPairing(orderedPlayers, pastMatches);
  }

  const matches: GeneratedMatch[] = [];
  let tableNumber = 1;

  for (const [p1, p2] of pairs) {
    matches.push({
      table: tableNumber++,
      p1Id: p1.id,
      p2Id: p2.id,
      p1Name: p1.name,
      p2Name: p2.name,
      p1Score: 0,
      p2Score: 0,
      status: 'pending',
      isBye: false,
    });
  }

  return {
    round: roundNumber,
    matches,
    hasSolution,
    warning,
    byePlayerId: null,
  };
}

/**
 * Menyiapkan susunan pemain sebelum pairing:
 * - Ronde 1: acak penuh.
 * - Ronde berikutnya: urutkan berdasarkan grup poin (Score Brackets), acak di dalam kelompok poin yang sama.
 */
function orderPlayersForPairing(
  roundNumber: number,
  players: PairingPlayer[],
  rng?: () => number
): PairingPlayer[] {
  if (roundNumber === 1) {
    return shuffleArray(players, rng);
  }

  // Kelompokkan berdasarkan poin
  const groupsByPoints = new Map<number, PairingPlayer[]>();
  for (const player of players) {
    const list = groupsByPoints.get(player.points) || [];
    list.push(player);
    groupsByPoints.set(player.points, list);
  }

  // Urutkan grup poin dari terbesar ke terkecil
  const sortedPoints = Array.from(groupsByPoints.keys()).sort((a, b) => b - a);

  const result: PairingPlayer[] = [];
  for (const pts of sortedPoints) {
    const group = groupsByPoints.get(pts)!;
    // Acak pemain dalam kelompok poin yang sama
    const shuffledGroup = shuffleArray(group, rng);
    result.push(...shuffledGroup);
  }

  return result;
}

/**
 * Validasi penukaran manual dua meja atau dua pemain.
 * Mengecek apakah penukaran akan menyebabkan pertandingan ulang (rematch).
 */
export function validateManualSwap(
  playerAId: string,
  newOpponentId: string | null,
  pastMatches: PastMatchRecord[]
): { isValid: boolean; warning?: string } {
  if (newOpponentId === null) {
    // Pasangan dengan BYE
    const pastByes = getPlayersWithPastBye(pastMatches);
    if (pastByes.has(playerAId)) {
      return {
        isValid: false,
        warning: 'Pemain ini sudah pernah mendapatkan BYE di ronde sebelumnya.',
      };
    }
    return { isValid: true };
  }

  if (hasPlayedBefore(playerAId, newOpponentId, pastMatches)) {
    return {
      isValid: false,
      warning: 'Kedua pemain ini sudah pernah bertanding di ronde sebelumnya (rematch).',
    };
  }

  return { isValid: true };
}
