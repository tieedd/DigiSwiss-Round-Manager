import test from 'node:test';
import assert from 'node:assert/strict';
import {
  MAX_LEAGUE_DECK_NAME_LENGTH,
  validateSingleLeagueDeck,
  validateLeagueDecksSubmission,
  hasValidTwoLeagueDecks,
  getPlayersWithIncompleteLeagueDecks,
  validateLeagueStartRequirements,
  formatLeagueDecksAuditSummary,
} from '../utils/leagueDeckLogic.ts';

test('LEAGUE DECK 1: validateSingleLeagueDeck memvalidasi nama (1-40 karakter) dan minimal 1 warna resmi', () => {
  assert.equal(validateSingleLeagueDeck({ name: '   ', colors: ['Merah'] }, 'Deck 1').valid, false);
  assert.equal(
    validateSingleLeagueDeck(
      { name: 'A'.repeat(MAX_LEAGUE_DECK_NAME_LENGTH + 1), colors: ['Biru'] },
      'Deck 1'
    ).valid,
    false
  );
  assert.equal(validateSingleLeagueDeck({ name: 'WarGreymon', colors: [] }, 'Deck 1').valid, false);

  const invalidColorRes = validateSingleLeagueDeck(
    { name: 'WarGreymon', colors: ['Silver'] },
    'Deck 1'
  );
  assert.equal(invalidColorRes.valid, false);

  const ok = validateSingleLeagueDeck(
    { name: '  WarGreymon OTK  ', colors: ['Merah', 'Hitam', 'Merah'] },
    'Deck 1'
  );
  assert.equal(ok.valid, true);
  assert.equal(ok.sanitized?.name, 'WarGreymon OTK');
  assert.deepEqual(ok.sanitized?.colors, ['Merah', 'Hitam']);
});

test('LEAGUE DECK 2: validateLeagueDecksSubmission menolak jika nama Deck 1 dan Deck 2 sama (case-insensitive)', () => {
  const duplicateNameRes = validateLeagueDecksSubmission(
    { name: 'MirageGaogamon', colors: ['Biru'] },
    { name: '  miragegaogamon  ', colors: ['Biru', 'Kuning'] }
  );
  assert.equal(duplicateNameRes.valid, false);
  assert.match(duplicateNameRes.error || '', /tidak boleh sama/i);

  const validRes = validateLeagueDecksSubmission(
    { name: 'WarGreymon', colors: ['Merah'] },
    { name: 'MirageGaogamon', colors: ['Biru'] }
  );
  assert.equal(validRes.valid, true);
  assert.equal(validRes.sanitized?.length, 2);
});

test('LEAGUE DECK 3: hasValidTwoLeagueDecks dan getPlayersWithIncompleteLeagueDecks menyaring peserta accepted termasuk manual', () => {
  const players = [
    { id: 'u1', name: 'Andi', uid: 'u1', manual: false, status: 'accepted' },
    { id: 'manual_1', name: 'Budi (Manual)', uid: null, manual: true, status: 'accepted' },
    { id: 'u2', name: 'Citra', uid: 'u2', manual: false, status: 'accepted' },
    { id: 'u3', name: 'Dodi', uid: 'u3', manual: false, status: 'rejected' },
  ];

  const deckMap = new Map([
    [
      'u1',
      {
        decks: [
          { name: 'Red Hybrid', colors: ['Merah'] },
          { name: 'Blue Flare', colors: ['Biru'] },
        ],
        revealedTo: [],
        updatedAt: 1000,
      },
    ],
    [
      'manual_1',
      {
        decks: [
          { name: 'Imperialdramon', colors: ['Biru', 'Hijau'] },
          { name: 'Imperialdramon', colors: ['Biru'] }, // invalid karena duplikat
        ],
        revealedTo: [],
        updatedAt: 1000,
      },
    ],
  ]);

  assert.equal(hasValidTwoLeagueDecks(deckMap.get('u1')), true);
  assert.equal(hasValidTwoLeagueDecks(deckMap.get('manual_1')), false);
  assert.equal(hasValidTwoLeagueDecks(null), false);

  const incomplete = getPlayersWithIncompleteLeagueDecks(players, deckMap);
  assert.deepEqual(
    incomplete.map((p) => p.name),
    ['Budi (Manual)', 'Citra']
  );
});

test('LEAGUE DECK 4: validateLeagueStartRequirements memblokir mulai liga jika < 4 peserta atau ada yang belum isi 2 deck', () => {
  const threePlayers = [
    { id: 'u1', name: 'Andi', uid: 'u1', manual: false, status: 'accepted' },
    { id: 'u2', name: 'Budi', uid: 'u2', manual: false, status: 'accepted' },
    { id: 'u3', name: 'Citra', uid: 'u3', manual: false, status: 'accepted' },
  ];
  const validDecks = {
    decks: [
      { name: 'Deck A', colors: ['Merah'] },
      { name: 'Deck B', colors: ['Biru'] },
    ],
    revealedTo: [],
    updatedAt: 1000,
  };

  const resUnder4 = validateLeagueStartRequirements(threePlayers, {
    u1: validDecks,
    u2: validDecks,
    u3: validDecks,
  });
  assert.equal(resUnder4.canStart, false);
  assert.match(resUnder4.errorMessage || '', /Minimal 4 peserta accepted/i);

  const fourPlayers = [
    ...threePlayers,
    { id: 'manual_4', name: 'Dina', uid: null, manual: true, status: 'accepted' },
  ];
  const resMissingOne = validateLeagueStartRequirements(fourPlayers, {
    u1: validDecks,
    u2: validDecks,
    u3: validDecks,
  });
  assert.equal(resMissingOne.canStart, false);
  assert.deepEqual(
    resMissingOne.missingDeckPlayers.map((p) => p.name),
    ['Dina']
  );
  assert.match(resMissingOne.errorMessage || '', /Dina/);

  const resAllReady = validateLeagueStartRequirements(fourPlayers, {
    u1: validDecks,
    u2: validDecks,
    u3: validDecks,
    manual_4: validDecks,
  });
  assert.equal(resAllReady.canStart, true);
  assert.equal(resAllReady.missingDeckPlayers.length, 0);
});

test('LEAGUE DECK 5: formatLeagueDecksAuditSummary merangkum nilai lama/baru untuk audit log', () => {
  assert.equal(formatLeagueDecksAuditSummary(null), 'Belum isi deck');
  const summary = formatLeagueDecksAuditSummary({
    decks: [
      { name: 'Gallantmon', colors: ['Merah'] },
      { name: 'Beelzemon', colors: ['Ungu', 'Hitam'] },
    ],
  });
  assert.equal(
    summary,
    'Deck 1: Gallantmon [Merah] | Deck 2: Beelzemon [Ungu/Hitam]'
  );
});
