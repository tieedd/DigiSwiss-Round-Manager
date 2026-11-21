import type { DeckColor, LeagueDeckEntry } from '../types/index.ts';
import {
  DECK_COLOR_HEX,
  OFFICIAL_DECK_COLORS,
  truncateTextToWidth
} from './deckExportLogic.ts';
import { formatOrganizerLocationLine } from './canvasExport.ts';
import type {
  LeagueRoundPairingExportData,
  LeagueRoundStandingsExportData,
  LeagueTopCutBracketExportData
} from './roundExportLogic.ts';
import { getExportPalette, type ExportPalette } from './exportTheme.ts';
import { getCurrentTheme, type AppTheme } from './themeLogic.ts';
import {
  formatIndonesianFullDate,
  formatPercent2Decimals,
} from './exportFormatLogic.ts';

function createRetinaCanvas(
  logicalWidth: number,
  logicalHeight: number
): { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D } | null {
  if (typeof document === 'undefined') return null;
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  canvas.width = logicalWidth * 2;
  canvas.height = logicalHeight * 2;
  ctx.scale(2, 2);
  return { canvas, ctx };
}

function drawRoundedRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number
) {
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + w - radius, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + radius);
  ctx.lineTo(x + w, y + h - radius);
  ctx.quadraticCurveTo(x + w, y + h, x + w - radius, y + h);
  ctx.lineTo(x + radius, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - radius);
  ctx.lineTo(x, y + radius);
  ctx.quadraticCurveTo(x, y, x + radius, y);
  ctx.closePath();
}

function drawLeagueHeader(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  padding: number,
  palette: ExportPalette,
  options: {
    title: string;
    seasonLabel: string | null;
    stageLabel: string;
    date: string;
    organizerName: string;
    location: string;
    stageAccentColor?: string;
  }
): number {
  // Background mengikuti tema aktif aplikasi (konsisten dengan canvasExport.ts)
  ctx.fillStyle = palette.pageBg;
  ctx.fillRect(0, 0, width, height);

  // Decorative amber top bar
  const grad = ctx.createLinearGradient(0, 0, width, 0);
  grad.addColorStop(0, palette.headerBarFrom);
  grad.addColorStop(1, palette.headerBarTo);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, width, 8);

  // Title
  ctx.fillStyle = palette.titleText;
  ctx.font = 'bold 24px sans-serif';
  const titleText = truncateTextToWidth(
    (s) => ctx.measureText(s).width,
    options.title,
    width - padding * 2
  );
  ctx.fillText(titleText, padding, 48);

  // Baris LIGA + Season + Stage Pill
  let cursorX = padding;
  ctx.font = 'bold 12px monospace';
  const ligaText = 'LIGA';
  const ligaW = ctx.measureText(ligaText).width + 16;
  ctx.fillStyle = palette.badgeBg;
  drawRoundedRect(ctx, cursorX, 62, ligaW, 22, 4);
  ctx.fill();
  ctx.fillStyle = palette.badgeText;
  ctx.fillText(ligaText, cursorX + 8, 77);
  cursorX += ligaW + 10;

  if (options.seasonLabel) {
    ctx.font = 'bold 14px monospace';
    ctx.fillStyle = palette.seasonText;
    ctx.fillText(options.seasonLabel, cursorX, 78);
    cursorX += ctx.measureText(options.seasonLabel).width + 12;
  }

  // Stage label pill
  ctx.font = 'bold 12px monospace';
  const stageText = options.stageLabel;
  const stageW = ctx.measureText(stageText).width + 18;
  ctx.fillStyle = palette.stagePillBg;
  drawRoundedRect(ctx, cursorX, 62, stageW, 22, 4);
  ctx.fill();
  ctx.strokeStyle = options.stageAccentColor || palette.deckNameText;
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.fillStyle = options.stageAccentColor || palette.deckNameText;
  ctx.fillText(stageText, cursorX + 9, 77);

  // Date & Organizer/Location
  ctx.fillStyle = palette.mutedText;
  ctx.font = '13px sans-serif';
  ctx.fillText(`Tanggal: ${formatIndonesianFullDate(options.date)}`, padding, 108);

  ctx.font = 'bold 14px sans-serif';
  ctx.fillStyle = palette.strongText;
  const orgLocLine = formatOrganizerLocationLine(
    options.organizerName,
    options.location,
    width - padding * 2,
    (str) => ctx.measureText(str).width
  );
  ctx.fillText(orgLocLine, padding, 132);

  return 154;
}

