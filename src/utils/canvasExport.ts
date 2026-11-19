import type { Participation } from '../types/index.ts';
import type { DeckColor } from './deckExportLogic.ts';
import {
  DECK_COLOR_HEX,
  OFFICIAL_DECK_COLORS,
  getUsedDeckColors,
  truncateTextToWidth
} from './deckExportLogic.ts';

export interface ExportStandingsImageOptions {
  tournamentName: string;
  tournamentDate: string;
  format: string;
  participations: Participation[];
  organizerName?: string;
  location?: string;
  seasonLabel?: string | null;
  isLeague?: boolean;
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
  location?: string
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

  if (typeof nameOrOptions === 'object' && nameOrOptions !== null) {
    tName = nameOrOptions.tournamentName;
    tDate = nameOrOptions.tournamentDate;
    tFormat = nameOrOptions.format;
    parts = nameOrOptions.participations || [];
    orgName = nameOrOptions.organizerName;
    locName = nameOrOptions.location;
    seasonLabel = nameOrOptions.seasonLabel;
    isLeague = Boolean(nameOrOptions.isLeague || seasonLabel);
  } else {
    tName = nameOrOptions || '';
    tDate = tournamentDate || '';
    tFormat = format || '';
    parts = participations || [];
    orgName = organizerName;
    locName = location;
  }

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

  // Background
  ctx.fillStyle = '#0f172a'; // slate-900 (tetap palet gelap)
  ctx.fillRect(0, 0, width, height);

