import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildNextTopCutRoundMatches,
  buildTopCutSeeds,
  checkTopCutEligibility,
  computeFinalRankingsWithTopCut,
  createTopCutInitialMatches,
  filterSwissMatches,
  filterTopCutMatches,
  getNextTopCutRoundLabel,
  getRoundDisplayLabel,
  getTopCutFinalRoundNumber,
  getTopCutRoundCount,
  isFinalTopCutRound,
  isSwissMatch,
  isTopCutMatch,
} from '../utils/topCutLogic.ts';
import { calculateTournamentStandings } from '../utils/standingsLogic.ts';
import { calculatePlayerStats } from '../utils/statsLogic.ts';
import {
  generateStandingsCsv,
  generateStandingsText,
} from '../utils/deckExportLogic.ts';

function makePlayers(count, overrides = {}) {
  return Array.from({ length: count }, (_, idx) => {
    const id = `p${idx + 1}`;
    return {
      id,
      name: `Player ${idx + 1}`,
      status: 'accepted',
      ...(overrides[id] || {}),
    };
  });
}

/**
 * Menghasilkan 3 ronde Swiss untuk 10 pemain di mana urutan klasemen Swiss akhir
 * dapat ditentukan dengan jelas: p1..p10 (berdasarkan poin & win rate).
 */
function makeClearSwissMatches10(players) {
  const matches = [];
  // Ronde 1: 1v6, 2v7, 3v8, 4v9, 5v10 -> 1..5 menang 2-0
  for (let i = 0; i < 5; i++) {
    matches.push({
      id: `r1m${i + 1}`,
      round: 1,
      stage: 'swiss',
      table: i + 1,
      p1Id: players[i].id,
      p2Id: players[i + 5].id,
      p1Name: players[i].name,
      p2Name: players[i + 5].name,
      p1Score: 2,
      p2Score: 0,
      status: 'confirmed',
    });
  }
  // Ronde 2: 1v4 (1 menang), 2v5 (2 menang), 3v6 (3 menang), 7v9 (7 menang), 8v10 (8 menang)
  const r2Pairs = [
    [0, 3, 2, 0],
    [1, 4, 2, 0],
    [2, 5, 2, 0],
    [6, 8, 2, 0],
    [7, 9, 2, 0],
  ];
  r2Pairs.forEach(([a, b, s1, s2], i) => {
    matches.push({
      id: `r2m${i + 1}`,
      round: 2,
      // Uji kompatibilitas mundur: tanpa field stage tetap dianggap Swiss
      table: i + 1,
      p1Id: players[a].id,
      p2Id: players[b].id,
      p1Name: players[a].name,
      p2Name: players[b].name,
      p1Score: s1,
      p2Score: s2,
      status: 'confirmed',
    });
  });
  // Ronde 3: 1v2 (1 menang), 3v4 (3 menang), 5v7 (5 menang), 6v8 (6 menang), 9v10 (9 menang)
  const r3Pairs = [
    [0, 1, 2, 0],
    [2, 3, 2, 1],
    [4, 6, 2, 0],
    [5, 7, 2, 0],
    [8, 9, 2, 0],
  ];
  r3Pairs.forEach(([a, b, s1, s2], i) => {
    matches.push({
      id: `r3m${i + 1}`,
      round: 3,
      stage: 'swiss',
      table: i + 1,
      p1Id: players[a].id,
      p2Id: players[b].id,
      p1Name: players[a].name,
      p2Name: players[b].name,
      p1Score: s1,
      p2Score: s2,
      status: 'confirmed',
    });
  });
  return matches;
}

