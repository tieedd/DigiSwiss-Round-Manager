import { formatSeasonLabel } from './seasonLogic.ts';
import { getSwissStandingRecord } from './finalRecordLogic.ts';
import {
  formatIndonesianFullDate,
  formatPercent2Decimals,
  TOP_CUT_EXPORT_NOTE,
} from './exportFormatLogic.ts';

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
  tournamentId: string;
  tournamentName: string;
  date: string;
  format: string;
  tournamentType?: 'regular' | 'league';
  season?: { number: number; month: number; year: number };
  playerId: string;
  uid: string | null;
  organizerId: string;
  name: string;
  rank: number;
  swissRank?: number;
  topCutResult?: 'Juara' | 'Runner-up' | 'Semifinal' | 'Perempat Final';
  wins: number;
  losses: number;
  swissWins?: number;
  swissLosses?: number;
  swissPoints?: number;
  topCutWins?: number;
  topCutLosses?: number;
  topCutPoints?: number;
  gamesWon: number;
  gamesLost: number;
  points: number;
  omw: number;
  gw: number;
  ogw: number;
  deckName?: string;
  deckColors?: DeckColor[];
  decks?: Array<{ name: string; colors: DeckColor[] }>;
  isManual?: boolean;
}

export const OFFICIAL_DECK_COLORS: readonly DeckColor[] = [
  'Merah',
  'Biru',
  'Kuning',
  'Hijau',
  'Hitam',
  'Ungu',
  'Putih'
] as const;

export const DECK_COLOR_HEX: Record<DeckColor, string> = {
  Merah: '#EB1B0C',
  Biru: '#41AFFD',
  Kuning: '#FFEB19',
  Hijau: '#218470',
  Hitam: '#18181B',
  Ungu: '#610FBE',
  Putih: '#F8FAFC'
};

export const DECK_COLOR_ACTIVE_TEXT: Record<DeckColor, string> = {
  Merah: '#FFFFFF',
  Biru: '#111827',
  Kuning: '#111827',
  Hijau: '#FFFFFF',
  Hitam: '#FFFFFF',
  Ungu: '#FFFFFF',
  Putih: '#111827'
};

export const DECK_COLOR_STYLES: Record<DeckColor, { bg: string; text: string; border: string; activeBg: string }> = {
  Merah: {
    bg: 'bg-dark-surface-high',
    text: 'text-dark-text',
    border: 'border-dark-border',
    activeBg: 'font-semibold shadow-sm'
  },
  Biru: {
    bg: 'bg-dark-surface-high',
    text: 'text-dark-text',
    border: 'border-dark-border',
    activeBg: 'font-semibold shadow-sm'
  },
  Kuning: {
    bg: 'bg-dark-surface-high',
    text: 'text-dark-text',
    border: 'border-dark-border',
    activeBg: 'font-semibold shadow-sm'
  },
  Hijau: {
    bg: 'bg-dark-surface-high',
    text: 'text-dark-text',
    border: 'border-dark-border',
    activeBg: 'font-semibold shadow-sm'
  },
  Hitam: {
    bg: 'bg-dark-surface-high',
    text: 'text-dark-text',
    border: 'border-dark-border',
    activeBg: 'font-semibold shadow-sm'
  },
  Ungu: {
    bg: 'bg-dark-surface-high',
    text: 'text-dark-text',
    border: 'border-dark-border',
    activeBg: 'font-semibold shadow-sm'
  },
  Putih: {
    bg: 'bg-dark-surface-high',
    text: 'text-dark-text',
    border: 'border-dark-border',
    activeBg: 'font-semibold shadow-sm'
  }
};

export const DECK_COLOR_EMOJI: Record<DeckColor, string> = {
  Merah: '🔴',
  Biru: '🔵',
  Kuning: '🟡',
  Hijau: '🟢',
  Hitam: '⚫',
  Ungu: '🟣',
  Putih: '⚪'
};

export function formatDeckColorsEmoji(colors?: string[] | null): string {
  if (!colors || !Array.isArray(colors) || colors.length === 0) return '';
  const validColors = colors
    .map((c) => (typeof c === 'string' ? c.trim() : ''))
    .filter((c) => OFFICIAL_DECK_COLORS.includes(c as DeckColor));
  return validColors.length > 0 ? `(${validColors.join(', ')})` : '';
}

export function getDeckColorLabel(colors?: string[] | null): string {
  if (!colors || !Array.isArray(colors) || colors.length === 0) return '';
  return colors.join(', ');
}

/**
  * Mengambil daftar warna unik yang digunakan pada daftar partisipasi
  */
