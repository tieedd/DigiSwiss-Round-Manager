import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildLeagueRoundExportFileName,
  buildLeagueRoundPairingExportData,
  buildLeagueRoundStandingsExportData,
  buildLeagueTopCutBracketExportData,
  buildWaitingMatchesList,
  canShowRoundScores,
  escapeCsvCell,
  formatWaitingMatchesReminderText,
  generateLeagueRoundPairingText,
  generateLeagueRoundStandingCsv,
  generateLeagueRoundStandingText,
  generateLeagueTopCutBracketText,
} from '../utils/roundExportLogic.ts';
import {
  generateStandingsCsv,
  generateStandingsText,
} from '../utils/deckExportLogic.ts';

const baseLeagueTournament = {
  id: 'lg_bjm_1',
  name: 'DCG Banjarmasin',
  date: '2026-11-21',
  location: 'Banjarmasin, "Gedung" A',
  organizerName: 'Komunitas, BJM',
  format: 'BO3',
  type: 'league',
  season: { number: 1, month: 11, year: 2026 },
  totalRounds: 3,
};

const sampleDecksA = [
  { name: 'WarGreymon OTK', colors: ['Merah', 'Hitam'] },
  { name: 'MirageGaogamon', colors: ['Biru'] },
];
const sampleDecksB = [
  { name: 'ShineGreymon', colors: ['Kuning', 'Merah'] },
  { name: 'Imperialdramon', colors: ['Biru', 'Hijau'] },
];

test('ROUND EXPORT 1: Penamaan berkas ekspor per ronde mengandung nama liga, season, dan jenis', () => {
  assert.equal(
    buildLeagueRoundExportFileName(baseLeagueTournament, 'Ronde 2', 'Pairing', 'png'),
    'DCG-Banjarmasin_SEASON-1-NOVEMBER-2026_Ronde-2_Pairing.png'
  );
  assert.equal(
    buildLeagueRoundExportFileName(baseLeagueTournament, 'Ronde 2', 'Standing', 'csv'),
    'DCG-Banjarmasin_SEASON-1-NOVEMBER-2026_Ronde-2_Standing.csv'
  );
  assert.equal(
    buildLeagueRoundExportFileName(baseLeagueTournament, 'Top 8', 'Bracket', 'png'),
    'DCG-Banjarmasin_SEASON-1-NOVEMBER-2026_Top-8_Bracket.png'
  );
});

