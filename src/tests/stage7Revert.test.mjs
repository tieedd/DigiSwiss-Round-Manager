import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  generateSwissPairing,
  hasPlayedBefore
} from '../utils/swissPairing.ts';
import {
  calculateMatchPoints,
  calculateTournamentStandings
} from '../utils/standingsLogic.ts';

test('Tahap 7 TES: Ubah skor ronde 1 lalu pastikan pairing ronde 2 baru sesuai poin baru dan tanpa rematch', () => {
  const players = [
    { id: 'p1', name: 'Player 1', status: 'accepted' },
    { id: 'p2', name: 'Player 2', status: 'accepted' },
    { id: 'p3', name: 'Player 3', status: 'accepted' },
    { id: 'p4', name: 'Player 4', status: 'accepted' },
    { id: 'p5', name: 'Player 5', status: 'accepted' },
    { id: 'p6', name: 'Player 6', status: 'accepted' },
    { id: 'p7', name: 'Player 7', status: 'accepted' },
    { id: 'p8', name: 'Player 8', status: 'accepted' },
  ];

  // 1. Ronde 1 Awal:
  // Meja 1: p1 vs p2 (skor awal: p1 menang 2-0 -> p1: 3 pts, p2: 0 pts)
  // Meja 2: p3 vs p4 (p3 menang 2-0 -> p3: 3 pts, p4: 0 pts)
  // Meja 3: p5 vs p6 (p5 menang 2-0 -> p5: 3 pts, p6: 0 pts)
  // Meja 4: p7 vs p8 (p7 menang 2-0 -> p7: 3 pts, p8: 0 pts)
  const initialRound1Matches = [
    { round: 1, p1Id: 'p1', p2Id: 'p2', p1Score: 2, p2Score: 0, status: 'confirmed' },
    { round: 1, p1Id: 'p3', p2Id: 'p4', p1Score: 2, p2Score: 0, status: 'confirmed' },
    { round: 1, p1Id: 'p5', p2Id: 'p6', p1Score: 2, p2Score: 0, status: 'confirmed' },
    { round: 1, p1Id: 'p7', p2Id: 'p8', p1Score: 2, p2Score: 0, status: 'confirmed' },
  ];

  // 2. Organizer mengoreksi skor Meja 1 Ronde 1:
  // p2 sebenarnya menang 2-0 atas p1! (sehingga p2: 3 poin, p1: 0 poin)
  const correctedRound1Matches = [
    { round: 1, p1Id: 'p1', p2Id: 'p2', p1Score: 0, p2Score: 2, status: 'confirmed' }, // skor diperbaiki
    { round: 1, p1Id: 'p3', p2Id: 'p4', p1Score: 2, p2Score: 0, status: 'confirmed' },
    { round: 1, p1Id: 'p5', p2Id: 'p6', p1Score: 2, p2Score: 0, status: 'confirmed' },
    { round: 1, p1Id: 'p7', p2Id: 'p8', p1Score: 2, p2Score: 0, status: 'confirmed' },
  ];

  // 3. Hitung klasemen setelah perbaikan skor
  const updatedStandings = calculateTournamentStandings(players, correctedRound1Matches, 'BO3');

  // Pastikan p2 sekarang memiliki 3 poin dan p1 memiliki 0 poin
  const p2Standing = updatedStandings.find((s) => s.playerId === 'p2');
  const p1Standing = updatedStandings.find((s) => s.playerId === 'p1');
  assert.equal(p2Standing.points, 3, 'Player 2 harus memiliki 3 poin setelah koreksi skor');
  assert.equal(p1Standing.points, 0, 'Player 1 harus memiliki 0 poin setelah koreksi skor');

  // 4. Siapkan PairingPlayer berdasarkan klasemen baru
  const pairingPlayers = players.map((p) => {
    const s = updatedStandings.find((item) => item.playerId === p.id);
    return {
      id: p.id,
      name: p.name,
      points: s ? s.points : 0,
      status: 'accepted',
    };
  });

  const pastMatchRecords = correctedRound1Matches.map((m) => ({
    round: m.round,
    p1Id: m.p1Id,
    p2Id: m.p2Id,
  }));

  // 5. Buat pairing Ronde 2 yang baru
  const newRound2Pairing = generateSwissPairing(2, pairingPlayers, pastMatchRecords, 'BO3');

  assert.equal(newRound2Pairing.hasSolution, true, 'Pairing ronde 2 baru harus valid');
  assert.equal(newRound2Pairing.matches.length, 4, '8 pemain menghasilkan 4 pertandingan meja');

  // Pastikan TIDAK ADA rematch dengan lawan ronde 1
  for (const m of newRound2Pairing.matches) {
    const rematch = hasPlayedBefore(m.p1Id, m.p2Id, pastMatchRecords);
    assert.equal(
      rematch,
      false,
      `Pertandingan Meja ${m.table} (${m.p1Id} vs ${m.p2Id}) tidak boleh merupakan rematch dari ronde 1`
    );
  }

  // 6. Verifikasi pengelompokan poin (Score Bracket):
  // Kelompok 3 poin: {p2, p3, p5, p7}
  // Kelompok 0 poin: {p1, p4, p6, p8}
  // Cari lawan dari p2: harus dari kelompok 3 poin (p3, p5, atau p7)
  const p2Match = newRound2Pairing.matches.find((m) => m.p1Id === 'p2' || m.p2Id === 'p2');
  assert.ok(p2Match, 'Player 2 harus mendapatkan meja di ronde 2');
  const p2OpponentId = p2Match.p1Id === 'p2' ? p2Match.p2Id : p2Match.p1Id;
  assert.ok(
    ['p3', 'p5', 'p7'].includes(p2OpponentId),
    `Player 2 (3 poin) harus dipasangkan dengan sesama peraih 3 poin (p3, p5, p7), bukan ${p2OpponentId}`
  );

  // Cari lawan dari p1: harus dari kelompok 0 poin (p4, p6, atau p8)
  const p1Match = newRound2Pairing.matches.find((m) => m.p1Id === 'p1' || m.p2Id === 'p1');
  assert.ok(p1Match, 'Player 1 harus mendapatkan meja di ronde 2');
  const p1OpponentId = p1Match.p1Id === 'p1' ? p1Match.p2Id : p1Match.p1Id;
  assert.ok(
    ['p4', 'p6', 'p8'].includes(p1OpponentId),
    `Player 1 (0 poin) harus dipasangkan dengan sesama peraih 0 poin (p4, p6, p8), bukan ${p1OpponentId}`
  );
  assert.notEqual(p1OpponentId, 'p2', 'Player 1 tidak boleh rematch dengan Player 2');
});

test('Tahap 7: Klasemen mengabaikan pertandingan yang berstatus archived: true', () => {
  const players = [
    { id: 'p1', name: 'Alpha' },
    { id: 'p2', name: 'Bravo' },
  ];

  const matches = [
    { p1Id: 'p1', p2Id: 'p2', p1Score: 1, p2Score: 0, status: 'confirmed', archived: false },
    // Pertandingan ronde berikutnya yang diarsipkan karena revert
    { p1Id: 'p1', p2Id: 'p2', p1Score: 0, p2Score: 1, status: 'confirmed', archived: true },
  ];

  const standings = calculateTournamentStandings(players, matches, 'BO1');
  assert.equal(standings[0].playerId, 'p1');
  assert.equal(standings[0].points, 3, 'Pertandingan yang diarsipkan tidak boleh dihitung');
  assert.equal(standings[1].points, 0);
});
