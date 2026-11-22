import test from 'node:test';
import assert from 'node:assert/strict';

import {
  DARK_EXPORT_PALETTE,
  LIGHT_EXPORT_PALETTE,
  getExportPalette,
  contrastRatio,
} from '../utils/exportTheme.ts';

const HEX6_REGEX = /^#[0-9a-fA-F]{6}$/;

function flattenPaletteHexEntries(palette) {
  const entries = [];
  for (const [key, value] of Object.entries(palette)) {
    if (typeof value === 'string') {
      entries.push([key, value]);
    } else if (value && typeof value === 'object') {
      for (const [subKey, subVal] of Object.entries(value)) {
        entries.push([`${key}.${subKey}`, subVal]);
      }
    }
  }
  return entries;
}

test('EXPORT THEME 1: Palet gelap dan terang memiliki seluruh token yang sama dan seluruh nilai hex valid', () => {
  const darkPalette = getExportPalette('dark');
  const lightPalette = getExportPalette('light');
  const defaultPalette = getExportPalette();

  assert.deepEqual(defaultPalette, darkPalette);
  assert.deepEqual(darkPalette, DARK_EXPORT_PALETTE);
  assert.deepEqual(lightPalette, LIGHT_EXPORT_PALETTE);

  const darkKeys = Object.keys(darkPalette).sort();
  const lightKeys = Object.keys(lightPalette).sort();
  assert.deepEqual(lightKeys, darkKeys);

  assert.deepEqual(
    Object.keys(lightPalette.deckDotOutline).sort(),
    Object.keys(darkPalette.deckDotOutline).sort()
  );

  for (const [token, hex] of flattenPaletteHexEntries(darkPalette)) {
    assert.match(hex, HEX6_REGEX, `Dark palette token ${token} harus hex #RRGGBB valid, dapat "${hex}"`);
  }
  for (const [token, hex] of flattenPaletteHexEntries(lightPalette)) {
    assert.match(hex, HEX6_REGEX, `Light palette token ${token} harus hex #RRGGBB valid, dapat "${hex}"`);
  }

  // Warna outline dot Putih dan Hitam pada tema terang berbeda/kontras dengan latar putih
  assert.notEqual(lightPalette.pageBg.toLowerCase(), darkPalette.pageBg.toLowerCase());
  assert.notEqual(lightPalette.deckDotOutline.Putih.toLowerCase(), '#ffffff');
});

test('EXPORT THEME 2: Palet gelap mempertahankan nilai warna lama yang sebelumnya di-hardcode', () => {
  const dark = getExportPalette('dark');
  assert.equal(dark.pageBg, '#0f172a');
  assert.equal(dark.headerBarFrom, '#f59e0b');
  assert.equal(dark.headerBarTo, '#d97706');
  assert.equal(dark.titleText, '#f8fafc');
  assert.equal(dark.mutedText, '#94a3b8');
  assert.equal(dark.strongText, '#e2e8f0');
  assert.equal(dark.secondaryText, '#cbd5e1');
  assert.equal(dark.sectionHeaderBg, '#1e293b');
  assert.equal(dark.tableHeaderBg, '#1e293b');
  assert.equal(dark.tableHeaderText, '#cbd5e1');
  assert.equal(dark.rowBgEven, '#131d31');
  assert.equal(dark.rowBgOdd, '#0f172a');
  assert.equal(dark.rowDivider, '#1e293b');
  assert.equal(dark.cardBg, '#131d31');
  assert.equal(dark.cardBorder, '#293548');
  assert.equal(dark.cardFinalBg, '#17233a');
  assert.equal(dark.emptySlotBg, '#111c33');
  assert.equal(dark.emptySlotBorder, '#334155');
  assert.equal(dark.emptySlotText, '#94a3b8');
  assert.equal(dark.badgeBg, '#f59e0b');
  assert.equal(dark.badgeText, '#0f172a');
  assert.equal(dark.seasonText, '#fbbf24');
  assert.equal(dark.accentText, '#f59e0b');
  assert.equal(dark.deckNameText, '#38bdf8');
  assert.equal(dark.winnerText, '#facc15');
  assert.equal(dark.loserText, '#94a3b8');
  assert.equal(dark.rankGold, '#facc15');
  assert.equal(dark.rankGoldBar, '#eab308');
  assert.equal(dark.rankSilver, '#94a3b8');
  assert.equal(dark.rankBronze, '#cd7f32');
  assert.equal(dark.successText, '#2DD4BF');
  assert.equal(dark.championBannerBorder, '#facc15');
  assert.equal(dark.championBannerText, '#facc15');
  assert.deepEqual(dark.deckDotOutline, {
    Hitam: '#94A3B8',
    Putih: '#CBD5E1',
    default: '#94A3B8',
  });
  assert.equal(dark.legendText, '#cbd5e1');
  assert.equal(dark.footerText, '#94a3b8');
});

test('EXPORT THEME 3: Fungsi murni contrastRatio menghitung kontras WCAG secara akurat', () => {
  const maxContrast = contrastRatio('#000000', '#FFFFFF');
  assert.ok(Math.abs(maxContrast - 21) < 0.01);
  assert.equal(contrastRatio('#FFFFFF', '#FFFFFF'), 1);
  assert.equal(
    contrastRatio('#0F172A', '#F8FAFC'),
    contrastRatio('#F8FAFC', '#0F172A')
  );
});

test('EXPORT THEME 4: Rasio kontras WCAG AA (>= 4.5:1) terpenuhi pada seluruh pasangan teks utama di tema terang dan gelap', () => {
  for (const theme of ['light', 'dark']) {
    const p = getExportPalette(theme);
    const pairs = [
      ['titleText / pageBg', p.titleText, p.pageBg],
      ['mutedText / pageBg', p.mutedText, p.pageBg],
      ['strongText / pageBg', p.strongText, p.pageBg],
      ['deckNameText / cardBg', p.deckNameText, p.cardBg],
      ['deckNameText / rowBgEven', p.deckNameText, p.rowBgEven],
      ['deckNameText / rowBgOdd', p.deckNameText, p.rowBgOdd],
      ['accentText / rowBgEven', p.accentText, p.rowBgEven],
      ['accentText / rowBgOdd', p.accentText, p.rowBgOdd],
      ['winnerText / winnerRowBg', p.winnerText, p.winnerRowBg],
      ['tableHeaderText / tableHeaderBg', p.tableHeaderText, p.tableHeaderBg],
      ['championBannerText / championBannerBg', p.championBannerText, p.championBannerBg],
      ['successText / pageBg', p.successText, p.pageBg],
      ['badgeText / badgeBg', p.badgeText, p.badgeBg],
    ];

    for (const [label, fg, bg] of pairs) {
      const ratio = contrastRatio(fg, bg);
      assert.ok(
        ratio >= 4.5,
        `[${theme}] Kontras ${label} (${fg} di atas ${bg}) hanya ${ratio.toFixed(2)}:1 (< 4.5:1)`
      );
    }
  }
});
