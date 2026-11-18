import test from 'node:test';
import assert from 'node:assert/strict';
import {
  attachLeagueDecksToPairingDrafts,
  buildMatchAuditLogValues,
  createInitialDraftGames,
  deriveMatchScoresFromGames,
  formatMatchGamesAuditSummary,
  getVisibleDraftGames,
  isLeaguePerGameMatch,
  isMatchGamesFormComplete,
  needsGame3,
  toSubmittedMatchGames,
  validateMatchGames,
} from '../utils/matchGamesLogic.ts';
import { calculateMatchPoints } from '../utils/standingsLogic.ts';

const P1_DECKS = [
  { name: 'WarGreymon OTK', colors: ['Merah'] },
  { name: 'BlackWarGreymon', colors: ['Hitam', 'Merah'] },
];

const P2_DECKS = [
  { name: 'MirageGaogamon', colors: ['Biru'] },
  { name: 'ShineGreymon', colors: ['Kuning', 'Merah'] },
];

test('MATCH GAMES 1: 2-0 dan 0-2 tanpa Game 3 valid, Game 3 tersembunyi & tidak ikut terkirim', () => {
  assert.equal(needsGame3('p1', 'p1'), false);
  assert.equal(needsGame3('p2', 'p2'), false);
  assert.equal(needsGame3('p1', null), false);

  // Simulasikan slot ke-3 sempat terisi lalu Game 2 diubah menjadi 2-0
  const drafts = [
    { winner: 'p1', p1Deck: 0, p2Deck: 1 },
    { winner: 'p1', p1Deck: 0, p2Deck: 1 },
    { winner: 'p2', p1Deck: 1, p2Deck: 0 },
  ];

  const visible = getVisibleDraftGames(drafts);
  assert.equal(visible.length, 2);
  assert.equal(isMatchGamesFormComplete(drafts), true);

  const submitted20 = toSubmittedMatchGames(drafts);
  assert.equal(submitted20.length, 2);
  assert.deepEqual(deriveMatchScoresFromGames(submitted20), { p1Score: 2, p2Score: 0 });

  const validation20 = validateMatchGames(submitted20, P1_DECKS, P2_DECKS);
  assert.equal(validation20.valid, true);
  assert.equal(validation20.p1Score, 2);
  assert.equal(validation20.p2Score, 0);

  // 0-2 juga valid dengan 2 game
  const submitted02 = [
    { winner: 'p2', p1Deck: 1, p2Deck: 0 },
    { winner: 'p2', p1Deck: 1, p2Deck: 0 },
  ];
  const validation02 = validateMatchGames(submitted02, P1_DECKS, P2_DECKS);
  assert.equal(validation02.valid, true);
  assert.equal(validation02.p1Score, 0);
  assert.equal(validation02.p2Score, 2);

  // Menolak jika Game 3 dipaksa dikirim pada skor 2-0
  const extraGameOn20 = validateMatchGames(drafts, P1_DECKS, P2_DECKS);
  assert.equal(extraGameOn20.valid, false);
});

test('MATCH GAMES 2: 2-1 dan 1-2 menampilkan Game 3 saat 1-1 dan menurunkan skor akhir', () => {
  assert.equal(needsGame3('p1', 'p2'), true);
  assert.equal(needsGame3('p2', 'p1'), true);

  const drafts21 = [
    { winner: 'p1', p1Deck: 0, p2Deck: 0 },
    { winner: 'p2', p1Deck: 0, p2Deck: 1 },
    { winner: 'p1', p1Deck: 1, p2Deck: 1 },
  ];
  assert.equal(getVisibleDraftGames(drafts21).length, 3);
  assert.equal(isMatchGamesFormComplete(drafts21), true);

  const submitted21 = toSubmittedMatchGames(drafts21);
  assert.equal(submitted21.length, 3);
  const val21 = validateMatchGames(submitted21, P1_DECKS, P2_DECKS);
  assert.equal(val21.valid, true);
  assert.equal(val21.p1Score, 2);
  assert.equal(val21.p2Score, 1);

  const submitted12 = [
    { winner: 'p2', p1Deck: 0, p2Deck: 0 },
    { winner: 'p1', p1Deck: 1, p2Deck: 0 },
    { winner: 'p2', p1Deck: 1, p2Deck: 1 },
  ];
  const val12 = validateMatchGames(submitted12, P1_DECKS, P2_DECKS);
  assert.equal(val12.valid, true);
  assert.equal(val12.p1Score, 1);
  assert.equal(val12.p2Score, 2);

  // Skor turunan kompatibel dengan perhitungan poin BO3 Swiss
  assert.equal(calculateMatchPoints('BO3', val21.p1Score, val21.p2Score, false), 2);
  assert.equal(calculateMatchPoints('BO3', val12.p1Score, val12.p2Score, false), 1);
});

