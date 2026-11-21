import type {
  Participation,
  Tournament,
  TournamentSeason,
} from '../types/index.ts';
import { formatSeasonLabel, isLeagueTournament } from './seasonLogic.ts';
import { formatIndonesianFullDate } from './exportFormatLogic.ts';

export interface LeagueSeasonBreakdownItem {
  tournamentId: string;
  tournamentName: string;
  seasonLabel: string;
  date: string;
  season?: TournamentSeason;
  points: number;
  wins: number;
  losses: number;
  rank: number;
  topCutResult?: string;
}

export interface LeagueCumulativePlayerStanding {
  rank: number;
  playerKey: string;
  playerName: string;
  uid: string | null;
  totalPoints: number;
  totalWins: number;
  totalLosses: number;
  seasonsCount: number;
  seasonBreakdown: LeagueSeasonBreakdownItem[];
}

export interface LeagueOrganizerOption {
  organizerId: string;
  organizerName: string;
  tournamentsCount: number;
  latestDate: string;
}

export interface LeagueCumulativeSummary {
  organizerId: string;
  organizerName: string;
  tournaments: Tournament[];
  standings: LeagueCumulativePlayerStanding[];
}

/**
 * Mengambil hanya Turnamen Liga yang sudah berstatus 'finished'.
 * Turnamen reguler maupun Liga berstatus 'registration'/'running' selalu dikecualikan.
 */
export function filterFinishedLeagueTournaments(
  tournaments: ReadonlyArray<Tournament>
): Tournament[] {
  return tournaments.filter(
    (t) => t && t.status === 'finished' && isLeagueTournament(t)
  );
}

/**
 * Mengurutkan Turnamen Liga secara kronologis berdasarkan season (tahun, bulan, nomor)
 * lalu tanggal & waktu pembuatan.
 */
export function sortSeasonTournamentsChronologically(
  tournaments: ReadonlyArray<Tournament>
): Tournament[] {
  return [...tournaments].sort((a, b) => {
    const ya = Number(a.season?.year || 0);
    const yb = Number(b.season?.year || 0);
    if (ya !== yb) return ya - yb;

    const ma = Number(a.season?.month || 0);
    const mb = Number(b.season?.month || 0);
    if (ma !== mb) return ma - mb;

    const na = Number(a.season?.number || 0);
    const nb = Number(b.season?.number || 0);
    if (na !== nb) return na - nb;

    const da = (a.date || '').localeCompare(b.date || '');
    if (da !== 0) return da;

    return (a.createdAt || 0) - (b.createdAt || 0);
  });
}

/**
 * Mengekstrak daftar organizer unik yang memiliki minimal 1 Turnamen Liga berstatus 'finished'.
 */
export function extractLeagueOrganizers(
  tournaments: ReadonlyArray<Tournament>
): LeagueOrganizerOption[] {
  const finishedLeagues = sortSeasonTournamentsChronologically(
    filterFinishedLeagueTournaments(tournaments)
  );

  const map = new Map<string, LeagueOrganizerOption>();
  for (const t of finishedLeagues) {
    if (!t.organizerId) continue;
    const existing = map.get(t.organizerId);
    if (!existing) {
      map.set(t.organizerId, {
        organizerId: t.organizerId,
        organizerName: t.organizerName || 'Organizer',
        tournamentsCount: 1,
        latestDate: t.date || '',
      });
    } else {
      existing.tournamentsCount += 1;
      if (t.organizerName && t.organizerName.trim()) {
        existing.organizerName = t.organizerName;
      }
      if ((t.date || '') > existing.latestDate) {
        existing.latestDate = t.date || '';
      }
    }
  }

  return Array.from(map.values()).sort((a, b) => {
    if (b.tournamentsCount !== a.tournamentsCount) {
      return b.tournamentsCount - a.tournamentsCount;
    }
    const dateCmp = b.latestDate.localeCompare(a.latestDate);
    if (dateCmp !== 0) return dateCmp;
    return a.organizerName.localeCompare(b.organizerName, 'id', {
      sensitivity: 'base',
    });
  });
}

/**
 * Menentukan kunci unik pemain untuk penggabungan lintas season:
 * - Pemain terdaftar: berdasarkan `uid` agar konsisten meski nama berubah
 * - Pemain manual (tanpa uid): berdasarkan nama yang dinormalisasi (trimmed lowercase)
 */