export function getUsedDeckColors(
  participations: Participation[],
  limit = 32
): DeckColor[] {
  const used = new Set<string>();
  participations.slice(0, limit).forEach((p) => {
    if (p.deckColors && Array.isArray(p.deckColors)) {
      p.deckColors.forEach((c) => used.add(c));
    }
    if (p.decks && Array.isArray(p.decks)) {
      p.decks.forEach((d) => {
        if (d && Array.isArray(d.colors)) {
          d.colors.forEach((c) => used.add(c));
        }
      });
    }
  });
  return OFFICIAL_DECK_COLORS.filter((c) => used.has(c));
}

/**
  * Memotong teks agar lebarnya sesuai batas piksel kanvas
  */
export function truncateTextToWidth(
  measureWidth: (str: string) => number,
  text: string,
  maxWidth: number
): string {
  if (measureWidth(text) <= maxWidth) return text;
  let truncated = text;
  while (truncated.length > 0 && measureWidth(truncated + '...') > maxWidth) {
    truncated = truncated.slice(0, -1);
  }
  return truncated.length > 0 ? truncated + '...' : '';
}

/**
 * Validasi form pengisian deck pemain
 */
export function validateDeckSubmission(
  deckName: string,
  deckColors: DeckColor[]
): { valid: boolean; error?: string } {
  if (!deckName || deckName.trim().length === 0) {
    return { valid: false, error: 'Nama deck tidak boleh kosong.' };
  }
  if (!deckColors || deckColors.length === 0) {
    return { valid: false, error: 'Pilih minimal 1 warna deck.' };
  }
  const invalidColor = deckColors.find((c) => !OFFICIAL_DECK_COLORS.includes(c));
  if (invalidColor) {
    return { valid: false, error: `Warna "${invalidColor}" tidak valid.` };
  }
  return { valid: true };
}

/**
 * Menghitung progres pengisian deck peserta
 */
export function calculateDeckFillProgress(participations: Participation[]): {
  filled: number;
  total: number;
  percentage: number;
  isAllFilled: boolean;
} {
  const total = participations.length;
  if (total === 0) {
    return { filled: 0, total: 0, percentage: 0, isAllFilled: false };
  }
  const filled = participations.filter(
    (p) => !!p.deckName && p.deckName.trim().length > 0 && Array.isArray(p.deckColors) && p.deckColors.length > 0
  ).length;
  const percentage = Math.round((filled / total) * 100);
  return {
    filled,
    total,
    percentage,
    isAllFilled: filled === total
  };
}

export interface GenerateStandingsCsvOptions {
  seasonLabel?: string | null;
  isLeague?: boolean;
  hasTopCut?: boolean;
}

/**
 * Menghasilkan konten string CSV untuk ekspor hasil akhir
 */
