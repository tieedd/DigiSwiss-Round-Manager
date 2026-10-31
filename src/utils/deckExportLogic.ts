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
  playerId: string;
  uid: string | null;
  organizerId: string;
  name: string;
  rank: number;
  wins: number;
  losses: number;
  gamesWon: number;
  gamesLost: number;
  points: number;
  omw: number;
  gw: number;
  ogw: number;
  deckName?: string;
  deckColors?: DeckColor[];
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

export const DECK_COLOR_STYLES: Record<DeckColor, { bg: string; text: string; border: string; activeBg: string }> = {
  Merah: {
    bg: 'bg-red-500/10',
    text: 'text-red-400',
    border: 'border-red-500/40',
    activeBg: 'bg-red-600 text-white border-red-500'
  },
  Biru: {
    bg: 'bg-blue-500/10',
    text: 'text-blue-400',
    border: 'border-blue-500/40',
    activeBg: 'bg-blue-600 text-white border-blue-500'
  },
  Kuning: {
    bg: 'bg-amber-400/10',
    text: 'text-amber-300',
    border: 'border-amber-400/40',
    activeBg: 'bg-amber-500 text-dark-bg font-semibold border-amber-400'
  },
  Hijau: {
    bg: 'bg-emerald-500/10',
    text: 'text-emerald-400',
    border: 'border-emerald-500/40',
    activeBg: 'bg-emerald-600 text-white border-emerald-500'
  },
  Hitam: {
    bg: 'bg-zinc-700/30',
    text: 'text-zinc-300',
    border: 'border-zinc-500/40',
    activeBg: 'bg-zinc-800 text-white border-zinc-400'
  },
  Ungu: {
    bg: 'bg-purple-500/10',
    text: 'text-purple-400',
    border: 'border-purple-500/40',
    activeBg: 'bg-purple-600 text-white border-purple-500'
  },
  Putih: {
    bg: 'bg-neutral-200/10',
    text: 'text-neutral-200',
    border: 'border-neutral-300/40',
    activeBg: 'bg-neutral-200 text-neutral-900 font-semibold border-white'
  }
};

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

/**
 * Menghasilkan konten string CSV untuk ekspor hasil akhir
 */
export function generateStandingsCsv(
  tournamentName: string,
  participations: Participation[]
): string {
  const headers = [
    'Peringkat',
    'Nama Pemain',
    'Tipe Peserta',
    'Nama Deck',
    'Warna Deck',
    'Total Poin',
    'Menang Match',
    'Kalah Match',
    'Game Menang',
    'Game Kalah',
    'OMW%',
    'GW%',
    'OGW%'
  ];

  const escapeCsv = (val: string | number | undefined | null) => {
    if (val === undefined || val === null) return '""';
    const str = String(val).replace(/"/g, '""');
    return `"${str}"`;
  };

  const rows = participations.map((p) => [
    escapeCsv(p.rank),
    escapeCsv(p.name),
    escapeCsv(p.isManual ? 'Manual' : 'Akun Terdaftar'),
    escapeCsv(p.deckName || '-'),
    escapeCsv(p.deckColors && p.deckColors.length > 0 ? p.deckColors.join('/') : '-'),
    escapeCsv(p.points),
    escapeCsv(p.wins),
    escapeCsv(p.losses),
    escapeCsv(p.gamesWon),
    escapeCsv(p.gamesLost),
    escapeCsv(`${p.omw}%`),
    escapeCsv(`${p.gw}%`),
    escapeCsv(`${p.ogw}%`)
  ]);

  return [headers.join(','), ...rows.map((r) => r.join(','))].join('\r\n');
}

/**
 * Menghasilkan teks ringkasan berformat rapi untuk disalin / diekspor
 */
export function generateStandingsText(
  tournamentName: string,
  tournamentDate: string,
  format: string,
  participations: Participation[]
): string {
  const lines: string[] = [];
  lines.push(`=======================================================`);
  lines.push(`HASIL AKHIR TURNAMEN: ${tournamentName.toUpperCase()}`);
  lines.push(`Tanggal: ${tournamentDate} | Format: ${format}`);
  lines.push(`=======================================================`);
  lines.push(``);

  for (const p of participations) {
    const medal = p.rank === 1 ? '🥇' : p.rank === 2 ? '🥈' : p.rank === 3 ? '🥉' : `#${p.rank}`;
    const deckInfo = p.deckName
      ? `${p.deckName} [${(p.deckColors || []).join('/')}]`
      : 'Deck belum diisi';
    lines.push(
      `${medal} ${p.name.padEnd(20)} | Poin: ${String(p.points).padStart(2)} | W-L: ${p.wins}-${p.losses} | Deck: ${deckInfo}`
    );
    lines.push(
      `   Tie-breakers -> OMW: ${p.omw}% | GW: ${p.gw}% | OGW: ${p.ogw}%`
    );
    lines.push(`-------------------------------------------------------`);
  }

  lines.push(``);
  lines.push(`Digenerate oleh DigiSwiss-Round pada ${new Date().toLocaleString('id-ID')}`);
  return lines.join('\n');
}
