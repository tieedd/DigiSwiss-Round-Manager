import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import { validateBootstrapAdminPassword } from '../utils/bootstrapLogic.ts';
import {
  formatPercent2Decimals,
  formatIndonesianFullDate,
  TOP_CUT_EXPORT_NOTE,
} from '../utils/exportFormatLogic.ts';
import {
  generateStandingsCsv,
  generateStandingsText,
} from '../utils/deckExportLogic.ts';

// --- PART A: KEAMANAN ADMIN ---

test('Part A: validateBootstrapAdminPassword memvalidasi panjang minimal 8 karakter, konfirmasi cocok, dan tidak memuat "admindss"', () => {
  assert.equal(validateBootstrapAdminPassword('', '').valid, false);
  assert.equal(validateBootstrapAdminPassword('1234567', '1234567').valid, false);
  assert.equal(validateBootstrapAdminPassword('admindss123', 'admindss123').valid, false);
  assert.equal(validateBootstrapAdminPassword('AdminDSS99', 'AdminDSS99').valid, false);
  assert.equal(validateBootstrapAdminPassword('KuatBanget123', 'BedaBanget123').valid, false);

  const ok = validateBootstrapAdminPassword('KuatBanget#2026', 'KuatBanget#2026');
  assert.equal(ok.valid, true);
  assert.equal(ok.error, undefined);
});

test('Part A: tidak ada password awal hardcoded di bootstrapService.ts / bootstrapLogic.ts / AdminBootstrapSetupView.tsx', () => {
  const files = [
    'src/services/bootstrapService.ts',
    'src/utils/bootstrapLogic.ts',
    'src/views/AdminBootstrapSetupView.tsx',
  ];
  for (const relPath of files) {
    const fullPath = path.resolve(process.cwd(), relPath);
    assert.equal(fs.existsSync(fullPath), true, `File ${relPath} harus ada`);
    const content = fs.readFileSync(fullPath, 'utf8');
    assert.equal(
      content.toLowerCase().includes('dssadmin'),
      false,
      `Password bawaan lama ditemukan di ${relPath}`
    );
  }

  const bootstrapSvc = fs.readFileSync(
    path.resolve(process.cwd(), 'src/services/bootstrapService.ts'),
    'utf8'
  );
  assert.equal(
    bootstrapSvc.includes('admindss@digiswiss.app'),
    false,
    'Email admin tidak boleh ditulis literal di bootstrapService.ts'
  );
});

test('Part A: tidak ada pemanggilan window.confirm tersisa di folder src/', () => {
  const srcRoot = path.resolve(process.cwd(), 'src');
  const found = [];

  function walk(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === 'tests') continue;
        walk(full);
      } else if (/\.(ts|tsx|js|jsx)$/.test(entry.name)) {
        const content = fs.readFileSync(full, 'utf8');
        if (/\bwindow\.confirm\s*\(/.test(content)) {
          found.push(path.relative(process.cwd(), full));
        }
      }
    }
  }

  walk(srcRoot);
  assert.deepEqual(found, [], `Masih ditemukan window.confirm di: ${found.join(', ')}`);
});

test('Part A: firestore.rules menutup celah bootstrap dengan getAfter & existsAfter pada users dan meta/bootstrap', () => {
  const rules = fs.readFileSync(path.resolve(process.cwd(), 'firestore.rules'), 'utf8');
  assert.equal(rules.includes('match /meta/{docId}'), true);
  assert.equal(
    rules.includes('existsAfter(/databases/$(database)/documents/meta/bootstrap)'),
    true
  );
  assert.equal(
    rules.includes('getAfter(/databases/$(database)/documents/meta/bootstrap).data.initializedBy == uid'),
    true
  );
  assert.equal(
    rules.includes('existsAfter(/databases/$(database)/documents/users/$(request.auth.uid))'),
    true
  );
  assert.equal(
    rules.includes("getAfter(/databases/$(database)/documents/users/$(request.auth.uid)).data.username == 'admindss'"),
    true
  );
});

