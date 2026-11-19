import type {
  DeckColor,
  LeagueDeckEntry,
  MatchStatus,
  TopCutSize,
  Tournament,
  TournamentMatch,
  TournamentPlayer
} from '../types/index.ts';
import { calculateTournamentStandings } from './standingsLogic.ts';
import {
  getRoundDisplayLabel,
  getTopCutRoundCount,
  isSwissMatch,
  isTopCutMatch
} from './topCutLogic.ts';
import { formatSeasonLabel } from './seasonLogic.ts';
import { formatDeckColorsEmoji } from './deckExportLogic.ts';

export type RoundExportKind = 'Standing' | 'Pairing' | 'Bracket';
export type RoundExportFileExtension = 'png' | 'txt' | 'csv';

export interface LeagueRoundStandingRow {
  rank: number;
  playerId: string;
  playerName: string;
  isDropped: boolean;
  points: number;
  matchWins: number;
  matchLosses: number;
  omw: number;
}

export interface LeagueRoundStandingsExportData {
  tournamentName: string;
  seasonLabel: string | null;
  date: string;
  organizerName: string;
  location: string;
  roundNumber: number;
  roundTitle: string;
  isAllConfirmed: boolean;
  rows: LeagueRoundStandingRow[];
}

export interface LeagueRoundPairingRow {
  table: number;
  tableLabel: string;
  isBye: boolean;
  p1Name: string;
  p1Decks: LeagueDeckEntry[];
  p2Name: string;
  p2Decks: LeagueDeckEntry[];
  p1Score: number | null;
  p2Score: number | null;
  winner: 'p1' | 'p2' | null;
}

export interface LeagueRoundPairingExportData {
  tournamentName: string;
  seasonLabel: string | null;
  date: string;
  organizerName: string;
  location: string;
  roundNumber: number;
  roundLabel: string;
  showScores: boolean;
  rows: LeagueRoundPairingRow[];
}

export interface LeagueBracketMatchSlot {
  table: number;
  tableLabel: string;
  isPlaceholder: boolean;
  p1Id?: string;
  p2Id?: string | null;
  p1Seed: number | null;
  p2Seed: number | null;
  p1Name: string;
  p2Name: string;
  p1Decks: LeagueDeckEntry[];
  p2Decks: LeagueDeckEntry[];
  p1Score: number | null;
  p2Score: number | null;
  winner: 'p1' | 'p2' | null;
}

export interface LeagueBracketStage {
  roundNumber: number;
  label: string;
  isFinal: boolean;
  showScores: boolean;
  slots: LeagueBracketMatchSlot[];
}

export interface LeagueBracketChampion {
  playerId: string;
  name: string;
  seedNumber: number | null;
  decks: LeagueDeckEntry[];
}

export interface LeagueTopCutBracketExportData {
  tournamentName: string;
  seasonLabel: string | null;
  date: string;
  organizerName: string;
  location: string;
  topCutSize: TopCutSize;
  roundLabel: string;
  stages: LeagueBracketStage[];
  champion: LeagueBracketChampion | null;
}

export type WaitingMatchStatusLabel =
  | 'Belum ada input'
  | 'Menunggu konfirmasi'
  | 'Sengketa';

export interface WaitingMatchItem {
  id: string;
  table: number;
  p1Name: string;
  p2Name: string;
  status: MatchStatus;
  statusLabel: WaitingMatchStatusLabel;
}

export function escapeCsvCell(val: string | number | undefined | null): string {
  if (val === undefined || val === null) return '""';
  const str = String(val).replace(/"/g, '""');
  return `"${str}"`;
}

function toFileSlug(input: string | undefined | null, fallback: string): string {
  const cleaned = (input || '')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/[^a-zA-Z0-9-]/g, '')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
  return cleaned || fallback;
}

/**
 * Membentuk nama berkas ekspor per ronde Turnamen Liga.
 * Contoh: DCG-Banjarmasin_SEASON-1-NOVEMBER-2026_Ronde-2_Pairing.png
 */