export function generateStandingsCsv(
  tournamentName: string,
  participations: Participation[],
  options?: GenerateStandingsCsvOptions
): string {
  const hasTopCutColumn = participations.some((p) => Boolean(p.topCutResult));
  const hasTopCut =
    options?.hasTopCut ??
    (hasTopCutColumn ||
      participations.some(
        (p) =>
          (typeof p.topCutWins === 'number' && p.topCutWins > 0) ||
          (typeof p.topCutLosses === 'number' && p.topCutLosses > 0)
      ));
  const resolvedSeason =
    options?.seasonLabel || formatSeasonLabel(participations[0]?.season);
  const resolvedLeague =
    options?.isLeague ??
    (participations[0]?.tournamentType === 'league' ||
      Boolean(resolvedSeason) ||
      participations.some((p) => Array.isArray(p.decks) && p.decks.length > 0));

  const headers = [
    'Peringkat',
    'Nama Pemain',
    'Tipe Peserta',
    ...(resolvedLeague
      ? ['Deck 1', 'Warna Deck 1', 'Deck 2', 'Warna Deck 2']
      : ['Nama Deck', 'Warna Deck']),
    'Total Poin',
    'Match W',
    'Match L',
    'Game Win',
    'Game Lose',
    'OMW%',
    'GW%',
    'OGW%',
    ...(hasTopCutColumn ? ['Hasil Top Cut'] : [])
  ];

  const escapeCsv = (val: string | number | undefined | null) => {
    if (val === undefined || val === null) return '""';
    const str = String(val).replace(/"/g, '""');
    return `"${str}"`;
  };

  const metadataRows = resolvedSeason
    ? [
        `${escapeCsv('Turnamen')},${escapeCsv(tournamentName)}`,
        `${escapeCsv('Jenis')},${escapeCsv(resolvedLeague ? 'Turnamen Liga' : 'Turnamen Reguler')}`,
        `${escapeCsv('Season')},${escapeCsv(resolvedSeason)}`,
        ''
      ]
    : [];

  const rows = participations.map((p) => {
    const deckCols = resolvedLeague
      ? (() => {
          const d1 =
            p.decks?.[0] && p.decks[0].name?.trim()
              ? p.decks[0]
              : p.deckName?.trim()
              ? { name: p.deckName.trim(), colors: p.deckColors || [] }
              : undefined;
          const d2 = p.decks?.[1] && p.decks[1].name?.trim() ? p.decks[1] : undefined;
          return [
            escapeCsv(d1?.name?.trim() || '-'),
            escapeCsv(d1?.colors && d1.colors.length > 0 ? d1.colors.join('/') : '-'),
            escapeCsv(d2?.name?.trim() || '-'),
            escapeCsv(d2?.colors && d2.colors.length > 0 ? d2.colors.join('/') : '-')
          ];
        })()
      : [
          escapeCsv(p.deckName || '-'),
          escapeCsv(p.deckColors && p.deckColors.length > 0 ? p.deckColors.join('/') : '-')
        ];

    const cols = [
      escapeCsv(p.rank),
      escapeCsv(p.name),
      escapeCsv(p.isManual ? 'Manual' : 'Akun Terdaftar'),
      ...deckCols,
      escapeCsv(p.points),
      escapeCsv(p.wins),
      escapeCsv(p.losses),
      escapeCsv(p.gamesWon),
      escapeCsv(p.gamesLost),
      escapeCsv(formatPercent2Decimals(p.omw)),
      escapeCsv(formatPercent2Decimals(p.gw)),
      escapeCsv(formatPercent2Decimals(p.ogw))
    ];
    if (hasTopCutColumn) {
      cols.push(escapeCsv(p.topCutResult || '-'));
    }
    return cols;
  });

  const section1HeaderRow = resolvedLeague
    ? [`${escapeCsv('Peringkat Akhir')}`]
    : [];

  const swissSectionRows: string[] = [];
  if (resolvedLeague) {
    const swissSorted = [...participations].sort(
      (a, b) => (a.swissRank ?? a.rank) - (b.swissRank ?? b.rank) || a.rank - b.rank
    );
    swissSectionRows.push('');
    swissSectionRows.push(`${escapeCsv('Klasemen Swiss (sebelum Top Cut)')}`);
    swissSectionRows.push(
      ['Peringkat Swiss', 'Nama Pemain', 'Poin', 'W-L', 'OMW%']
        .map((h) => escapeCsv(h))
        .join(',')
    );
    swissSorted.forEach((p) => {
      const swissRankVal = p.swissRank ?? p.rank;
      const swissRec = getSwissStandingRecord(p);
      swissSectionRows.push(
        [
          escapeCsv(swissRankVal),
          escapeCsv(p.name),
          escapeCsv(swissRec.points),
          escapeCsv(`${swissRec.wins}-${swissRec.losses}`),
          escapeCsv(formatPercent2Decimals(p.omw))
        ].join(',')
      );
    });
  }

  const topCutNoteRow =
    hasTopCut && participations.length > 0
      ? [escapeCsv(`Catatan: ${TOP_CUT_EXPORT_NOTE}`)]
      : [];

  return [
    ...metadataRows,
    ...section1HeaderRow,
    headers.join(','),
    ...rows.map((r) => r.join(',')),
    ...topCutNoteRow,
    ...swissSectionRows
  ].join('\r\n');
}

export interface GenerateStandingsTextOptions {
  tournamentName: string;
  tournamentDate: string;
  format: string;
  participations: Participation[];
  organizerName?: string;
  location?: string;
  seasonLabel?: string | null;
  isLeague?: boolean;
  hasTopCut?: boolean;
}

/**
 * Menghasilkan teks ringkasan berformat rapi untuk disalin / diekspor
 */
export function generateStandingsText(
  nameOrOptions: string | GenerateStandingsTextOptions | Participation[],
  tournamentDate?: string,
  format?: string,
  participations?: Participation[],
  organizerName?: string,
  location?: string
): string {
  let tournamentName = '';
  let dateStr = '';
  let formatStr = '';
  let parts: Participation[] = [];
  let orgName: string | undefined;
  let locName: string | undefined;
  let seasonLabel: string | null | undefined;
  let isLeague = false;
  let explicitHasTopCut: boolean | undefined;

  if (Array.isArray(nameOrOptions)) {
    // Dipanggil sebagai generateStandingsText(participations)
    parts = nameOrOptions;
    if (parts.length > 0) {
      tournamentName = parts[0].tournamentName || 'Turnamen';
      dateStr = parts[0].date || '-';
      formatStr = parts[0].format || '-';
      seasonLabel = formatSeasonLabel(parts[0].season);
      isLeague = parts[0].tournamentType === 'league' || Boolean(seasonLabel);
    }
  } else if (typeof nameOrOptions === 'object' && nameOrOptions !== null) {
    tournamentName = nameOrOptions.tournamentName;
    dateStr = nameOrOptions.tournamentDate;
    formatStr = nameOrOptions.format;
    parts = nameOrOptions.participations || [];
    orgName = nameOrOptions.organizerName;
    locName = nameOrOptions.location;
    seasonLabel =
      nameOrOptions.seasonLabel ?? formatSeasonLabel(parts[0]?.season);
    isLeague =
      nameOrOptions.isLeague ??
      (parts[0]?.tournamentType === 'league' || Boolean(seasonLabel));
    explicitHasTopCut = nameOrOptions.hasTopCut;
  } else {
    tournamentName = nameOrOptions || '';
    dateStr = tournamentDate || '';
    formatStr = format || '';
    parts = participations || [];
    orgName = organizerName;
    locName = location;
    seasonLabel = formatSeasonLabel(parts[0]?.season);
    isLeague = parts[0]?.tournamentType === 'league' || Boolean(seasonLabel);
  }

  const hasTopCut =
    explicitHasTopCut ??
    parts.some(
      (p) =>
        Boolean(p.topCutResult) ||
        (typeof p.topCutWins === 'number' && p.topCutWins > 0) ||
        (typeof p.topCutLosses === 'number' && p.topCutLosses > 0)
    );

  const lines: string[] = [];
  lines.push(`=======================================================`);
  lines.push(`HASIL AKHIR TURNAMEN: ${tournamentName.toUpperCase()}`);
  if (seasonLabel || isLeague) {
    lines.push(
      `Jenis: ${isLeague ? 'Turnamen Liga' : 'Turnamen Reguler'}${seasonLabel ? ` | ${seasonLabel}` : ''}`
    );
  }
  lines.push(`Tanggal: ${formatIndonesianFullDate(dateStr)} | Format: ${formatStr}`);
  lines.push(
    `Organizer: ${orgName && orgName.trim() ? orgName.trim() : '-'} | Lokasi: ${locName && locName.trim() ? locName.trim() : '-'}`
  );
  lines.push(`=======================================================`);
  lines.push(``);

  if (isLeague) {
    lines.push(`--- PERINGKAT AKHIR ---`);
    lines.push(``);
  }

  for (const p of parts) {
    const medal = p.rank === 1 ? '🥇' : p.rank === 2 ? '🥈' : p.rank === 3 ? '🥉' : `#${p.rank}`;
    const topCutTag = p.topCutResult ? ` [${p.topCutResult}]` : '';
    const validDecks = Array.isArray(p.decks)
      ? p.decks.filter((d) => d && d.name && d.name.trim().length > 0)
      : [];
    let deckInfo = 'Deck belum diisi';
    if (validDecks.length > 0) {
      deckInfo = validDecks
        .map((d) => {
          const emojiStr = formatDeckColorsEmoji(d.colors);
          return `${d.name.trim()}${emojiStr ? ` ${emojiStr}` : ''}`;
        })
        .join(' & ');
    } else if (p.deckName && p.deckName.trim().length > 0) {
      const emojiStr = formatDeckColorsEmoji(p.deckColors);
      deckInfo = `${p.deckName.trim()}${emojiStr ? ` ${emojiStr}` : ''}`;
    }
    lines.push(
      `${medal} ${p.name.padEnd(20)}${topCutTag} | Poin: ${String(p.points).padStart(2)} | W-L: ${p.wins}-${p.losses} | Deck: ${deckInfo}`
    );
    lines.push(
      `   Tie-breakers -> OMW: ${formatPercent2Decimals(p.omw)} | GW: ${formatPercent2Decimals(p.gw)} | OGW: ${formatPercent2Decimals(p.ogw)}`
    );
    lines.push(`-------------------------------------------------------`);
  }

  if (hasTopCut && parts.length > 0) {
    lines.push(`Catatan: ${TOP_CUT_EXPORT_NOTE}`);
  }

  if (isLeague && parts.length > 0) {
    const swissSorted = [...parts].sort(
      (a, b) => (a.swissRank ?? a.rank) - (b.swissRank ?? b.rank) || a.rank - b.rank
    );
    lines.push(``);
    lines.push(`--- KLASEMEN SWISS (SEBELUM TOP CUT) ---`);
    lines.push(``);
    for (const p of swissSorted) {
      const sRank = p.swissRank ?? p.rank;
      const swissRec = getSwissStandingRecord(p);
      lines.push(
        `#${sRank} ${p.name.padEnd(20)} | Poin: ${String(swissRec.points).padStart(2)} | W-L: ${swissRec.wins}-${swissRec.losses} | OMW: ${formatPercent2Decimals(p.omw)}`
      );
    }
  }

  lines.push(``);
  lines.push(`Digenerate oleh DigiSwiss-Round pada ${formatIndonesianFullDate(new Date())}`);
  return lines.join('\n');
}

