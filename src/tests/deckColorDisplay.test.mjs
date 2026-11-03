import test from 'node:test';
import assert from 'node:assert/strict';
import {
  OFFICIAL_DECK_COLORS,
  DECK_COLOR_HEX,
  DECK_COLOR_EMOJI,
  formatDeckColorsEmoji,
  getDeckColorLabel,
  getUsedDeckColors,
  truncateTextToWidth,
  generateStandingsText,
  generateStandingsCsv
} from '../utils/deckExportLogic.ts';

test('WARNA DECK 1: 7 warna resmi terdefinisi lengkap di DECK_COLOR_HEX dan DECK_COLOR_EMOJI', () => {
  assert.equal(OFFICIAL_DECK_COLORS.length, 7);

  // HEX
  assert.equal(DECK_COLOR_HEX.Merah, '#EF4444');
  assert.equal(DECK_COLOR_HEX.Biru, '#3B82F6');
  assert.equal(DECK_COLOR_HEX.Kuning, '#FACC15');
  assert.equal(DECK_COLOR_HEX.Hijau, '#10B981');
  assert.equal(DECK_COLOR_HEX.Hitam, '#18181B');
  assert.equal(DECK_COLOR_HEX.Ungu, '#A855F7');
  assert.equal(DECK_COLOR_HEX.Putih, '#F8FAFC');

  // EMOJI
  assert.equal(DECK_COLOR_EMOJI.Merah, '🔴');
  assert.equal(DECK_COLOR_EMOJI.Biru, '🔵');
  assert.equal(DECK_COLOR_EMOJI.Kuning, '🟡');
  assert.equal(DECK_COLOR_EMOJI.Hijau, '🟢');
  assert.equal(DECK_COLOR_EMOJI.Hitam, '⚫');
  assert.equal(DECK_COLOR_EMOJI.Ungu, '🟣');
  assert.equal(DECK_COLOR_EMOJI.Putih, '⚪');
});

test('WARNA DECK 2: formatDeckColorsEmoji mengembalikan emoji tanpa spasi dan menangani array kosong/null', () => {
  assert.equal(formatDeckColorsEmoji(['Hijau', 'Biru']), '🟢🔵');
  assert.equal(formatDeckColorsEmoji(['Merah']), '🔴');
  assert.equal(formatDeckColorsEmoji(['Merah', 'Kuning', 'Hitam']), '🔴🟡⚫');
  assert.equal(formatDeckColorsEmoji([]), '');
  assert.equal(formatDeckColorsEmoji(null), '');
  assert.equal(formatDeckColorsEmoji(undefined), '');
});

test('WARNA DECK 3: getDeckColorLabel mengembalikan string dipisahkan koma dan spasi', () => {
  assert.equal(getDeckColorLabel(['Hijau', 'Biru']), 'Hijau, Biru');
  assert.equal(getDeckColorLabel(['Merah']), 'Merah');
  assert.equal(getDeckColorLabel(['Putih', 'Ungu', 'Hitam']), 'Putih, Ungu, Hitam');
  assert.equal(getDeckColorLabel([]), '');
  assert.equal(getDeckColorLabel(null), '');
  assert.equal(getDeckColorLabel(undefined), '');
});

test('WARNA DECK 4: truncateTextToWidth memotong teks berdasarkan batas piksel dengan elipsis', () => {
  // Simulasi fungsi pengukur lebar: 1 karakter = 10px, '...' = 20px
  const fakeMeasure = (str) => (str.endsWith('...') ? (str.length - 3) * 10 + 20 : str.length * 10);

  // Jika teks <= maxWidth, tidak dipotong
  assert.equal(truncateTextToWidth(fakeMeasure, 'Mirage', 80), 'Mirage');

  // Jika melebihi maxWidth (100px), teks 'WarGreymon OTK' (140px) dipotong
  const truncated = truncateTextToWidth(fakeMeasure, 'WarGreymon OTK', 100);
  assert.ok(truncated.endsWith('...'));
  assert.ok(fakeMeasure(truncated) <= 100);
});

test('WARNA DECK 5: getUsedDeckColors mengumpulkan warna unik yang ada pada tabel hasil secara terurut', () => {
  const participations = [
    { rank: 1, deckName: 'D1', deckColors: ['Putih', 'Biru'] },
    { rank: 2, deckName: 'D2', deckColors: ['Hijau'] },
    { rank: 3, deckName: 'D3', deckColors: ['Biru'] },
    { rank: 4, deckName: 'D4', deckColors: [] }
  ];

  const used = getUsedDeckColors(participations);
  // Warna terurut sesuai urutan resmi OFFICIAL_DECK_COLORS: Biru, Hijau, Putih
  assert.deepEqual(used, ['Biru', 'Hijau', 'Putih']);
});

test('WARNA DECK 6: generateStandingsText tidak menggunakan tanda kurung siku [...] untuk warna dan menyertakan emoji', () => {
  const participations = [
    {
      id: 'p1',
      tournamentId: 't1',
      tournamentName: 'T1',
      date: '2026-11-03',
      format: 'Standard',
      playerId: 'pl1',
      uid: 'u1',
      organizerId: 'org1',
      name: 'Player One',
      rank: 1,
      wins: 3,
      losses: 0,
      gamesWon: 6,
      gamesLost: 1,
      points: 9,
      omw: 60,
      gw: 85,
      ogw: 58,
      deckName: 'Ambatron FTK',
      deckColors: ['Hijau', 'Biru']
    },
    {
      id: 'p2',
      tournamentId: 't1',
      tournamentName: 'T1',
      date: '2026-11-03',
      format: 'Standard',
      playerId: 'pl2',
      uid: 'u2',
      organizerId: 'org1',
      name: 'Player Two',
      rank: 2,
      wins: 2,
      losses: 1,
      gamesWon: 5,
      gamesLost: 3,
      points: 6,
      omw: 55,
      gw: 62,
      ogw: 52,
      deckName: '',
      deckColors: []
    }
  ];

  const text = generateStandingsText('Kejuaraan Toko', '03/11/2026', 'BO3', participations);

  // Harus memuat emoji warna tanpa kurung siku
  assert.ok(text.includes('Ambatron FTK 🟢🔵'));
  assert.ok(!text.includes('[Hijau/Biru]'));
  assert.ok(!text.includes('[Hijau, Biru]'));
  assert.ok(text.includes('Deck belum diisi'));
});

test('WARNA DECK 7: generateStandingsCsv mempertahankan format nama warna dengan garis miring', () => {
  const participations = [
    {
      id: 'p1',
      tournamentId: 't1',
      tournamentName: 'T1',
      date: '2026-11-03',
      format: 'Standard',
      playerId: 'pl1',
      uid: 'u1',
      organizerId: 'org1',
      name: 'Player One',
      rank: 1,
      wins: 3,
      losses: 0,
      gamesWon: 6,
      gamesLost: 1,
      points: 9,
      omw: 60,
      gw: 85,
      ogw: 58,
      deckName: 'Ambatron FTK',
      deckColors: ['Hijau', 'Biru']
    }
  ];

  const csv = generateStandingsCsv('Kejuaraan Toko', participations);
  assert.ok(csv.includes('"Hijau/Biru"'));
  assert.ok(!csv.includes('🟢🔵'));
});