export function buildLeagueRoundExportFileName(
  tournament: Pick<Tournament, 'name' | 'season'>,
  scopeLabel: string,
  exportKind: RoundExportKind,
  extension: RoundExportFileExtension
): string {
  const leagueSlug = toFileSlug(tournament.name, 'Liga');
  const seasonLabel = formatSeasonLabel(tournament.season);
  const seasonSlug = seasonLabel ? toFileSlug(seasonLabel, 'SEASON') : null;
  const scopeSlug = toFileSlug(scopeLabel, 'Ronde');
  const kindSlug = toFileSlug(exportKind, 'Ekspor');

  const parts = [leagueSlug, seasonSlug, scopeSlug, kindSlug].filter(Boolean);
  return `${parts.join('_')}.${extension}`;
}

/**
 * Skor ronde/babak hanya boleh tampil apabila ada pertandingan aktif
 * dan SELURUH pertandingan aktif tersebut berstatus 'confirmed'.
 */
export function canShowRoundScores(
  roundMatches: ReadonlyArray<Pick<TournamentMatch, 'status' | 'archived'>>
): boolean {
  const activeMatches = (roundMatches || []).filter((m) => !m.archived);
  if (activeMatches.length === 0) return false;
  return activeMatches.every((m) => m.status === 'confirmed');
}

export function getStandingRoundStatusTitle(
  roundNumber: number,
  isRoundAllConfirmed: boolean
): string {
  return isRoundAllConfirmed
    ? `Setelah Ronde ${roundNumber}`
    : `Sementara (Ronde ${roundNumber} berjalan)`;
}

function normalizeMatchDecks(
  decks?: ReadonlyArray<LeagueDeckEntry> | null
): LeagueDeckEntry[] {
  if (!Array.isArray(decks)) return [];
  return decks
    .filter((d) => Boolean(d && typeof d.name === 'string' && d.name.trim().length > 0))
    .slice(0, 2)
    .map((d) => ({
      name: d.name.trim(),
      colors: Array.isArray(d.colors) ? ([...d.colors] as DeckColor[]) : [],
    }));
}

export function formatPlayerDecksInlineText(
  decks: ReadonlyArray<LeagueDeckEntry>
): string {
  if (!decks || decks.length === 0) return '';
  return decks
    .map((d) => {
      const emoji = formatDeckColorsEmoji(d.colors);
      return `${d.name}${emoji ? ` ${emoji}` : ''}`;
    })
    .join(' & ');
}

/**
 * Menyusun data Standing Swiss per ronde untuk Turnamen Liga.
 * Hanya menghitung pertandingan Swiss yang sudah confirmed s.d. targetRound;
 * pertandingan Top Cut diabaikan; pemain drop tetap tampil dengan "(Drop)".
 */
export function buildLeagueRoundStandingsExportData(
  tournament: Pick<Tournament, 'name' | 'date' | 'organizerName' | 'location' | 'format' | 'season'>,
  players: ReadonlyArray<TournamentPlayer>,
  allMatches: ReadonlyArray<TournamentMatch>,
  targetRound: number
): LeagueRoundStandingsExportData {
  const eligiblePlayers = (players || []).filter(
    (p) => p && p.status !== 'waiting' && p.status !== 'rejected'
  );

  const swissUpToRound = (allMatches || []).filter(
    (m) => !m.archived && isSwissMatch(m) && m.round <= targetRound
  );
  const targetRoundMatches = swissUpToRound.filter((m) => m.round === targetRound);
  const isAllConfirmed = canShowRoundScores(targetRoundMatches);

  const standings = calculateTournamentStandings(
    eligiblePlayers.map((p) => ({ id: p.id, name: p.name, status: p.status })),
    swissUpToRound.map((m) => ({
      p1Id: m.p1Id,
      p2Id: m.p2Id,
      p1Score: m.p1Score,
      p2Score: m.p2Score,
      status: m.status,
      archived: m.archived,
      stage: m.stage,
    })),
    tournament.format || 'BO3'
  );

  return {
    tournamentName: tournament.name || 'Liga',
    seasonLabel: formatSeasonLabel(tournament.season),
    date: tournament.date || '-',
    organizerName: tournament.organizerName || '-',
    location: tournament.location || '-',
    roundNumber: targetRound,
    roundTitle: getStandingRoundStatusTitle(targetRound, isAllConfirmed),
    isAllConfirmed,
    rows: standings.map((s) => ({
      rank: s.rank,
      playerId: s.playerId,
      playerName: s.playerName,
      isDropped: Boolean(s.isDropped),
      points: s.points,
      matchWins: s.matchWins,
      matchLosses: s.matchLosses,
      omw: s.omw,
    })),
  };
}

