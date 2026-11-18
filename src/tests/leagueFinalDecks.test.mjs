import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildLeagueFinalDecksAssignment,
  detectLeagueParticipationsNeedingSync,
  formatParticipationDecksInlineNames,
  formatParticipationDecksText,
  getParticipationDecksList,
  hasValidParticipationTwoDecks,
  isLeagueParticipation,
  mergePlayerDeckHistory,
  resolveLeagueParticipationDecks,
} from '../utils/leagueFinalDecksLogic.ts';
import {
  countUnfilledDecks,
  buildDeckHistoryOptions,
  buildFinalStandingsRows,
} from '../utils/finalStandingsLogic.ts';
import {
  formatDeckColorsEmoji,
  generateStandingsCsv,
  generateStandingsText,
  getUsedDeckColors,
} from '../utils/deckExportLogic.ts';
import {
  calculateAdminStats,
  calculateOrganizerStats,
  calculatePlayerStats,
} from '../utils/statsLogic.ts';

test('LIGA FINAL 1: Penyusunan field decks dari koleksi decks & peserta tanpa dokumen deck', () => {
  const deckDocs = new Map([
    [
      'p1',
      {
        decks: [
          { name: '  WarGreymon OTK ', colors: ['Merah', 'Hitam'] },
          { name: 'MirageGaogamon', colors: ['Biru'] },
        ],
        revealedTo: [],
        updatedAt: 1000,
      },
    ],
    [
      'p2',
      {
        // Tidak valid: hanya 1 deck / nama deck 2 kosong
        decks: [
          { name: 'Red Hybrid', colors: ['Merah'] },
          { name: '   ', colors: ['Biru'] },
        ],
        revealedTo: [],
        updatedAt: 1000,
      },
    ],
  ]);

  const standings = [
    { playerId: 'p1', playerName: 'Taichi' },
    { playerId: 'p2', playerName: 'Yamato' },
    { playerId: 'p3', playerName: 'Sora' }, // Tidak punya dokumen di decks sama sekali
  ];

  const { assignedDecksMap, missingPlayers } = buildLeagueFinalDecksAssignment(
    standings,
    deckDocs
  );

  assert.equal(assignedDecksMap.size, 1);
  assert.deepEqual(assignedDecksMap.get('p1'), [
    { name: 'WarGreymon OTK', colors: ['Merah', 'Hitam'] },
    { name: 'MirageGaogamon', colors: ['Biru'] },
  ]);
  assert.equal(assignedDecksMap.get('p2'), undefined);
  assert.equal(assignedDecksMap.get('p3'), undefined);

  assert.deepEqual(missingPlayers, [
    { playerId: 'p2', playerName: 'Yamato' },
    { playerId: 'p3', playerName: 'Sora' },
  ]);

  // Pastikan di-clone sehingga mutasi tidak merusak sumber
  const resolved = resolveLeagueParticipationDecks('p1', deckDocs);
  assert.ok(resolved);
  resolved[0].colors.push('Kuning');
  assert.deepEqual(deckDocs.get('p1').decks[0].colors, ['Merah', 'Hitam']);
});

test('LIGA FINAL 2: Deteksi participation liga yang perlu disinkronkan dari koleksi decks', () => {
  const participations = [
    {
      id: 'lg1_p1',
      tournamentId: 'lg1',
      tournamentType: 'league',
      playerId: 'p1',
      name: 'Taichi',
      deckName: '',
      deckColors: [],
      // Belum ada field decks -> perlu sync & punya doc
    },
    {
      id: 'lg1_p2',
      tournamentId: 'lg1',
      tournamentType: 'league',
      playerId: 'p2',
      name: 'Yamato',
      deckName: '',
      deckColors: [],
      decks: [
        { name: 'MetalGarurumon', colors: ['Biru'] },
        { name: 'Blue Flare', colors: ['Biru', 'Hitam'] },
      ],
      // Sudah punya 2 deck valid -> tidak perlu sync
    },
    {
      id: 'lg1_p3',
      tournamentId: 'lg1',
      tournamentType: 'league',
      playerId: 'p3',
      name: 'Sora',
      deckName: '',
      deckColors: [],
      // Belum ada decks dan tidak ada di koleksi decks -> masuk missingDeckDocs
    },
    {
      id: 'reg1_p4',
      tournamentId: 'reg1',
      tournamentType: 'regular',
      playerId: 'p4',
      name: 'Koushiro',
      deckName: '',
      deckColors: [],
      // Turnamen reguler -> diabaikan oleh deteksi sync liga
    },
  ];

  const deckDocs = {
    p1: {
      decks: [
        { name: 'Greymon', colors: ['Merah'] },
        { name: 'ShineGreymon', colors: ['Kuning', 'Merah'] },
      ],
      revealedTo: [],
      updatedAt: 2000,
    },
    p2: {
      decks: [
        { name: 'MetalGarurumon', colors: ['Biru'] },
        { name: 'Blue Flare', colors: ['Biru', 'Hitam'] },
      ],
      revealedTo: [],
      updatedAt: 2000,
    },
  };

  const res = detectLeagueParticipationsNeedingSync(participations, deckDocs);
  assert.equal(res.unfilledCount, 2);
  assert.equal(res.needingSync.length, 1);
  assert.equal(res.needingSync[0].participation.id, 'lg1_p1');
  assert.deepEqual(res.needingSync[0].decks, [
    { name: 'Greymon', colors: ['Merah'] },
    { name: 'ShineGreymon', colors: ['Kuning', 'Merah'] },
  ]);
  assert.equal(res.missingDeckDocs.length, 1);
  assert.equal(res.missingDeckDocs[0].id, 'lg1_p3');
});