test('MATCH GAMES 3: Game 1 mulai tanpa deck terpilih dan game belum lengkap ditolak', () => {
  const freshDrafts = createInitialDraftGames(null);
  assert.equal(freshDrafts[0].p1Deck, null);
  assert.equal(freshDrafts[0].p2Deck, null);
  assert.equal(freshDrafts[0].winner, null);
  assert.equal(isMatchGamesFormComplete(freshDrafts), false);

  // Game 1 lengkap, Game 2 belum pilih deck P2
  const missingDeckG2 = [
    { winner: 'p1', p1Deck: 0, p2Deck: 0 },
    { winner: 'p1', p1Deck: 0, p2Deck: null },
    { winner: null, p1Deck: null, p2Deck: null },
  ];
  assert.equal(isMatchGamesFormComplete(missingDeckG2), false);

  // 1-1 tapi Game 3 belum lengkap
  const incompleteG3 = [
    { winner: 'p1', p1Deck: 0, p2Deck: 0 },
    { winner: 'p2', p1Deck: 0, p2Deck: 0 },
    { winner: null, p1Deck: 0, p2Deck: 0 },
  ];
  assert.equal(isMatchGamesFormComplete(incompleteG3), false);

  // validateMatchGames menolak 1-1 tanpa Game 3
  const onlyTwoTied = validateMatchGames(
    [
      { winner: 'p1', p1Deck: 0, p2Deck: 0 },
      { winner: 'p2', p1Deck: 0, p2Deck: 0 },
    ],
    P1_DECKS,
    P2_DECKS
  );
  assert.equal(onlyTwoTied.valid, false);
});

test('MATCH GAMES 4: Indeks deck tidak valid ditolak', () => {
  const invalidP1Deck = validateMatchGames(
    [
      { winner: 'p1', p1Deck: 2, p2Deck: 0 },
      { winner: 'p1', p1Deck: 0, p2Deck: 0 },
    ],
    P1_DECKS,
    P2_DECKS
  );
  assert.equal(invalidP1Deck.valid, false);
  assert.match(invalidP1Deck.error || '', /Pemain 1/i);

  const invalidP2Deck = validateMatchGames(
    [
      { winner: 'p2', p1Deck: 0, p2Deck: -1 },
      { winner: 'p2', p1Deck: 0, p2Deck: 1 },
    ],
    P1_DECKS,
    P2_DECKS
  );
  assert.equal(invalidP2Deck.valid, false);
  assert.match(invalidP2Deck.error || '', /Pemain 2/i);

  const invalidWinner = validateMatchGames(
    [
      { winner: 'draw', p1Deck: 0, p2Deck: 0 },
      { winner: 'p1', p1Deck: 0, p2Deck: 0 },
    ],
    P1_DECKS,
    P2_DECKS
  );
  assert.equal(invalidWinner.valid, false);
});

