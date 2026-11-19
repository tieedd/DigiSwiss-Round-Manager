import test from 'node:test';
import assert from 'node:assert/strict';

import {
  calculateTopCutRecordsByPlayer,
  mergeSwissAndTopCutRecord,
  formatFinalRecordBreakdown,
  getSwissStandingRecord,
  needsLeagueFinalRecordRecalc,
  buildRecalculatedFinalRecordsPlan,
} from '../utils/finalRecordLogic.ts';
import { calculateTournamentStandings } from '../utils/standingsLogic.ts';
import {
  computeFinalRankingsWithTopCut,
  filterSwissMatches,
} from '../utils/topCutLogic.ts';
import {
  generateStandingsCsv,
  generateStandingsText,
} from '../utils/deckExportLogic.ts';
import { calculatePlayerStats } from '../utils/statsLogic.ts';

function make8Players() {
  return Array.from({ length: 8 }, (_, idx) => ({
    id: `p${idx + 1}`,
    name: `Player ${idx + 1}`,
    status: 'accepted',
  }));
}

function makeSwiss3RoundsFor8Players() {
  // Swiss 3 ronde menghasilkan p1 3-0 (9 pts), p2..p4 2-1, p5..p7 1-2, p8 0-3
  return [
    // Round 1
    { id: 'r1m1', round: 1, stage: 'swiss', table: 1, p1Id: 'p1', p2Id: 'p8', p1Name: 'Player 1', p2Name: 'Player 8', p1Score: 2, p2Score: 0, status: 'confirmed' },
    { id: 'r1m2', round: 1, stage: 'swiss', table: 2, p1Id: 'p2', p2Id: 'p7', p1Name: 'Player 2', p2Name: 'Player 7', p1Score: 2, p2Score: 0, status: 'confirmed' },
    { id: 'r1m3', round: 1, stage: 'swiss', table: 3, p1Id: 'p3', p2Id: 'p6', p1Name: 'Player 3', p2Name: 'Player 6', p1Score: 2, p2Score: 0, status: 'confirmed' },
    { id: 'r1m4', round: 1, stage: 'swiss', table: 4, p1Id: 'p4', p2Id: 'p5', p1Name: 'Player 4', p2Name: 'Player 5', p1Score: 2, p2Score: 0, status: 'confirmed' },
    // Round 2
    { id: 'r2m1', round: 2, stage: 'swiss', table: 1, p1Id: 'p1', p2Id: 'p4', p1Name: 'Player 1', p2Name: 'Player 4', p1Score: 2, p2Score: 0, status: 'confirmed' },
    { id: 'r2m2', round: 2, stage: 'swiss', table: 2, p1Id: 'p2', p2Id: 'p3', p1Name: 'Player 2', p2Name: 'Player 3', p1Score: 2, p2Score: 0, status: 'confirmed' },
    { id: 'r2m3', round: 2, stage: 'swiss', table: 3, p1Id: 'p5', p2Id: 'p8', p1Name: 'Player 5', p2Name: 'Player 8', p1Score: 2, p2Score: 0, status: 'confirmed' },
    { id: 'r2m4', round: 2, stage: 'swiss', table: 4, p1Id: 'p6', p2Id: 'p7', p1Name: 'Player 6', p2Name: 'Player 7', p1Score: 2, p2Score: 0, status: 'confirmed' },
    // Round 3
    { id: 'r3m1', round: 3, stage: 'swiss', table: 1, p1Id: 'p1', p2Id: 'p2', p1Name: 'Player 1', p2Name: 'Player 2', p1Score: 2, p2Score: 0, status: 'confirmed' },
    { id: 'r3m2', round: 3, stage: 'swiss', table: 2, p1Id: 'p3', p2Id: 'p4', p1Name: 'Player 3', p2Name: 'Player 4', p1Score: 2, p2Score: 0, status: 'confirmed' },
    { id: 'r3m3', round: 3, stage: 'swiss', table: 3, p1Id: 'p5', p2Id: 'p6', p1Name: 'Player 5', p2Name: 'Player 6', p1Score: 2, p2Score: 0, status: 'confirmed' },
    { id: 'r3m4', round: 3, stage: 'swiss', table: 4, p1Id: 'p7', p2Id: 'p8', p1Name: 'Player 7', p2Name: 'Player 8', p1Score: 2, p2Score: 0, status: 'confirmed' },
  ];
}