export function resolveCumulativePlayerKey(
  p: Pick<Participation, 'uid' | 'playerId' | 'name'>
): string {
  const uid = (p.uid || '').trim();
  if (uid) return `uid:${uid}`;
  const normalizedName = (p.name || '').trim().toLowerCase();
  if (normalizedName) return `name:${normalizedName}`;
  return `pid:${p.playerId || ''}`;
}

function getSeasonDisplayLabel(t: Pick<Tournament, 'season' | 'name'>): string {
  return formatSeasonLabel(t.season) || t.name || 'SEASON';
}

/**
 * Menghitung klasemen poin Liga lintas season milik SATU organizer tertentu.
 * Hanya menjumlahkan poin Hasil Akhir (field `points` di `participations`)
 * dari Turnamen Liga berstatus 'finished'.
 */
export function computeLeagueCumulativeStandings(
  tournaments: ReadonlyArray<Tournament>,
  participations: ReadonlyArray<Participation>,
  organizerId: string
): LeagueCumulativeSummary {
  const orgFinishedLeagues = sortSeasonTournamentsChronologically(
    filterFinishedLeagueTournaments(tournaments).filter(
      (t) => t.organizerId === organizerId
    )
  );

  const tournamentById = new Map<string, Tournament>();
  const tournamentOrder = new Map<string, number>();
  orgFinishedLeagues.forEach((t, idx) => {
    tournamentById.set(t.id, t);
    tournamentOrder.set(t.id, idx);
  });

  const organizerName =
    orgFinishedLeagues.length > 0
      ? orgFinishedLeagues[orgFinishedLeagues.length - 1].organizerName || 'Organizer'
      : 'Organizer';

  interface Accumulator {
    playerKey: string;
    playerName: string;
    latestOrder: number;
    uid: string | null;
    totalPoints: number;
    totalWins: number;
    totalLosses: number;
    seenTournamentIds: Set<string>;
    breakdown: Array<{ order: number; item: LeagueSeasonBreakdownItem }>;
  }

  const accMap = new Map<string, Accumulator>();

  for (const p of participations) {
    const tourney = tournamentById.get(p.tournamentId);
    if (!tourney) continue;

    const key = resolveCumulativePlayerKey(p);
    const order = tournamentOrder.get(tourney.id) ?? 0;

    let acc = accMap.get(key);
    if (!acc) {
      acc = {
        playerKey: key,
        playerName: (p.name || 'Pemain').trim() || 'Pemain',
        latestOrder: order,
        uid: p.uid || null,
        totalPoints: 0,
        totalWins: 0,
        totalLosses: 0,
        seenTournamentIds: new Set<string>(),
        breakdown: [],
      };
      accMap.set(key, acc);
    }

    // Hindari duplikasi untuk pemain & turnamen yang sama
    if (acc.seenTournamentIds.has(tourney.id)) continue;
    acc.seenTournamentIds.add(tourney.id);

    if (order >= acc.latestOrder && p.name && p.name.trim()) {
      acc.playerName = p.name.trim();
      acc.latestOrder = order;
    }
    if (!acc.uid && p.uid) {
      acc.uid = p.uid;
    }

    const pts = Number.isFinite(p.points) ? p.points : 0;
    const wins = Number.isFinite(p.wins) ? p.wins : 0;
    const losses = Number.isFinite(p.losses) ? p.losses : 0;

    acc.totalPoints += pts;
    acc.totalWins += wins;
    acc.totalLosses += losses;

    acc.breakdown.push({
      order,
      item: {
        tournamentId: tourney.id,
        tournamentName: tourney.name,
        seasonLabel: getSeasonDisplayLabel(tourney),
        date: tourney.date || p.date || '',
        season: tourney.season,
        points: pts,
        wins,
        losses,
        rank: p.rank,
        ...(p.topCutResult ? { topCutResult: p.topCutResult } : {}),
      },
    });
  }

  const rows: LeagueCumulativePlayerStanding[] = Array.from(accMap.values()).map(
    (acc) => ({
      rank: 0,
      playerKey: acc.playerKey,
      playerName: acc.playerName,
      uid: acc.uid,
      totalPoints: acc.totalPoints,
      totalWins: acc.totalWins,
      totalLosses: acc.totalLosses,
      seasonsCount: acc.breakdown.length,
      seasonBreakdown: acc.breakdown
        .sort((a, b) => a.order - b.order)
        .map((entry) => entry.item),
    })
  );

  rows.sort((a, b) => {
    if (b.totalPoints !== a.totalPoints) {
      return b.totalPoints - a.totalPoints;
    }
    const diffA = a.totalWins - a.totalLosses;
    const diffB = b.totalWins - b.totalLosses;
    if (diffB !== diffA) {
      return diffB - diffA;
    }
    if (b.totalWins !== a.totalWins) {
      return b.totalWins - a.totalWins;
    }
    if (b.seasonsCount !== a.seasonsCount) {
      return b.seasonsCount - a.seasonsCount;
    }
    return a.playerName.localeCompare(b.playerName, 'id', {
      sensitivity: 'base',
    });
  });

  rows.forEach((row, idx) => {
    row.rank = idx + 1;
  });

  return {
    organizerId,
    organizerName,
    tournaments: orgFinishedLeagues,
    standings: rows,
  };
}