test('LIGA FINAL 3: Penggabungan riwayat deck menyertakan kedua deck Liga dan deduplikasi case-insensitive', () => {
  const participations = [
    {
      id: 'reg1_u1',
      tournamentName: 'Store Cup',
      date: '2026-10-01',
      tournamentType: 'regular',
      deckName: 'WarGreymon OTK',
      deckColors: ['Merah'],
      createdAt: 1000,
    },
    {
      id: 'lg1_u1',
      tournamentName: 'Jakarta League S1',
      date: '2026-11-01',
      tournamentType: 'league',
      season: { number: 1, month: 11, year: 2026 },
      deckName: '',
      deckColors: [],
      decks: [
        { name: '  wargreymon otk ', colors: ['Merah', 'Hitam'] }, // duplikat case-insensitive lebih baru
        { name: 'MirageGaogamon', colors: ['Biru'] },
      ],
      createdAt: 2000,
    },
    {
      id: 'lg2_u1',
      tournamentName: 'Jakarta League S2',
      date: '2026-11-15',
      tournamentType: 'league',
      deckName: '',
      deckColors: [],
      decks: [
        { name: 'MIRAGEGAOGAMON', colors: ['Biru'] }, // duplikat
        { name: 'Imperialdramon', colors: ['Biru', 'Hijau'] },
      ],
      createdAt: 3000,
    },
  ];

  const merged = mergePlayerDeckHistory(participations);
  assert.equal(merged.length, 3);
  assert.deepEqual(
    merged.map((m) => m.deckName),
    ['MIRAGEGAOGAMON', 'Imperialdramon', 'wargreymon otk']
  );

  // buildDeckHistoryOptions juga mendukung decks Liga
  const options = buildDeckHistoryOptions(participations);
  assert.equal(options.length, 3);
});

test('LIGA FINAL 4: Partisipasi reguler tidak terpengaruh dan liga dikecualikan dari countUnfilledDecks', () => {
  const mixed = [
    {
      id: 'reg_1',
      uid: 'u1',
      tournamentType: 'regular',
      deckName: '',
      deckColors: [],
    },
    {
      id: 'reg_2',
      uid: 'u1',
      deckName: 'Jesmon',
      deckColors: ['Merah'],
    },
    {
      id: 'lg_1',
      uid: 'u1',
      tournamentType: 'league',
      season: { number: 1, month: 11, year: 2026 },
      deckName: '',
      deckColors: [],
      decks: [
        { name: 'Deck A', colors: ['Biru'] },
        { name: 'Deck B', colors: ['Kuning'] },
      ],
    },
    {
      id: 'lg_2_unsynced',
      uid: 'u1',
      tournamentType: 'league',
      deckName: '',
      deckColors: [],
    },
  ];

  // Hanya reg_1 yang dihitung belum diisi
  assert.equal(countUnfilledDecks(mixed, 'u1'), 1);
  assert.equal(isLeagueParticipation(mixed[2]), true);
  assert.equal(isLeagueParticipation(mixed[0]), false);
  assert.equal(hasValidParticipationTwoDecks(mixed[2]), true);
  assert.equal(hasValidParticipationTwoDecks(mixed[0]), false);

  assert.deepEqual(getParticipationDecksList(mixed[1]), [
    { name: 'Jesmon', colors: ['Merah'] },
  ]);
  assert.equal(getParticipationDecksList(mixed[3]).length, 0);
  assert.equal(
    formatParticipationDecksInlineNames(mixed[2]),
    'Deck A / Deck B'
  );
  assert.equal(
    formatParticipationDecksText(mixed[2], formatDeckColorsEmoji),
    'Deck A 🔵 & Deck B 🟡'
  );

  const rows = buildFinalStandingsRows(
    mixed.map((p, idx) => ({ ...p, rank: idx + 1, name: `Player ${idx + 1}` })),
    'u1'
  );
  assert.equal(rows[2].isLeague, true);
  assert.equal(rows[2].decks?.length, 2);
  assert.equal(rows[1].isLeague, false);
});