test('FINAL RECORD 1: Turnamen Liga Top 4 BO3 — Juara (3+2=5W), Runner-up, Semifinal, non-Top-Cut, dan poin BO3 Top Cut', () => {
  const players = make8Players();
  const swissMatches = makeSwiss3RoundsFor8Players();

  // Top 4 dimulai di ronde 4 (Semifinal) & ronde 5 (Final)
  // Semifinal 1: p1 (2-0) p4 -> p1 +3 pts, p4 +0 pts
  // Semifinal 2: p2 (2-1) p3 -> p2 +2 pts, p3 +1 pt
  // Final: p1 (2-1) p2 -> p1 +2 pts, p2 +1 pt
  // Match archived & match pending harus diabaikan!
  const topCutMatches = [
    { id: 'tc_arch', round: 4, stage: 'topcut', table: 1, p1Id: 'p1', p2Id: 'p4', p1Name: 'Player 1', p2Name: 'Player 4', p1Score: 0, p2Score: 2, status: 'confirmed', archived: true },
    { id: 'tc_pend', round: 4, stage: 'topcut', table: 1, p1Id: 'p4', p2Id: 'p8', p1Name: 'Player 4', p2Name: 'Player 8', p1Score: 2, p2Score: 0, status: 'pending', archived: false },
    { id: 'sf1', round: 4, stage: 'topcut', table: 1, p1Id: 'p1', p2Id: 'p4', p1Name: 'Player 1', p2Name: 'Player 4', p1Score: 2, p2Score: 0, status: 'confirmed', archived: false },
    { id: 'sf2', round: 4, stage: 'topcut', table: 2, p1Id: 'p2', p2Id: 'p3', p1Name: 'Player 2', p2Name: 'Player 3', p1Score: 2, p2Score: 1, status: 'confirmed', archived: false },
    { id: 'fin', round: 5, stage: 'topcut', table: 1, p1Id: 'p1', p2Id: 'p2', p1Name: 'Player 1', p2Name: 'Player 2', p1Score: 2, p2Score: 1, status: 'confirmed', archived: false },
  ];

  const allMatches = [...swissMatches, ...topCutMatches];
  const swissStandings = calculateTournamentStandings(players, filterSwissMatches(allMatches), 'BO3');
  const topCutMeta = {
    size: 4,
    startedAt: 1700000000000,
    startedRound: 4,
    seeds: swissStandings.slice(0, 4).map((s) => ({
      playerId: s.playerId,
      name: s.playerName,
      swissRank: s.rank,
    })),
  };

  const finalStandings = computeFinalRankingsWithTopCut(swissStandings, topCutMeta, allMatches, 3);
  const topCutRecords = calculateTopCutRecordsByPlayer(allMatches, 'BO3');

  const mergedByPlayer = new Map();
  for (const s of finalStandings) {
    mergedByPlayer.set(
      s.playerId,
      {
        ...s,
        ...mergeSwissAndTopCutRecord(
          { wins: s.matchWins, losses: s.matchLosses, points: s.points },
          topCutRecords.get(s.playerId),
          true
        ),
      }
    );
  }

  // Juara (p1): Swiss 3-0 (9 pts) + Top Cut 2-0 (3 + 2 = 5 pts) => Total 5W - 0L, 14 pts
  const p1 = mergedByPlayer.get('p1');
  assert.equal(p1.rank, 1);
  assert.equal(p1.topCutResult, 'Juara');
  assert.equal(p1.wins, 5);
  assert.equal(p1.losses, 0);
  assert.equal(p1.points, 14);
  assert.equal(p1.swissWins, 3);
  assert.equal(p1.swissLosses, 0);
  assert.equal(p1.swissPoints, 9);
  assert.equal(p1.topCutWins, 2);
  assert.equal(p1.topCutLosses, 0);
  assert.equal(p1.topCutPoints, 5);
  // Metrik Swiss murni tetap hanya dari Swiss (3 match x 2-0 = 6 gamesWon, 0 gamesLost)
  assert.equal(p1.gamesWon, 6);
  assert.equal(p1.gamesLost, 0);
  assert.equal(formatFinalRecordBreakdown(p1), 'Swiss 3-0 • Top Cut 2-0');

  // Runner-up (p2): Swiss 2-1 (6 pts) + Top Cut 1-1 (2-1 SF = 2 pts, 1-2 Final = 1 pt => 3 pts) => 3W-2L, 9 pts
  const p2 = mergedByPlayer.get('p2');
  assert.equal(p2.rank, 2);
  assert.equal(p2.topCutResult, 'Runner-up');
  assert.equal(p2.wins, 3);
  assert.equal(p2.losses, 2);
  assert.equal(p2.points, 9);
  assert.equal(p2.swissWins, 2);
  assert.equal(p2.swissLosses, 1);
  assert.equal(p2.topCutWins, 1);
  assert.equal(p2.topCutLosses, 1);
  assert.equal(p2.topCutPoints, 3);
  assert.equal(formatFinalRecordBreakdown(p2), 'Swiss 2-1 • Top Cut 1-1');

  // Semifinal loser p3 (kalah 1-2 di SF -> +1 pt)
  const p3 = mergedByPlayer.get('p3');
  assert.equal(p3.topCutResult, 'Semifinal');
  assert.equal(p3.swissWins, 2);
  assert.equal(p3.swissLosses, 1);
  assert.equal(p3.topCutWins, 0);
  assert.equal(p3.topCutLosses, 1);
  assert.equal(p3.topCutPoints, 1);
  assert.equal(p3.wins, 2);
  assert.equal(p3.losses, 2);
  assert.equal(p3.points, 7);
  assert.equal(formatFinalRecordBreakdown(p3), 'Swiss 2-1 • Top Cut 0-1');

  // Non-Top-Cut player (p8): Swiss 0-3, Top Cut 0-0 -> breakdown tidak tampil
  const p8 = mergedByPlayer.get('p8');
  assert.equal(p8.topCutResult, undefined);
  assert.equal(p8.wins, 0);
  assert.equal(p8.losses, 3);
  assert.equal(p8.topCutWins, 0);
  assert.equal(p8.topCutLosses, 0);
  assert.equal(formatFinalRecordBreakdown(p8), null);
});

