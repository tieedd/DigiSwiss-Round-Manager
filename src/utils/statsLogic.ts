export type DeckColor =
  | 'Merah'
  | 'Biru'
  | 'Kuning'
  | 'Hijau'
  | 'Hitam'
  | 'Ungu'
  | 'Putih';

export interface Participation {
  id: string;
  tournamentId?: string;
  tournamentName: string;
  date: string;
  format?: string;
  playerId?: string;
  uid?: string | null;
  organizerId?: string;
  name?: string;
  rank: number;
  wins: number;
  losses: number;
  gamesWon?: number;
  gamesLost?: number;
  points?: number;
  omw?: number;
  gw?: number;
  ogw?: number;
  deckName?: string;
  deckColors?: DeckColor[];
  createdAt?: number;
}

export interface Tournament {
  id: string;
  name: string;
  status: string;
  [key: string]: any;
}

export interface UserProfile {
  username: string;
  role: string;
  [key: string]: any;
}

export interface PlayerStatsSummary {
  totalTournaments: number;
  totalWins: number;
  totalLosses: number;
  winRate: number;
  mostPlayedDeck: string;
  mostPlayedColor: DeckColor | string;
  rankTrend: Array<{
    tournamentName: string;
    date: string;
    rank: number;
    points: number;
  }>;
  deckStats: Array<{
    deckName: string;
    count: number;
    wins: number;
    losses: number;
    winRate: number;
  }>;
  colorStats: Array<{
    color: DeckColor;
    count: number;
    wins: number;
    losses: number;
    winRate: number;
  }>;
}

export interface OrganizerStatsSummary {
  totalTournaments: number;
  averagePlayers: number;
  totalParticipants: number;
  mostPopularDeck: string;
  highestWinRateColor: DeckColor | string;
  colorDistribution: Array<{
    color: DeckColor;
    count: number;
    percentage: number;
  }>;
  popularDecks: Array<{
    deckName: string;
    count: number;
    percentage: number;
  }>;
  colorWinRates: Array<{
    color: DeckColor;
    wins: number;
    losses: number;
    winRate: number;
  }>;
}

export interface AdminStatsSummary {
  totalUsers: number;
  usersByRole: {
    player: number;
    organizer: number;
    admin: number;
  };
  totalTournaments: number;
  tournamentsByStatus: {
    registration: number;
    running: number;
    finished: number;
  };
  totalParticipations: number;
  topDecksGlobal: Array<{
    deckName: string;
    count: number;
  }>;
  colorDistributionGlobal: Array<{
    color: DeckColor;
    count: number;
    percentage: number;
  }>;
}

const ALL_OFFICIAL_COLORS: DeckColor[] = [
  'Merah',
  'Biru',
  'Kuning',
  'Hijau',
  'Hitam',
  'Ungu',
  'Putih'
];

/**
 * Menghitung statistik performa seorang pemain dari daftar partisipasinya
 */