test('ROUND EXPORT 2: Standing Saat Ini (Sementara vs Setelah Ronde X, Drop tetap tampil, Top Cut diabaikan, CSV aman koma/kutip)', () => {
  const players = [
    { id: 'p1', name: 'Taichi "Tai", Yagami', status: 'accepted', manual: false, uid: 'u1', joinedAt: 1 },
    { id: 'p2', name: 'Yamato', status: 'dropped', manual: false, uid: 'u2', joinedAt: 2 },
    { id: 'p3', name: 'Sora', status: 'accepted', manual: false, uid: 'u3', joinedAt: 3 },
    { id: 'p4', name: 'Koushiro', status: 'accepted', manual: false, uid: 'u4', joinedAt: 4 },
  ];

  // Ronde 1 selesai, Ronde 2 masih berjalan (1 awaiting), plus ada match Top Cut yang harus diabaikan
  const matches = [
    {
      id: 'r1_m1', round: 1, stage: 'swiss', table: 1,
      p1Id: 'p1', p2Id: 'p2', p1Name: 'Taichi "Tai", Yagami', p2Name: 'Yamato',
      p1Score: 2, p2Score: 0, status: 'confirmed', updatedAt: 10,
    },
    {
      id: 'r1_m2', round: 1, stage: 'swiss', table: 2,
      p1Id: 'p3', p2Id: 'p4', p1Name: 'Sora', p2Name: 'Koushiro',
      p1Score: 2, p2Score: 1, status: 'confirmed', updatedAt: 10,
    },
    {
      id: 'r2_m1', round: 2, stage: 'swiss', table: 1,
      p1Id: 'p1', p2Id: 'p3', p1Name: 'Taichi "Tai", Yagami', p2Name: 'Sora',
      p1Score: 2, p2Score: 0, status: 'confirmed', updatedAt: 20,
    },
    {
      id: 'r2_m2', round: 2, stage: 'swiss', table: 2,
      p1Id: 'p4', p2Id: null, p1Name: 'Koushiro', p2Name: 'BYE',
      p1Score: 2, p2Score: 0, status: 'awaiting', updatedAt: 20,
    },
    // Top cut match yang harus diabaikan pada perhitungan Standing Swiss
    {
      id: 'tc_m1', round: 4, stage: 'topcut', table: 1,
      p1Id: 'p3', p2Id: 'p1', p1Name: 'Sora', p2Name: 'Taichi "Tai", Yagami',
      p1Score: 2, p2Score: 0, status: 'confirmed', updatedAt: 30,
    },
  ];

  // Saat Ronde 2 belum semua confirmed -> judul Sementara
  const provisional = buildLeagueRoundStandingsExportData(baseLeagueTournament, players, matches, 2);
  assert.equal(provisional.isAllConfirmed, false);
  assert.equal(provisional.roundTitle, 'Sementara (Ronde 2 berjalan)');

  // Taichi punya 2 kemenangan confirmed (3 + 3 = 6 poin) — Top Cut tidak dihitung!
  const taichiRow = provisional.rows.find((r) => r.playerId === 'p1');
  assert.equal(taichiRow.points, 6);
  assert.equal(taichiRow.matchWins, 2);

  // Yamato yang drop tetap muncul dengan status Drop
  const yamatoRow = provisional.rows.find((r) => r.playerId === 'p2');
  assert.ok(yamatoRow);
  assert.equal(yamatoRow.isDropped, true);

  const text = generateLeagueRoundStandingText(provisional);
  assert.ok(text.includes('SEASON 1 NOVEMBER 2026'));
  assert.ok(text.includes('Sementara (Ronde 2 berjalan)'));
  assert.ok(text.includes('Yamato (Drop)'));

  const csv = generateLeagueRoundStandingCsv(provisional);
  assert.ok(csv.includes('"Komunitas, BJM"'));
  assert.ok(csv.includes('"Banjarmasin, ""Gedung"" A"'));
  assert.ok(csv.includes('"Taichi ""Tai"", Yagami"'));
  assert.ok(csv.includes('"Yamato (Drop)","Drop"'));

  // Escape helper langsung
  assert.equal(escapeCsvCell('a, "b"'), '"a, ""b"""');

  // Setelah Ronde 2 seluruhnya confirmed -> judul "Setelah Ronde 2"
  const completedMatches = matches.map((m) =>
    m.id === 'r2_m2' ? { ...m, status: 'confirmed' } : m
  );
  const completed = buildLeagueRoundStandingsExportData(baseLeagueTournament, players, completedMatches, 2);
  assert.equal(completed.isAllConfirmed, true);
  assert.equal(completed.roundTitle, 'Setelah Ronde 2');
});

test('ROUND EXPORT 3: Pairing Ronde X menyembunyikan skor bila ada 1 match belum confirmed, mendukung BYE & match lama tanpa deck', () => {
  const round2Incomplete = [
    {
      id: 'm1', round: 2, stage: 'swiss', table: 1,
      p1Id: 'p1', p2Id: 'p2', p1Name: 'Taichi', p2Name: 'Yamato',
      p1Decks: sampleDecksA, p2Decks: sampleDecksB,
      p1Score: 2, p2Score: 1, status: 'confirmed', updatedAt: 1,
    },
    {
      id: 'm2', round: 2, stage: 'swiss', table: 2,
      p1Id: 'p3', p2Id: 'p4', p1Name: 'Sora', p2Name: 'Koushiro',
      // match lama tanpa p1Decks / p2Decks
      p1Score: 1, p2Score: 2, status: 'awaiting', updatedAt: 2,
    },
    {
      id: 'm3', round: 2, stage: 'swiss', table: 3,
      p1Id: 'p5', p2Id: null, p1Name: 'Mimi', p2Name: 'BYE',
      p1Decks: sampleDecksA,
      p1Score: 2, p2Score: 0, status: 'confirmed', updatedAt: 3,
    },
  ];

  assert.equal(canShowRoundScores(round2Incomplete), false);
  const hiddenData = buildLeagueRoundPairingExportData(baseLeagueTournament, 2, round2Incomplete);
  assert.equal(hiddenData.showScores, false);
  assert.equal(hiddenData.rows[0].p1Score, null);
  assert.equal(hiddenData.rows[0].p2Score, null);
  assert.equal(hiddenData.rows[0].winner, null);
  // Match lama tanpa deck tetap aman
  assert.deepEqual(hiddenData.rows[1].p1Decks, []);
  assert.deepEqual(hiddenData.rows[1].p2Decks, []);
  // BYE
  assert.equal(hiddenData.rows[2].isBye, true);
  assert.equal(hiddenData.rows[2].p2Name, 'BYE');

  const hiddenText = generateLeagueRoundPairingText(hiddenData);
  assert.ok(!hiddenText.includes('2 - 1'));
  assert.ok(!hiddenText.includes('1 - 2'));
  assert.ok(!hiddenText.includes('[Menang]'));
  assert.ok(hiddenText.includes('Meja 1: Taichi (WarGreymon OTK 🔴⚫ & MirageGaogamon 🔵) VS Yamato'));
  assert.ok(hiddenText.includes('Meja 2: Sora VS Koushiro'));
  assert.ok(hiddenText.includes('Meja 3: Mimi (WarGreymon OTK 🔴⚫ & MirageGaogamon 🔵) VS BYE'));

  // Sekarang seluruh match ronde 2 confirmed -> skor & pemenang tampil
  const round2Done = round2Incomplete.map((m) =>
    m.id === 'm2' ? { ...m, status: 'confirmed' } : m
  );
  const shownData = buildLeagueRoundPairingExportData(baseLeagueTournament, 2, round2Done);
  assert.equal(shownData.showScores, true);
  assert.equal(shownData.rows[0].p1Score, 2);
  assert.equal(shownData.rows[0].p2Score, 1);
  assert.equal(shownData.rows[0].winner, 'p1');
  assert.equal(shownData.rows[1].winner, 'p2');

  const shownText = generateLeagueRoundPairingText(shownData);
  assert.ok(shownText.includes('(2 - 1)'));
  assert.ok(shownText.includes('(1 - 2)'));
  assert.ok(shownText.includes('[Menang]'));
});