export function generateLeagueRoundStandingText(
  data: LeagueRoundStandingsExportData
): string {
  const lines: string[] = [];
  lines.push('=======================================================');
  lines.push(`STANDING LIGA: ${data.tournamentName.toUpperCase()}`);
  if (data.seasonLabel) {
    lines.push(`Season: ${data.seasonLabel}`);
  }
  lines.push(`Keterangan: ${data.roundTitle}`);
  lines.push(
    `Tanggal: ${data.date} | Organizer: ${data.organizerName || '-'} | Lokasi: ${data.location || '-'}`
  );
  lines.push('=======================================================');
  lines.push('');

  if (data.rows.length === 0) {
    lines.push('Belum ada data peserta.');
  } else {
    for (const row of data.rows) {
      const dropSuffix = row.isDropped ? ' (Drop)' : '';
      lines.push(
        `#${row.rank} ${row.playerName}${dropSuffix} | Poin: ${row.points} | W-L: ${row.matchWins}-${row.matchLosses} | OMW: ${row.omw}%`
      );
    }
  }

  return lines.join('\n');
}

export function generateLeagueRoundStandingCsv(
  data: LeagueRoundStandingsExportData
): string {
  const metadata = [
    `${escapeCsvCell('Turnamen')},${escapeCsvCell(data.tournamentName)}`,
    `${escapeCsvCell('Jenis')},${escapeCsvCell('Turnamen Liga')}`,
    `${escapeCsvCell('Season')},${escapeCsvCell(data.seasonLabel || '-')}`,
    `${escapeCsvCell('Tanggal')},${escapeCsvCell(data.date)}`,
    `${escapeCsvCell('Organizer')},${escapeCsvCell(data.organizerName || '-')}`,
    `${escapeCsvCell('Lokasi')},${escapeCsvCell(data.location || '-')}`,
    `${escapeCsvCell('Keterangan')},${escapeCsvCell(data.roundTitle)}`,
    '',
  ];

  const headers = ['Peringkat', 'Nama Pemain', 'Status', 'Poin', 'W-L', 'OMW%']
    .map(escapeCsvCell)
    .join(',');

  const rows = data.rows.map((row) =>
    [
      row.rank,
      row.isDropped ? `${row.playerName} (Drop)` : row.playerName,
      row.isDropped ? 'Drop' : 'Aktif',
      row.points,
      `${row.matchWins}-${row.matchLosses}`,
      `${row.omw}%`,
    ]
      .map(escapeCsvCell)
      .join(',')
  );

  return [...metadata, headers, ...rows].join('\r\n');
}

/**
 * Menyusun data Pairing Ronde X untuk Turnamen Liga.
 * Skor dan pemenang disembunyikan total apabila masih ada pertandingan ronde X yang belum 'confirmed'.
 */
