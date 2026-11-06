import test from 'node:test';
import assert from 'node:assert/strict';

import {
  formatOrganizerLocationLine
} from '../utils/canvasExport.ts';

import {
  generateStandingsText
} from '../utils/deckExportLogic.ts';

import {
  determineInitialTheme
} from '../utils/themeLogic.ts';

import {
  isPinFormatValid,
  isWeakPin,
  hashPin,
  verifyPinHash,
  isPinLocked,
  getGateRoute
} from '../utils/pinSecurityLogic.ts';

test('FEATURE 1: formatOrganizerLocationLine memformat baris Organizer dan Lokasi', () => {
  // Simulasi measureText sederhana (panjang karakter * 8 piksel)
  const mockMeasure = (str) => str.length * 8;

  // 1. Nilai normal dalam batas
  const normalLine = formatOrganizerLocationLine(
    'Toko Hobi Jaya',
    'Mall Artha Gading, Jakarta',
    1000,
    mockMeasure
  );
  assert.equal(normalLine, 'Organizer: Toko Hobi Jaya  |  Lokasi: Mall Artha Gading, Jakarta');

  // 2. Nilai kosong jatuh ke "-"
  const emptyLine = formatOrganizerLocationLine(null, '', 1000, mockMeasure);
  assert.equal(emptyLine, 'Organizer: -  |  Lokasi: -');

  // 3. Teks sangat panjang dipotong proporsional dengan elipsis
  const longOrg = 'Toko Hobi Kartu Terbesar Se-Indonesia dan Komunitas Digimon Nasional';
  const longLoc = 'Lantai 3 Food Court Grand Indonesia Shopping Town West Mall Jakarta Pusat';
  const truncatedLine = formatOrganizerLocationLine(longOrg, longLoc, 400, mockMeasure);

  assert.ok(mockMeasure(truncatedLine) <= 400, 'Hasil baris harus muat dalam maxWidth 400');
  assert.ok(truncatedLine.includes('Organizer: '));
  assert.ok(truncatedLine.includes('  |  Lokasi: '));
  assert.ok(truncatedLine.includes('…'), 'Harus menyertakan elipsis pemendekan');
});

test('FEATURE 1: generateStandingsText menyertakan baris Organizer dan Lokasi', () => {
  const sampleParts = [
    {
      id: 'p1',
      tournamentId: 't1',
      tournamentName: 'Digimon Cup',
      date: '2026-11-06',
      format: 'BO3',
      playerId: 'u1',
      uid: 'u1',
      organizerId: 'org1',
      name: 'Taichi Yagami',
      rank: 1,
      wins: 3,
      losses: 0,
      gamesWon: 6,
      gamesLost: 1,
      points: 9,
      omw: 66.7,
      gw: 85.7,
      ogw: 60.0,
      deckName: 'WarGreymon OTK',
      deckColors: ['Merah']
    }
  ];

  // Pemanggilan dengan objek opsi
  const textFromOptions = generateStandingsText({
    tournamentName: 'Digimon Cup',
    tournamentDate: '2026-11-06',
    format: 'BO3',
    participations: sampleParts,
    organizerName: 'Bandai Card Center',
    location: 'Senayan City'
  });

  assert.ok(textFromOptions.includes('Organizer: Bandai Card Center | Lokasi: Senayan City'));
  assert.ok(textFromOptions.includes('HASIL AKHIR TURNAMEN: DIGIMON CUP'));
  assert.ok(textFromOptions.includes('WarGreymon OTK 🔴'));

  // Pemanggilan dengan argumen posisional
  const textPositional = generateStandingsText(
    'Digimon Cup',
    '2026-11-06',
    'BO3',
    sampleParts,
    'Toko Kartu',
    'Bandung'
  );
  assert.ok(textPositional.includes('Organizer: Toko Kartu | Lokasi: Bandung'));
});

test('FEATURE 2: determineInitialTheme mengevaluasi preferensi tema', () => {
  // Tersimpan di localStorage
  assert.equal(determineInitialTheme('light', false), 'light');
  assert.equal(determineInitialTheme('dark', true), 'dark');
  assert.equal(determineInitialTheme('light', true), 'light');

  // Belum tersimpan: ikuti prefers-color-scheme
  assert.equal(determineInitialTheme(null, true), 'light');
  assert.equal(determineInitialTheme(null, false), 'dark');
  assert.equal(determineInitialTheme(undefined, false), 'dark');
});

