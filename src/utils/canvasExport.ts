import type { Participation } from '../types/index.ts';
import type { DeckColor } from './deckExportLogic.ts';
import {
  DECK_COLOR_HEX,
  OFFICIAL_DECK_COLORS,
  getUsedDeckColors,
  truncateTextToWidth
} from './deckExportLogic.ts';
import { getSwissStandingRecord } from './finalRecordLogic.ts';
import { getExportPalette } from './exportTheme.ts';
import { getCurrentTheme, type AppTheme } from './themeLogic.ts';

export interface ExportStandingsImageOptions {
  tournamentName: string;
  tournamentDate: string;
  format: string;
  participations: Participation[];
  organizerName?: string;
  location?: string;
  seasonLabel?: string | null;
  isLeague?: boolean;
  theme?: AppTheme;
}

/**
 * Format baris Organizer dan Lokasi dengan pemotongan proporsional elipsis "…"
 * jika melebihi batas piksel kartu (maxWidth).
 */
export function formatOrganizerLocationLine(
  organizerName: string | undefined | null,
  location: string | undefined | null,
  maxWidth: number,
  measureWidth: (str: string) => number
): string {
  const org = organizerName && organizerName.trim() ? organizerName.trim() : '-';
  const loc = location && location.trim() ? location.trim() : '-';

  const fullLine = `Organizer: ${org}  |  Lokasi: ${loc}`;
  if (measureWidth(fullLine) <= maxWidth) {
    return fullLine;
  }

  // Pendekkan nama organizer dan lokasi secara proporsional dengan elipsis "…"
  let trimmedOrg = org;
  let trimmedLoc = loc;

  while (
    measureWidth(`Organizer: ${trimmedOrg}  |  Lokasi: ${trimmedLoc}`) > maxWidth
  ) {
    if (trimmedOrg.length <= 2 && trimmedLoc.length <= 2) {
      break;
    }
    // Kurangi dari string yang lebih panjang
    if (trimmedOrg.length >= trimmedLoc.length && trimmedOrg.length > 2) {
      trimmedOrg = trimmedOrg.endsWith('…')
        ? trimmedOrg.slice(0, -2) + '…'
        : trimmedOrg.slice(0, -1) + '…';
    } else if (trimmedLoc.length > 2) {
      trimmedLoc = trimmedLoc.endsWith('…')
        ? trimmedLoc.slice(0, -2) + '…'
        : trimmedLoc.slice(0, -1) + '…';
    } else {
      break;
    }
  }

  return `Organizer: ${trimmedOrg}  |  Lokasi: ${trimmedLoc}`;
}

/**
 * Merender kartu hasil akhir turnamen secara visual ke HTML Canvas dan mengembalikan Data URL PNG
 */