export function buildLeagueRoundPairingExportData(
  tournament: Pick<Tournament, 'name' | 'date' | 'organizerName' | 'location' | 'season'>,
  roundNumber: number,
  roundMatches: ReadonlyArray<TournamentMatch>
): LeagueRoundPairingExportData {
  const activeMatches = (roundMatches || [])
    .filter((m) => !m.archived && m.round === roundNumber)
    .sort((a, b) => a.table - b.table);

  const showScores = canShowRoundScores(activeMatches);

  const rows: LeagueRoundPairingRow[] = activeMatches.map((m) => {
    const isBye = m.p2Id === null;
    const p1Decks = normalizeMatchDecks(m.p1Decks);
    const p2Decks = isBye ? [] : normalizeMatchDecks(m.p2Decks);

    let winner: 'p1' | 'p2' | null = null;
    if (showScores) {
      if (isBye || m.p1Score > m.p2Score) {
        winner = 'p1';
      } else if (m.p2Score > m.p1Score) {
        winner = 'p2';
      }
    }

    return {
      table: m.table,
      tableLabel: `Meja ${m.table}`,
      isBye,
      p1Name: m.p1Name,
      p1Decks,
      p2Name: isBye ? 'BYE' : m.p2Name,
      p2Decks,
      p1Score: showScores && !isBye ? m.p1Score : null,
      p2Score: showScores && !isBye ? m.p2Score : null,
      winner,
    };
  });

  return {
    tournamentName: tournament.name || 'Liga',
    seasonLabel: formatSeasonLabel(tournament.season),
    date: tournament.date || '-',
    organizerName: tournament.organizerName || '-',
    location: tournament.location || '-',
    roundNumber,
    roundLabel: `Pairing Ronde ${roundNumber}`,
    showScores,
    rows,
  };
}

export function generateLeagueRoundPairingText(
  data: LeagueRoundPairingExportData
): string {
  const lines: string[] = [];
  lines.push('=======================================================');
  lines.push(`PAIRING LIGA: ${data.tournamentName.toUpperCase()}`);
  if (data.seasonLabel) {
    lines.push(`Season: ${data.seasonLabel}`);
  }
  lines.push(
    `Babak: ${data.roundLabel}${data.showScores ? ' (Hasil Resmi)' : ' (Sedang Berjalan)'}`
  );
  lines.push(
    `Tanggal: ${data.date} | Organizer: ${data.organizerName || '-'} | Lokasi: ${data.location || '-'}`
  );
  lines.push('=======================================================');
  lines.push('');

  if (data.rows.length === 0) {
    lines.push('Belum ada data meja pertandingan.');
  } else {
    for (const row of data.rows) {
      const p1DeckStr = formatPlayerDecksInlineText(row.p1Decks);
      const p1Display = p1DeckStr ? `${row.p1Name} (${p1DeckStr})` : row.p1Name;

      if (row.isBye) {
        const winTag = data.showScores ? ' [Menang]' : '';
        lines.push(`${row.tableLabel}: ${p1Display}${winTag} VS BYE`);
        continue;
      }

      const p2DeckStr = formatPlayerDecksInlineText(row.p2Decks);
      const p2Display = p2DeckStr ? `${row.p2Name} (${p2DeckStr})` : row.p2Name;

      if (data.showScores && row.p1Score !== null && row.p2Score !== null) {
        const p1WinTag = row.winner === 'p1' ? ' [Menang]' : '';
        const p2WinTag = row.winner === 'p2' ? ' [Menang]' : '';
        lines.push(
          `${row.tableLabel}: ${p1Display}${p1WinTag} (${row.p1Score} - ${row.p2Score}) ${p2Display}${p2WinTag}`
        );
      } else {
        lines.push(`${row.tableLabel}: ${p1Display} VS ${p2Display}`);
      }
    }
  }

  return lines.join('\n');
}

/**
 * Menyusun data Bracket Top Cut (Top 4 / Top 8) khusus peserta yang masuk Top Cut.
 * Aturan skor berlaku per babak: skor & pemenang suatu babak hanya tampil setelah
 * SELURUH pertandingan di babak tersebut berstatus 'confirmed'.
 */