test('FEATURE 3: isPinFormatValid dan isWeakPin memfilter PIN secara ketat', () => {
  // Format 6 digit
  assert.equal(isPinFormatValid('123456'), true);
  assert.equal(isPinFormatValid('841923'), true);
  assert.equal(isPinFormatValid('12345'), false);
  assert.equal(isPinFormatValid('1234567'), false);
  assert.equal(isPinFormatValid('12345a'), false);

  // PIN Lemah: 6 angka sama
  assert.equal(isWeakPin('111111').isWeak, true);
  assert.equal(isWeakPin('000000').isWeak, true);

  // PIN Lemah: Berurutan naik
  assert.equal(isWeakPin('123456').isWeak, true);
  assert.equal(isWeakPin('234567').isWeak, true);

  // PIN Lemah: Berurutan turun
  assert.equal(isWeakPin('654321').isWeak, true);
  assert.equal(isWeakPin('987654').isWeak, true);

  // PIN Lemah: Pola 2 angka berulang
  assert.equal(isWeakPin('121212').isWeak, true);
  assert.equal(isWeakPin('454545').isWeak, true);

  // PIN Lemah: Pola 3 angka berulang
  assert.equal(isWeakPin('123123').isWeak, true);
  assert.equal(isWeakPin('789789').isWeak, true);

  // PIN Kuat & Valid
  const strongPin = isWeakPin('841923');
  assert.equal(strongPin.isWeak, false);
});

test('FEATURE 3: hashPin dan verifyPinHash menghasilkan hash aman PBKDF2-SHA256', async () => {
  const pin = '841923';
  const hashed = await hashPin(pin);

  assert.equal(hashed.algo, 'pbkdf2-sha256');
  assert.equal(hashed.iterations, 150000);
  assert.ok(hashed.salt.length >= 16);
  assert.ok(hashed.hash.length >= 32);

  // Verifikasi hash cocok
  const isValid = await verifyPinHash(pin, hashed.salt, hashed.hash, hashed.iterations);
  assert.equal(isValid, true, 'PIN yang benar harus terverifikasi cocok');

  // Verifikasi hash tidak cocok untuk PIN berbeda
  const isInvalid = await verifyPinHash('841924', hashed.salt, hashed.hash, hashed.iterations);
  assert.equal(isInvalid, false, 'PIN yang salah harus ditolak');
});

test('FEATURE 3: isPinLocked mengevaluasi countdown penguncian 15 menit', () => {
  const now = 1700000000000;
  const lockedUntil = now + 900000; // 15 menit kemudian

  const lockActive = isPinLocked(lockedUntil, now);
  assert.equal(lockActive.locked, true);
  assert.equal(lockActive.remainingSeconds, 900);

  const lockExpired = isPinLocked(now - 1000, now);
  assert.equal(lockExpired.locked, false);
  assert.equal(lockExpired.remainingSeconds, 0);

  const noLock = isPinLocked(null, now);
  assert.equal(noLock.locked, false);
});

test('FEATURE 3: getGateRoute memprioritaskan urutan gerbang mustChangePassword -> create_pin -> app', () => {
  const mockUser = {
    username: 'player1',
    displayName: 'Pemain 1',
    role: 'player',
    active: true,
    createdAt: 1000
  };

  // 1. Belum ada profil -> login
  assert.equal(getGateRoute(null, false), 'login');

  // 2. mustChangePassword aktif -> must_change_password (bahkan jika belum ada PIN)
  const forcedUser = { ...mockUser, mustChangePassword: true };
  assert.equal(getGateRoute(forcedUser, false), 'must_change_password');
  assert.equal(getGateRoute(forcedUser, true), 'must_change_password');

  // 3. hasPin masih null (memuat) -> loading
  assert.equal(getGateRoute(mockUser, null), 'loading');

  // 4. mustChangePassword beres, belum punya PIN -> create_pin
  assert.equal(getGateRoute(mockUser, false), 'create_pin');

  // 5. mustChangePassword beres, sudah punya PIN -> app utama
  assert.equal(getGateRoute(mockUser, true), 'app');
});