function drawSingleDeckLine(
  ctx: CanvasRenderingContext2D,
  deck: LeagueDeckEntry,
  startX: number,
  baselineY: number,
  dotCenterY: number,
  bgFill: string,
  maxWidth: number,
  palette: ExportPalette,
  fontSize = 11,
  dotRadius = 4.5,
  textColor = palette.deckNameText
) {
  ctx.font = `${fontSize}px sans-serif`;
  const colors = (deck.colors || []).filter((c) =>
    OFFICIAL_DECK_COLORS.includes(c as DeckColor)
  ) as DeckColor[];

  const step = dotRadius * 1.5;
  const dotsWidth =
    colors.length > 0 ? dotRadius * 2 + (colors.length - 1) * step : 0;
  const gap = colors.length > 0 ? 6 : 0;
  const maxTextW = Math.max(36, maxWidth - dotsWidth - gap);

  const label = truncateTextToWidth(
    (s) => ctx.measureText(s).width,
    deck.name.trim(),
    maxTextW
  );

  ctx.fillStyle = textColor;
  ctx.fillText(label, startX, baselineY);

  if (colors.length > 0) {
    const labelW = ctx.measureText(label).width;
    let dotX = startX + labelW + gap + dotRadius;
    for (const c of colors) {
      const hex = DECK_COLOR_HEX[c] || palette.mutedText;
      ctx.beginPath();
      ctx.arc(dotX, dotCenterY, dotRadius + 1.2, 0, Math.PI * 2);
      ctx.fillStyle = bgFill;
      ctx.fill();

      ctx.beginPath();
      ctx.arc(dotX, dotCenterY, dotRadius, 0, Math.PI * 2);
      ctx.fillStyle = hex;
      ctx.fill();

      if (c === 'Hitam') {
        ctx.lineWidth = 1;
        ctx.strokeStyle = palette.deckDotOutline.Hitam;
        ctx.stroke();
      } else if (c === 'Putih') {
        ctx.lineWidth = 1;
        ctx.strokeStyle = palette.deckDotOutline.Putih;
        ctx.stroke();
      }

      dotX += step;
    }
  }
}

function collectUsedColorsFromDecks(decksList: LeagueDeckEntry[][]): DeckColor[] {
  const used = new Set<string>();
  for (const decks of decksList) {
    for (const d of decks) {
      if (d && Array.isArray(d.colors)) {
        d.colors.forEach((c) => used.add(c));
      }
    }
  }
  return OFFICIAL_DECK_COLORS.filter((c) => used.has(c));
}

function drawLegendAndFooter(
  ctx: CanvasRenderingContext2D,
  usedColors: DeckColor[],
  legendY: number,
  canvasHeight: number,
  padding: number,
  palette: ExportPalette
) {
  if (usedColors.length > 0) {
    ctx.font = 'bold 11px sans-serif';
    ctx.fillStyle = palette.mutedText;
    const labelText = 'Warna deck:';
    ctx.fillText(labelText, padding, legendY);

    let legendX = padding + ctx.measureText(labelText).width + 12;
    const dotR = 5;

    for (const color of usedColors) {
      const hex = DECK_COLOR_HEX[color] || palette.mutedText;
      ctx.beginPath();
      ctx.arc(legendX + dotR, legendY - 4, dotR, 0, Math.PI * 2);
      ctx.fillStyle = hex;
      ctx.fill();

      if (color === 'Hitam') {
        ctx.lineWidth = 1;
        ctx.strokeStyle = palette.deckDotOutline.Hitam;
        ctx.stroke();
      } else if (color === 'Putih') {
        ctx.lineWidth = 1;
        ctx.strokeStyle = palette.deckDotOutline.Putih;
        ctx.stroke();
      }

      ctx.font = '11px sans-serif';
      ctx.fillStyle = palette.legendText;
      ctx.fillText(color, legendX + dotR * 2 + 5, legendY);
      legendX += dotR * 2 + 5 + ctx.measureText(color).width + 14;
    }
  }

  ctx.fillStyle = palette.footerText;
  ctx.font = '11px sans-serif';
  ctx.fillText(
    `Digenerate oleh DigiSwiss-Round • ${formatIndonesianFullDate(new Date())}`,
    padding,
    canvasHeight - 18
  );
}