export function buildLeagueCumulativeExportFileName(
  organizerName: string,
  extension: 'png' | 'csv' | 'txt'
): string {
  const cleanOrg = (organizerName || 'Organizer')
    .trim()
    .replace(/\s+/g, '_')
    .replace(/[^a-zA-Z0-9_-]/g, '');
  const slug = cleanOrg || 'Organizer';
  return `Klasemen-Liga-Lintas-Season-${slug}.${extension}`;
}

export function generateLeagueCumulativeText(
  summary: LeagueCumulativeSummary,
  now: Date = new Date()
): string {
  const lines: string[] = [];
  lines.push('KLASEMEN POIN LIGA LINTAS SEASON');
  lines.push(`Organizer: ${summary.organizerName}`);
  lines.push(`Total Season Selesai: ${summary.tournaments.length} Season`);
  lines.push(`Total Pemain: ${summary.standings.length} Pemain`);
  lines.push(`Tanggal Cetak: ${formatIndonesianFullDate(now)}`);

  if (summary.tournaments.length > 0) {
    lines.push('');
    lines.push('DAFTAR SEASON YANG DIHITUNG:');
    summary.tournaments.forEach((t, idx) => {
      const sLabel = getSeasonDisplayLabel(t);
      lines.push(
        `${idx + 1}. ${t.name} (${sLabel}) — ${formatIndonesianFullDate(t.date)}`
      );
    });
  }

  lines.push('');
  lines.push('PERINGKAT AKUMULASI:');
  if (summary.standings.length === 0) {
    lines.push('Belum ada data pemain pada Turnamen Liga yang selesai.');
  } else {
    summary.standings.forEach((row) => {
      lines.push(
        `#${row.rank} ${row.playerName} — ${row.totalPoints} Pts | ${row.totalWins}W - ${row.totalLosses}L | ${row.seasonsCount} Season`
      );
      row.seasonBreakdown.forEach((sb) => {
        const tcText = sb.topCutResult ? `, ${sb.topCutResult}` : '';
        lines.push(
          `   • ${sb.seasonLabel}: ${sb.points} Pts (${sb.wins}W-${sb.losses}L, Rank #${sb.rank}${tcText})`
        );
      });
    });
  }

  lines.push('');
  lines.push(
    'Catatan: Poin dijumlahkan dari Hasil Akhir (Swiss + Top Cut) Turnamen Liga yang berstatus selesai.'
  );
  return lines.join('\n');
}

function csvEscape(val: string | number | undefined | null): string {
  const str = String(val ?? '');
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

export function generateLeagueCumulativeCsv(
  summary: LeagueCumulativeSummary
): string {
  const header = [
    'Rank',
    'Organizer',
    'Nama Pemain',
    'Total Poin',
    'Total Menang (W)',
    'Total Kalah (L)',
    'Jumlah Season',
    'Rincian Per Season',
  ];

  const rows = summary.standings.map((row) => {
    const breakdownText = row.seasonBreakdown
      .map((sb) => {
        const tc = sb.topCutResult ? `, ${sb.topCutResult}` : '';
        return `${sb.seasonLabel}: ${sb.points} Pts (${sb.wins}W-${sb.losses}L, Rank #${sb.rank}${tc})`;
      })
      .join(' | ');

    return [
      row.rank,
      summary.organizerName,
      row.playerName,
      row.totalPoints,
      row.totalWins,
      row.totalLosses,
      row.seasonsCount,
      breakdownText,
    ].map(csvEscape);
  });

  return [header.map(csvEscape).join(','), ...rows.map((r) => r.join(','))].join(
    '\n'
  );
}