export function calculatePlayerStats(participations: Participation[]): PlayerStatsSummary {
  if (!participations || participations.length === 0) {
    return {
      totalTournaments: 0,
      totalWins: 0,
      totalLosses: 0,
      winRate: 0,
      mostPlayedDeck: '-',
      mostPlayedColor: '-',
      rankTrend: [],
      deckStats: [],
      colorStats: []
    };
  }

  let totalWins = 0;
  let totalLosses = 0;
  const deckMap = new Map<string, { count: number; wins: number; losses: number }>();
  const colorMap = new Map<DeckColor, { count: number; wins: number; losses: number }>();

  ALL_OFFICIAL_COLORS.forEach((c) => {
    colorMap.set(c, { count: 0, wins: 0, losses: 0 });
  });

  const rankTrend: Array<{ tournamentName: string; date: string; rank: number; points: number }> = [];

  // Urutkan berdasarkan tanggal partisipasi
  const sorted = [...participations].sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));

  sorted.forEach((p) => {
    totalWins += p.wins || 0;
    totalLosses += p.losses || 0;

    rankTrend.push({
      tournamentName: p.tournamentName,
      date: p.date,
      rank: p.rank,
      points: p.points
    });

    // Deck stats
    if (p.deckName && p.deckName.trim().length > 0) {
      const dName = p.deckName.trim();
      const current = deckMap.get(dName) || { count: 0, wins: 0, losses: 0 };
      current.count += 1;
      current.wins += p.wins || 0;
      current.losses += p.losses || 0;
      deckMap.set(dName, current);
    }

    // Color stats
    if (Array.isArray(p.deckColors)) {
      p.deckColors.forEach((color) => {
        const cData = colorMap.get(color as DeckColor) || { count: 0, wins: 0, losses: 0 };
        cData.count += 1;
        cData.wins += p.wins || 0;
        cData.losses += p.losses || 0;
        colorMap.set(color as DeckColor, cData);
      });
    }
  });

  const totalMatches = totalWins + totalLosses;
  const winRate = totalMatches > 0 ? Math.round((totalWins / totalMatches) * 1000) / 10 : 0;

  // Most played deck
  let mostPlayedDeck = '-';
  let maxDeckCount = 0;
  const deckStats: PlayerStatsSummary['deckStats'] = [];
  deckMap.forEach((val, key) => {
    const total = val.wins + val.losses;
    const wr = total > 0 ? Math.round((val.wins / total) * 1000) / 10 : 0;
    deckStats.push({
      deckName: key,
      count: val.count,
      wins: val.wins,
      losses: val.losses,
      winRate: wr
    });
    if (val.count > maxDeckCount) {
      maxDeckCount = val.count;
      mostPlayedDeck = key;
    }
  });
  deckStats.sort((a, b) => b.count - a.count);

  // Most played color & list
  let mostPlayedColor = '-';
  let maxColorCount = 0;
  const colorStats: PlayerStatsSummary['colorStats'] = [];
  colorMap.forEach((val, key) => {
    if (val.count > 0) {
      const total = val.wins + val.losses;
      const wr = total > 0 ? Math.round((val.wins / total) * 1000) / 10 : 0;
      colorStats.push({
        color: key,
        count: val.count,
        wins: val.wins,
        losses: val.losses,
        winRate: wr
      });
      if (val.count > maxColorCount) {
        maxColorCount = val.count;
        mostPlayedColor = key;
      }
    }
  });
  colorStats.sort((a, b) => b.count - a.count);

  return {
    totalTournaments: participations.length,
    totalWins,
    totalLosses,
    winRate,
    mostPlayedDeck,
    mostPlayedColor,
    rankTrend,
    deckStats,
    colorStats
  };
}

/**
 * Menghitung statistik untuk organizer dari turnamen dan partisipasi yang diadakan
 */
export function calculateOrganizerStats(
  tournaments: Tournament[],
  participations: Participation[]
): OrganizerStatsSummary {
  if (!tournaments || tournaments.length === 0) {
    return {
      totalTournaments: 0,
      averagePlayers: 0,
      totalParticipants: 0,
      mostPopularDeck: '-',
      highestWinRateColor: '-',
      colorDistribution: [],
      popularDecks: [],
      colorWinRates: []
    };
  }

  const totalTournaments = tournaments.length;
  const totalParticipants = participations.length;
  const averagePlayers = totalTournaments > 0 ? Math.round((totalParticipants / totalTournaments) * 10) / 10 : 0;

  const deckCountMap = new Map<string, number>();
  const colorCountMap = new Map<DeckColor, number>();
  const colorMatchMap = new Map<DeckColor, { wins: number; losses: number }>();

  ALL_OFFICIAL_COLORS.forEach((c) => {
    colorCountMap.set(c, 0);
    colorMatchMap.set(c, { wins: 0, losses: 0 });
  });

  let totalColorAppearances = 0;

  participations.forEach((p) => {
    if (p.deckName && p.deckName.trim().length > 0) {
      const d = p.deckName.trim();
      deckCountMap.set(d, (deckCountMap.get(d) || 0) + 1);
    }

    if (Array.isArray(p.deckColors)) {
      p.deckColors.forEach((color) => {
        const c = color as DeckColor;
        colorCountMap.set(c, (colorCountMap.get(c) || 0) + 1);
        totalColorAppearances += 1;

        const m = colorMatchMap.get(c) || { wins: 0, losses: 0 };
        m.wins += p.wins || 0;
        m.losses += p.losses || 0;
        colorMatchMap.set(c, m);
      });
    }
  });

  // Popular decks
  const popularDecks: OrganizerStatsSummary['popularDecks'] = [];
  let mostPopularDeck = '-';
  let maxDeck = 0;

  deckCountMap.forEach((count, deckName) => {
    const percentage = totalParticipants > 0 ? Math.round((count / totalParticipants) * 100) : 0;
    popularDecks.push({ deckName, count, percentage });
    if (count > maxDeck) {
      maxDeck = count;
      mostPopularDeck = deckName;
    }
  });
  popularDecks.sort((a, b) => b.count - a.count);

  // Color distribution
  const colorDistribution: OrganizerStatsSummary['colorDistribution'] = [];
  colorCountMap.forEach((count, color) => {
    if (count > 0) {
      const percentage = totalColorAppearances > 0 ? Math.round((count / totalColorAppearances) * 100) : 0;
      colorDistribution.push({ color, count, percentage });
    }
  });
  colorDistribution.sort((a, b) => b.count - a.count);

  // Color win rates
  const colorWinRates: OrganizerStatsSummary['colorWinRates'] = [];
  let highestWinRateColor = '-';
  let maxWr = -1;

  colorMatchMap.forEach((val, color) => {
    const total = val.wins + val.losses;
    if (total > 0) {
      const wr = Math.round((val.wins / total) * 1000) / 10;
      colorWinRates.push({ color, wins: val.wins, losses: val.losses, winRate: wr });
      if (wr > maxWr && val.wins + val.losses >= 2) {
        maxWr = wr;
        highestWinRateColor = color;
      }
    }
  });
  colorWinRates.sort((a, b) => b.winRate - a.winRate);

  return {
    totalTournaments,
    averagePlayers,
    totalParticipants,
    mostPopularDeck,
    highestWinRateColor,
    colorDistribution,
    popularDecks,
    colorWinRates
  };
}