/**
 * Ekspor PNG Standing Saat Ini untuk Turnamen Liga (resolusi 2x, tinggi dinamis aman untuk 64+ pemain).
 */
export function exportLeagueRoundStandingToImage(
  data: LeagueRoundStandingsExportData,
  theme?: AppTheme
): string | null {
  const palette = getExportPalette(theme ?? getCurrentTheme());
  const width = 960;
  const padding = 30;
  const headerBottom = 154;
  const tableHeaderH = 36;
  const rowH = 42;
  const totalRows = Math.max(1, data.rows.length);
  const footerH = 40;
  const height = headerBottom + tableHeaderH + totalRows * rowH + footerH;

  const created = createRetinaCanvas(width, height);
  if (!created) return null;
  const { canvas, ctx } = created;

  const tableY = drawLeagueHeader(ctx, width, height, padding, palette, {
    title: `STANDING LIGA: ${data.tournamentName.toUpperCase()}`,
    seasonLabel: data.seasonLabel,
    stageLabel: data.roundTitle,
    date: data.date,
    organizerName: data.organizerName,
    location: data.location,
    stageAccentColor: data.isAllConfirmed ? palette.successText : palette.seasonText,
  });

  // Table header
  ctx.fillStyle = palette.tableHeaderBg;
  ctx.fillRect(padding, tableY, width - padding * 2, tableHeaderH);

  ctx.fillStyle = palette.tableHeaderText;
  ctx.font = 'bold 12px monospace';
  ctx.fillText('RANK', padding + 14, tableY + 23);
  ctx.fillText('NAMA PEMAIN', padding + 88, tableY + 23);
  ctx.fillText('POIN', padding + 560, tableY + 23);
  ctx.fillText('W - L', padding + 660, tableY + 23);
  ctx.fillText('OMW%', padding + 790, tableY + 23);

  let currentY = tableY + tableHeaderH;

  if (data.rows.length === 0) {
    ctx.fillStyle = palette.rowBgEven;
    ctx.fillRect(padding, currentY, width - padding * 2, rowH);
    ctx.fillStyle = palette.mutedText;
    ctx.font = '13px sans-serif';
    ctx.fillText('Belum ada data peserta.', padding + 18, currentY + 26);
    currentY += rowH;
  } else {
    data.rows.forEach((row, idx) => {
      const rowBg = idx % 2 === 0 ? palette.rowBgEven : palette.rowBgOdd;
      ctx.fillStyle = rowBg;
      ctx.fillRect(padding, currentY, width - padding * 2, rowH);

      if (row.rank <= 3) {
        ctx.fillStyle =
          row.rank === 1
            ? palette.rankGoldBar
            : row.rank === 2
            ? palette.rankSilver
            : palette.rankBronze;
        ctx.fillRect(padding, currentY, 4, rowH);
      }

      const textY = currentY + 26;

      ctx.font = 'bold 14px monospace';
      ctx.fillStyle =
        row.rank === 1
          ? palette.rankGold
          : row.rank <= 3
          ? palette.rankSilverText
          : palette.mutedText;
      ctx.fillText(String(row.rank), padding + 20, textY);

      const displayName = row.isDropped
        ? `${row.playerName} (Drop)`
        : row.playerName;
      ctx.font = 'bold 14px sans-serif';
      ctx.fillStyle = row.isDropped ? palette.mutedText : palette.titleText;
      ctx.fillText(
        truncateTextToWidth(
          (s) => ctx.measureText(s).width,
          displayName,
          445
        ),
        padding + 88,
        textY
      );

      ctx.font = 'bold 14px monospace';
      ctx.fillStyle = palette.accentText;
      ctx.fillText(String(row.points), padding + 566, textY);

      ctx.font = '13px monospace';
      ctx.fillStyle = palette.strongText;
      ctx.fillText(`${row.matchWins} - ${row.matchLosses}`, padding + 662, textY);

      ctx.fillStyle = palette.secondaryText;
      ctx.fillText(formatPercent2Decimals(row.omw), padding + 792, textY);

      currentY += rowH;
    });
  }

  drawLegendAndFooter(ctx, [], currentY + 18, height, padding, palette);
  return canvas.toDataURL('image/png');
}

