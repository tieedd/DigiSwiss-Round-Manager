import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  OFFICIAL_DECK_COLORS,
  DECK_COLOR_HEX,
  DECK_COLOR_ACTIVE_TEXT,
} from '../utils/deckExportLogic.ts';
import { getExportPalette, contrastRatio } from '../utils/exportTheme.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function rgbToHex(r, g, b) {
  return (
    '#' +
    [r, g, b]
      .map((n) => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, '0'))
      .join('')
      .toUpperCase()
  );
}

function parseCssThemeTokens(cssContent) {
  const darkMatch = /:root\s*\{([\s\S]*?)\n\}/.exec(cssContent);
  const lightMatch = /:root\[data-theme="light"\]\s*\{([\s\S]*?)\n\}/.exec(cssContent);
  assert.ok(darkMatch, 'Blok :root di src/index.css harus ditemukan');
  assert.ok(lightMatch, 'Blok :root[data-theme="light"] di src/index.css harus ditemukan');

  const extractTriplets = (block) => {
    const tokens = {};
    const regex = /(--c-[a-z0-9-]+)\s*:\s*(\d+)\s+(\d+)\s+(\d+)\s*;/g;
    let m;
    while ((m = regex.exec(block)) !== null) {
      tokens[m[1]] = rgbToHex(Number(m[2]), Number(m[3]), Number(m[4]));
    }
    return tokens;
  };

  return {
    dark: extractTriplets(darkMatch[1]),
    light: extractTriplets(lightMatch[1]),
  };
}

function hexToSrgb01(hex) {
  const clean = hex.replace('#', '');
  return [
    parseInt(clean.slice(0, 2), 16) / 255,
    parseInt(clean.slice(2, 4), 16) / 255,
    parseInt(clean.slice(4, 6), 16) / 255,
  ];
}

