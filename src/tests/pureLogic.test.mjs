import { test } from 'node:test';
import assert from 'node:assert/strict';

// Import implementasi logika murni
import { usernameToEmail, emailToUsername, isValidUsername } from '../utils/authHelpers.ts';
import {
  calculateMatchPoints,
  calculateWinPercentage,
  calculateOMW,
  getRecommendedSwissRounds,
  isValidJoinCode
} from '../utils/swissLogic.ts';

test('authHelpers: usernameToEmail mengonversi username menjadi email semu dengan huruf kecil', () => {
  assert.equal(usernameToEmail('TaichiYagami'), 'taichiyagami@digiswiss.app');
  assert.equal(usernameToEmail('  Yamato_01  '), 'yamato_01@digiswiss.app');
  assert.equal(usernameToEmail('Koushiro.Izumi'), 'koushiro.izumi@digiswiss.app');
});

test('authHelpers: emailToUsername mengembalikan username asli dari domain @digiswiss.app', () => {
  assert.equal(emailToUsername('taichiyagami@digiswiss.app'), 'taichiyagami');
  assert.equal(emailToUsername(null), '');
});

test('authHelpers: isValidUsername memvalidasi panjang dan karakter yang diperbolehkan', () => {
  assert.equal(isValidUsername('omnimon'), true);
  assert.equal(isValidUsername('agumon_01'), true);
  assert.equal(isValidUsername('ab'), false); // terlalu pendek (<3)
  assert.equal(isValidUsername('user@invalid!'), false); // karakter tidak valid
});

test('swissLogic: calculateMatchPoints menghitung poin menang (3), draw (1), kalah (0)', () => {
  assert.equal(calculateMatchPoints(3, 1, 0), 9);
  assert.equal(calculateMatchPoints(2, 1, 1), 7);
  assert.equal(calculateMatchPoints(0, 4, 0), 0);
});

test('swissLogic: calculateWinPercentage menghitung persentase dengan pembulatan 2 desimal', () => {
  assert.equal(calculateWinPercentage(2, 3), 66.67);
  assert.equal(calculateWinPercentage(0, 3, true), 33.33); // batas minimum floor 33.33% untuk tiebreaker
});

test('swissLogic: calculateOMW menghitung rata-rata OMW% lawan', () => {
  const oppRates = [66.67, 33.33, 100];
  const omw = calculateOMW(oppRates);
  assert.equal(omw, 66.67);
});

test('swissLogic: getRecommendedSwissRounds menghitung jumlah ronde standar Bandai', () => {
  assert.equal(getRecommendedSwissRounds(4), 3); // max(3, ceil(log2(4))) = 3
  assert.equal(getRecommendedSwissRounds(8), 3);
  assert.equal(getRecommendedSwissRounds(16), 4);
  assert.equal(getRecommendedSwissRounds(32), 5);
  assert.equal(getRecommendedSwissRounds(64), 6);
});

test('swissLogic: isValidJoinCode memeriksa kode turnamen alfanumerik 4-8 karakter', () => {
  assert.equal(isValidJoinCode('EVO26'), true);
  assert.equal(isValidJoinCode('DGM889'), true);
  assert.equal(isValidJoinCode('AB'), false); // <4 karakter
  assert.equal(isValidJoinCode('VERYLONGCODE123'), false); // >8 karakter
});