/**
 * Ekspor PNG Pairing Ronde X untuk Turnamen Liga (resolusi 2x).
 * Skor dan sorotan pemenang HANYA dirender ketika data.showScores === true.
 */
export function exportLeagueRoundPairingToImage(
  data: LeagueRoundPairingExportData,
  theme?: AppTheme
): string | null {
  const palette = getExportPalette(theme ?? getCurrentTheme());
  const width = 1040;
  const padding = 30;
  const headerBottom = 154;
  const tableHeaderH = 36;

  const hasAnyDeck = data.rows.some(
    (r) => r.p1Decks.length > 0 || r.p2Decks.length > 0
  );
  const rowH = hasAnyDeck ? 72 : 48;
  const totalRows = Math.max(1, data.rows.length);

  const usedColors = collectUsedColorsFromDecks(
    data.rows.flatMap((r) => [r.p1Decks, r.p2Decks])
  );
  const legendH = usedColors.length > 0 ? 32 : 0;
  const footerH = 40;

  const height =
    headerBottom + tableHeaderH + totalRows * rowH + legendH + footerH;

  const created = createRetinaCanvas(width, height);
  if (!created) return null;
  const { canvas, ctx } = created;

  const tableY = drawLeagueHeader(ctx, width, height, padding, palette, {
    title: `PAIRING LIGA: ${data.tournamentName.toUpperCase()}`,
    seasonLabel: data.seasonLabel,
    stageLabel: data.showScores
      ? `${data.roundLabel} • Selesai`
      : data.roundLabel,
    date: data.date,
    organizerName: data.organizerName,
    location: data.location,
    stageAccentColor: data.showScores ? palette.successText : palette.deckNameText,
  });

  // Table header
  const colMejaX = padding + 14;
  const colP1X = padding + 104;
  const colCenterX = padding + 528;
  const colP2X = padding + 586;
  const playerColW = 390;

  ctx.fillStyle = palette.tableHeaderBg;
  ctx.fillRect(padding, tableY, width - padding * 2, tableHeaderH);
  ctx.fillStyle = palette.tableHeaderText;
  ctx.font = 'bold 12px monospace';
  ctx.fillText('MEJA', colMejaX, tableY + 23);
  ctx.fillText('PEMAIN 1', colP1X, tableY + 23);
  ctx.fillText(data.showScores ? 'SKOR' : 'VS', colCenterX - 12, tableY + 23);
  ctx.fillText('PEMAIN 2', colP2X, tableY + 23);

  let currentY = tableY + tableHeaderH;

  if (data.rows.length === 0) {
    ctx.fillStyle = palette.rowBgEven;
    ctx.fillRect(padding, currentY, width - padding * 2, rowH);
    ctx.fillStyle = palette.mutedText;
    ctx.font = '13px sans-serif';
    ctx.fillText('Belum ada data meja pertandingan.', padding + 18, currentY + 28);
    currentY += rowH;
  } else {
    data.rows.forEach((row, idx) => {
      const rowBg = idx % 2 === 0 ? palette.rowBgEven : palette.rowBgOdd;
      ctx.fillStyle = rowBg;
      ctx.fillRect(padding, currentY, width - padding * 2, rowH);

      // Divider tipis antar baris
      ctx.fillStyle = palette.rowDivider;
      ctx.fillRect(padding, currentY + rowH - 1, width - padding * 2, 1);

      const p1IsWinner = data.showScores && row.winner === 'p1';
      const p2IsWinner = data.showScores && row.winner === 'p2';

      const nameBaseline = hasAnyDeck ? currentY + 24 : currentY + 29;

      // Meja label
      ctx.font = 'bold 13px monospace';
      ctx.fillStyle = palette.accentText;
      ctx.fillText(row.tableLabel, colMejaX, nameBaseline);

      // Pemain 1
      ctx.font = 'bold 14px sans-serif';
      ctx.fillStyle = p1IsWinner
        ? palette.winnerText
        : p2IsWinner
        ? palette.loserText
        : palette.titleText;
      const p1Label = p1IsWinner ? `★ ${row.p1Name}` : row.p1Name;
      ctx.fillText(
        truncateTextToWidth((s) => ctx.measureText(s).width, p1Label, playerColW),
        colP1X,
        nameBaseline
      );

      if (hasAnyDeck && row.p1Decks.length > 0) {
        if (row.p1Decks[0]) {
          drawSingleDeckLine(
            ctx,
            row.p1Decks[0],
            colP1X,
            currentY + 43,
            currentY + 39,
            rowBg,
            playerColW,
            palette
          );
        }
        if (row.p1Decks[1]) {
          drawSingleDeckLine(
            ctx,
            row.p1Decks[1],
            colP1X,
            currentY + 61,
            currentY + 57,
            rowBg,
            playerColW,
            palette
          );
        }
      }

      // Tengah: VS atau Skor (jika showScores === true)
      ctx.font = 'bold 14px monospace';
      if (data.showScores) {
        if (row.isBye) {
          ctx.fillStyle = palette.successText;
          ctx.fillText('WIN', colCenterX - 12, nameBaseline);
        } else {
          ctx.fillStyle = palette.accentText;
          const scoreStr = `${row.p1Score} - ${row.p2Score}`;
          const scoreW = ctx.measureText(scoreStr).width;
          ctx.fillText(scoreStr, colCenterX - scoreW / 2 + 4, nameBaseline);
        }
      } else {
        ctx.fillStyle = palette.footerText;
        ctx.fillText('VS', colCenterX - 6, nameBaseline);
      }

      // Pemain 2 / BYE
      ctx.font = row.isBye ? 'italic 14px sans-serif' : 'bold 14px sans-serif';
      ctx.fillStyle = row.isBye
        ? palette.mutedText
        : p2IsWinner
        ? palette.winnerText
        : p1IsWinner
        ? palette.loserText
        : palette.titleText;
      const p2Label = p2IsWinner ? `★ ${row.p2Name}` : row.p2Name;
      ctx.fillText(
        truncateTextToWidth((s) => ctx.measureText(s).width, p2Label, playerColW),
        colP2X,
        nameBaseline
      );

      if (hasAnyDeck && !row.isBye && row.p2Decks.length > 0) {
        if (row.p2Decks[0]) {
          drawSingleDeckLine(
            ctx,
            row.p2Decks[0],
            colP2X,
            currentY + 43,
            currentY + 39,
            rowBg,
            playerColW,
            palette
          );
        }
        if (row.p2Decks[1]) {
          drawSingleDeckLine(
            ctx,
            row.p2Decks[1],
            colP2X,
            currentY + 61,
            currentY + 57,
            rowBg,
            playerColW,
            palette
          );
        }
      }

      currentY += rowH;
    });
  }

  drawLegendAndFooter(ctx, usedColors, currentY + 18, height, padding, palette);
  return canvas.toDataURL('image/png');
}