function srgbToLinear(c) {
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

function linearToSrgb(c) {
  const clamped = Math.max(0, Math.min(1, c));
  return clamped <= 0.0031308
    ? 12.92 * clamped
    : 1.055 * Math.pow(clamped, 1 / 2.4) - 0.055;
}

// Matriks simulasi buta warna Machado et al. (2009), keparahan 1.0 pada linear sRGB
const MACHADO_2009_MATRICES = {
  protan: [
    [0.152286, 1.052583, -0.204868],
    [0.114503, 0.786281, 0.099216],
    [-0.003882, -0.048116, 1.051998],
  ],
  deutan: [
    [0.367322, 0.860646, -0.227968],
    [0.280085, 0.672501, 0.047413],
    [-0.01182, 0.04294, 0.968881],
  ],
  tritan: [
    [1.255528, -0.076749, -0.178779],
    [-0.078411, 0.930809, 0.147602],
    [0.004733, 0.691367, 0.3039],
  ],
};

function simulateMachado2009(hex, type) {
  const [sr, sg, sb] = hexToSrgb01(hex);
  const [lr, lg, lb] = [srgbToLinear(sr), srgbToLinear(sg), srgbToLinear(sb)];
  const m = MACHADO_2009_MATRICES[type];
  const simLin = m.map((row) =>
    Math.max(0, Math.min(1, row[0] * lr + row[1] * lg + row[2] * lb))
  );
  // Konversi kembali melalui sRGB clamp standar
  return simLin.map((c) => srgbToLinear(linearToSrgb(c)));
}

function linearRgbToLab([r, g, b]) {
  // sRGB linear -> CIE XYZ (D65)
  const x = 0.4124564 * r + 0.3575761 * g + 0.1804375 * b;
  const y = 0.2126729 * r + 0.7151522 * g + 0.072175 * b;
  const z = 0.0193339 * r + 0.119192 * g + 0.9503041 * b;

  // D65 reference white
  const xn = 0.95047;
  const yn = 1.0;
  const zn = 1.08883;

  const f = (t) => (t > 216 / 24389 ? Math.cbrt(t) : (24389 / 27 * t + 16) / 116);
  const fx = f(x / xn);
  const fy = f(y / yn);
  const fz = f(z / zn);

  return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
}

// Perhitungan jarak warna CIEDE2000 (Sharma et al. 2005)
function ciede2000([L1, a1, b1], [L2, a2, b2]) {
  const deg2rad = (d) => (d * Math.PI) / 180;
  const rad2deg = (r) => (r * 180) / Math.PI;

  const C1 = Math.hypot(a1, b1);
  const C2 = Math.hypot(a2, b2);
  const Cbar = (C1 + C2) / 2;
  const Cbar7 = Math.pow(Cbar, 7);
  const G = 0.5 * (1 - Math.sqrt(Cbar7 / (Cbar7 + Math.pow(25, 7))));

  const a1p = (1 + G) * a1;
  const a2p = (1 + G) * a2;
  const C1p = Math.hypot(a1p, b1);
  const C2p = Math.hypot(a2p, b2);

  const hp = (ap, b) => {
    if (ap === 0 && b === 0) return 0;
    const h = rad2deg(Math.atan2(b, ap));
    return h >= 0 ? h : h + 360;
  };
  const h1p = hp(a1p, b1);
  const h2p = hp(a2p, b2);

  const dLp = L2 - L1;
  const dCp = C2p - C1p;

  let dhp = 0;
  if (C1p * C2p !== 0) {
    if (Math.abs(h2p - h1p) <= 180) dhp = h2p - h1p;
    else if (h2p - h1p > 180) dhp = h2p - h1p - 360;
    else dhp = h2p - h1p + 360;
  }
  const dHp = 2 * Math.sqrt(C1p * C2p) * Math.sin(deg2rad(dhp / 2));

  const Lbarp = (L1 + L2) / 2;
  const Cbarp = (C1p + C2p) / 2;

  let hbarp = h1p + h2p;
  if (C1p * C2p !== 0) {
    if (Math.abs(h1p - h2p) <= 180) hbarp = (h1p + h2p) / 2;
    else if (h1p + h2p < 360) hbarp = (h1p + h2p + 360) / 2;
    else hbarp = (h1p + h2p - 360) / 2;
  }

  const T =
    1 -
    0.17 * Math.cos(deg2rad(hbarp - 30)) +
    0.24 * Math.cos(deg2rad(2 * hbarp)) +
    0.32 * Math.cos(deg2rad(3 * hbarp + 6)) -
    0.2 * Math.cos(deg2rad(4 * hbarp - 63));

  const dTheta = 30 * Math.exp(-Math.pow((hbarp - 275) / 25, 2));
  const Cbarp7 = Math.pow(Cbarp, 7);
  const RC = 2 * Math.sqrt(Cbarp7 / (Cbarp7 + Math.pow(25, 7)));
  const Lbarp50sq = Math.pow(Lbarp - 50, 2);
  const SL = 1 + (0.015 * Lbarp50sq) / Math.sqrt(20 + Lbarp50sq);
  const SC = 1 + 0.045 * Cbarp;
  const SH = 1 + 0.015 * Cbarp * T;
  const RT = -Math.sin(deg2rad(2 * dTheta)) * RC;

  return Math.sqrt(
    Math.pow(dLp / SL, 2) +
      Math.pow(dCp / SC, 2) +
      Math.pow(dHp / SH, 2) +
      RT * (dCp / SC) * (dHp / SH)
  );
}

test('AKSESIBILITAS WARNA 1: Seluruh token teks tema CSS memenuhi rasio kontras WCAG AA >= 4.5:1 di atas seluruh permukaan', () => {
  const cssPath = path.resolve(__dirname, '../index.css');
  const cssContent = fs.readFileSync(cssPath, 'utf8');
  const themes = parseCssThemeTokens(cssContent);

  const fgKeys = [
    '--c-dark-text',
    '--c-dark-muted',
    '--c-accent',
    '--c-status-green',
    '--c-status-yellow',
    '--c-status-red',
    '--c-info',
  ];
  const bgKeys = ['--c-dark-bg', '--c-dark-surface', '--c-dark-surface-high'];

  for (const themeName of ['dark', 'light']) {
    const tokens = themes[themeName];
    for (const fgKey of fgKeys) {
      assert.ok(tokens[fgKey], `[${themeName}] Token ${fgKey} wajib ada di index.css`);
      for (const bgKey of bgKeys) {
        assert.ok(tokens[bgKey], `[${themeName}] Token ${bgKey} wajib ada di index.css`);
        const ratio = contrastRatio(tokens[fgKey], tokens[bgKey]);
        assert.ok(
          ratio >= 4.5,
          `[${themeName}] Kontras ${fgKey} (${tokens[fgKey]}) di atas ${bgKey} (${tokens[bgKey]}) hanya ${ratio.toFixed(2)}:1 (< 4.5:1)`
        );
      }
    }
  }

  // Tombol aksen solid (#0B0F14 di atas #FF8A1F) berlaku di kedua tema
  const primaryBtnContrast = contrastRatio('#0B0F14', '#FF8A1F');
  assert.ok(
    primaryBtnContrast >= 4.5,
    `Kontras teks tombol aksen utama hanya ${primaryBtnContrast.toFixed(2)}:1`
  );
});

test('AKSESIBILITAS WARNA 2: Chip deck aktif memakai warna teks paling kontras terhadap warna latar deck', () => {
  for (const color of OFFICIAL_DECK_COLORS) {
    const bgHex = DECK_COLOR_HEX[color];
    const chosenFg = DECK_COLOR_ACTIVE_TEXT[color];
    const whiteRatio = contrastRatio('#FFFFFF', bgHex);
    const darkRatio = contrastRatio('#111827', bgHex);
    const chosenRatio = contrastRatio(chosenFg, bgHex);

    assert.equal(
      chosenRatio,
      Math.max(whiteRatio, darkRatio),
      `DECK_COLOR_ACTIVE_TEXT[${color}] (${chosenFg}) harus memilih kontras tertinggi`
    );
    assert.ok(
      chosenRatio >= 4.4,
      `Kontras chip aktif ${color} (${chosenFg} di atas ${bgHex}) terlalu rendah: ${chosenRatio.toFixed(2)}:1`
    );
  }
});

test('AKSESIBILITAS WARNA 3: 7 warna deck tetap dapat dibedakan di bawah simulasi Machado (2009) protanopia, deuteranopia, dan tritanopia', () => {
  const thresholds = {
    deutan: 20,
    protan: 20,
    tritan: 15,
  };

  for (const [cvdType, minRequiredDeltaE] of Object.entries(thresholds)) {
    let minDeltaE = Infinity;
    let minPair = '';

    for (let i = 0; i < OFFICIAL_DECK_COLORS.length; i++) {
      for (let j = i + 1; j < OFFICIAL_DECK_COLORS.length; j++) {
        const c1 = OFFICIAL_DECK_COLORS[i];
        const c2 = OFFICIAL_DECK_COLORS[j];
        const lab1 = linearRgbToLab(simulateMachado2009(DECK_COLOR_HEX[c1], cvdType));
        const lab2 = linearRgbToLab(simulateMachado2009(DECK_COLOR_HEX[c2], cvdType));
        const dE = ciede2000(lab1, lab2);
        if (dE < minDeltaE) {
          minDeltaE = dE;
          minPair = `${c1} vs ${c2}`;
        }
      }
    }

    assert.ok(
      minDeltaE >= minRequiredDeltaE,
      `Jarak minimum CIEDE2000 pada simulasi ${cvdType} (${minPair}) hanya ${minDeltaE.toFixed(2)} (< ${minRequiredDeltaE})`
    );
  }
});

test('AKSESIBILITAS WARNA 4: Seluruh pasangan warna ExportPalette PNG memenuhi kontras WCAG AA >= 4.5:1 di tema terang dan gelap', () => {
  for (const theme of ['light', 'dark']) {
    const p = getExportPalette(theme);
    const pairs = [
      ['titleText / pageBg', p.titleText, p.pageBg],
      ['mutedText / pageBg', p.mutedText, p.pageBg],
      ['strongText / pageBg', p.strongText, p.pageBg],
      ['secondaryText / pageBg', p.secondaryText, p.pageBg],
      ['sectionHeadingPrimary / pageBg', p.sectionHeadingPrimary, p.pageBg],
      ['sectionHeadingSecondary / pageBg', p.sectionHeadingSecondary, p.pageBg],
      ['seasonText / pageBg', p.seasonText, p.pageBg],
      ['deckNameText / cardBg', p.deckNameText, p.cardBg],
      ['deckNameText / cardFinalBg', p.deckNameText, p.cardFinalBg],
      ['deckNameText / rowBgEven', p.deckNameText, p.rowBgEven],
      ['deckNameText / rowBgOdd', p.deckNameText, p.rowBgOdd],
      ['deckNameText / winnerRowBg', p.deckNameText, p.winnerRowBg],
      ['deckNameText / stagePillBg', p.deckNameText, p.stagePillBg],
      ['accentText / rowBgEven', p.accentText, p.rowBgEven],
      ['accentText / rowBgOdd', p.accentText, p.rowBgOdd],
      ['accentText / cardBg', p.accentText, p.cardBg],
      ['accentText / sectionHeaderBg', p.accentText, p.sectionHeaderBg],
      ['accentText / stagePillBg', p.accentText, p.stagePillBg],
      ['winnerText / winnerRowBg', p.winnerText, p.winnerRowBg],
      ['winnerText / sectionHeaderBg', p.winnerText, p.sectionHeaderBg],
      ['winnerText / stagePillBg', p.winnerText, p.stagePillBg],
      ['loserText / rowBgEven', p.loserText, p.rowBgEven],
      ['loserText / rowBgOdd', p.loserText, p.rowBgOdd],
      ['loserText / cardBg', p.loserText, p.cardBg],
      ['tableHeaderText / tableHeaderBg', p.tableHeaderText, p.tableHeaderBg],
      ['emptySlotText / emptySlotBg', p.emptySlotText, p.emptySlotBg],
      ['championBannerText / championBannerBg', p.championBannerText, p.championBannerBg],
      ['successText / pageBg', p.successText, p.pageBg],
      ['successText / stagePillBg', p.successText, p.stagePillBg],
      ['successText / cardBg', p.successText, p.cardBg],
      ['badgeText / badgeBg', p.badgeText, p.badgeBg],
      ['legendText / pageBg', p.legendText, p.pageBg],
      ['footerText / pageBg', p.footerText, p.pageBg],
      ['footerText / rowBgEven', p.footerText, p.rowBgEven],
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
