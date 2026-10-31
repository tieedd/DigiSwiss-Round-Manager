/**
 * DigiSwiss-Round: Modul Perhitungan Skor dan Klasemen Sistem Swiss (Tahap 6)
 * Mematuhi aturan resmi turnamen:
 * - BO1: Menang = 3 poin, Kalah = 0 poin.
 * - BO3: 2-0 = 3 poin, 2-1 = 2 poin, 1-2 = 1 poin (kalah tetap dapat poin), 0-2 = 0 poin.
 * - Tidak ada seri.
 * - Tie-breaker berurutan:
 *   1. OMW% (Opponent Match Win %)
 *   2. GW% (Game Win %)
 *   3. OGW% (Opponent Game Win %)
 *   4. Head-to-Head
 * - Nilai minimum 33.33% per lawan untuk perhitungan OMW% dan OGW%.
 * - Pertandingan BYE tidak dihitung sebagai lawan pada OMW% dan OGW%.
 */

export type TournamentFormat = 'BO1' | 'BO3';

/**
 * Objek Konfigurasi Perolehan Poin Resmi
 */
export const SCORING_CONFIG = {
  BO1: {
    WIN: 3,
    LOSS: 0,
  },
  BO3: {
    '2-0': 3,
    '2-1': 2,
    '1-2': 1,
    '0-2': 0,
  },
} as const;

/**
 * Menghitung perolehan poin dari satu pertandingan
 */
export function calculateMatchPoints(
  format: TournamentFormat,
  myScore: number,
  oppScore: number,
  isBye: boolean = false
): number {
  if (isBye) {
    return SCORING_CONFIG.BO1.WIN; // 3 poin untuk BYE
  }

  if (format === 'BO1') {
    return myScore > oppScore ? SCORING_CONFIG.BO1.WIN : SCORING_CONFIG.BO1.LOSS;
  }

  // Format BO3
  const scoreKey = `${myScore}-${oppScore}` as keyof typeof SCORING_CONFIG.BO3;
  if (scoreKey in SCORING_CONFIG.BO3) {
    return SCORING_CONFIG.BO3[scoreKey];
  }

  // Pengaman jika input non-standar
  if (myScore > oppScore) {
    return myScore === 2 && oppScore === 1 ? 2 : 3;
  }
  if (myScore === 1 && oppScore === 2) {
    return 1;
  }
  return 0;
}

export interface PlayerStanding {
  rank: number;
  playerId: string;
  playerName: string;
  points: number;
  matchWins: number;
  matchLosses: number;
  gamesWon: number;
  gamesLost: number;
  omw: number; // Opponent Match Win % (minimum 33.33%, lawan BYE tidak dihitung)
  gw: number;  // Game Win % (minimum 33.33%)
  ogw: number; // Opponent Game Win % (minimum 33.33%, lawan BYE tidak dihitung)
  isDropped?: boolean;
}

export interface StandingPlayerInput {
  id: string;
  name: string;
  status?: string;
}

export interface StandingMatchInput {
  p1Id: string;
  p2Id: string | null; // null jika BYE
  p1Score: number;
  p2Score: number;
  status: string;
  archived?: boolean;
}

/**
 * Menghitung Klasemen Turnamen Lengkap (Sisi Klien)
 */