test('FINAL RECORD 2: Turnamen Liga Top 8 BO3 — Juara (3+3=6W) dan Perempat Final loser', () => {
  const players = make8Players();
  const swissMatches = makeSwiss3RoundsFor8Players();

  // Top 8: QF (round 4), SF (round 5), Final (round 6)
  const topCutMatches = [
    { id: 'qf1', round: 4, stage: 'topcut', table: 1, p1Id: 'p1', p2Id: 'p8', p1Name: 'Player 1', p2Name: 'Player 8', p1Score: 2, p2Score: 0, status: 'confirmed' },
    { id: 'qf2', round: 4, stage: 'topcut', table: 2, p1Id: 'p4', p2Id: 'p5', p1Name: 'Player 4', p2Name: 'Player 5', p1Score: 2, p2Score: 1, status: 'confirmed' },
    { id: 'qf3', round: 4, stage: 'topcut', table: 3, p1Id: 'p2', p2Id: 'p7', p1Name: 'Player 2', p2Name: 'Player 7', p1Score: 2, p2Score: 0, status: 'confirmed' },
    { id: 'qf4', round: 4, stage: 'topcut', table: 4, p1Id: 'p3', p2Id: 'p6', p1Name: 'Player 3', p2Name: 'Player 6', p1Score: 2, p2Score: 0, status: 'confirmed' },
    { id: 'sf1', round: 5, stage: 'topcut', table: 1, p1Id: 'p1', p2Id: 'p4', p1Name: 'Player 1', p2Name: 'Player 4', p1Score: 2, p2Score: 0, status: 'confirmed' },
    { id: 'sf2', round: 5, stage: 'topcut', table: 2, p1Id: 'p2', p2Id: 'p3', p1Name: 'Player 2', p2Name: 'Player 3', p1Score: 2, p2Score: 0, status: 'confirmed' },
    { id: 'fin', round: 6, stage: 'topcut', table: 1, p1Id: 'p1', p2Id: 'p2', p1Name: 'Player 1', p2Name: 'Player 2', p1Score: 2, p2Score: 0, status: 'confirmed' },
  ];

  const allMatches = [...swissMatches, ...topCutMatches];
  const swissStandings = calculateTournamentStandings(players, filterSwissMatches(allMatches), 'BO3');
  const topCutMeta = {
    size: 8,
    startedAt: 1700000000000,
    startedRound: 4,
    seeds: swissStandings.map((s) => ({
      playerId: s.playerId,
      name: s.playerName,
      swissRank: s.rank,
    })),
  };

  const finalStandings = computeFinalRankingsWithTopCut(swissStandings, topCutMeta, allMatches, 3);
  const topCutRecords = calculateTopCutRecordsByPlayer(allMatches, 'BO3');

  const p1Final = finalStandings.find((s) => s.playerId === 'p1');
  const p1Merged = mergeSwissAndTopCutRecord(
    { wins: p1Final.matchWins, losses: p1Final.matchLosses, points: p1Final.points },
    topCutRecords.get('p1'),
    true
  );
  assert.equal(p1Final.rank, 1);
  assert.equal(p1Final.topCutResult, 'Juara');
  assert.equal(p1Merged.wins, 6); // 3 Swiss + 3 Top Cut
  assert.equal(p1Merged.losses, 0);
  assert.equal(p1Merged.points, 18); // 9 + 9
  assert.equal(formatFinalRecordBreakdown({ ...p1Merged, topCutResult: p1Final.topCutResult }), 'Swiss 3-0 • Top Cut 3-0');

  // QF loser p5 (2-1 Swiss, kalah 1-2 di QF -> +1 pt Top Cut) => Total 2W-2L
  const p5Final = finalStandings.find((s) => s.playerId === 'p5');
  const p5Merged = mergeSwissAndTopCutRecord(
    { wins: p5Final.matchWins, losses: p5Final.matchLosses, points: p5Final.points },
    topCutRecords.get('p5'),
    true
  );
  assert.equal(p5Final.topCutResult, 'Perempat Final');
  assert.equal(p5Merged.swissWins, 2);
  assert.equal(p5Merged.swissLosses, 1);
  assert.equal(p5Merged.topCutWins, 0);
  assert.equal(p5Merged.topCutLosses, 1);
  assert.equal(p5Merged.topCutPoints, 1);
  assert.equal(p5Merged.wins, 2);
  assert.equal(p5Merged.losses, 2);
  assert.equal(formatFinalRecordBreakdown({ ...p5Merged, topCutResult: p5Final.topCutResult }), 'Swiss 2-1 • Top Cut 0-1');

  // QF loser p8 (0-3 Swiss, kalah 0-2 di QF -> +0 pt Top Cut) => Total 0W-4L
  const p8Final = finalStandings.find((s) => s.playerId === 'p8');
  const p8Merged = mergeSwissAndTopCutRecord(
    { wins: p8Final.matchWins, losses: p8Final.matchLosses, points: p8Final.points },
    topCutRecords.get('p8'),
    true
  );
  assert.equal(p8Final.topCutResult, 'Perempat Final');
  assert.equal(p8Merged.swissWins, 0);
  assert.equal(p8Merged.swissLosses, 3);
  assert.equal(p8Merged.topCutWins, 0);
  assert.equal(p8Merged.topCutLosses, 1);
  assert.equal(p8Merged.topCutPoints, 0);
  assert.equal(p8Merged.wins, 0);
  assert.equal(p8Merged.losses, 4);
  assert.equal(formatFinalRecordBreakdown({ ...p8Merged, topCutResult: p8Final.topCutResult }), 'Swiss 0-3 • Top Cut 0-1');
});