test('ROUND EXPORT 4: Bracket Top Cut (Top 4 & Top 8), skor per babak, slot kosong, hanya peserta Top Cut, & Juara Final', () => {
  const top4Tournament = {
    ...baseLeagueTournament,
    totalRounds: 3,
    topCut: {
      size: 4,
      startedAt: 100,
      seeds: [
        { playerId: 'p1', name: 'Taichi', swissRank: 1 },
        { playerId: 'p2', name: 'Yamato', swissRank: 2 },
        { playerId: 'p3', name: 'Sora', swissRank: 3 },
        { playerId: 'p4', name: 'Koushiro', swissRank: 4 },
      ],
    },
  };

  // Peserta non-Top-Cut ('p5') hanya main di Swiss ronde 1..3, tidak boleh masuk bracket
  const matchesPartialSf = [
    {
      id: 'swiss_non_tc', round: 1, stage: 'swiss', table: 1,
      p1Id: 'p5', p2Id: 'p6', p1Name: 'JoeNonTopCut', p2Name: 'TakeruNonTopCut',
      p1Score: 2, p2Score: 0, status: 'confirmed', updatedAt: 1,
    },
    {
      id: 'sf1', round: 4, stage: 'topcut', table: 1,
      p1Id: 'p1', p2Id: 'p4', p1Name: 'Taichi', p2Name: 'Koushiro',
      p1Decks: sampleDecksA, p2Decks: sampleDecksB,
      p1Score: 2, p2Score: 0, status: 'confirmed', updatedAt: 10,
    },
    {
      id: 'sf2', round: 4, stage: 'topcut', table: 2,
      p1Id: 'p2', p2Id: 'p3', p1Name: 'Yamato', p2Name: 'Sora',
      p1Decks: sampleDecksB, p2Decks: sampleDecksA,
      p1Score: 2, p2Score: 1, status: 'awaiting', updatedAt: 11,
    },
  ];

  const partialBracket = buildLeagueTopCutBracketExportData(top4Tournament, matchesPartialSf);
  assert.equal(partialBracket.topCutSize, 4);
  assert.equal(partialBracket.stages.length, 2);
  assert.equal(partialBracket.stages[0].label, 'Semifinal');
  // Karena sf2 masih awaiting, Semifinal tidak boleh menampilkan skor / pemenang sama sekali (termasuk sf1!)
  assert.equal(partialBracket.stages[0].showScores, false);
  assert.equal(partialBracket.stages[0].slots[0].p1Score, null);
  assert.equal(partialBracket.stages[0].slots[0].winner, null);
  assert.equal(partialBracket.stages[0].slots[0].p1Seed, 1);
  assert.equal(partialBracket.stages[0].slots[0].p2Seed, 4);
  // Babak Final belum dibuat -> Slot Kosong
  assert.equal(partialBracket.stages[1].label, 'Final');
  assert.equal(partialBracket.stages[1].slots[0].isPlaceholder, true);
  assert.equal(partialBracket.champion, null);

  const partialText = generateLeagueTopCutBracketText(partialBracket);
  assert.ok(!partialText.includes('JoeNonTopCut'));
  assert.ok(!partialText.includes('TakeruNonTopCut'));
  assert.ok(!partialText.includes('(2 - 0)'));
  assert.ok(partialText.includes('Slot Kosong'));

  // Setelah Semifinal dan Final selesai semua
  const matchesFinalDone = [
    ...matchesPartialSf.map((m) => (m.id === 'sf2' ? { ...m, status: 'confirmed' } : m)),
    {
      id: 'fin1', round: 5, stage: 'topcut', table: 1,
      p1Id: 'p1', p2Id: 'p2', p1Name: 'Taichi', p2Name: 'Yamato',
      p1Decks: sampleDecksA, p2Decks: sampleDecksB,
      p1Score: 2, p2Score: 1, status: 'confirmed', updatedAt: 20,
    },
  ];

  const finalBracket = buildLeagueTopCutBracketExportData(top4Tournament, matchesFinalDone);
  assert.equal(finalBracket.stages[0].showScores, true);
  assert.equal(finalBracket.stages[1].showScores, true);
  assert.equal(finalBracket.champion?.playerId, 'p1');
  assert.equal(finalBracket.champion?.seedNumber, 1);

  const finalText = generateLeagueTopCutBracketText(finalBracket);
  assert.ok(finalText.includes('🏆 JUARA: #1 Taichi'));
  assert.ok(finalText.includes('[Juara]'));

  // Cek Top 8 membentuk 3 babak: Perempat Final (4 slot), Semifinal (2 slot), Final (1 slot)
  const top8Tournament = {
    ...baseLeagueTournament,
    totalRounds: 4,
    topCut: {
      size: 8,
      startedAt: 100,
      seeds: Array.from({ length: 8 }, (_, idx) => ({
        playerId: `p${idx + 1}`,
        name: `Pemain ${idx + 1}`,
        swissRank: idx + 1,
      })),
    },
  };
  const top8Empty = buildLeagueTopCutBracketExportData(top8Tournament, []);
  assert.deepEqual(
    top8Empty.stages.map((s) => [s.label, s.slots.length]),
    [
      ['Perempat Final', 4],
      ['Semifinal', 2],
      ['Final', 1],
    ]
  );
});