export function calculateTournamentStandings(
  players: StandingPlayerInput[],
  matches: StandingMatchInput[],
  format: TournamentFormat
): PlayerStanding[] {
  // Hanya pertimbangkan pertandingan yang sudah terkonfirmasi (confirmed) dan TIDAK diarsipkan
  const confirmedMatches = matches.filter((m) => m.status === 'confirmed' && !m.archived);

  // Struktur akumulasi data per pemain
  interface PlayerAccumulator {
    id: string;
    name: string;
    isDropped: boolean;
    points: number;
    matchWins: number;
    matchLosses: number;
    gamesWon: number;
    gamesLost: number;
    realOpponentIds: string[]; // Tidak termasuk BYE
  }

  const accumulators = new Map<string, PlayerAccumulator>();

  for (const p of players) {
    accumulators.set(p.id, {
      id: p.id,
      name: p.name,
      isDropped: p.status === 'dropped',
      points: 0,
      matchWins: 0,
      matchLosses: 0,
      gamesWon: 0,
      gamesLost: 0,
      realOpponentIds: [],
    });
  }

  // 1. Akumulasi Poin, Menang, Kalah, Game Menang, Game Kalah, dan Daftar Lawan
  for (const m of confirmedMatches) {
    const isBye = m.p2Id === null;
    const p1 = accumulators.get(m.p1Id);

    if (p1) {
      const p1Points = calculateMatchPoints(format, m.p1Score, m.p2Score, isBye);
      p1.points += p1Points;
      p1.gamesWon += m.p1Score;
      p1.gamesLost += m.p2Score;

      if (isBye || m.p1Score > m.p2Score) {
        p1.matchWins += 1;
      } else {
        p1.matchLosses += 1;
      }

      if (!isBye && m.p2Id) {
        p1.realOpponentIds.push(m.p2Id);
      }
    }

    if (!isBye && m.p2Id) {
      const p2 = accumulators.get(m.p2Id);
      if (p2) {
        const p2Points = calculateMatchPoints(format, m.p2Score, m.p1Score, false);
        p2.points += p2Points;
        p2.gamesWon += m.p2Score;
        p2.gamesLost += m.p1Score;

        if (m.p2Score > m.p1Score) {
          p2.matchWins += 1;
        } else {
          p2.matchLosses += 1;
        }

        p2.realOpponentIds.push(m.p1Id);
      }
    }
  }

  // 2. Hitung MW% (Match Win %) dan GW% (Game Win %) individu masing-masing pemain
  // Batas minimum 33.33% (0.3333) per standar resmi
  const playerMW = new Map<string, number>();
  const playerGW = new Map<string, number>();

  for (const [id, acc] of accumulators.entries()) {
    const totalMatches = acc.matchWins + acc.matchLosses;
    const rawMW = totalMatches > 0 ? (acc.matchWins / totalMatches) * 100 : 33.33;
    playerMW.set(id, Math.max(33.33, rawMW));

    const totalGames = acc.gamesWon + acc.gamesLost;
    const rawGW = totalGames > 0 ? (acc.gamesWon / totalGames) * 100 : 33.33;
    playerGW.set(id, Math.max(33.33, rawGW));
  }

  // 3. Hitung OMW% dan OGW% untuk masing-masing pemain (tidak menghitung BYE)
  const playerOMW = new Map<string, number>();
  const playerOGW = new Map<string, number>();

  for (const [id, acc] of accumulators.entries()) {
    if (acc.realOpponentIds.length === 0) {
      playerOMW.set(id, 33.33);
      playerOGW.set(id, 33.33);
    } else {
      // OMW%: Rata-rata MW% seluruh lawan nyata
      const sumOppMW = acc.realOpponentIds.reduce(
        (sum, oppId) => sum + (playerMW.get(oppId) ?? 33.33),
        0
      );
      const omw = sumOppMW / acc.realOpponentIds.length;
      playerOMW.set(id, Math.round(omw * 100) / 100);

      // OGW%: Rata-rata GW% seluruh lawan nyata
      const sumOppGW = acc.realOpponentIds.reduce(
        (sum, oppId) => sum + (playerGW.get(oppId) ?? 33.33),
        0
      );
      const ogw = sumOppGW / acc.realOpponentIds.length;
      playerOGW.set(id, Math.round(ogw * 100) / 100);
    }
  }

  // 4. Struktur data awal klasemen
  const standings: PlayerStanding[] = [];

  for (const [id, acc] of accumulators.entries()) {
    standings.push({
      rank: 1,
      playerId: id,
      playerName: acc.name,
      points: acc.points,
      matchWins: acc.matchWins,
      matchLosses: acc.matchLosses,
      gamesWon: acc.gamesWon,
      gamesLost: acc.gamesLost,
      omw: playerOMW.get(id) ?? 33.33,
      gw: Math.round((playerGW.get(id) ?? 33.33) * 100) / 100,
      ogw: playerOGW.get(id) ?? 33.33,
      isDropped: acc.isDropped,
    });
  }

  // 5. Fungsi Pengecekan Head-to-Head
  const checkHeadToHead = (playerAId: string, playerBId: string): number => {
    // Cari pertandingan langsung antara player A dan player B
    const directMatch = confirmedMatches.find(
      (m) =>
        m.p2Id !== null &&
        ((m.p1Id === playerAId && m.p2Id === playerBId) ||
          (m.p1Id === playerBId && m.p2Id === playerAId))
    );

    if (!directMatch) return 0; // Belum pernah bertemu

    if (directMatch.p1Id === playerAId) {
      if (directMatch.p1Score > directMatch.p2Score) return -1; // A menang atas B -> A peringkat lebih tinggi
      if (directMatch.p2Score > directMatch.p1Score) return 1;  // B menang atas A -> B peringkat lebih tinggi
    } else {
      if (directMatch.p2Score > directMatch.p1Score) return -1; // A menang atas B
      if (directMatch.p1Score > directMatch.p2Score) return 1;  // B menang atas A
    }

    return 0;
  };

  // 6. Urutkan berdasarkan:
  // (1) Poin
  // (2) OMW%
  // (3) GW%
  // (4) OGW%
  // (5) Head-to-Head
  standings.sort((a, b) => {
    // 1. Poin tertinggi
    if (b.points !== a.points) {
      return b.points - a.points;
    }

    // 2. OMW% tertinggi
    if (Math.abs(b.omw - a.omw) > 0.001) {
      return b.omw - a.omw;
    }

    // 3. GW% tertinggi
    if (Math.abs(b.gw - a.gw) > 0.001) {
      return b.gw - a.gw;
    }

    // 4. OGW% tertinggi
    if (Math.abs(b.ogw - a.ogw) > 0.001) {
      return b.ogw - a.ogw;
    }

    // 5. Head-to-Head
    const h2h = checkHeadToHead(a.playerId, b.playerId);
    if (h2h !== 0) {
      return h2h;
    }

    // Default stabil berdasarkan nama
    return a.playerName.localeCompare(b.playerName);
  });

  // 7. Berikan nomor peringkat (1, 2, 3...)
  for (let i = 0; i < standings.length; i++) {
    standings[i].rank = i + 1;
  }

  return standings;
}