test('LIGA FINAL 5: Ekspor CSV, Teks, dan warna legend mencakup 2 deck Liga tanpa merusak reguler', () => {
  const leagueParts = [
    {
      id: 'lg_p1',
      tournamentId: 'lg1',
      tournamentName: 'Jakarta League',
      date: '2026-11-20',
      format: 'BO3',
      tournamentType: 'league',
      season: { number: 3, month: 11, year: 2026 },
      playerId: 'p1',
      uid: 'u1',
      organizerId: 'org1',
      name: 'Taichi',
      rank: 1,
      topCutResult: 'Juara',
      wins: 4,
      losses: 0,
      gamesWon: 8,
      gamesLost: 2,
      points: 12,
      omw: 70,
      gw: 80,
      ogw: 65,
      deckName: '',
      deckColors: [],
      decks: [
        { name: 'WarGreymon OTK', colors: ['Merah', 'Hitam'] },
        { name: 'MirageGaogamon', colors: ['Biru'] },
      ],
    },
  ];

  // Legend warna mengumpulkan warna dari decks[]
  assert.deepEqual(getUsedDeckColors(leagueParts), ['Merah', 'Biru', 'Hitam']);

  // Ekspor CSV Liga menyertakan Deck 1 & Deck 2 + Season
  const csv = generateStandingsCsv('Jakarta League', leagueParts, {
    seasonLabel: 'SEASON 3 NOVEMBER 2026',
    isLeague: true,
  });
  assert.ok(csv.includes('Peringkat,Nama Pemain,Tipe Peserta,Deck 1,Warna Deck 1,Deck 2,Warna Deck 2'));
  assert.ok(csv.includes('"WarGreymon OTK","Merah/Hitam","MirageGaogamon","Biru"'));

  // Ekspor Teks Liga menyertakan kedua deck & emoji
  const text = generateStandingsText({
    tournamentName: 'Jakarta League',
    tournamentDate: '2026-11-20',
    format: 'BO3',
    participations: leagueParts,
    seasonLabel: 'SEASON 3 NOVEMBER 2026',
    isLeague: true,
  });
  assert.ok(text.includes('Deck: WarGreymon OTK 🔴⚫ & MirageGaogamon 🔵'));
});

test('LIGA FINAL 6: Statistik Player, Organizer, dan Admin menghitung 2 deck Liga tanpa menggandakan total turnamen atau peserta', () => {
  const leagueParticipation = {
    id: 'lg1_u1',
    tournamentId: 'lg1',
    tournamentName: 'Jakarta League S1',
    date: '2026-11-20',
    tournamentType: 'league',
    season: { number: 1, month: 11, year: 2026 },
    rank: 1,
    wins: 3,
    losses: 1,
    points: 9,
    deckName: '', // sengaja kosong seperti hasil finalisasi Liga
    deckColors: [],
    decks: [
      { name: 'WarGreymon OTK', colors: ['Merah', 'Hitam'] },
      { name: 'MirageGaogamon', colors: ['Biru'] },
    ],
    createdAt: 1000,
  };

  const pStats = calculatePlayerStats([leagueParticipation]);
  assert.equal(pStats.totalTournaments, 1);
  assert.equal(pStats.totalWins, 3);
  assert.equal(pStats.totalLosses, 1);
  assert.equal(pStats.winRate, 75);
  assert.equal(pStats.championCount, 1);
  assert.equal(pStats.deckStats.length, 2);
  assert.ok(pStats.deckStats.some((d) => d.deckName === 'WarGreymon OTK' && d.count === 1));
  assert.ok(pStats.deckStats.some((d) => d.deckName === 'MirageGaogamon' && d.count === 1));
  assert.deepEqual(
    pStats.colorStats.map((c) => c.color).sort(),
    ['Biru', 'Hitam', 'Merah']
  );

  const oStats = calculateOrganizerStats(
    [{ id: 'lg1', name: 'Jakarta League S1', status: 'finished' }],
    [leagueParticipation]
  );
  assert.equal(oStats.totalParticipants, 1);
  assert.equal(oStats.averagePlayers, 1);
  assert.equal(oStats.popularDecks.length, 2);
  assert.equal(oStats.colorDistribution.length, 3);

  const aStats = calculateAdminStats(
    [{ username: 'u1', role: 'player' }],
    [{ id: 'lg1', status: 'finished' }],
    [leagueParticipation]
  );
  assert.equal(aStats.totalParticipations, 1);
  assert.equal(aStats.topDecksGlobal.length, 2);
  assert.equal(aStats.colorDistributionGlobal.length, 3);
});
