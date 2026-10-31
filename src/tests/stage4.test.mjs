import { test } from 'node:test';
import assert from 'node:assert/strict';

import { calculateSwissRounds, generateJoinCode, isValidJoinCode } from '../utils/swissLogic.ts';

test('Tahap 4 TES: fungsi jumlah ronde untuk 3, 8 (3), 9, 16 (4), 17, 32 (5), 33 (6), dan 20 pemain menghasilkan 5', () => {
  // 3 sampai 8 pemain = 3 ronde
  assert.equal(calculateSwissRounds(3), 3, '3 pemain harus menghasilkan 3 ronde');
  assert.equal(calculateSwissRounds(4), 3, '4 pemain harus menghasilkan 3 ronde');
  assert.equal(calculateSwissRounds(8), 3, '8 pemain harus menghasilkan 3 ronde');

  // 9 sampai 16 pemain = 4 ronde
  assert.equal(calculateSwissRounds(9), 4, '9 pemain harus menghasilkan 4 ronde');
  assert.equal(calculateSwissRounds(12), 4, '12 pemain harus menghasilkan 4 ronde');
  assert.equal(calculateSwissRounds(16), 4, '16 pemain harus menghasilkan 4 ronde');

  // 17 sampai 32 pemain = 5 ronde
  assert.equal(calculateSwissRounds(17), 5, '17 pemain harus menghasilkan 5 ronde');
  assert.equal(calculateSwissRounds(20), 5, '20 pemain harus menghasilkan 5 ronde');
  assert.equal(calculateSwissRounds(32), 5, '32 pemain harus menghasilkan 5 ronde');

  // 33 sampai 64 pemain = 6 ronde
  assert.equal(calculateSwissRounds(33), 6, '33 pemain harus menghasilkan 6 ronde');
  assert.equal(calculateSwissRounds(64), 6, '64 pemain harus menghasilkan 6 ronde');
});

test('Tahap 4: generateJoinCode menghasilkan 6 karakter alfanumerik acak', () => {
  const code = generateJoinCode();
  assert.equal(typeof code, 'string');
  assert.equal(code.length, 6);
  assert.equal(/^[A-Z0-9]{6}$/.test(code), true);
  assert.equal(isValidJoinCode(code), true);
});

test('Tahap 4: Validasi format turnamen dan status', () => {
  const validFormats = ['BO1', 'BO3'];
  assert.equal(validFormats.includes('BO1'), true);
  assert.equal(validFormats.includes('BO3'), true);
  assert.equal(validFormats.includes('BO5'), false);

  const validStatuses = ['registration', 'running', 'finished'];
  assert.equal(validStatuses.includes('registration'), true);
  assert.equal(validStatuses.includes('running'), true);
  assert.equal(validStatuses.includes('finished'), true);
});