  // Decorative header gradient
  const grad = ctx.createLinearGradient(0, 0, width, 0);
  grad.addColorStop(0, '#f59e0b'); // amber-500
  grad.addColorStop(1, '#d97706');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, width, 8);

  // Title
  ctx.fillStyle = '#f8fafc';
  ctx.font = 'bold 28px sans-serif';
  ctx.fillText(`HASIL AKHIR: ${tName.toUpperCase()}`, padding, 60);

  // Subtitle
  ctx.fillStyle = '#94a3b8';
  ctx.font = '14px sans-serif';
  ctx.fillText(
    `Tanggal: ${tDate}  |  Format: ${tFormat}  |  Total Peserta: ${parts.length} Pemain`,
    padding,
    90
  );

  // Baris Organizer dan Lokasi (Bold 15px, #E2E8F0)
  ctx.font = 'bold 15px sans-serif';
  ctx.fillStyle = '#e2e8f0';
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
      ctx.fillStyle = '#f59e0b';
      ctx.fillRect(cursorX, 132, ligaWidth, 22);
      ctx.fillStyle = '#0f172a';
      ctx.fillText(ligaText, cursorX + 8, 147);
      cursorX += ligaWidth + 10;
    }
    if (seasonLabel) {
      ctx.font = 'bold 14px monospace';
      ctx.fillStyle = '#fbbf24';
      ctx.fillText(seasonLabel, cursorX, 148);
    }
  }

  // Section 1 heading (untuk Turnamen Liga)
  const tableY = (hasSeasonBanner ? 176 : 150) + section1LabelHeight;
  if (isLeague) {
    ctx.font = 'bold 13px monospace';
    ctx.fillStyle = '#fbbf24';
    ctx.fillText('PERINGKAT AKHIR', padding, tableY - 10);
  }

  // Table Header Background
  ctx.fillStyle = '#1e293b'; // slate-800
  ctx.fillRect(padding, tableY, width - padding * 2, 36);

  // Table Headers
  ctx.fillStyle = '#cbd5e1';
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

    ctx.fillStyle = '#38bdf8';
    ctx.fillText(truncatedName, deckColStartX, textBaselineY);

    if (colors.length > 0) {
      const textWidth = ctx.measureText(truncatedName).width;
      let dotCenterX = deckColStartX + textWidth + gap + dotRadius;

      colors.forEach((c) => {
        const hex = DECK_COLOR_HEX[c] || '#94A3B8';

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
          ctx.strokeStyle = '#94A3B8';
          ctx.stroke();
        } else if (c === 'Putih') {
          ctx.lineWidth = 1;
          ctx.strokeStyle = '#CBD5E1';
          ctx.stroke();
        }

        dotCenterX += step;
      });
    }
  };

  parts.slice(0, totalRows).forEach((p, idx) => {
    const rowBg = idx % 2 === 0 ? '#131d31' : '#0f172a';
    const textMidY = currentY + (hasTwoDeckRows ? 33 : 27);

    // Alternating row background
    ctx.fillStyle = rowBg;
    ctx.fillRect(padding, currentY, width - padding * 2, rowHeight);

    // Top 3 accent border
    if (p.rank <= 3) {
      ctx.fillStyle = p.rank === 1 ? '#eab308' : p.rank === 2 ? '#94a3b8' : '#cd7f32';
      ctx.fillRect(padding, currentY, 4, rowHeight);
    }

    // Rank text
    ctx.font = 'bold 14px monospace';
    ctx.fillStyle = p.rank === 1 ? '#facc15' : p.rank <= 3 ? '#e2e8f0' : '#94a3b8';
    ctx.fillText(String(p.rank), padding + 22, textMidY);

    // Player Name + optional Top Cut badge
    const playerColStartX = padding + 80;
    const playerColMaxWidth = 248;
    const tcBadge = p.topCutResult ? `[${p.topCutResult}]` : '';
    ctx.font = 'bold 11px monospace';
    const tcBadgeWidth = tcBadge ? ctx.measureText(tcBadge).width + 8 : 0;

    ctx.font = 'bold 14px sans-serif';
    ctx.fillStyle = '#f8fafc';
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
      ctx.fillStyle = p.topCutResult === 'Juara' ? '#facc15' : '#38bdf8';
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
      ctx.fillStyle = '#64748b';
      ctx.fillText('Belum diisi', deckColStartX, textMidY);
    }

    // Points
    ctx.font = 'bold 15px monospace';
    ctx.fillStyle = '#f59e0b';
    ctx.fillText(String(p.points), padding + 625, textMidY);

    // W - L
    ctx.font = '13px monospace';
    ctx.fillStyle = '#e2e8f0';
    ctx.fillText(`${p.wins} - ${p.losses}`, padding + 695, textMidY);

    // OMW%
    ctx.font = '13px monospace';
    ctx.fillStyle = '#cbd5e1';
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
    ctx.fillStyle = '#38bdf8';
    ctx.fillText('KLASEMEN SWISS (SEBELUM TOP CUT)', padding, swissTitleY);

    const swissTableY = swissTitleY + 10;
    ctx.fillStyle = '#1e293b';
    ctx.fillRect(padding, swissTableY, width - padding * 2, 32);

    ctx.fillStyle = '#cbd5e1';
    ctx.font = 'bold 12px monospace';
    ctx.fillText('SWISS #', padding + 15, swissTableY + 21);
    ctx.fillText('NAMA PEMAIN', padding + 110, swissTableY + 21);
    ctx.fillText('PTS', padding + 580, swissTableY + 21);
    ctx.fillText('W - L', padding + 690, swissTableY + 21);
    ctx.fillText('OMW%', padding + 810, swissTableY + 21);

    currentY = swissTableY + 32;

    swissSorted.forEach((p, idx) => {
      const rowBg = idx % 2 === 0 ? '#131d31' : '#0f172a';
      ctx.fillStyle = rowBg;
      ctx.fillRect(padding, currentY, width - padding * 2, swissRowHeight);

      const sRank = p.swissRank ?? p.rank;
      const textY = currentY + 24;

      ctx.font = 'bold 13px monospace';
      ctx.fillStyle = sRank <= 3 ? '#fbbf24' : '#94a3b8';
      ctx.fillText(`#${sRank}`, padding + 20, textY);

      ctx.font = 'bold 13px sans-serif';
      ctx.fillStyle = '#f8fafc';
      ctx.fillText(
        truncateTextToWidth((str) => ctx.measureText(str).width, p.name, 445),
        padding + 110,
        textY
      );

      ctx.font = 'bold 13px monospace';
      ctx.fillStyle = '#f59e0b';
      ctx.fillText(String(p.points), padding + 585, textY);

      ctx.font = '13px monospace';
      ctx.fillStyle = '#e2e8f0';
      ctx.fillText(`${p.wins} - ${p.losses}`, padding + 695, textY);

      ctx.fillStyle = '#cbd5e1';
      ctx.fillText(`${p.omw}%`, padding + 815, textY);

      currentY += swissRowHeight;
    });
  }

  // Legenda warna deck di atas footer (hanya jika ada warna yang dipakai)
  if (usedColors.length > 0) {
    const legendY = currentY + 18;
    ctx.font = 'bold 11px sans-serif';
    ctx.fillStyle = '#94a3b8';
    const labelText = 'Warna deck:';
    ctx.fillText(labelText, padding, legendY);

    let legendX = padding + ctx.measureText(labelText).width + 12;
    const dotR = 5;

    usedColors.forEach((color) => {
      const hex = DECK_COLOR_HEX[color] || '#94A3B8';

      // Dot
      ctx.beginPath();
      ctx.arc(legendX + dotR, legendY - 4, dotR, 0, Math.PI * 2);
      ctx.fillStyle = hex;
      ctx.fill();

      if (color === 'Hitam') {
        ctx.lineWidth = 1;
        ctx.strokeStyle = '#94A3B8';
        ctx.stroke();
      } else if (color === 'Putih') {
        ctx.lineWidth = 1;
        ctx.strokeStyle = '#CBD5E1';
        ctx.stroke();
      }

      // Color Name
      ctx.font = '11px sans-serif';
      ctx.fillStyle = '#cbd5e1';
      ctx.fillText(color, legendX + dotR * 2 + 5, legendY);

      legendX += dotR * 2 + 5 + ctx.measureText(color).width + 14;
    });

    currentY += legendHeight;
  }

  // Footer
  ctx.fillStyle = '#64748b';
  ctx.font = '11px sans-serif';
  ctx.fillText(
    `Digenerate oleh DigiSwiss-Round • ${new Date().toLocaleDateString('id-ID')}`,
    padding,
    height - 20
  );

  return canvas.toDataURL('image/png');
}