export function exportStandingsToImage(
  nameOrOptions: string | ExportStandingsImageOptions,
  tournamentDate?: string,
  format?: string,
  participations?: Participation[],
  organizerName?: string,
  location?: string,
  theme?: AppTheme
): string | null {
  if (typeof document === 'undefined') return null;
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  let tName = '';
  let tDate = '';
  let tFormat = '';
  let parts: Participation[] = [];
  let orgName: string | undefined;
  let locName: string | undefined;
  let seasonLabel: string | null | undefined;
  let isLeague = false;
  let resolvedTheme: AppTheme;

  if (typeof nameOrOptions === 'object' && nameOrOptions !== null) {
    tName = nameOrOptions.tournamentName;
    tDate = nameOrOptions.tournamentDate;
    tFormat = nameOrOptions.format;
    parts = nameOrOptions.participations || [];
    orgName = nameOrOptions.organizerName;
    locName = nameOrOptions.location;
    seasonLabel = nameOrOptions.seasonLabel;
    isLeague = Boolean(nameOrOptions.isLeague || seasonLabel);
    resolvedTheme = nameOrOptions.theme ?? getCurrentTheme();
  } else {
    tName = nameOrOptions || '';
    tDate = tournamentDate || '';
    tFormat = format || '';
    parts = participations || [];
    orgName = organizerName;
    locName = location;
    resolvedTheme = theme ?? getCurrentTheme();
  }

  const palette = getExportPalette(resolvedTheme);

  const hasSeasonBanner = Boolean(seasonLabel || isLeague);
  const totalRows = Math.min(parts.length, isLeague ? 64 : 32);
  const hasTwoDeckRows =
    isLeague ||
    parts.slice(0, totalRows).some((p) => Array.isArray(p.decks) && p.decks.length > 0);
  const width = 1000;
  const rowHeight = hasTwoDeckRows ? 56 : 44;
  const section1LabelHeight = isLeague ? 28 : 0;
  const headerHeight = (hasSeasonBanner ? 215 : 185) + section1LabelHeight;
  const padding = 30;

  // Bagian 2 untuk Turnamen Liga: Klasemen Swiss (sebelum Top Cut)
  const swissRowHeight = 38;
  const swissSectionHeight =
    isLeague && totalRows > 0 ? 68 + totalRows * swissRowHeight : 0;

  // Ambil hanya warna deck yang ada di tabel hasil
  const usedColors = getUsedDeckColors(parts, totalRows);
  const legendHeight = usedColors.length > 0 ? 32 : 0;
  const height =
    headerHeight +
    totalRows * rowHeight +
    swissSectionHeight +
    padding * 2 +
    legendHeight +
    40;

  if (isLeague) {
    canvas.width = width * 2;
    canvas.height = height * 2;
    ctx.scale(2, 2);
  } else {
    canvas.width = width;
    canvas.height = height;
  }

  // Background mengikuti tema aktif aplikasi
  ctx.fillStyle = palette.pageBg;
  ctx.fillRect(0, 0, width, height);

  // Decorative header gradient
  const grad = ctx.createLinearGradient(0, 0, width, 0);
  grad.addColorStop(0, palette.headerBarFrom);
  grad.addColorStop(1, palette.headerBarTo);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, width, 8);

  // Title
  ctx.fillStyle = palette.titleText;
  ctx.font = 'bold 28px sans-serif';
  ctx.fillText(`HASIL AKHIR: ${tName.toUpperCase()}`, padding, 60);

  // Subtitle
  ctx.fillStyle = palette.mutedText;
  ctx.font = '14px sans-serif';
  ctx.fillText(
    `Tanggal: ${tDate}  |  Format: ${tFormat}  |  Total Peserta: ${parts.length} Pemain`,
    padding,
    90
  );

  // Baris Organizer dan Lokasi
  ctx.font = 'bold 15px sans-serif';
  ctx.fillStyle = palette.strongText;
  const orgLocLine = formatOrganizerLocationLine(
    orgName,
    locName,
    width - padding * 2,
    (str) => ctx.measureText(str).width
  );
  ctx.fillText(orgLocLine, padding, 118);

  // Baris penanda LIGA & Season (jika Turnamen Liga)
  if (hasSeasonBanner) {
    let cursorX = padding;
    if (isLeague) {
      ctx.font = 'bold 12px monospace';
      const ligaText = 'LIGA';
      const ligaWidth = ctx.measureText(ligaText).width + 16;
      ctx.fillStyle = palette.badgeBg;
      ctx.fillRect(cursorX, 132, ligaWidth, 22);
      ctx.fillStyle = palette.badgeText;
      ctx.fillText(ligaText, cursorX + 8, 147);
      cursorX += ligaWidth + 10;
    }
    if (seasonLabel) {
      ctx.font = 'bold 14px monospace';
      ctx.fillStyle = palette.seasonText;
      ctx.fillText(seasonLabel, cursorX, 148);
    }
  }

  // Section 1 heading (untuk Turnamen Liga)
  const tableY = (hasSeasonBanner ? 176 : 150) + section1LabelHeight;
  if (isLeague) {
    ctx.font = 'bold 13px monospace';
    ctx.fillStyle = palette.sectionHeadingPrimary;
    ctx.fillText('PERINGKAT AKHIR', padding, tableY - 10);
  }

  // Table Header Background
  ctx.fillStyle = palette.tableHeaderBg;
  ctx.fillRect(padding, tableY, width - padding * 2, 36);

  // Table Headers
  ctx.fillStyle = palette.tableHeaderText;
  ctx.font = 'bold 12px monospace';
  ctx.fillText('RANK', padding + 15, tableY + 22);
  ctx.fillText('NAMA PEMAIN', padding + 80, tableY + 22);
  ctx.fillText('DECK', padding + 340, tableY + 22);
  ctx.fillText('PTS', padding + 620, tableY + 22);
  ctx.fillText('W - L', padding + 690, tableY + 22);
  ctx.fillText('OMW%', padding + 780, tableY + 22);
  ctx.fillText('GW%', padding + 860, tableY + 22);

  // Rows
  let currentY = tableY + 36;

  const deckColStartX = padding + 340;
  const maxColWidth = 260; // Dari x=370 ke kolom PTS di x=650

  const drawSingleDeckLine = (
    deckName: string,
    deckColors: DeckColor[] | undefined,
    textBaselineY: number,
    dotCenterY: number,
    rowBg: string,
    fontSize: number,
    dotRadius: number
  ) => {
    ctx.font = `${fontSize}px sans-serif`;
    const colors = (deckColors || []).filter((c) =>
      OFFICIAL_DECK_COLORS.includes(c as DeckColor)
    ) as DeckColor[];

    const step = dotRadius * 1.5;
    const dotsWidth =
      colors.length > 0 ? dotRadius * 2 + (colors.length - 1) * step : 0;
    const gap = colors.length > 0 ? 8 : 0;
    const maxTextWidth = Math.max(40, maxColWidth - dotsWidth - gap);

    const truncatedName = truncateTextToWidth(
      (str) => ctx.measureText(str).width,
      deckName.trim(),
      maxTextWidth
    );

    ctx.fillStyle = palette.deckNameText;
    ctx.fillText(truncatedName, deckColStartX, textBaselineY);

    if (colors.length > 0) {
      const textWidth = ctx.measureText(truncatedName).width;
      let dotCenterX = deckColStartX + textWidth + gap + dotRadius;

      colors.forEach((c) => {
        const hex = DECK_COLOR_HEX[c] || palette.mutedText;

        ctx.beginPath();
        ctx.arc(dotCenterX, dotCenterY, dotRadius + 1.5, 0, Math.PI * 2);
        ctx.fillStyle = rowBg;
        ctx.fill();

        ctx.beginPath();
        ctx.arc(dotCenterX, dotCenterY, dotRadius, 0, Math.PI * 2);
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

        dotCenterX += step;
      });
    }
  };

  parts.slice(0, totalRows).forEach((p, idx) => {
    const rowBg = idx % 2 === 0 ? palette.rowBgEven : palette.rowBgOdd;
    const textMidY = currentY + (hasTwoDeckRows ? 33 : 27);

    // Alternating row background
    ctx.fillStyle = rowBg;
    ctx.fillRect(padding, currentY, width - padding * 2, rowHeight);

    // Top 3 accent border
    if (p.rank <= 3) {
      ctx.fillStyle =
        p.rank === 1
          ? palette.rankGoldBar
          : p.rank === 2
          ? palette.rankSilver
          : palette.rankBronze;
      ctx.fillRect(padding, currentY, 4, rowHeight);
    }

    // Rank text
    ctx.font = 'bold 14px monospace';
    ctx.fillStyle =
      p.rank === 1
        ? palette.rankGold
        : p.rank <= 3
        ? palette.rankSilverText
        : palette.mutedText;
    ctx.fillText(String(p.rank), padding + 22, textMidY);

    // Player Name + optional Top Cut badge
    const playerColStartX = padding + 80;
    const playerColMaxWidth = 248;
    const tcBadge = p.topCutResult ? `[${p.topCutResult}]` : '';
    ctx.font = 'bold 11px monospace';
    const tcBadgeWidth = tcBadge ? ctx.measureText(tcBadge).width + 8 : 0;

    ctx.font = 'bold 14px sans-serif';
    ctx.fillStyle = palette.titleText;
    const maxNameWidth = Math.max(80, playerColMaxWidth - tcBadgeWidth);
    const displayName = truncateTextToWidth(
      (str) => ctx.measureText(str).width,
      p.name,
      maxNameWidth
    );
    ctx.fillText(displayName, playerColStartX, textMidY);

    if (tcBadge) {
      const nameWidth = ctx.measureText(displayName).width;
      ctx.font = 'bold 11px monospace';
      ctx.fillStyle =
        p.topCutResult === 'Juara' ? palette.winnerText : palette.deckNameText;
      ctx.fillText(tcBadge, playerColStartX + nameWidth + 6, textMidY - 1);
    }

    // Deck & Color Dots (2 deck untuk Liga, 1 deck untuk Reguler)
    const leagueDecks = Array.isArray(p.decks)
      ? p.decks.filter((d) => d && d.name && d.name.trim().length > 0)
      : [];

    if (leagueDecks.length > 0) {
      if (leagueDecks[0]) {
        drawSingleDeckLine(
          leagueDecks[0].name,
          leagueDecks[0].colors,
          currentY + 21,
          currentY + 16,
          rowBg,
          12,
          6
        );
      }
      if (leagueDecks[1]) {
        drawSingleDeckLine(
          leagueDecks[1].name,
          leagueDecks[1].colors,
          currentY + 43,
          currentY + 38,
          rowBg,
          12,
          6
        );
      }
    } else if (p.deckName && p.deckName.trim().length > 0) {
      drawSingleDeckLine(
        p.deckName,
        p.deckColors,
        textMidY,
        currentY + (hasTwoDeckRows ? 28 : 22),
        rowBg,
        13,
        7
      );
    } else {
      ctx.font = '13px sans-serif';
      ctx.fillStyle = palette.emptySlotText;
      ctx.fillText('Belum diisi', deckColStartX, textMidY);
    }

    // Points
    ctx.font = 'bold 15px monospace';
    ctx.fillStyle = palette.accentText;
    ctx.fillText(String(p.points), padding + 625, textMidY);

    // W - L
    ctx.font = '13px monospace';
    ctx.fillStyle = palette.strongText;
    ctx.fillText(`${p.wins} - ${p.losses}`, padding + 695, textMidY);

    // OMW%
    ctx.font = '13px monospace';
    ctx.fillStyle = palette.secondaryText;
    ctx.fillText(`${p.omw}%`, padding + 785, textMidY);

    // GW%
    ctx.fillText(`${p.gw}%`, padding + 865, textMidY);

    currentY += rowHeight;
  });

  // Bagian 2 untuk Turnamen Liga: Klasemen Swiss (sebelum Top Cut)
  if (isLeague && totalRows > 0) {
    const swissSorted = [...parts]
      .slice(0, totalRows)
      .sort((a, b) => (a.swissRank ?? a.rank) - (b.swissRank ?? b.rank) || a.rank - b.rank);

    const swissTitleY = currentY + 26;
    ctx.font = 'bold 13px monospace';
    ctx.fillStyle = palette.sectionHeadingSecondary;
    ctx.fillText('KLASEMEN SWISS (SEBELUM TOP CUT)', padding, swissTitleY);

    const swissTableY = swissTitleY + 10;
    ctx.fillStyle = palette.tableHeaderBg;
    ctx.fillRect(padding, swissTableY, width - padding * 2, 32);

    ctx.fillStyle = palette.tableHeaderText;
    ctx.font = 'bold 12px monospace';
    ctx.fillText('SWISS #', padding + 15, swissTableY + 21);
    ctx.fillText('NAMA PEMAIN', padding + 110, swissTableY + 21);
    ctx.fillText('PTS', padding + 620, swissTableY + 21);
    ctx.fillText('W - L', padding + 690, swissTableY + 21);
    ctx.fillText('OMW%', padding + 780, swissTableY + 21);
    ctx.fillText('GW%', padding + 860, swissTableY + 21);

    currentY = swissTableY + 32;

    swissSorted.forEach((p, idx) => {
      const rowBg = idx % 2 === 0 ? palette.rowBgEven : palette.rowBgOdd;
      ctx.fillStyle = rowBg;
      ctx.fillRect(padding, currentY, width - padding * 2, swissRowHeight);

      const sRank = p.swissRank ?? p.rank;
      const swissRec = getSwissStandingRecord(p);
      const textY = currentY + 24;

      ctx.font = 'bold 13px monospace';
      ctx.fillStyle = sRank <= 3 ? palette.seasonText : palette.mutedText;
      ctx.fillText(`#${sRank}`, padding + 20, textY);

      ctx.font = 'bold 13px sans-serif';
      ctx.fillStyle = palette.titleText;
      ctx.fillText(
        truncateTextToWidth((str) => ctx.measureText(str).width, p.name, 490),
        padding + 110,
        textY
      );

      ctx.font = 'bold 13px monospace';
      ctx.fillStyle = palette.accentText;
      ctx.fillText(String(swissRec.points), padding + 625, textY);

      ctx.font = '13px monospace';
      ctx.fillStyle = palette.strongText;
      ctx.fillText(`${swissRec.wins} - ${swissRec.losses}`, padding + 695, textY);

      ctx.fillStyle = palette.secondaryText;
      ctx.fillText(`${p.omw}%`, padding + 785, textY);

      ctx.fillText(`${p.gw}%`, padding + 865, textY);

      currentY += swissRowHeight;
    });
  }

  // Legenda warna deck di atas footer (hanya jika ada warna yang dipakai)
  if (usedColors.length > 0) {
    const legendY = currentY + 18;
    ctx.font = 'bold 11px sans-serif';
    ctx.fillStyle = palette.mutedText;
    const labelText = 'Warna deck:';
    ctx.fillText(labelText, padding, legendY);

    let legendX = padding + ctx.measureText(labelText).width + 12;
    const dotR = 5;

    usedColors.forEach((color) => {
      const hex = DECK_COLOR_HEX[color] || palette.mutedText;

      // Dot
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

      // Color Name
      ctx.font = '11px sans-serif';
      ctx.fillStyle = palette.legendText;
      ctx.fillText(color, legendX + dotR * 2 + 5, legendY);

      legendX += dotR * 2 + 5 + ctx.measureText(color).width + 14;
    });

    currentY += legendHeight;
  }

  // Footer
  ctx.fillStyle = palette.footerText;
  ctx.font = '11px sans-serif';
  ctx.fillText(
    `Digenerate oleh DigiSwiss-Round • ${new Date().toLocaleDateString('id-ID')}`,
    padding,
    height - 20
  );

  return canvas.toDataURL('image/png');
}