/**
 * Ekspor PNG Bracket Top Cut (Top 4 / Top 8) untuk Turnamen Liga (resolusi 2x).
 * Hanya menampilkan peserta Top Cut; babak belum dibuat tampil sebagai Slot Kosong;
 * skor & pemenang per babak hanya tampil bila SELURUH pertandingan babak tersebut confirmed.
 */
export function exportLeagueTopCutBracketToImage(
  data: LeagueTopCutBracketExportData,
  theme?: AppTheme
): string | null {
  const palette = getExportPalette(theme ?? getCurrentTheme());
  const stageCount = Math.max(1, data.stages.length);
  const width = stageCount >= 3 ? 1200 : 960;
  const padding = 30;
  const headerBottom = 154;
  const colGap = 24;
  const colWidth =
    (width - padding * 2 - colGap * (stageCount - 1)) / stageCount;

  const firstStageSlotCount = data.stages[0]?.slots.length || 2;
  const cardH = 122;
  const cardGap = 16;
  const championBannerH = data.champion ? 56 : 0;
  const stageTitleH = 32;

  const usedColors = collectUsedColorsFromDecks(
    data.stages.flatMap((st) =>
      st.slots.flatMap((sl) => [sl.p1Decks, sl.p2Decks])
    )
  );
  const legendH = usedColors.length > 0 ? 32 : 0;
  const footerH = 40;

  const bracketBodyH =
    firstStageSlotCount * cardH + Math.max(0, firstStageSlotCount - 1) * cardGap;

  const height =
    headerBottom +
    championBannerH +
    4 +
    stageTitleH +
    bracketBodyH +
    legendH +
    footerH;

  const created = createRetinaCanvas(width, height);
  if (!created) return null;
  const { canvas, ctx } = created;

  let cursorY = drawLeagueHeader(ctx, width, height, padding, palette, {
    title: `BRACKET TOP ${data.topCutSize}: ${data.tournamentName.toUpperCase()}`,
    seasonLabel: data.seasonLabel,
    stageLabel: data.roundLabel,
    date: data.date,
    organizerName: data.organizerName,
    location: data.location,
    stageAccentColor: data.champion ? palette.winnerText : palette.accentText,
  });

  // Banner Juara jika Final sudah selesai
  if (data.champion) {
    ctx.fillStyle = palette.championBannerBg;
    drawRoundedRect(ctx, padding, cursorY, width - padding * 2, 42, 8);
    ctx.fill();
    ctx.strokeStyle = palette.championBannerBorder;
    ctx.lineWidth = 1.5;
    ctx.stroke();

    const seedStr = data.champion.seedNumber
      ? `#${data.champion.seedNumber} `
      : '';
    const decksStr =
      data.champion.decks.length > 0
        ? ` • ${data.champion.decks.map((d) => d.name).join(' & ')}`
        : '';
    ctx.font = 'bold 15px sans-serif';
    ctx.fillStyle = palette.championBannerText;
    const champText = truncateTextToWidth(
      (s) => ctx.measureText(s).width,
      `JUARA TOP ${data.topCutSize}: ${seedStr}${data.champion.name}${decksStr}`,
      width - padding * 2 - 28
    );
    ctx.fillText(champText, padding + 14, cursorY + 26);

    cursorY += championBannerH;
  }

  const stageTopY = cursorY + 4;

  data.stages.forEach((stage, stageIdx) => {
    const colX = padding + stageIdx * (colWidth + colGap);

    // Stage Header
    ctx.fillStyle = palette.sectionHeaderBg;
    drawRoundedRect(ctx, colX, stageTopY, colWidth, 26, 5);
    ctx.fill();

    ctx.font = 'bold 12px monospace';
    ctx.fillStyle = stage.isFinal ? palette.winnerText : palette.accentText;
    ctx.fillText(stage.label.toUpperCase(), colX + 10, stageTopY + 17);

    const slotTopBase = stageTopY + stageTitleH;
    const slotCount = stage.slots.length;
    const totalColCardSpace = bracketBodyH;
    const slotBlockH = totalColCardSpace / Math.max(1, slotCount);

    stage.slots.forEach((slot, slotIdx) => {
      const cardY = slotTopBase + slotIdx * slotBlockH + (slotBlockH - cardH) / 2;

      if (slot.isPlaceholder) {
        ctx.fillStyle = palette.emptySlotBg;
        drawRoundedRect(ctx, colX, cardY, colWidth, cardH, 8);
        ctx.fill();
        ctx.save();
        ctx.setLineDash([5, 4]);
        ctx.strokeStyle = palette.emptySlotBorder;
        ctx.lineWidth = 1;
        ctx.stroke();
        ctx.restore();

        ctx.font = 'bold 11px monospace';
        ctx.fillStyle = palette.emptySlotText;
        ctx.fillText(slot.tableLabel, colX + 12, cardY + 22);

        ctx.font = '12px sans-serif';
        ctx.fillStyle = palette.emptySlotText;
        ctx.fillText('Slot Kosong', colX + 12, cardY + 62);
        ctx.font = '11px sans-serif';
        ctx.fillText('Menunggu babak sebelumnya', colX + 12, cardY + 80);
        return;
      }

      // Match card
      const cardBg = stage.isFinal ? palette.cardFinalBg : palette.cardBg;
      ctx.fillStyle = cardBg;
      drawRoundedRect(ctx, colX, cardY, colWidth, cardH, 8);
      ctx.fill();
      ctx.strokeStyle = stage.isFinal ? palette.cardFinalBorder : palette.cardBorder;
      ctx.lineWidth = 1;
      ctx.stroke();

      // Top mini-bar
      ctx.font = 'bold 10px monospace';
      ctx.fillStyle = palette.mutedText;
      ctx.fillText(slot.tableLabel, colX + 10, cardY + 16);

      if (stage.showScores) {
        const statusLabel = stage.isFinal ? 'FINAL SELESAI' : 'SELESAI';
        const stW = ctx.measureText(statusLabel).width;
        ctx.fillStyle = stage.isFinal ? palette.winnerText : palette.successText;
        ctx.fillText(statusLabel, colX + colWidth - stW - 10, cardY + 16);
      }

      ctx.fillStyle = palette.rowDivider;
      ctx.fillRect(colX + 8, cardY + 22, colWidth - 16, 1);

      const drawPlayerRow = (
        rowTopY: number,
        seed: number | null,
        name: string,
        decks: LeagueDeckEntry[],
        score: number | null,
        isWinner: boolean,
        isLoser: boolean
      ) => {
        const rowH = 44;
        if (isWinner) {
          ctx.fillStyle = palette.winnerRowBg;
          drawRoundedRect(ctx, colX + 6, rowTopY, colWidth - 12, rowH, 5);
          ctx.fill();
        }

        const scoreAreaW = stage.showScores ? 36 : 8;
        let textX = colX + 12;

        if (seed !== null) {
          ctx.font = 'bold 11px monospace';
          ctx.fillStyle = palette.accentText;
          const seedTag = `#${seed}`;
          ctx.fillText(seedTag, textX, rowTopY + 16);
          textX += ctx.measureText(seedTag).width + 6;
        }

        const maxNameW = Math.max(
          50,
          colX + colWidth - scoreAreaW - textX - 4
        );
        ctx.font = isWinner ? 'bold 12px sans-serif' : '600 12px sans-serif';
        ctx.fillStyle = isWinner
          ? palette.winnerText
          : isLoser
          ? palette.loserText
          : palette.titleText;
        ctx.fillText(
          truncateTextToWidth((s) => ctx.measureText(s).width, name, maxNameW),
          textX,
          rowTopY + 16
        );

        // Score only if stage.showScores
        if (stage.showScores && score !== null) {
          ctx.font = 'bold 13px monospace';
          ctx.fillStyle = isWinner ? palette.winnerText : palette.loserText;
          const scoreStr = String(score);
          const sw = ctx.measureText(scoreStr).width;
          ctx.fillText(scoreStr, colX + colWidth - 14 - sw, rowTopY + 17);
        }

        // Decks (up to 2 side by side or compact)
        if (decks.length > 0) {
          const deckAreaW = colWidth - 24;
          if (decks.length === 1) {
            drawSingleDeckLine(
              ctx,
              decks[0],
              colX + 12,
              rowTopY + 34,
              rowTopY + 30,
              isWinner ? palette.winnerRowBg : cardBg,
              deckAreaW,
              palette,
              10,
              3.8
            );
          } else {
            const halfW = (deckAreaW - 8) / 2;
            drawSingleDeckLine(
              ctx,
              decks[0],
              colX + 12,
              rowTopY + 34,
              rowTopY + 30,
              isWinner ? palette.winnerRowBg : cardBg,
              halfW,
              palette,
              10,
              3.5
            );
            drawSingleDeckLine(
              ctx,
              decks[1],
              colX + 12 + halfW + 8,
              rowTopY + 34,
              rowTopY + 30,
              isWinner ? palette.winnerRowBg : cardBg,
              halfW,
              palette,
              10,
              3.5
            );
          }
        }
      };

      const p1Won = stage.showScores && slot.winner === 'p1';
      const p2Won = stage.showScores && slot.winner === 'p2';

      drawPlayerRow(
        cardY + 26,
        slot.p1Seed,
        slot.p1Name,
        slot.p1Decks,
        slot.p1Score,
        p1Won,
        p2Won
      );
      drawPlayerRow(
        cardY + 72,
        slot.p2Seed,
        slot.p2Name,
        slot.p2Decks,
        slot.p2Score,
        p2Won,
        p1Won
      );
    });
  });

  const bottomContentY = stageTopY + stageTitleH + bracketBodyH;
  drawLegendAndFooter(ctx, usedColors, bottomContentY + 20, height, padding, palette);
  return canvas.toDataURL('image/png');
}