/**
 * Menghitung statistik sistem global untuk Administrator
 */
export function calculateAdminStats(
  users: UserProfile[],
  tournaments: Tournament[],
  participations: Participation[]
): AdminStatsSummary {
  const usersByRole = {
    player: 0,
    organizer: 0,
    admin: 0
  };

  users.forEach((u) => {
    if (u.role === 'admin') usersByRole.admin += 1;
    else if (u.role === 'organizer') usersByRole.organizer += 1;
    else usersByRole.player += 1;
  });

  const tournamentsByStatus = {
    registration: 0,
    running: 0,
    finished: 0
  };

  tournaments.forEach((t) => {
    if (t.status === 'registration') tournamentsByStatus.registration += 1;
    else if (t.status === 'running') tournamentsByStatus.running += 1;
    else if (t.status === 'finished') tournamentsByStatus.finished += 1;
  });

  const deckMap = new Map<string, number>();
  const colorMap = new Map<DeckColor, number>();
  let totalColors = 0;

  ALL_OFFICIAL_COLORS.forEach((c) => colorMap.set(c, 0));

  participations.forEach((p) => {
    if (p.deckName && p.deckName.trim().length > 0) {
      const name = p.deckName.trim();
      deckMap.set(name, (deckMap.get(name) || 0) + 1);
    }
    if (Array.isArray(p.deckColors)) {
      p.deckColors.forEach((color) => {
        const c = color as DeckColor;
        colorMap.set(c, (colorMap.get(c) || 0) + 1);
        totalColors += 1;
      });
    }
  });

  const topDecksGlobal: AdminStatsSummary['topDecksGlobal'] = [];
  deckMap.forEach((count, deckName) => {
    topDecksGlobal.push({ deckName, count });
  });
  topDecksGlobal.sort((a, b) => b.count - a.count);

  const colorDistributionGlobal: AdminStatsSummary['colorDistributionGlobal'] = [];
  colorMap.forEach((count, color) => {
    if (count > 0) {
      const percentage = totalColors > 0 ? Math.round((count / totalColors) * 100) : 0;
      colorDistributionGlobal.push({ color, count, percentage });
    }
  });
  colorDistributionGlobal.sort((a, b) => b.count - a.count);

  return {
    totalUsers: users.length,
    usersByRole,
    totalTournaments: tournaments.length,
    tournamentsByStatus,
    totalParticipations: participations.length,
    topDecksGlobal: topDecksGlobal.slice(0, 10),
    colorDistributionGlobal
  };
}