test('FINAL RECORD 3: Turnamen tanpa Top Cut & turnamen reguler tidak berubah', () => {
  const mergedRegular = mergeSwissAndTopCutRecord(
    { wins: 3, losses: 1, points: 9 },
    { wins: 2, losses: 0, points: 6 },
    false
  );
  assert.equal(mergedRegular.wins, 3);
  assert.equal(mergedRegular.losses, 1);
  assert.equal(mergedRegular.points, 9);
  assert.equal('swissWins' in mergedRegular, false);
  assert.equal('topCutWins' in mergedRegular, false);
  assert.equal(formatFinalRecordBreakdown(mergedRegular), null);
});

test('FINAL RECORD 4: Ekspor CSV & Teks (Peringkat Akhir pakai Total, Klasemen Swiss pakai Swiss / fallback data lama) + Statistik', () => {
  const participations = [
    {
      id: 't1_p1',
      tournamentId: 't1',
      tournamentName: 'Liga Banjarmasin',
      date: '2026-11-18',
      format: 'BO3',
      tournamentType: 'league',
      season: { number: 1, month: 11, year: 2026 },
      playerId: 'p1',
      uid: 'u1',
      organizerId: 'org1',
      name: 'JuaraLiga',
      rank: 1,
      swissRank: 2,
      topCutResult: 'Juara',
      wins: 5,
      losses: 0,
      points: 14,
      swissWins: 3,
      swissLosses: 0,
      swissPoints: 9,
      topCutWins: 2,
      topCutLosses: 0,
      topCutPoints: 5,
      gamesWon: 6,
      gamesLost: 0,
      omw: 66.7,
      gw: 100,
      ogw: 60.0,
      decks: [
        { name: 'Gallantmon', colors: ['Merah'] },
        { name: 'MirageGaogamon', colors: ['Biru'] },
      ],
    },
    {
      // Simulasi data lama tanpa field swiss*
      id: 't1_p2',
      tournamentId: 't1',
      tournamentName: 'Liga Banjarmasin',
      date: '2026-11-18',
      format: 'BO3',
      tournamentType: 'league',
      season: { number: 1, month: 11, year: 2026 },
      playerId: 'p2',
      uid: 'u2',
      organizerId: 'org1',
      name: 'DataLama',
      rank: 2,
      swissRank: 1,
      topCutResult: 'Runner-up',
      wins: 3,
      losses: 0,
      points: 9,
      gamesWon: 6,
      gamesLost: 1,
      omw: 60.0,
      gw: 85.7,
      ogw: 55.0,
      decks: [
        { name: 'Beelzemon', colors: ['Ungu'] },
        { name: 'ShineGreymon', colors: ['Kuning'] },
      ],
    },
  ];

  const csv = generateStandingsCsv('Liga Banjarmasin', participations, {
    seasonLabel: 'SEASON 1 NOVEMBER 2026',
    isLeague: true,
  });
  // Bagian 1: Peringkat Akhir pakai Total (14 pts, 5 W, 0 L)
  assert.ok(csv.includes('"1","JuaraLiga","Akun Terdaftar","Gallantmon","Merah","MirageGaogamon","Biru","14","5","0","6","0","66.7%","100%","60%","Juara"'));
  // Bagian 2: Klasemen Swiss pakai swissPoints=9 dan swissWins-swissLosses=3-0
  assert.ok(csv.includes('"2","JuaraLiga","9","3-0","66.7%"'));
  // Fallback data lama tanpa swiss*
  assert.ok(csv.includes('"1","DataLama","9","3-0","60%"'));

  const text = generateStandingsText({
    tournamentName: 'Liga Banjarmasin',
    tournamentDate: '2026-11-18',
    format: 'BO3',
    participations,
    isLeague: true,
    seasonLabel: 'SEASON 1 NOVEMBER 2026',
  });
  assert.ok(text.includes('🥇 JuaraLiga            [Juara] | Poin: 14 | W-L: 5-0'));
  assert.ok(text.includes('#2 JuaraLiga            | Poin:  9 | W-L: 3-0 | OMW: 66.7%'));
  assert.ok(text.includes('#1 DataLama             | Poin:  9 | W-L: 3-0 | OMW: 60%'));

  // Statistik otomatis memakai total W-L
  const stats = calculatePlayerStats([participations[0]]);
  assert.equal(stats.totalWins, 5);
  assert.equal(stats.totalLosses, 0);
  assert.equal(stats.winRate, 100);
});

