import { Participation } from '../types';
import {
  DeckColor,
  DECK_COLOR_HEX,
  OFFICIAL_DECK_COLORS,
  getUsedDeckColors,
  truncateTextToWidth
} from './deckExportLogic';

/**
 * Merender kartu hasil akhir turnamen secara visual ke HTML Canvas dan mengembalikan Data URL PNG
 */
export function exportStandingsToImage(
  tournamentName: string,
  tournamentDate: string,
  format: string,
  participations: Participation[]
): string | null {
  if (typeof document === 'undefined') return null;
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  const width = 1000;
  const rowHeight = 44;
  const headerHeight = 160;
  const padding = 30;
  const totalRows = Math.min(participations.length, 32);

  // Ambil hanya warna deck yang ada di tabel hasil
  const usedColors = getUsedDeckColors(participations, totalRows);
  const legendHeight = usedColors.length > 0 ? 32 : 0;
  const height = headerHeight + totalRows * rowHeight + padding * 2 + legendHeight + 40;

  canvas.width = width;
  canvas.height = height;

  // Background
  ctx.fillStyle = '#0f172a'; // slate-900
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
  ctx.fillText(`HASIL AKHIR: ${tournamentName.toUpperCase()}`, padding, 60);

  // Subtitle
  ctx.fillStyle = '#94a3b8';
  ctx.font = '14px sans-serif';
  ctx.fillText(
    `Tanggal: ${tournamentDate}  |  Format: ${format}  |  Total Peserta: ${participations.length} Pemain`,
    padding,
    90
  );

  // Table Header Background
  const tableY = 125;
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

  participations.slice(0, totalRows).forEach((p, idx) => {
    const rowBg = idx % 2 === 0 ? '#131d31' : '#0f172a';

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
    ctx.fillText(String(p.rank), padding + 22, currentY + 27);

    // Player Name
    ctx.font = 'bold 14px sans-serif';
    ctx.fillStyle = '#f8fafc';
    ctx.fillText(p.name.length > 24 ? p.name.substring(0, 22) + '...' : p.name, padding + 80, currentY + 27);

    // Deck & Color Dots
    ctx.font = '13px sans-serif';
    if (p.deckName && p.deckName.trim().length > 0) {
      const colors = (p.deckColors || []).filter((c) =>
        OFFICIAL_DECK_COLORS.includes(c as DeckColor)
      ) as DeckColor[];

      const r = 7;
      const step = r * 1.5; // ~25% overlap (center distance = 10.5px)
      const dotsWidth = colors.length > 0 ? r * 2 + (colors.length - 1) * step : 0;
      const gap = colors.length > 0 ? 8 : 0;
      const maxTextWidth = Math.max(40, maxColWidth - dotsWidth - gap);

      const truncatedName = truncateTextToWidth(
        (str) => ctx.measureText(str).width,
        p.deckName.trim(),
        maxTextWidth
      );

      ctx.fillStyle = '#38bdf8';
      ctx.fillText(truncatedName, deckColStartX, currentY + 27);

      if (colors.length > 0) {
        const textWidth = ctx.measureText(truncatedName).width;
        let dotCenterX = deckColStartX + textWidth + gap + r;
        const dotCenterY = currentY + 22; // vertically center in 44px row

        colors.forEach((c) => {
          const hex = DECK_COLOR_HEX[c] || '#94A3B8';

          // Background ring matching row background
          ctx.beginPath();
          ctx.arc(dotCenterX, dotCenterY, r + 1.5, 0, Math.PI * 2);
          ctx.fillStyle = rowBg;
          ctx.fill();

          // Circle dot
          ctx.beginPath();
          ctx.arc(dotCenterX, dotCenterY, r, 0, Math.PI * 2);
          ctx.fillStyle = hex;
          ctx.fill();

          // Contrast borders
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
    } else {
      ctx.fillStyle = '#64748b';
      ctx.fillText('Belum diisi', deckColStartX, currentY + 27);
    }

    // Points
    ctx.font = 'bold 15px monospace';
    ctx.fillStyle = '#f59e0b';
    ctx.fillText(String(p.points), padding + 625, currentY + 27);

    // W - L
    ctx.font = '13px monospace';
    ctx.fillStyle = '#e2e8f0';
    ctx.fillText(`${p.wins} - ${p.losses}`, padding + 695, currentY + 27);

    // OMW%
    ctx.font = '13px monospace';
    ctx.fillStyle = '#cbd5e1';
    ctx.fillText(`${p.omw}%`, padding + 785, currentY + 27);

    // GW%
    ctx.fillText(`${p.gw}%`, padding + 865, currentY + 27);

    currentY += rowHeight;
  });

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