test('ROUND EXPORT 5: Daftar Menunggu & teks pengingat ringkas', () => {
  const matches = [
    { id: 'm1', round: 2, table: 1, p1Id: 'p1', p2Id: 'p2', p1Name: 'A', p2Name: 'B', p1Score: 2, p2Score: 0, status: 'confirmed', updatedAt: 1 },
    { id: 'm2', round: 2, table: 3, p1Id: 'p3', p2Id: 'p4', p1Name: 'C', p2Name: 'D', p1Score: 1, p2Score: 1, status: 'disputed', updatedAt: 2 },
    { id: 'm3', round: 2, table: 2, p1Id: 'p5', p2Id: 'p6', p1Name: 'E', p2Name: 'F', p1Score: 2, p2Score: 1, status: 'awaiting', updatedAt: 3 },
    { id: 'm4', round: 2, table: 4, p1Id: 'p7', p2Id: 'p8', p1Name: 'G', p2Name: 'H', p1Score: 0, p2Score: 0, status: 'pending', updatedAt: 4 },
    { id: 'm5', round: 2, table: 5, p1Id: 'p9', p2Id: null, p1Name: 'I', p2Name: 'BYE', p1Score: 2, p2Score: 0, status: 'pending', updatedAt: 5 },
  ];

  const items = buildWaitingMatchesList(matches);
  assert.deepEqual(
    items.map((i) => ({ table: i.table, statusLabel: i.statusLabel })),
    [
      { table: 2, statusLabel: 'Menunggu konfirmasi' },
      { table: 3, statusLabel: 'Sengketa' },
      { table: 4, statusLabel: 'Belum ada input' },
    ]
  );

  const reminder = formatWaitingMatchesReminderText({
    tournamentName: 'DCG Banjarmasin',
    seasonLabel: 'SEASON 1 NOVEMBER 2026',
    roundLabel: 'Ronde 2',
    items,
  });
  assert.ok(reminder.includes('Menunggu 3 pertandingan (DCG Banjarmasin • SEASON 1 NOVEMBER 2026 • Ronde 2):'));
  assert.ok(reminder.includes('- Meja 2: E vs F (Menunggu konfirmasi)'));
  assert.ok(reminder.includes('- Meja 3: C vs D (Sengketa)'));
  assert.ok(reminder.includes('- Meja 4: G vs H (Belum ada input)'));
});