test('TOP CUT: kelayakan peserta aktif untuk Top 4 dan Top 8', () => {
  const p3 = makePlayers(3);
  assert.deepEqual(checkTopCutEligibility(p3), {
    activeCount: 3,
    canStartTop4: false,
    canStartTop8: false,
  });

  const p7WithDrops = makePlayers(9, {
    p8: { status: 'dropped' },
    p9: { status: 'waiting' },
  });
  assert.deepEqual(checkTopCutEligibility(p7WithDrops), {
    activeCount: 7,
    canStartTop4: true,
    canStartTop8: false,
  });

  const p8 = makePlayers(10, {
    p9: { status: 'dropped' },
    p10: { status: 'rejected' },
  });
  assert.deepEqual(checkTopCutEligibility(p8), {
    activeCount: 8,
    canStartTop4: true,
    canStartTop8: true,
  });
});

test('TOP CUT: label babak dan utilitas jumlah ronde Top 4 & Top 8', () => {
  assert.equal(getTopCutRoundCount(4), 2);
  assert.equal(getTopCutRoundCount(8), 3);
  assert.equal(getTopCutFinalRoundNumber(3, 4), 5);
  assert.equal(getTopCutFinalRoundNumber(4, 8), 7);

  // Swiss tetap "Ronde X"
  assert.equal(getRoundDisplayLabel(1, 3, 4), 'Ronde 1');
  assert.equal(getRoundDisplayLabel(3, 3, 8), 'Ronde 3');

  // Top 4
  assert.equal(getRoundDisplayLabel(4, 3, 4), 'Semifinal');
  assert.equal(getRoundDisplayLabel(5, 3, 4), 'Final');
  assert.equal(getNextTopCutRoundLabel(4, 3, 4), 'Final');
  assert.equal(getNextTopCutRoundLabel(5, 3, 4), null);
  assert.equal(isFinalTopCutRound(4, 3, 4), false);
  assert.equal(isFinalTopCutRound(5, 3, 4), true);

  // Top 8
  assert.equal(getRoundDisplayLabel(5, 4, 8), 'Perempat Final');
  assert.equal(getRoundDisplayLabel(6, 4, 8), 'Semifinal');
  assert.equal(getRoundDisplayLabel(7, 4, 8), 'Final');
  assert.equal(getNextTopCutRoundLabel(5, 4, 8), 'Semifinal');
  assert.equal(getNextTopCutRoundLabel(6, 4, 8), 'Final');
  assert.equal(getNextTopCutRoundLabel(7, 4, 8), null);
  assert.equal(isFinalTopCutRound(7, 4, 8), true);
});

test('TOP CUT: seeding melewati pemain dropped dan membentuk bracket Top 4 (1v4, 2v3)', () => {
  const players = makePlayers(8, {
    p1: { status: 'dropped' }, // peringkat #1 Swiss dropped -> harus dilewati!
  });
  const matches = [
    // Buat p1 skor tertinggi tapi dropped
    { id: 'm1', round: 1, table: 1, p1Id: 'p1', p2Id: 'p8', p1Name: 'Player 1', p2Name: 'Player 8', p1Score: 2, p2Score: 0, status: 'confirmed' },
    { id: 'm2', round: 1, table: 2, p1Id: 'p2', p2Id: 'p7', p1Name: 'Player 2', p2Name: 'Player 7', p1Score: 2, p2Score: 0, status: 'confirmed' },
    { id: 'm3', round: 1, table: 3, p1Id: 'p3', p2Id: 'p6', p1Name: 'Player 3', p2Name: 'Player 6', p1Score: 2, p2Score: 0, status: 'confirmed' },
    { id: 'm4', round: 1, table: 4, p1Id: 'p4', p2Id: 'p5', p1Name: 'Player 4', p2Name: 'Player 5', p1Score: 2, p2Score: 1, status: 'confirmed' },
  ];

  const seeds = buildTopCutSeeds(players, matches, 'BO3', 4);
  assert.equal(seeds.length, 4);
  assert.equal(seeds.some((s) => s.playerId === 'p1'), false);
  // 4 pemain teratas non-dropped harus p2, p3, p4, dan salah satu dari p5/p6/p7/p8 (di sini p5 unggul 1 game)
  assert.deepEqual(
    seeds.map((s) => s.playerId),
    ['p2', 'p3', 'p4', 'p5']
  );

  const bracketMatches = createTopCutInitialMatches(seeds, 4);
  assert.equal(bracketMatches.length, 2);
  // Seed 1 vs Seed 4
  assert.equal(bracketMatches[0].table, 1);
  assert.equal(bracketMatches[0].p1Id, 'p2');
  assert.equal(bracketMatches[0].p2Id, 'p5');
  // Seed 2 vs Seed 3
  assert.equal(bracketMatches[1].table, 2);
  assert.equal(bracketMatches[1].p1Id, 'p3');
  assert.equal(bracketMatches[1].p2Id, 'p4');
});

