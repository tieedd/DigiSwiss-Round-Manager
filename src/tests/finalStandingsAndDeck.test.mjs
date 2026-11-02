import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildFinalStandingsRows,
  countUnfilledDecks,
  buildDeckHistoryOptions,
  validatePlayerDeckInput
} from '../utils/finalStandingsLogic.ts';

test('TES DECK: Validasi masukan deck (nama kosong, terlalu panjang, tanpa warna, warna tidak dikenal)', () => {
  // Nama kosong
  assert.equal(validatePlayerDeckInput('', ['Merah']).valid, false);
  assert.equal(validatePlayerDeckInput('   ', ['Merah']).valid, false);

  // Nama lebih dari 40 karakter
  const longName = 'A'.repeat(41);
  assert.equal(validatePlayerDeckInput(longName, ['Merah']).valid, false);

  // Tanpa warna
  assert.equal(validatePlayerDeckInput('WarGreymon', []).valid, false);

  // Lebih dari 7 warna
  assert.equal(
    validatePlayerDeckInput('Rainbow', [
      'Merah', 'Biru', 'Kuning', 'Hijau', 'Hitam', 'Ungu', 'Putih', 'Extra'
    ]).valid,
    false
  );

  // Warna tidak dikenal
  assert.equal(validatePlayerDeckInput('WarGreymon', ['Oranye']).valid, false);

  // Valid (1 sampai 40 karakter, warna resmi)
  assert.equal(validatePlayerDeckInput('WarGreymon OTK', ['Merah', 'Hitam']).valid, true);
  assert.equal(validatePlayerDeckInput('MirageGaogamon', ['Biru']).valid, true);
  assert.equal(validatePlayerDeckInput('A', ['Putih']).valid, true);
});

test('TES DECK: buildDeckHistoryOptions menghasilkan opsi unik dengan urutan terbaru di atas', () => {
  const dummyParticipations = [
    {
      id: 'p1',
      deckName: 'WarGreymon OTK',
      deckColors: ['Merah', 'Hitam'],
      createdAt: 1000
    },
    {
      id: 'p2',
      deckName: 'MirageGaogamon',
      deckColors: ['Biru'],
      createdAt: 2000
    },
    {
      id: 'p3',
      deckName: 'wargreymon otk', // Duplikat nama case-insensitive
      deckColors: ['Merah'],
      createdAt: 3000 // Lebih baru dari p1
    },
    {
      id: 'p4',
      deckName: '', // Kosong, diabaikan
      deckColors: [],
      createdAt: 4000
    }
  ];

  const options = buildDeckHistoryOptions(dummyParticipations);

  // Harus ada 2 opsi unik
  assert.equal(options.length, 2);

  // Yang terbaru (createdAt: 3000) harus muncul pertama
  assert.equal(options[0].deckName.toLowerCase(), 'wargreymon otk');
  assert.equal(options[1].deckName, 'MirageGaogamon');
});

test('TES DECK: countUnfilledDecks menghitung partisipasi dengan nama deck kosong', () => {
  const dummyParticipations = [
    { id: '1', uid: 'userA', deckName: 'Imperialdramon' },
    { id: '2', uid: 'userA', deckName: '' },
    { id: '3', uid: 'userA', deckName: '   ' },
    { id: '4', uid: 'userA' }, // deckName undefined
    { id: '5', uid: 'userB', deckName: '' } // Beda user
  ];

  // Untuk userA, ada 3 yang belum diisi (id 2, 3, 4)
  assert.equal(countUnfilledDecks(dummyParticipations, 'userA'), 3);

  // Untuk userB, ada 1
  assert.equal(countUnfilledDecks(dummyParticipations, 'userB'), 1);

  // Total global
  assert.equal(countUnfilledDecks(dummyParticipations), 4);
});

test('TES KLASEMEN AKHIR: buildFinalStandingsRows mengurutkan rank dan menandai isMe, isTop3, isDropped', () => {
  const rawParticipations = [
    {
      id: 'part_4',
      rank: 4,
      name: 'Yamato',
      uid: 'user_yamato',
      wins: 2,
      losses: 2,
      points: 6,
      omw: 45.0,
      gw: 50.0,
      ogw: 48.0,
      deckName: 'Garurumon',
      deckColors: ['Biru'],
      isDropped: true
    },
    {
      id: 'part_1',
      rank: 1,
      name: 'Taichi',
      uid: 'user_taichi',
      wins: 4,
      losses: 0,
      points: 12,
      omw: 65.5,
      gw: 80.0,
      ogw: 60.0,
      deckName: 'WarGreymon',
      deckColors: ['Merah']
    },
    {
      id: 'part_2',
      rank: 2,
      name: 'Koushiro',
      uid: 'user_koushiro',
      wins: 3,
      losses: 1,
      points: 9,
      omw: 55.0,
      gw: 66.7,
      ogw: 52.0,
      deckName: '', // Tanpa deck
      deckColors: []
    },
    {
      id: 'part_3',
      rank: 3,
      name: 'Mimi',
      uid: null, // Peserta manual
      wins: 3,
      losses: 1,
      points: 9,
      omw: 50.0,
      gw: 60.0,
      ogw: 50.0,
      deckName: 'Rosemon',
      deckColors: ['Hijau']
    }
  ];

  const rows = buildFinalStandingsRows(rawParticipations, 'user_yamato');

  // Urutan harus terurut berdasarkan rank ascending: 1, 2, 3, 4
  assert.equal(rows[0].rank, 1);
  assert.equal(rows[0].name, 'Taichi');
  assert.equal(rows[0].isTop3, true);
  assert.equal(rows[0].isMe, false);

  assert.equal(rows[1].rank, 2);
  assert.equal(rows[1].name, 'Koushiro');
  assert.equal(rows[1].isTop3, true);
  assert.equal(rows[1].deckName, ''); // Data tanpa deck ditangani dengan aman

  assert.equal(rows[2].rank, 3);
  assert.equal(rows[2].name, 'Mimi');
  assert.equal(rows[2].isTop3, true);
  assert.equal(rows[2].uid, null); // Peserta manual

  assert.equal(rows[3].rank, 4);
  assert.equal(rows[3].name, 'Yamato');
  assert.equal(rows[3].isTop3, false);
  assert.equal(rows[3].isMe, true); // Ditandai isMe
  assert.equal(rows[3].isDropped, true); // Ditandai isDropped
});
