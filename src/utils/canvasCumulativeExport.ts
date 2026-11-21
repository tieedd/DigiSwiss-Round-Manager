import type { LeagueCumulativeSummary } from './leagueCumulativeLogic.ts';
import { truncateTextToWidth } from './deckExportLogic.ts';
import { getExportPalette } from './exportTheme.ts';
import { getCurrentTheme, type AppTheme } from './themeLogic.ts';
import { formatIndonesianFullDate } from './exportFormatLogic.ts';

export interface ExportLeagueCumulativeImageOptions {
  summary: LeagueCumulativeSummary;
  theme?: AppTheme;
  now?: Date;
}

/**
 * Merender Klasemen Poin Liga Lintas Season ke HTML Canvas 2x Retina (mengikuti tema aktif)
 * dan mengembalikan Data URL PNG.
 */
export function exportLeagueCumulativeToImage(
  options: ExportLeagueCumulativeImageOptions
): string | null {
  if (typeof document === 'undefined') return null;
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  const { summary } = options;
  const now = options.now ?? new Date();
  const palette = getExportPalette(options.theme ?? getCurrentTheme());

  const width = 1000;
  const padding = 30;
  const standings = summary.standings.slice(0, 64);

  // Hitung tinggi tiap baris berdasarkan jumlah rincian season
  const lineHeight = 16;
  const rowHeights = standings.map((row) => {
    const breakdownCount = Math.max(1, row.seasonBreakdown.length);
    return Math.max(46, 18 + breakdownCount * lineHeight);
  });

  const tableY = 174;
  const totalTableRowsHeight = rowHeights.reduce((sum, h) => sum + h, 0);
  const noteY = tableY + 36 + totalTableRowsHeight + 18;
  const footerBaselineY = noteY + 24;
  const height = footerBaselineY + 18;

  canvas.width = width * 2;
  canvas.height = height * 2;
  ctx.scale(2, 2);

  // Background mengikuti tema aktif aplikasi
  ctx.fillStyle = palette.pageBg;
  ctx.fillRect(0, 0, width, height);

  // Header bar gradient
  const grad = ctx.createLinearGradient(0, 0, width, 0);
  grad.addColorStop(0, palette.headerBarFrom);
  grad.addColorStop(1, palette.headerBarTo);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, width, 8);

  // Badge LIGA + label
  ctx.font = 'bold 12px monospace';
  const ligaText = 'LIGA';
  const ligaWidth = ctx.measureText(ligaText).width + 16;
  ctx.fillStyle = palette.badgeBg;
  ctx.fillRect(padding, 24, ligaWidth, 22);
  ctx.fillStyle = palette.badgeText;
  ctx.fillText(ligaText, padding + 8, 39);

  ctx.font = 'bold 13px monospace';
  ctx.fillStyle = palette.seasonText;
  ctx.fillText('AKUMULASI POIN LINTAS SEASON', padding + ligaWidth + 10, 40);

  // Title
  ctx.fillStyle = palette.titleText;
  ctx.font = 'bold 26px sans-serif';
  ctx.fillText('KLASEMEN POIN LIGA LINTAS SEASON', padding, 76);

  // Organizer & Ringkasan
  ctx.font = 'bold 15px sans-serif';
  ctx.fillStyle = palette.strongText;
  const orgSummary = `Organizer: ${summary.organizerName}  |  Total Season Selesai: ${summary.tournaments.length}  |  Total Pemain: ${summary.standings.length}`;
  ctx.fillText(
    truncateTextToWidth((s) => ctx.measureText(s).width, orgSummary, width - padding * 2),
    padding,
    104
  );

  // Tanggal cetak & periode season
  ctx.font = '13px sans-serif';
  ctx.fillStyle = palette.mutedText;
  const seasonNames = summary.tournaments
    .map((t) =>
      t.season
        ? `S${t.season.number} (${String(t.season.month).padStart(2, '0')}/${t.season.year})`
        : t.name
    )
    .join(', ');
  const subInfo = `Diperbarui: ${formatIndonesianFullDate(now)}${
    seasonNames ? `  |  Season: ${seasonNames}` : ''
  }`;
  ctx.fillText(
    truncateTextToWidth((s) => ctx.measureText(s).width, subInfo, width - padding * 2),
    padding,
    128
  );

  // Section Label
  ctx.font = 'bold 13px monospace';
  ctx.fillStyle = palette.sectionHeadingPrimary;
  ctx.fillText('PERINGKAT AKUMULASI PEMAIN', padding, tableY - 10);

  // Table Header
  ctx.fillStyle = palette.tableHeaderBg;
  ctx.fillRect(padding, tableY, width - padding * 2, 36);

  ctx.fillStyle = palette.tableHeaderText;
  ctx.font = 'bold 12px monospace';
  ctx.fillText('RANK', padding + 14, tableY + 22);
  ctx.fillText('NAMA PEMAIN', padding + 78, tableY + 22);
  ctx.fillText('TOTAL PTS', padding + 335, tableY + 22);
  ctx.fillText('W - L', padding + 435, tableY + 22);
  ctx.fillText('SEASON', padding + 515, tableY + 22);
  ctx.fillText('RINCIAN PER SEASON', padding + 590, tableY + 22);

  let currentY = tableY + 36;

  standings.forEach((row, idx) => {
    const rHeight = rowHeights[idx];
    const rowBg = idx % 2 === 0 ? palette.rowBgEven : palette.rowBgOdd;

    ctx.fillStyle = rowBg;
    ctx.fillRect(padding, currentY, width - padding * 2, rHeight);

    if (row.rank <= 3) {
      ctx.fillStyle =
        row.rank === 1
          ? palette.rankGoldBar
          : row.rank === 2
          ? palette.rankSilver
          : palette.rankBronze;
      ctx.fillRect(padding, currentY, 4, rHeight);
    }

    const midY = currentY + 26;

    // Rank
    ctx.font = 'bold 14px monospace';
    ctx.fillStyle =
      row.rank === 1
        ? palette.rankGold
        : row.rank <= 3
        ? palette.rankSilverText
        : palette.mutedText;
    ctx.fillText(String(row.rank), padding + 20, midY);

    // Nama Pemain
    ctx.font = 'bold 14px sans-serif';
    ctx.fillStyle = palette.titleText;
    ctx.fillText(
      truncateTextToWidth((s) => ctx.measureText(s).width, row.playerName, 245),
      padding + 78,
      midY
    );

    // Total Poin
    ctx.font = 'bold 15px monospace';
    ctx.fillStyle = palette.accentText;
    ctx.fillText(String(row.totalPoints), padding + 350, midY);

    // Total W - L
    ctx.font = '13px monospace';
    ctx.fillStyle = palette.strongText;
    ctx.fillText(`${row.totalWins} - ${row.totalLosses}`, padding + 435, midY);

    // Jumlah Season
    ctx.fillStyle = palette.secondaryText;
    ctx.fillText(`${row.seasonsCount}x`, padding + 530, midY);

    // Rincian Per Season
    ctx.font = '11px monospace';
    row.seasonBreakdown.forEach((sb, sIdx) => {
      const lineY = currentY + 20 + sIdx * lineHeight;
      const tcPart = sb.topCutResult ? ` [${sb.topCutResult}]` : '';
      const text = `${sb.seasonLabel}: ${sb.points} Pts (${sb.wins}W-${sb.losses}L, #${sb.rank})${tcPart}`;
      ctx.fillStyle = sIdx === 0 ? palette.deckNameText : palette.secondaryText;
      ctx.fillText(
        truncateTextToWidth(
          (s) => ctx.measureText(s).width,
          text,
          width - padding - (padding + 590) - 10
        ),
        padding + 590,
        lineY
      );
    });

    currentY += rHeight;
  });

  // Catatan sumber data
  ctx.font = 'italic 11px sans-serif';
  ctx.fillStyle = palette.mutedText;
  ctx.fillText(
    'Poin dijumlahkan dari Hasil Akhir (Swiss + Top Cut) Turnamen Liga yang berstatus selesai.',
    padding,
    noteY
  );

  // Footer
  ctx.fillStyle = palette.footerText;
  ctx.font = '11px sans-serif';
  ctx.fillText(
    `Digenerate oleh DigiSwiss-Round • ${formatIndonesianFullDate(now)}`,
    padding,
    footerBaselineY
  );

  return canvas.toDataURL('image/png');
}