export function buildLeagueTopCutBracketExportData(
  tournament: Pick<
    Tournament,
    'name' | 'date' | 'organizerName' | 'location' | 'season' | 'totalRounds' | 'topCut'
  >,
  allMatches: ReadonlyArray<TournamentMatch>
): LeagueTopCutBracketExportData {
  const topCutSize: TopCutSize = tournament.topCut?.size === 8 ? 8 : 4;
  const totalSwissRounds = tournament.totalRounds || 3;
  const seeds = tournament.topCut?.seeds || [];

  const seedMap = new Map<string, number>();
  seeds.forEach((s, idx) => {
    seedMap.set(s.playerId, idx + 1);
  });

  const stageCount = getTopCutRoundCount(topCutSize);
  const topCutMatches = (allMatches || []).filter(
    (m) => !m.archived && (isTopCutMatch(m) || m.round > totalSwissRounds)
  );

  const stages: LeagueBracketStage[] = [];
  let champion: LeagueBracketChampion | null = null;

  for (let offset = 1; offset <= stageCount; offset += 1) {
    const roundNumber = totalSwissRounds + offset;
    const label = getRoundDisplayLabel(roundNumber, totalSwissRounds, topCutSize);
    const isFinal = offset === stageCount;
    const expectedMatchCount = Math.pow(2, stageCount - offset);

    const stageMatches = topCutMatches
      .filter((m) => m.round === roundNumber)
      .filter((m) => {
        if (seedMap.size === 0) return true;
        const p1Allowed = seedMap.has(m.p1Id);
        const p2Allowed = m.p2Id === null || seedMap.has(m.p2Id);
        return p1Allowed && p2Allowed;
      })
      .sort((a, b) => a.table - b.table);

    const showScores = canShowRoundScores(stageMatches);
    const slots: LeagueBracketMatchSlot[] = [];

    for (let i = 0; i < expectedMatchCount; i += 1) {
      const m = stageMatches[i];
      if (!m) {
        slots.push({
          table: i + 1,
          tableLabel: `Meja ${i + 1}`,
          isPlaceholder: true,
          p1Seed: null,
          p2Seed: null,
          p1Name: 'Slot Kosong',
          p2Name: 'Slot Kosong',
          p1Decks: [],
          p2Decks: [],
          p1Score: null,
          p2Score: null,
          winner: null,
        });
        continue;
      }

      const isBye = m.p2Id === null;
      const p1Seed = seedMap.get(m.p1Id) ?? null;
      const p2Seed = m.p2Id ? seedMap.get(m.p2Id) ?? null : null;
      const p1Decks = normalizeMatchDecks(m.p1Decks);
      const p2Decks = isBye ? [] : normalizeMatchDecks(m.p2Decks);

      let winner: 'p1' | 'p2' | null = null;
      if (showScores) {
        if (isBye || m.p1Score > m.p2Score) {
          winner = 'p1';
        } else if (m.p2Score > m.p1Score) {
          winner = 'p2';
        }
      }

      if (isFinal && showScores && winner) {
        champion =
          winner === 'p1'
            ? {
                playerId: m.p1Id,
                name: m.p1Name,
                seedNumber: p1Seed,
                decks: p1Decks,
              }
            : {
                playerId: m.p2Id || '',
                name: m.p2Name,
                seedNumber: p2Seed,
                decks: p2Decks,
              };
      }

      slots.push({
        table: m.table,
        tableLabel: `Meja ${m.table}`,
        isPlaceholder: false,
        p1Id: m.p1Id,
        p2Id: m.p2Id,
        p1Seed,
        p2Seed,
        p1Name: m.p1Name,
        p2Name: isBye ? 'BYE' : m.p2Name,
        p1Decks,
        p2Decks,
        p1Score: showScores && !isBye ? m.p1Score : null,
        p2Score: showScores && !isBye ? m.p2Score : null,
        winner,
      });
    }

    stages.push({
      roundNumber,
      label,
      isFinal,
      showScores,
      slots,
    });
  }

  return {
    tournamentName: tournament.name || 'Liga',
    seasonLabel: formatSeasonLabel(tournament.season),
    date: tournament.date || '-',
    organizerName: tournament.organizerName || '-',
    location: tournament.location || '-',
    topCutSize,
    roundLabel: `Bracket Top ${topCutSize}`,
    stages,
    champion,
  };
}