// --- PART B: PERBAIKAN EKSPOR HASIL AKHIR ---

test('Part B: formatPercent2Decimals selalu memformat persentase dengan tepat 2 desimal', () => {
  assert.equal(formatPercent2Decimals(100), '100.00%');
  assert.equal(formatPercent2Decimals(66.666), '66.67%');
  assert.equal(formatPercent2Decimals(66.7), '66.70%');
  assert.equal(formatPercent2Decimals(60), '60.00%');
  assert.equal(formatPercent2Decimals(33.33), '33.33%');
  assert.equal(formatPercent2Decimals(NaN), '0.00%');
});

test('Part B: formatIndonesianFullDate memformat dd MMMM yyyy dengan padding nol tanpa geser zona waktu', () => {
  assert.equal(formatIndonesianFullDate('2026-11-19'), '19 November 2026');
  assert.equal(formatIndonesianFullDate('2026-11-06'), '06 November 2026');
  assert.equal(formatIndonesianFullDate('2026-01-05'), '05 Januari 2026');
  assert.equal(formatIndonesianFullDate(new Date(2026, 7, 3)), '03 Agustus 2026');
});

test('Part B: TOP_CUT_EXPORT_NOTE muncul di ekspor teks & CSV jika turnamen memakai Top Cut, dan tidak muncul jika tanpa Top Cut', () => {
  const samplePart = {
    id: 't1_p1',
    tournamentId: 't1',
    tournamentName: 'Liga Tes',
    date: '2026-11-19',
    format: 'BO3',
    playerId: 'p1',
    uid: 'p1',
    organizerId: 'org1',
    name: 'Agus',
    rank: 1,
    swissRank: 2,
    topCutResult: 'Juara',
    wins: 5,
    losses: 0,
    swissWins: 3,
    swissLosses: 0,
    swissPoints: 9,
    topCutWins: 2,
    topCutLosses: 0,
    topCutPoints: 6,
    gamesWon: 10,
    gamesLost: 1,
    points: 15,
    omw: 66.7,
    gw: 90.9,
    ogw: 60,
    decks: [
      { name: 'Gallantmon', colors: ['Merah'] },
      { name: 'Mirage', colors: ['Biru'] },
    ],
  };

  const textWithTopCut = generateStandingsText({
    tournamentName: 'Liga Tes',
    tournamentDate: '2026-11-19',
    format: 'BO3',
    participations: [samplePart],
    isLeague: true,
    hasTopCut: true,
  });
  assert.equal(textWithTopCut.includes(TOP_CUT_EXPORT_NOTE), true);
  assert.equal(textWithTopCut.includes('19 November 2026'), true);
  assert.equal(textWithTopCut.includes('66.70%'), true);
  assert.equal(textWithTopCut.includes('90.90%'), true);

  const csvWithTopCut = generateStandingsCsv('Liga Tes', [samplePart], { hasTopCut: true });
  assert.equal(csvWithTopCut.includes(TOP_CUT_EXPORT_NOTE), true);
  assert.equal(csvWithTopCut.includes('66.70%'), true);
  assert.equal(csvWithTopCut.includes('60.00%'), true);

  const noTopCutPart = {
    ...samplePart,
    topCutResult: undefined,
    topCutWins: 0,
    topCutLosses: 0,
    topCutPoints: 0,
  };
  const textWithoutTopCut = generateStandingsText({
    tournamentName: 'Reguler Tes',
    tournamentDate: '2026-11-06',
    format: 'BO1',
    participations: [noTopCutPart],
    isLeague: false,
    hasTopCut: false,
  });
  assert.equal(textWithoutTopCut.includes(TOP_CUT_EXPORT_NOTE), false);
  assert.equal(textWithoutTopCut.includes('06 November 2026'), true);

  const csvWithoutTopCut = generateStandingsCsv('Reguler Tes', [noTopCutPart], { hasTopCut: false });
  assert.equal(csvWithoutTopCut.includes(TOP_CUT_EXPORT_NOTE), false);
});
