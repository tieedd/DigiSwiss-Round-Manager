import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  QR_SHARE_CANVAS_WIDTH,
  QR_SHARE_CANVAS_HEIGHT,
  QR_SHARE_MIN_QUIET_ZONE_MODULES,
  QR_FOREGROUND_HEX,
  QR_BACKGROUND_HEX,
  NON_DIGISWISS_QR_MESSAGE,
  getLeagueInviteQrCardLayout,
  buildLeagueInviteQrFileName,
  buildLeagueInviteShareCaption,
  validateScannedLeagueInviteText,
  mapQrBridgeErrorToIndonesianMessage,
} from '../utils/qrShareLogic.ts';

test('QR LAYOUT: ukuran kanvas, quiet zone >= 4 modul, dan QR wajib hitam di atas putih', () => {
  const layout = getLeagueInviteQrCardLayout(29);
  assert.equal(layout.canvasWidth, QR_SHARE_CANVAS_WIDTH);
  assert.equal(layout.canvasHeight, QR_SHARE_CANVAS_HEIGHT);
  assert.equal(layout.quietZoneModules >= 4, true);
  assert.equal(layout.quietZoneModules, QR_SHARE_MIN_QUIET_ZONE_MODULES);
  assert.equal(layout.totalModules, 29 + layout.quietZoneModules * 2);
  assert.equal(layout.qrForeground, QR_FOREGROUND_HEX);
  assert.equal(layout.qrBackground, QR_BACKGROUND_HEX);
  assert.equal(layout.modulePx >= 1, true);
  assert.equal(layout.boxSize > layout.qrRenderSize, true);
});

test('QR FILENAME: membentuk nama berkas PNG yang aman dan menyertakan season', () => {
  const withSeason = buildLeagueInviteQrFileName(
    'Liga Digimon Jakarta!',
    'SEASON 3 NOVEMBER 2026'
  );
  assert.equal(
    withSeason,
    'QR-Undangan-Liga_Digimon_Jakarta-SEASON_3_NOVEMBER_2026.png'
  );

  const withoutSeason = buildLeagueInviteQrFileName('Liga Mingguan');
  assert.equal(withoutSeason, 'QR-Undangan-Liga_Mingguan.png');
});

test('QR CAPTION: menyertakan judul liga, season, organizer, dan kode undangan', () => {
  const caption = buildLeagueInviteShareCaption({
    tournamentName: 'DigiLiga Nusantara',
    seasonLabel: 'SEASON 2 NOVEMBER 2026',
    organizerName: 'Toko Kartu Jaya',
    inviteCode: 'digiswiss:liga:k7p9m2wx',
  });

  assert.equal(caption.includes('DigiLiga Nusantara'), true);
  assert.equal(caption.includes('SEASON 2 NOVEMBER 2026'), true);
  assert.equal(caption.includes('Organizer: Toko Kartu Jaya'), true);
  assert.equal(caption.includes('Kode Undangan: K7P9M2WX'), true);
});

test('QR SCAN VALIDATION: menerima payload digiswiss:liga dan kode valid, menolak QR lain', () => {
  const validPayload = validateScannedLeagueInviteText('digiswiss:liga:K7P9M2WX');
  assert.equal(validPayload.valid, true);
  assert.equal(validPayload.code, 'K7P9M2WX');

  const validMixed = validateScannedLeagueInviteText('  DigiSwiss:Liga: k7p9-m2wx ');
  assert.equal(validMixed.valid, true);
  assert.equal(validMixed.code, 'K7P9M2WX');

  const validPlain = validateScannedLeagueInviteText('K7P9M2WX');
  assert.equal(validPlain.valid, true);
  assert.equal(validPlain.code, 'K7P9M2WX');

  const nonDigiSwissCases = [
    '',
    '   ',
    'https://digiswiss.example.com/join/K7P9M2WX',
    'WIFI:S:CafeWifi;T:WPA;P:K7P9M2WX;;',
    'BEGIN:VCARD\nFN:Budi\nEND:VCARD',
    'ABC123',
    '0O1IL234',
    'halo dunia',
  ];

  for (const raw of nonDigiSwissCases) {
    const res = validateScannedLeagueInviteText(raw);
    assert.equal(res.valid, false, `Seharusnya menolak "${raw}"`);
    assert.equal(res.error, NON_DIGISWISS_QR_MESSAGE);
  }
});

test('QR ERROR MESSAGES: menghasilkan pesan jelas untuk cancelled, unavailable, no_qr, timeout, dan failed', () => {
  assert.equal(
    mapQrBridgeErrorToIndonesianMessage('cancelled', 'camera'),
    'Pemindaian QR dibatalkan.'
  );
  assert.equal(
    mapQrBridgeErrorToIndonesianMessage('cancelled', 'gallery'),
    'Pemilihan gambar dari galeri dibatalkan.'
  );
  assert.equal(
    mapQrBridgeErrorToIndonesianMessage('unavailable', 'camera').includes('Layanan Google Play'),
    true
  );
  assert.equal(
    mapQrBridgeErrorToIndonesianMessage('no_qr', 'gallery').includes('Tidak ditemukan QR code'),
    true
  );
  assert.equal(
    mapQrBridgeErrorToIndonesianMessage('timeout', 'camera').includes('Waktu pemindaian QR habis'),
    true
  );
  assert.equal(
    mapQrBridgeErrorToIndonesianMessage('failed', 'camera').includes('Gagal membaca QR code'),
    true
  );
});