test('TOP CUT: bracket Top 8 (1v8, 4v5, 2v7, 3v6) sampai Final dan peringkat akhir + statistik', () => {
  const players = makePlayers(10);
  const swissMatches = makeClearSwissMatches10(players);
  const swissStandings = calculateTournamentStandings(players, swissMatches, 'BO3');
  const seeds = buildTopCutSeeds(players, swissMatches, 'BO3', 8);

  assert.equal(seeds.length, 8);
  const seedIds = seeds.map((s) => s.playerId);

  // Bentuk Perempat Final: 1v8, 4v5, 2v7, 3v6
  const qfDrafts = createTopCutInitialMatches(seeds, 8);
  assert.equal(qfDrafts.length, 4);
  assert.deepEqual(
    qfDrafts.map((m) => [m.p1Id, m.p2Id]),
    [
      [seedIds[0], seedIds[7]], // 1 vs 8
      [seedIds[3], seedIds[4]], // 4 vs 5
      [seedIds[1], seedIds[6]], // 2 vs 7
      [seedIds[2], seedIds[5]], // 3 vs 6
    ]
  );

  // Simulasikan hasil Perempat Final:
  // M1: seed 8 upset seed 1 (1-2)
  // M2: seed 4 kalahkan seed 5 (2-0)
  // M3: seed 2 kalahkan seed 7 (2-0)
  // M4: seed 6 upset seed 3 (0-2)
  const qfMatches = qfDrafts.map((d, i) => ({
    ...d,
    id: `qf${i + 1}`,
    round: 4,
    stage: 'topcut',
    p1Score: i === 0 || i === 3 ? 0 : 2,
    p2Score: i === 0 || i === 3 ? 2 : 0,
    status: 'confirmed',
  }));

  // Coba lanjut dengan satu match belum confirmed -> harus gagal
  assert.throws(
    () =>
      buildNextTopCutRoundMatches([
        ...qfMatches.slice(0, 3),
        { ...qfMatches[3], status: 'reported' },
      ]),
    /terkonfirmasi/
  );

  // Coba lanjut dengan skor seri -> harus gagal
  assert.throws(
    () =>
      buildNextTopCutRoundMatches([
        ...qfMatches.slice(0, 3),
        { ...qfMatches[3], p1Score: 1, p2Score: 1 },
      ]),
    /seri/
  );

  // Bentuk Semifinal: pemenang M1 (seed 8) vs M2 (seed 4), dan pemenang M3 (seed 2) vs M4 (seed 6)
  const sfDrafts = buildNextTopCutRoundMatches(qfMatches);
  assert.equal(sfDrafts.length, 2);
  assert.equal(sfDrafts[0].p1Id, seedIds[7]); // seed 8
  assert.equal(sfDrafts[0].p2Id, seedIds[3]); // seed 4
  assert.equal(sfDrafts[1].p1Id, seedIds[1]); // seed 2
  assert.equal(sfDrafts[1].p2Id, seedIds[5]); // seed 6

  // Semifinal: seed 8 kalahkan seed 4; seed 6 kalahkan seed 2
  const sfMatches = [
    { ...sfDrafts[0], id: 'sf1', round: 5, stage: 'topcut', p1Score: 2, p2Score: 1, status: 'confirmed' },
    { ...sfDrafts[1], id: 'sf2', round: 5, stage: 'topcut', p1Score: 0, p2Score: 2, status: 'confirmed' },
  ];

  // Final: seed 8 vs seed 6 -> seed 8 Juara!
  const finalDrafts = buildNextTopCutRoundMatches(sfMatches);
  assert.equal(finalDrafts.length, 1);
  assert.equal(finalDrafts[0].p1Id, seedIds[7]);
  assert.equal(finalDrafts[0].p2Id, seedIds[5]);

  const finalMatches = [
    { ...finalDrafts[0], id: 'fin1', round: 6, stage: 'topcut', p1Score: 2, p2Score: 0, status: 'confirmed' },
  ];

  const allMatches = [...swissMatches, ...qfMatches, ...sfMatches, ...finalMatches];

  // VERIFIKASI ISOLASI SWISS: hasil Top Cut tidak boleh mengubah poin, W/L, atau OMW/GW/OGW Swiss!
  const swissRecomputed = calculateTournamentStandings(players, filterSwissMatches(allMatches), 'BO3');
  assert.deepEqual(swissRecomputed, swissStandings);

  const swissViaCalculateDirectly = calculateTournamentStandings(players, allMatches, 'BO3');
  assert.deepEqual(swissViaCalculateDirectly, swissStandings);

  // VERIFIKASI PERINGKAT AKHIR TOP CUT:
  // rank 1: seed 8 (Juara)
  // rank 2: seed 6 (Runner-up)
  // rank 3..4: Semifinal losers = seed 2 dan seed 4 -> urut swissRank (seed 2 lebih dulu dari seed 4)
  // rank 5..8: QF losers = seed 1, seed 3, seed 5, seed 7 -> urut swissRank (1, 3, 5, 7)
  // rank 9..10: non-Top-Cut berdasar swissRank
  const topCutMeta = {
    size: 8,
    startedAt: 1700000000000,
    startedRound: 4,
    seeds,
  };
  const finalRankings = computeFinalRankingsWithTopCut(swissStandings, topCutMeta, allMatches, 3);

  assert.equal(finalRankings[0].playerId, seedIds[7]);
  assert.equal(finalRankings[0].rank, 1);
  assert.equal(finalRankings[0].swissRank, 8);
  assert.equal(finalRankings[0].topCutResult, 'Juara');

  // Pastikan poin Swiss seed 8 TIDAK ketambahan kemenangan Top Cut
  const seed8Swiss = swissStandings.find((s) => s.playerId === seedIds[7]);
  assert.equal(finalRankings[0].points, seed8Swiss.points);
  assert.equal(finalRankings[0].matchWins, seed8Swiss.matchWins);

  assert.equal(finalRankings[1].playerId, seedIds[5]);
  assert.equal(finalRankings[1].rank, 2);
  assert.equal(finalRankings[1].topCutResult, 'Runner-up');

  assert.equal(finalRankings[2].playerId, seedIds[1]); // Semifinalist dg swissRank 2
  assert.equal(finalRankings[2].rank, 3);
  assert.equal(finalRankings[2].topCutResult, 'Semifinal');

  assert.equal(finalRankings[3].playerId, seedIds[3]); // Semifinalist dg swissRank 4
  assert.equal(finalRankings[3].rank, 4);
  assert.equal(finalRankings[3].topCutResult, 'Semifinal');

  assert.deepEqual(
    finalRankings.slice(4, 8).map((r) => ({ id: r.playerId, rank: r.rank, res: r.topCutResult })),
    [
      { id: seedIds[0], rank: 5, res: 'Perempat Final' },
      { id: seedIds[2], rank: 6, res: 'Perempat Final' },
      { id: seedIds[4], rank: 7, res: 'Perempat Final' },
      { id: seedIds[6], rank: 8, res: 'Perempat Final' },
    ]
  );

  assert.equal(finalRankings[8].rank, 9);
  assert.equal(finalRankings[8].topCutResult, undefined);
  assert.equal(finalRankings[9].rank, 10);
  assert.equal(finalRankings[9].topCutResult, undefined);

  // VERIFIKASI STATISTIK PLAYER: menghitung Juara 1 & Podium berdasar peringkat akhir (rank)
  const champStats = calculatePlayerStats([
    {
      id: 't1_p8',
      tournamentName: 'Regional Cup',
      date: '2026-11-17',
      rank: finalRankings[0].rank,
      swissRank: finalRankings[0].swissRank,
      topCutResult: finalRankings[0].topCutResult,
      wins: finalRankings[0].matchWins,
      losses: finalRankings[0].matchLosses,
      points: finalRankings[0].points,
      deckName: 'Imperialdramon',
      deckColors: ['Biru', 'Hijau'],
      createdAt: 1700000000000,
    },
  ]);
  assert.equal(champStats.championCount, 1);
  assert.equal(champStats.podiumCount, 1);
});