export function generateLeagueTopCutBracketText(
  data: LeagueTopCutBracketExportData
): string {
  const lines: string[] = [];
  lines.push('=======================================================');
  lines.push(`BRACKET TOP ${data.topCutSize}: ${data.tournamentName.toUpperCase()}`);
  if (data.seasonLabel) {
    lines.push(`Season: ${data.seasonLabel}`);
  }
  lines.push(
    `Tanggal: ${data.date} | Organizer: ${data.organizerName || '-'} | Lokasi: ${data.location || '-'}`
  );
  lines.push('=======================================================');

  if (data.champion) {
    const champDecks = formatPlayerDecksInlineText(data.champion.decks);
    const seedPrefix = data.champion.seedNumber ? `#${data.champion.seedNumber} ` : '';
    lines.push(
      `🏆 JUARA: ${seedPrefix}${data.champion.name}${champDecks ? ` (${champDecks})` : ''}`
    );
  }

  for (const stage of data.stages) {
    lines.push('');
    lines.push(`[${stage.label.toUpperCase()}]`);
    for (const slot of stage.slots) {
      if (slot.isPlaceholder) {
        lines.push(`${slot.tableLabel}: (Slot Kosong - belum dimulai)`);
        continue;
      }

      const p1SeedStr = slot.p1Seed ? `#${slot.p1Seed} ` : '';
      const p1DeckStr = formatPlayerDecksInlineText(slot.p1Decks);
      const p1Text = `${p1SeedStr}${slot.p1Name}${p1DeckStr ? ` (${p1DeckStr})` : ''}`;

      const p2SeedStr = slot.p2Seed ? `#${slot.p2Seed} ` : '';
      const p2DeckStr = formatPlayerDecksInlineText(slot.p2Decks);
      const p2Text = `${p2SeedStr}${slot.p2Name}${p2DeckStr ? ` (${p2DeckStr})` : ''}`;

      if (stage.showScores && slot.p1Score !== null && slot.p2Score !== null) {
        const p1WinTag =
          slot.winner === 'p1' ? (stage.isFinal ? ' [Juara]' : ' [Menang]') : '';
        const p2WinTag =
          slot.winner === 'p2' ? (stage.isFinal ? ' [Juara]' : ' [Menang]') : '';
        lines.push(
          `${slot.tableLabel}: ${p1Text}${p1WinTag} (${slot.p1Score} - ${slot.p2Score}) ${p2Text}${p2WinTag}`
        );
      } else {
        lines.push(`${slot.tableLabel}: ${p1Text} VS ${p2Text}`);
      }
    }
  }

  return lines.join('\n');
}

export function getWaitingMatchStatusLabel(
  status: MatchStatus
): WaitingMatchStatusLabel {
  switch (status) {
    case 'awaiting':
      return 'Menunggu konfirmasi';
    case 'disputed':
      return 'Sengketa';
    case 'pending':
    default:
      return 'Belum ada input';
  }
}

export function buildWaitingMatchesList(
  roundMatches: ReadonlyArray<TournamentMatch>
): WaitingMatchItem[] {
  return (roundMatches || [])
    .filter((m) => !m.archived && m.p2Id !== null && m.status !== 'confirmed')
    .sort((a, b) => a.table - b.table)
    .map((m) => ({
      id: m.id,
      table: m.table,
      p1Name: m.p1Name,
      p2Name: m.p2Name,
      status: m.status,
      statusLabel: getWaitingMatchStatusLabel(m.status),
    }));
}

export function formatWaitingMatchesReminderText(params: {
  tournamentName: string;
  seasonLabel?: string | null;
  roundLabel: string;
  items: ReadonlyArray<WaitingMatchItem>;
}): string {
  const { tournamentName, seasonLabel, roundLabel, items } = params;
  const headerParts = [tournamentName, seasonLabel, roundLabel].filter(Boolean);
  const lines = [
    `Menunggu ${items.length} pertandingan (${headerParts.join(' • ')}):`,
  ];
  for (const item of items) {
    lines.push(
      `- Meja ${item.table}: ${item.p1Name} vs ${item.p2Name} (${item.statusLabel})`
    );
  }
  return lines.join('\n');
}