test('ROUND EXPORT 6: Hasil Akhir Liga memuat 2 bagian (Peringkat Akhir + Klasemen Swiss) dan reguler tetap sama', () => {
  const leagueParticipations = [
    {
      id: 'lg1_p2',
      tournamentId: 'lg1',
      tournamentName: 'DCG Banjarmasin',
      date: '2026-11-21',
      format: 'BO3',
      tournamentType: 'league',
      season: { number: 1, month: 11, year: 2026 },
      playerId: 'p2',
      uid: 'u2',
      organizerId: 'org1',
      name: 'Yamato',
      rank: 1,
      swissRank: 3,
      topCutResult: 'Juara',
      wins: 3,
      losses: 1,
      gamesWon: 7,
      gamesLost: 3,
      points: 9,
      omw: 64.5,
      gw: 70,
      ogw: 60,
      decks: sampleDecksB,
    },
    {
      id: 'lg1_p1',
      tournamentId: 'lg1',
      tournamentName: 'DCG Banjarmasin',
      date: '2026-11-21',
      format: 'BO3',
      tournamentType: 'league',
      season: { number: 1, month: 11, year: 2026 },
      playerId: 'p1',
      uid: 'u1',
      organizerId: 'org1',
      name: 'Taichi',
      rank: 2,
      swissRank: 1,
      topCutResult: 'Runner-up',
      wins: 4,
      losses: 0,
      gamesWon: 8,
      gamesLost: 1,
      points: 12,
      omw: 71.2,
      gw: 88.9,
      ogw: 66.7,
      decks: sampleDecksA,
    },
  ];

  const leagueText = generateStandingsText({
    tournamentName: 'DCG Banjarmasin',
    tournamentDate: '2026-11-21',
    format: 'BO3',
    participations: leagueParticipations,
    organizerName: 'Komunitas BJM',
    location: 'Banjarmasin',
    seasonLabel: 'SEASON 1 NOVEMBER 2026',
    isLeague: true,
  });

  assert.ok(leagueText.includes('--- PERINGKAT AKHIR ---'));
  assert.ok(leagueText.includes('--- KLASEMEN SWISS (SEBELUM TOP CUT) ---'));
  // Pada Klasemen Swiss, Taichi (swissRank 1) muncul sebelum Yamato (swissRank 3)
  const swissSection = leagueText.split('--- KLASEMEN SWISS (SEBELUM TOP CUT) ---')[1];
  assert.ok(swissSection.indexOf('#1 Taichi') < swissSection.indexOf('#3 Yamato'));
  assert.ok(swissSection.includes('OMW: 71.20%'));

  const leagueCsv = generateStandingsCsv('DCG Banjarmasin', leagueParticipations, {
    seasonLabel: 'SEASON 1 NOVEMBER 2026',
    isLeague: true,
  });
  assert.ok(leagueCsv.includes('"Peringkat Akhir"'));
  assert.ok(leagueCsv.includes('"Klasemen Swiss (sebelum Top Cut)"'));
  assert.ok(leagueCsv.includes('"Peringkat Swiss","Nama Pemain","Poin","W-L","OMW%"'));

  // Pastikan reguler tidak memiliki 2 bagian Liga
  const regularParticipations = [
    {
      id: 'reg1_p1',
      tournamentId: 'reg1',
      tournamentName: 'Weekly Cup',
      date: '2026-11-21',
      format: 'BO1',
      tournamentType: 'regular',
      playerId: 'p1',
      uid: 'u1',
      organizerId: 'org1',
      name: 'Taichi',
      rank: 1,
      wins: 3,
      losses: 0,
      gamesWon: 3,
      gamesLost: 0,
      points: 9,
      omw: 66.7,
      gw: 100,
      ogw: 60,
      deckName: 'Greymon',
      deckColors: ['Merah'],
    },
  ];

  const regText = generateStandingsText({
    tournamentName: 'Weekly Cup',
    tournamentDate: '2026-11-21',
    format: 'BO1',
    participations: regularParticipations,
    isLeague: false,
  });
  assert.ok(!regText.includes('KLASEMEN SWISS'));
  assert.ok(!regText.includes('PERINGKAT AKHIR'));

  const regCsv = generateStandingsCsv('Weekly Cup', regularParticipations, {
    isLeague: false,
  });
  assert.ok(!regCsv.includes('Klasemen Swiss'));
  assert.ok(!regCsv.includes('Peringkat Akhir'));
});