test('MATCH GAMES 5: Snapshot deck pada match terisolasi dari perubahan deck berikutnya & BYE tanpa deck', () => {
  const deckMap = new Map([
    [
      'u1',
      {
        decks: [
          { name: 'WarGreymon OTK', colors: ['Merah'] },
          { name: 'BlackWarGreymon', colors: ['Hitam', 'Merah'] },
        ],
        revealedTo: [],
        updatedAt: 1000,
      },
    ],
    [
      'u2',
      {
        decks: [
          { name: 'MirageGaogamon', colors: ['Biru'] },
          { name: 'ShineGreymon', colors: ['Kuning'] },
        ],
        revealedTo: [],
        updatedAt: 1000,
      },
    ],
    [
      'u3',
      {
        decks: [
          { name: 'Beelzemon', colors: ['Ungu'] },
          { name: 'Mastemon', colors: ['Kuning', 'Ungu'] },
        ],
        revealedTo: [],
        updatedAt: 1000,
      },
    ],
  ]);

  const drafts = [
    { table: 1, p1Id: 'u1', p2Id: 'u2', p1Name: 'Andi', p2Name: 'Budi' },
    { table: 2, p1Id: 'u3', p2Id: null, p1Name: 'Citra', p2Name: 'BYE' },
  ];

  const enriched = attachLeagueDecksToPairingDrafts(drafts, deckMap);
  assert.equal(enriched.length, 2);

  // Match biasa punya snapshot p1Decks dan p2Decks
  assert.equal(isLeaguePerGameMatch(enriched[0]), true);
  assert.equal(enriched[0].p1Decks?.[0].name, 'WarGreymon OTK');
  assert.equal(enriched[0].p2Decks?.[1].name, 'ShineGreymon');

  // Match BYE tidak punya p1Decks/p2Decks
  assert.equal(isLeaguePerGameMatch(enriched[1]), false);
  assert.equal('p1Decks' in enriched[1], false);
  assert.equal('p2Decks' in enriched[1], false);

  // Ubah deck sumber setelah pairing dibuat (simulasi edit oleh organizer)
  const u1Doc = deckMap.get('u1');
  u1Doc.decks[0].name = 'Deck Baru Diubah';
  u1Doc.decks[0].colors.push('Kuning');

  // Snapshot pada match yang sudah dibuat TIDAK berubah
  assert.equal(enriched[0].p1Decks?.[0].name, 'WarGreymon OTK');
  assert.deepEqual(enriched[0].p1Decks?.[0].colors, ['Merah']);
});

test('MATCH GAMES 6: Pemain tanpa 2 deck valid membatalkan pembuatan ronde dengan menyebut nama pemainnya', () => {
  const deckMap = {
    u1: {
      decks: [
        { name: 'Deck 1', colors: ['Merah'] },
        { name: 'Deck 2', colors: ['Biru'] },
      ],
      revealedTo: [],
      updatedAt: 1000,
    },
    u2: {
      // Invalid: nama kosong & duplikat
      decks: [
        { name: 'Same', colors: ['Hijau'] },
        { name: 'same', colors: ['Hijau'] },
      ],
      revealedTo: [],
      updatedAt: 1000,
    },
    // u3 tidak punya dokumen deck sama sekali
  };

  assert.throws(
    () =>
      attachLeagueDecksToPairingDrafts(
        [
          { table: 1, p1Id: 'u1', p2Id: 'u2', p1Name: 'Andi', p2Name: 'Budi' },
          { table: 2, p1Id: 'u3', p2Id: 'u4', p1Name: 'Citra', p2Name: 'Dodi' },
        ],
        deckMap
      ),
    (err) => {
      assert.match(err.message, /Budi/);
      assert.match(err.message, /Citra/);
      assert.match(err.message, /Dodi/);
      assert.doesNotMatch(err.message, /Andi/);
      return true;
    }
  );
});

test('MATCH GAMES 7: Ringkasan audit log KOREKSI_SKOR_PERTANDINGAN menyertakan pemenang dan deck per game', () => {
  const games = [
    { winner: 'p1', p1Deck: 0, p2Deck: 0 },
    { winner: 'p2', p1Deck: 0, p2Deck: 1 },
    { winner: 'p1', p1Deck: 1, p2Deck: 1 },
  ];

  const summary = formatMatchGamesAuditSummary(games, 'Andi', 'Budi', P1_DECKS, P2_DECKS);
  assert.match(summary, /G1: Andi menang \(Andi: WarGreymon OTK vs Budi: MirageGaogamon\)/);
  assert.match(summary, /G2: Budi menang \(Andi: WarGreymon OTK vs Budi: ShineGreymon\)/);
  assert.match(summary, /G3: Andi menang \(Andi: BlackWarGreymon vs Budi: ShineGreymon\)/);

  const auditValues = buildMatchAuditLogValues(
    {
      p1Score: 0,
      p2Score: 0,
      status: 'pending',
      p1Name: 'Andi',
      p2Name: 'Budi',
      p1Decks: P1_DECKS,
      p2Decks: P2_DECKS,
    },
    2,
    1,
    games
  );

  assert.equal(auditValues.oldValue, '0 - 0 (pending)');
  assert.match(auditValues.newValue, /^2 - 1 \(confirmed\) \| G1:/);
});
