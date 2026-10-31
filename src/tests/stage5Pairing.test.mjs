import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  generateSwissPairing,
  hasPlayedBefore,
  getPlayersWithPastBye,
  validateManualSwap
} from '../utils/swissPairing.ts';

// Helper simulasi turnamen Swiss multi-ronde
function simulateTournament(playerCount, totalRounds, format = 'BO3') {
  const players = Array.from({ length: playerCount }, (_, i) => ({
    id: `p${i + 1}`,
    name: `Player ${i + 1}`,
    points: 0,
    status: 'accepted',
  }));

  const pastMatches = [];
  const roundPairings = [];

  for (let r = 1; r <= totalRounds; r++) {
    const pairing = generateSwissPairing(r, players, pastMatches, format);
    roundPairings.push(pairing);

    assert.equal(
      pairing.hasSolution,
      true,
      `Ronde ${r} untuk ${playerCount} peserta harus menemukan solusi pairing tanpa rematch`
    );

    // Verifikasi tidak ada rematch di ronde r
    for (const match of pairing.matches) {
      if (match.p2Id !== null) {
        const playedBefore = hasPlayedBefore(match.p1Id, match.p2Id, pastMatches);
        assert.equal(
          playedBefore,
          false,
          `Ronde ${r}: Pemain ${match.p1Id} dan ${match.p2Id} tidak boleh tanding ulang`
        );
      }
    }

    // Rekam pertandingan dan perbarui poin (anggap p1 menang atau random jika imbang)
    for (const match of pairing.matches) {
      pastMatches.push({
        round: r,
        p1Id: match.p1Id,
        p2Id: match.p2Id,
      });

      // Update skor simulasi
      if (match.p2Id === null) {
        // BYE menang 3 poin
        const p1 = players.find((p) => p.id === match.p1Id);
        if (p1) p1.points += 3;
      } else {
        // Beri poin kemenangan 3 ke salah satu
        const winner = Math.random() > 0.5 ? match.p1Id : match.p2Id;
        const p = players.find((item) => item.id === winner);
        if (p) p.points += 3;
      }
    }
  }

  return { players, pastMatches, roundPairings };
}

test('Tahap 5 TES: 8 peserta 3 ronde tanpa rematch', () => {
  const { pastMatches, roundPairings } = simulateTournament(8, 3);
  assert.equal(roundPairings.length, 3);

  // Verifikasi seluruh pasangan unik (tidak ada duplikasi)
  const pairKeys = new Set();
  for (const m of pastMatches) {
    const key = [m.p1Id, m.p2Id].sort().join('_vs_');
    assert.equal(pairKeys.has(key), false, `Pasangan ${key} tidak boleh bertemu lebih dari sekali`);
    pairKeys.add(key);
  }
  // 8 peserta per ronde ada 4 match, 3 ronde = 12 match
  assert.equal(pairKeys.size, 12);
});

test('Tahap 5 TES: 7 peserta dengan BYE tidak berulang', () => {
  const { pastMatches, roundPairings } = simulateTournament(7, 3);
  assert.equal(roundPairings.length, 3);

  const byeRecipients = [];
  for (const r of roundPairings) {
    const byeMatch = r.matches.find((m) => m.p2Id === null);
    assert.ok(byeMatch, `Setiap ronde harus memiliki 1 BYE untuk 7 peserta`);
    byeRecipients.push(byeMatch.p1Id);
  }

  assert.equal(byeRecipients.length, 3);
  const uniqueByes = new Set(byeRecipients);
  assert.equal(
    uniqueByes.size,
    3,
    'Penerima BYE tidak boleh berulang (7 peserta, 3 ronde menghasilkan 3 penerima BYE berbeda)'
  );
});

test('Tahap 5 TES: 3 peserta 3 ronde (tiap pemain BYE sekali)', () => {
  const { roundPairings } = simulateTournament(3, 3);
  assert.equal(roundPairings.length, 3);

  const byeRecipients = [];
  for (const r of roundPairings) {
    const byeMatch = r.matches.find((m) => m.p2Id === null);
    assert.ok(byeMatch, 'Setiap ronde harus memiliki 1 BYE untuk 3 peserta');
    byeRecipients.push(byeMatch.p1Id);
  }

  assert.equal(byeRecipients.length, 3);
  const uniqueByes = new Set(byeRecipients);
  // Tepat 3 pemain berbeda masing-masing mendapatkan BYE tepat 1 kali
  assert.equal(uniqueByes.size, 3, 'Tiap pemain dalam 3 peserta harus mendapatkan BYE tepat 1 kali');
  assert.ok(uniqueByes.has('p1'));
  assert.ok(uniqueByes.has('p2'));
  assert.ok(uniqueByes.has('p3'));
});

test('Tahap 5 TES: 20 peserta 5 ronde tanpa rematch', () => {
  const { pastMatches, roundPairings } = simulateTournament(20, 5);
  assert.equal(roundPairings.length, 5);

  const pairKeys = new Set();
  for (const m of pastMatches) {
    const key = [m.p1Id, m.p2Id].sort().join('_vs_');
    assert.equal(pairKeys.has(key), false, `Pasangan ${key} tidak boleh bertemu lebih dari sekali`);
    pairKeys.add(key);
  }
  // 20 peserta per ronde ada 10 match, 5 ronde = 50 match
  assert.equal(pairKeys.size, 50);
});

test('Tahap 5: Peserta dropped tidak dipasangkan lagi di ronde berikutnya', () => {
  const players = [
    { id: 'p1', name: 'Agumon', points: 3, status: 'accepted' },
    { id: 'p2', name: 'Gabumon', points: 3, status: 'accepted' },
    { id: 'p3', name: 'Patamon', points: 0, status: 'dropped' }, // dropped!
    { id: 'p4', name: 'Tailmon', points: 0, status: 'accepted' },
    { id: 'p5', name: 'Palmon', points: 0, status: 'accepted' },
  ];

  const pastMatches = [
    { round: 1, p1Id: 'p1', p2Id: 'p3' },
    { round: 1, p1Id: 'p2', p2Id: 'p4' },
    { round: 1, p1Id: 'p5', p2Id: null }, // p5 bye
  ];

  // Pemain aktif sekarang: p1, p2, p4, p5 (4 orang, genap)
  const result = generateSwissPairing(2, players, pastMatches, 'BO3');
  assert.equal(result.hasSolution, true);
  // Pastikan p3 (dropped) tidak ada di satupun match ronde 2
  const hasDropped = result.matches.some((m) => m.p1Id === 'p3' || m.p2Id === 'p3');
  assert.equal(hasDropped, false, 'Peserta dropped tidak boleh ada di pairing');
});

test('Tahap 5: Validasi penukaran pairing manual mendeteksi rematch', () => {
  const pastMatches = [{ round: 1, p1Id: 'p1', p2Id: 'p2' }];

  const invalidSwap = validateManualSwap('p1', 'p2', pastMatches);
  assert.equal(invalidSwap.isValid, false);
  assert.ok(invalidSwap.warning.includes('rematch'));

  const validSwap = validateManualSwap('p1', 'p3', pastMatches);
  assert.equal(validSwap.isValid, true);
});