test('FINAL RECORD 5: Deteksi & rencana hitung ulang data lama tanpa mengubah rank/deck/metrik Swiss', () => {
  const players = make8Players();
  const swissMatches = makeSwiss3RoundsFor8Players();
  const topCutMatches = [
    { id: 'sf1', round: 4, stage: 'topcut', table: 1, p1Id: 'p1', p2Id: 'p4', p1Name: 'Player 1', p2Name: 'Player 4', p1Score: 2, p2Score: 0, status: 'confirmed' },
    { id: 'sf2', round: 4, stage: 'topcut', table: 2, p1Id: 'p2', p2Id: 'p3', p1Name: 'Player 2', p2Name: 'Player 3', p1Score: 2, p2Score: 0, status: 'confirmed' },
    { id: 'fin', round: 5, stage: 'topcut', table: 1, p1Id: 'p1', p2Id: 'p2', p1Name: 'Player 1', p2Name: 'Player 2', p1Score: 2, p2Score: 0, status: 'confirmed' },
  ];
  const allMatches = [...swissMatches, ...topCutMatches];

  const legacyTourney = {
    type: 'league',
    format: 'BO3',
    topCut: { size: 4, startedAt: 1700000000000, startedRound: 4, seeds: [] },
  };
  const legacyParticipations = [
    { id: 't1_p1', playerId: 'p1', name: 'Player 1', topCutResult: 'Juara', wins: 3, losses: 0, points: 9 },
    { id: 't1_p8', playerId: 'p8', name: 'Player 8', wins: 0, losses: 3, points: 0 },
  ];

  assert.equal(needsLeagueFinalRecordRecalc(legacyTourney, legacyParticipations), true);
  assert.equal(needsLeagueFinalRecordRecalc({ type: 'regular', topCut: legacyTourney.topCut }, legacyParticipations), false);
  assert.equal(needsLeagueFinalRecordRecalc({ type: 'league' }, legacyParticipations), false);
  assert.equal(
    needsLeagueFinalRecordRecalc(legacyTourney, [
      { id: 't1_p1', playerId: 'p1', name: 'Player 1', topCutResult: 'Juara', swissWins: 3, swissLosses: 0, topCutWins: 2, topCutLosses: 0 },
    ]),
    false
  );

  const plan = buildRecalculatedFinalRecordsPlan(
    legacyTourney,
    players,
    allMatches,
    legacyParticipations
  );
  assert.equal(plan.length, 2);
  assert.deepEqual(plan[0].patch, {
    wins: 5,
    losses: 0,
    points: 15,
    swissWins: 3,
    swissLosses: 0,
    swissPoints: 9,
    topCutWins: 2,
    topCutLosses: 0,
    topCutPoints: 6,
  });
  assert.deepEqual(plan[1].patch, {
    wins: 0,
    losses: 3,
    points: 0,
    swissWins: 0,
    swissLosses: 3,
    swissPoints: 0,
    topCutWins: 0,
    topCutLosses: 0,
    topCutPoints: 0,
  });

  // getSwissStandingRecord fallback
  assert.deepEqual(getSwissStandingRecord({ wins: 3, losses: 0, points: 9 }), { wins: 3, losses: 0, points: 9 });
  assert.deepEqual(
    getSwissStandingRecord({ wins: 5, losses: 0, points: 14, swissWins: 3, swissLosses: 0, swissPoints: 9 }),
    { wins: 3, losses: 0, points: 9 }
  );
});
