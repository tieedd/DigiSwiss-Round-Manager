import type { AppTheme } from './themeLogic.ts';

export interface ExportPalette {
  pageBg: string;
  headerBarFrom: string;
  headerBarTo: string;
  titleText: string;
  mutedText: string;
  strongText: string;
  secondaryText: string;
  sectionHeaderBg: string;
  sectionHeadingPrimary: string;
  sectionHeadingSecondary: string;
  tableHeaderBg: string;
  tableHeaderText: string;
  rowBgEven: string;
  rowBgOdd: string;
  rowDivider: string;
  cardBg: string;
  cardBorder: string;
  cardFinalBg: string;
  cardFinalBorder: string;
  emptySlotBg: string;
  emptySlotBorder: string;
  emptySlotText: string;
  badgeBg: string;
  badgeText: string;
  seasonText: string;
  stagePillBg: string;
  accentText: string;
  deckNameText: string;
  winnerRowBg: string;
  winnerText: string;
  loserText: string;
  rankGold: string;
  rankGoldBar: string;
  rankSilver: string;
  rankSilverText: string;
  rankBronze: string;
  successText: string;
  championBannerBg: string;
  championBannerBorder: string;
  championBannerText: string;
  deckDotOutline: {
    Hitam: string;
    Putih: string;
    default: string;
  };
  legendText: string;
  footerText: string;
}

export const DARK_EXPORT_PALETTE: ExportPalette = {
  pageBg: '#0f172a',
  headerBarFrom: '#f59e0b',
  headerBarTo: '#d97706',
  titleText: '#f8fafc',
  mutedText: '#94a3b8',
  strongText: '#e2e8f0',
  secondaryText: '#cbd5e1',
  sectionHeaderBg: '#1e293b',
  sectionHeadingPrimary: '#fbbf24',
  sectionHeadingSecondary: '#38bdf8',
  tableHeaderBg: '#1e293b',
  tableHeaderText: '#cbd5e1',
  rowBgEven: '#131d31',
  rowBgOdd: '#0f172a',
  rowDivider: '#1e293b',
  cardBg: '#131d31',
  cardBorder: '#293548',
  cardFinalBg: '#17233a',
  cardFinalBorder: '#796821',
  emptySlotBg: '#111c33',
  emptySlotBorder: '#334155',
  emptySlotText: '#94a3b8',
  badgeBg: '#f59e0b',
  badgeText: '#0f172a',
  seasonText: '#fbbf24',
  stagePillBg: '#152e47',
  accentText: '#f59e0b',
  deckNameText: '#38bdf8',
  winnerRowBg: '#332f2c',
  winnerText: '#facc15',
  loserText: '#94a3b8',
  rankGold: '#facc15',
  rankGoldBar: '#eab308',
  rankSilver: '#94a3b8',
  rankSilverText: '#e2e8f0',
  rankBronze: '#cd7f32',
  successText: '#2DD4BF',
  championBannerBg: '#303027',
  championBannerBorder: '#facc15',
  championBannerText: '#facc15',
  deckDotOutline: {
    Hitam: '#94A3B8',
    Putih: '#CBD5E1',
    default: '#94A3B8',
  },
  legendText: '#cbd5e1',
  footerText: '#94a3b8',
};

export const LIGHT_EXPORT_PALETTE: ExportPalette = {
  pageBg: '#F8FAFC',
  headerBarFrom: '#F59E0B',
  headerBarTo: '#D97706',
  titleText: '#0F172A',
  mutedText: '#475569',
  strongText: '#1E293B',
  secondaryText: '#334155',
  sectionHeaderBg: '#E2E8F0',
  sectionHeadingPrimary: '#A34400',
  sectionHeadingSecondary: '#0369A1',
  tableHeaderBg: '#E2E8F0',
  tableHeaderText: '#1E293B',
  rowBgEven: '#FFFFFF',
  rowBgOdd: '#F1F5F9',
  rowDivider: '#CBD5E1',
  cardBg: '#FFFFFF',
  cardBorder: '#CBD5E1',
  cardFinalBg: '#FFFBEB',
  cardFinalBorder: '#F59E0B',
  emptySlotBg: '#F1F5F9',
  emptySlotBorder: '#94A3B8',
  emptySlotText: '#475569',
  badgeBg: '#F59E0B',
  badgeText: '#0F172A',
  seasonText: '#A34400',
  stagePillBg: '#E0F2FE',
  accentText: '#A34400',
  deckNameText: '#0369A1',
  winnerRowBg: '#FEF3C7',
  winnerText: '#92400E',
  loserText: '#475569',
  rankGold: '#A34400',
  rankGoldBar: '#EAB308',
  rankSilver: '#64748B',
  rankSilverText: '#1E293B',
  rankBronze: '#A34400',
  successText: '#0F766E',
  championBannerBg: '#FEF3C7',
  championBannerBorder: '#D97706',
  championBannerText: '#78350F',
  deckDotOutline: {
    Hitam: '#475569',
    Putih: '#64748B',
    default: '#475569',
  },
  legendText: '#334155',
  footerText: '#475569',
};

export function getExportPalette(theme: AppTheme = 'dark'): ExportPalette {
  return theme === 'light' ? LIGHT_EXPORT_PALETTE : DARK_EXPORT_PALETTE;
}

function parseHexColor(hex: string): [number, number, number] {
  const clean = (hex || '').trim();
  const match6 = /^#([0-9a-fA-F]{6})$/.exec(clean);
  if (match6) {
    const val = match6[1];
    return [
      parseInt(val.slice(0, 2), 16),
      parseInt(val.slice(2, 4), 16),
      parseInt(val.slice(4, 6), 16),
    ];
  }
  const match3 = /^#([0-9a-fA-F]{3})$/.exec(clean);
  if (match3) {
    const val = match3[1];
    return [
      parseInt(val[0] + val[0], 16),
      parseInt(val[1] + val[1], 16),
      parseInt(val[2] + val[2], 16),
    ];
  }
  throw new Error(`Kode warna hex tidak valid: "${hex}"`);
}

function channelRelativeLuminance(channel255: number): number {
  const srgb = channel255 / 255;
  return srgb <= 0.03928
    ? srgb / 12.92
    : Math.pow((srgb + 0.055) / 1.055, 2.4);
}

export function relativeLuminance(hex: string): number {
  const [r, g, b] = parseHexColor(hex);
  return (
    0.2126 * channelRelativeLuminance(r) +
    0.7152 * channelRelativeLuminance(g) +
    0.0722 * channelRelativeLuminance(b)
  );
}

/**
 * Menghitung rasio kontras WCAG 2.1 antara dua warna hex (#RRGGBB atau #RGB).
 */
export function contrastRatio(hexA: string, hexB: string): number {
  const lumA = relativeLuminance(hexA);
  const lumB = relativeLuminance(hexB);
  const lighter = Math.max(lumA, lumB);
  const darker = Math.min(lumA, lumB);
  return (lighter + 0.05) / (darker + 0.05);
}
