import qrcode from 'qrcode-generator';
import { formatLeagueInviteQrPayload } from './leagueInviteLogic.ts';
import { getLeagueInviteQrCardLayout } from './qrShareLogic.ts';
import { getExportPalette } from './exportTheme.ts';
import { getCurrentTheme, type AppTheme } from './themeLogic.ts';
import { truncateTextToWidth } from './deckExportLogic.ts';

export interface RenderLeagueInviteQrCardOptions {
  tournamentName: string;
  seasonLabel?: string | null;
  organizerName: string;
  inviteCode: string;
  theme?: AppTheme;
}

/**
 * Merender kartu undangan Turnamen Liga ke HTML Canvas dan mengembalikan PNG Data URL.
 * QR code SELALU dirender hitam (#000000) di atas putih (#FFFFFF) dengan quiet zone
 * minimal 4 modul agar tetap mudah terbaca kamera pada tema gelap maupun terang.
 */
export function renderLeagueInviteQrCardPng(
  options: RenderLeagueInviteQrCardOptions
): string | null {
  if (typeof document === 'undefined') return null;

  const payload = formatLeagueInviteQrPayload(options.inviteCode);
  if (!payload) return null;

  const qr = qrcode(0, 'M');
  qr.addData(payload);
  qr.make();
  const moduleCount = qr.getModuleCount();

  const layout = getLeagueInviteQrCardLayout(moduleCount);
  const canvas = document.createElement('canvas');
  canvas.width = layout.canvasWidth;
  canvas.height = layout.canvasHeight;

  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  const palette = getExportPalette(options.theme ?? getCurrentTheme());
  const w = layout.canvasWidth;
  const h = layout.canvasHeight;
  const centerX = w / 2;

  // Latar belakang kartu
  ctx.fillStyle = palette.pageBg;
  ctx.fillRect(0, 0, w, h);

  // Strip gradien amber di atas
  const grad = ctx.createLinearGradient(0, 0, w, 0);
  grad.addColorStop(0, palette.headerBarFrom);
  grad.addColorStop(1, palette.headerBarTo);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, w, 12);

  // Badge LIGA
  ctx.font = 'bold 18px monospace';
  const badgeLabel = 'UNDANGAN TURNAMEN LIGA';
  const badgeW = ctx.measureText(badgeLabel).width + 36;
  ctx.fillStyle = palette.badgeBg;
  ctx.fillRect(centerX - badgeW / 2, 54, badgeW, 34);
  ctx.fillStyle = palette.badgeText;
  ctx.textAlign = 'center';
  ctx.fillText(badgeLabel, centerX, 77);

  // Judul Liga
  ctx.fillStyle = palette.titleText;
  ctx.font = 'bold 34px sans-serif';
  const safeTitle = truncateTextToWidth(
    (s) => ctx.measureText(s).width,
    (options.tournamentName || 'Turnamen Liga').trim(),
    w - 96
  );
  ctx.fillText(safeTitle, centerX, 136);

  // Label SEASON # BULAN ####
  let orgY = 186;
  if (options.seasonLabel && options.seasonLabel.trim()) {
    ctx.fillStyle = palette.seasonText;
    ctx.font = 'bold 22px monospace';
    ctx.fillText(options.seasonLabel.trim().toUpperCase(), centerX, 174);
    orgY = 208;
  }

  // Nama Organizer
  ctx.fillStyle = palette.strongText;
  ctx.font = 'bold 20px sans-serif';
  const safeOrg = truncateTextToWidth(
    (s) => ctx.measureText(s).width,
    `Organizer: ${(options.organizerName || 'Organizer').trim()}`,
    w - 96
  );
  ctx.fillText(safeOrg, centerX, orgY);

  // Kotak Putih Penuh untuk QR + Quiet Zone >= 4 modul (WAJIB Hitam di atas Putih)
  const boxX = Math.round((w - layout.boxSize) / 2);
  const boxY = 246;
  ctx.fillStyle = layout.qrBackground; // #FFFFFF
  ctx.fillRect(boxX, boxY, layout.boxSize, layout.boxSize);

  // Border tipis netral di sekitar kotak putih agar tetap tegas di tema terang
  ctx.strokeStyle = palette.cardBorder;
  ctx.lineWidth = 2;
  ctx.strokeRect(boxX, boxY, layout.boxSize, layout.boxSize);

  const qrOriginX =
    boxX +
    Math.round((layout.boxSize - layout.qrRenderSize) / 2) +
    layout.quietZoneModules * layout.modulePx;
  const qrOriginY =
    boxY +
    Math.round((layout.boxSize - layout.qrRenderSize) / 2) +
    layout.quietZoneModules * layout.modulePx;

  ctx.fillStyle = layout.qrForeground; // #000000
  for (let r = 0; r < moduleCount; r++) {
    for (let c = 0; c < moduleCount; c++) {
      if (qr.isDark(r, c)) {
        ctx.fillRect(
          qrOriginX + c * layout.modulePx,
          qrOriginY + r * layout.modulePx,
          layout.modulePx,
          layout.modulePx
        );
      }
    }
  }

  // Kode Undangan Teks di bawah QR
  const codeSectionY = boxY + layout.boxSize + 52;
  ctx.fillStyle = palette.mutedText;
  ctx.font = '18px sans-serif';
  ctx.fillText('KODE UNDANGAN', centerX, codeSectionY);

  const cleanCode = options.inviteCode.trim().toUpperCase();
  const codePillW = 360;
  const codePillH = 68;
  const codePillX = centerX - codePillW / 2;
  const codePillY = codeSectionY + 18;
  ctx.fillStyle = palette.cardBg;
  ctx.fillRect(codePillX, codePillY, codePillW, codePillH);
  ctx.strokeStyle = palette.accentText;
  ctx.lineWidth = 2;
  ctx.strokeRect(codePillX, codePillY, codePillW, codePillH);

  ctx.fillStyle = palette.accentText;
  ctx.font = 'bold 38px monospace';
  ctx.fillText(cleanCode.split('').join(' '), centerX, codePillY + 47);

  // Payload teks & catatan bawah
  ctx.fillStyle = palette.secondaryText;
  ctx.font = '16px monospace';
  ctx.fillText(payload, centerX, codePillY + codePillH + 38);

  ctx.fillStyle = palette.footerText;
  ctx.font = '15px sans-serif';
  ctx.fillText(
    'Scan QR ini di DigiSwiss-Round atau masukkan kode di menu Turnamen',
    centerX,
    h - 36
  );

  ctx.textAlign = 'start';
  return canvas.toDataURL('image/png');
}
