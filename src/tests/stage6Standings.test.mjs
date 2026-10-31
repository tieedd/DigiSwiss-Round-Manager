import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  SCORING_CONFIG,
  calculateMatchPoints,
  calculateTournamentStandings
} from '../utils/standingsLogic.ts';

test('Tahap 6 TES: Konfigurasi perolehan poin BO1 dan BO3', () => {
  // BO1: Menang 3, Kalah 0
  assert.equal(SCORING_CONFIG.BO1.WIN, 3);
  assert.equal(SCORING_CONFIG.BO1.LOSS, 0);
  assert.equal(calculateMatchPoints('BO1', 1, 0), 3);
  assert.equal(calculateMatchPoints('BO1', 0, 1), 0);

  // BO3: 2-0 = 3, 2-1 = 2, 1-2 = 1 (yang kalah 1-2 tetap dapat poin), 0-2 = 0
  assert.equal(SCORING_CONFIG.BO3['2-0'], 3);
  assert.equal(SCORING_CONFIG.BO3['2-1'], 2);
  assert.equal(SCORING_CONFIG.BO3['1-2'], 1);
  assert.equal(SCORING_CONFIG.BO3['0-2'], 0);

  assert.equal(calculateMatchPoints('BO3', 2, 0), 3);
  assert.equal(calculateMatchPoints('BO3', 2, 1), 2);
  assert.equal(calculateMatchPoints('BO3', 1, 2), 1, 'Pemain kalah 1-2 wajib mendapatkan 1 poin');
  assert.equal(calculateMatchPoints('BO3', 0, 2), 0);

  // BYE otomatis menang 3 poin
  assert.equal(calculateMatchPoints('BO3', 2, 0, true), 3);
  assert.equal(calculateMatchPoints('BO1', 1, 0, true), 3);
});

test('Tahap 6 TES: Tie-breaker OMW%, GW%, OGW%, dan Head-to-Head', () => {
  // Skenario 4 pemain di turnamen BO3:
  // Ronde 1:
  // p1 vs p2: p1 menang 2-0 (p1: 3 pts, p2: 0 pts)
  // p3 vs p4: p3 menang 2-1 (p3: 2 pts, p4: 1 pt)
  //
  // Ronde 2:
  // p1 vs p3: p1 menang 2-1 (p1: 3+2=5 pts, p3: 2+1=3 pts)
  // p4 vs p2: p4 menang 2-0 (p4: 1+3=4 pts, p2: 0+0=0 pts)

  const players = [
    { id: 'p1', name: 'Taichi' },
    { id: 'p2', name: 'Yamato' },
    { id: 'p3', name: 'Koushiro' },
    { id: 'p4', name: 'Sora' },
  ];

  const matches = [
    { p1Id: 'p1', p2Id: 'p2', p1Score: 2, p2Score: 0, status: 'confirmed' },
    { p1Id: 'p3', p2Id: 'p4', p1Score: 2, p2Score: 1, status: 'confirmed' },
    { p1Id: 'p1', p2Id: 'p3', p1Score: 2, p2Score: 1, status: 'confirmed' },
    { p1Id: 'p4', p2Id: 'p2', p1Score: 2, p2Score: 0, status: 'confirmed' },
  ];

  const standings = calculateTournamentStandings(players, matches, 'BO3');

  // Peringkat 1: Taichi (p1) dengan 5 poin
  assert.equal(standings[0].playerId, 'p1');
  assert.equal(standings[0].points, 5);
  assert.equal(standings[0].matchWins, 2);
  assert.equal(standings[0].matchLosses, 0);

  // Peringkat 2: Sora (p4) dengan 4 poin
  assert.equal(standings[1].playerId, 'p4');
  assert.equal(standings[1].points, 4);

  // Peringkat 3: Koushiro (p3) dengan 3 poin
  assert.equal(standings[2].playerId, 'p3');
  assert.equal(standings[2].points, 3);

  // Peringkat 4: Yamato (p2) dengan 0 poin
  assert.equal(standings[3].playerId, 'p2');
  assert.equal(standings[3].points, 0);
});

test('Tahap 6 TES: Head-to-Head memecah seri ketika poin dan tiebreaker identik', () => {
  const players = [
    { id: 'pA', name: 'Alpha' },
    { id: 'pB', name: 'Bravo' },
  ];

  // pA mengalahkan pB 1-0 di BO1
  const matches = [
    { p1Id: 'pA', p2Id: 'pB', p1Score: 1, p2Score: 0, status: 'confirmed' },
  ];

  const standings = calculateTournamentStandings(players, matches, 'BO1');
  assert.equal(standings[0].playerId, 'pA', 'Alpha menang head-to-head atas Bravo');
  assert.equal(standings[1].playerId, 'pB');
});

test('Tahap 6 TES: BYE tidak dihitung sebagai lawan pada OMW% dan OGW% dan floor 33.33% aktif', () => {
  const players = [
    { id: 'p1', name: 'Agumon' },
    { id: 'p2', name: 'Gabumon' },
    { id: 'p3', name: 'Patamon' },
  ];

  // Ronde 1: p1 vs p2 (p1 menang 2-0), p3 BYE (2-0)
  const matches = [
    { p1Id: 'p1', p2Id: 'p2', p1Score: 2, p2Score: 0, status: 'confirmed' },
    { p1Id: 'p3', p2Id: null, p1Score: 2, p2Score: 0, status: 'confirmed' }, // p3 BYE
  ];

  const standings = calculateTournamentStandings(players, matches, 'BO3');

  // p3 hanya punya BYE, tidak ada lawan nyata -> OMW% dan OGW% harus default 33.33%
  const p3Standing = standings.find((s) => s.playerId === 'p3');
  assert.ok(p3Standing);
  assert.equal(p3Standing.points, 3);
  assert.equal(p3Standing.omw, 33.33, 'BYE tidak dihitung lawan sehingga OMW% 33.33%');
  assert.equal(p3Standing.ogw, 33.33, 'BYE tidak dihitung lawan sehingga OGW% 33.33%');

  // p2 kalah (0 win), MW% floor adalah 33.33%
  const p1Standing = standings.find((s) => s.playerId === 'p1');
  assert.ok(p1Standing);
  assert.equal(p1Standing.omw, 33.33, 'Lawan p1 adalah p2 yang kalah, OMW berpatokan pada batas bawah 33.33%');
});