test('TOP CUT: filterSwissMatches & filterTopCutMatches serta ekspor CSV/Teks', () => {
  const mixed = [
    { id: '1', stage: undefined },
    { id: '2', stage: 'swiss' },
    { id: '3', stage: 'topcut' },
  ];
  assert.equal(isSwissMatch(mixed[0]), true);
  assert.equal(isSwissMatch(mixed[1]), true);
  assert.equal(isSwissMatch(mixed[2]), false);
  assert.equal(isTopCutMatch(mixed[2]), true);
  assert.deepEqual(filterSwissMatches(mixed).map((m) => m.id), ['1', '2']);
  assert.deepEqual(filterTopCutMatches(mixed).map((m) => m.id), ['3']);

  const tourney = {
    name: 'Store Championship',
    date: '2026-11-17',
    location: 'Bandung',
    format: 'BO3',
    totalRounds: 3,
  };
  const parts = [
    {
      id: 'p1',
      tournamentName: tourney.name,
      date: tourney.date,
      playerId: 'p1',
      name: 'Budi',
      rank: 1,
      swissRank: 3,
      topCutResult: 'Juara',
      wins: 2,
      losses: 1,
      gamesWon: 4,
      gamesLost: 2,
      points: 6,
      omw: 66.7,
      gw: 60.0,
      ogw: 55.0,
      deckName: 'Jesmon',
      deckColors: ['Merah'],
      isManual: false,
    },
    {
      id: 'p2',
      tournamentName: tourney.name,
      date: tourney.date,
      playerId: 'p2',
      name: 'Siti',
      rank: 2,
      swissRank: 1,
      topCutResult: 'Runner-up',
      wins: 3,
      losses: 0,
      gamesWon: 6,
      gamesLost: 1,
      points: 9,
      omw: 55.5,
      gw: 85.0,
      ogw: 50.0,
      deckName: 'MirageGaogamon',
      deckColors: ['Biru'],
      isManual: false,
    },
  ];

  const csv = generateStandingsCsv(tourney.name, parts);
  assert.ok(
    csv.includes('Peringkat,Nama Pemain,Tipe Peserta,Nama Deck,Warna Deck,Total Poin,Match W,Match L,Game Win,Game Lose,OMW%,GW%,OGW%,Hasil Top Cut')
  );
  assert.ok(csv.includes('"1","Budi","Akun Terdaftar","Jesmon","Merah","6","2","1","4","2","66.70%","60.00%","55.00%","Juara"'));
  assert.ok(csv.includes('"2","Siti","Akun Terdaftar","MirageGaogamon","Biru","9","3","0","6","1","55.50%","85.00%","50.00%","Runner-up"'));

  const text = generateStandingsText(parts);
  assert.ok(text.includes('🥇 Budi                 [Juara] | Poin:  6 | W-L: 2-1'));
  assert.ok(text.includes('🥈 Siti                 [Runner-up] | Poin:  9 | W-L: 3-0'));
});
