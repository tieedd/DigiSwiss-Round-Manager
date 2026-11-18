import test from 'node:test';
import assert from 'node:assert/strict';
import {
  LEAGUE_INVITE_ALPHABET,
  LEAGUE_INVITE_CODE_LENGTH,
  generateLeagueInviteCode,
  isValidLeagueInviteCodeFormat,
  normalizeLeagueInviteInput,
  formatLeagueInviteQrPayload,
  validateLeagueInviteForRegistration,
} from '../utils/leagueInviteLogic.ts';

test('INVITE 1: generateLeagueInviteCode menghasilkan kode 8 karakter tanpa karakter ambigu (0, O, 1, I, L)', () => {
  const ambiguousChars = ['0', 'O', '1', 'I', 'L'];
  for (const ch of ambiguousChars) {
    assert.equal(LEAGUE_INVITE_ALPHABET.includes(ch), false);
  }

  for (let i = 0; i < 50; i++) {
    const code = generateLeagueInviteCode();
    assert.equal(code.length, LEAGUE_INVITE_CODE_LENGTH);
    assert.equal(isValidLeagueInviteCodeFormat(code), true);
    for (const ch of ambiguousChars) {
      assert.equal(code.includes(ch), false, `Kode ${code} mengandung ${ch}`);
    }
  }
});

test('INVITE 2: isValidLeagueInviteCodeFormat menolak karakter ambigu, panjang salah, dan simbol', () => {
  assert.equal(isValidLeagueInviteCodeFormat('K7P9M2WX'), true);
  assert.equal(isValidLeagueInviteCodeFormat('k7p9m2wx'), true);
  assert.equal(isValidLeagueInviteCodeFormat('07P9M2WX'), false); // 0
  assert.equal(isValidLeagueInviteCodeFormat('O7P9M2WX'), false); // O
  assert.equal(isValidLeagueInviteCodeFormat('17P9M2WX'), false); // 1
  assert.equal(isValidLeagueInviteCodeFormat('I7P9M2WX'), false); // I
  assert.equal(isValidLeagueInviteCodeFormat('L7P9M2WX'), false); // L
  assert.equal(isValidLeagueInviteCodeFormat('K7P9M2W'), false); // < 8
  assert.equal(isValidLeagueInviteCodeFormat('K7P9M2WX9'), false); // > 8
  assert.equal(isValidLeagueInviteCodeFormat('K7P9-2WX'), false);
  assert.equal(isValidLeagueInviteCodeFormat(''), false);
  assert.equal(isValidLeagueInviteCodeFormat(null), false);
});

test('INVITE 3: normalizeLeagueInviteInput mendukung tempel teks QR digiswiss:liga:{KODE}, spasi, dan huruf kecil', () => {
  assert.equal(normalizeLeagueInviteInput('k7p9m2wx'), 'K7P9M2WX');
  assert.equal(normalizeLeagueInviteInput('  K7P9 M2WX  '), 'K7P9M2WX');
  assert.equal(normalizeLeagueInviteInput('digiswiss:liga:K7P9M2WX'), 'K7P9M2WX');
  assert.equal(normalizeLeagueInviteInput('DIGISWISS:LIGA: k7p9-m2wx '), 'K7P9M2WX');
  assert.equal(formatLeagueInviteQrPayload('k7p9m2wx'), 'digiswiss:liga:K7P9M2WX');
});

test('INVITE 4: validateLeagueInviteForRegistration menolak kode kosong, format invalid, tidak ditemukan, dan nonaktif', () => {
  const emptyRes = validateLeagueInviteForRegistration({
    rawCode: '   ',
    invite: null,
    tournament: null,
  });
  assert.equal(emptyRes.valid, false);

  const badFormatRes = validateLeagueInviteForRegistration({
    rawCode: 'O1IL0123',
    invite: null,
    tournament: null,
  });
  assert.equal(badFormatRes.valid, false);
  assert.match(badFormatRes.error || '', /8 huruf besar\/angka/);

  const notFoundRes = validateLeagueInviteForRegistration({
    rawCode: 'K7P9M2WX',
    invite: null,
    tournament: null,
  });
  assert.equal(notFoundRes.valid, false);
  assert.match(notFoundRes.error || '', /tidak ditemukan/i);

  const inactiveRes = validateLeagueInviteForRegistration({
    rawCode: 'K7P9M2WX',
    invite: {
      code: 'K7P9M2WX',
      tournamentId: 't_league',
      active: false,
    },
    tournament: {
      id: 't_league',
      type: 'league',
      status: 'registration',
    },
  });
  assert.equal(inactiveRes.valid, false);
  assert.match(inactiveRes.error || '', /dinonaktifkan/i);
});

test('INVITE 5: validateLeagueInviteForRegistration menolak turnamen sudah mulai/selesai atau bukan liga', () => {
  const runningRes = validateLeagueInviteForRegistration({
    rawCode: 'digiswiss:liga:K7P9M2WX',
    invite: { code: 'K7P9M2WX', tournamentId: 't1', active: true },
    tournament: { id: 't1', type: 'league', status: 'running' },
  });
  assert.equal(runningRes.valid, false);
  assert.match(runningRes.error || '', /sudah dimulai/i);

  const finishedRes = validateLeagueInviteForRegistration({
    rawCode: 'K7P9M2WX',
    invite: { code: 'K7P9M2WX', tournamentId: 't1', active: true },
    tournament: { id: 't1', type: 'league', status: 'finished' },
  });
  assert.equal(finishedRes.valid, false);
  assert.match(finishedRes.error || '', /sudah selesai/i);

  const regularRes = validateLeagueInviteForRegistration({
    rawCode: 'K7P9M2WX',
    invite: { code: 'K7P9M2WX', tournamentId: 't1', active: true },
    tournament: { id: 't1', type: 'regular', status: 'registration' },
  });
  assert.equal(regularRes.valid, false);
});

test('INVITE 6: validateLeagueInviteForRegistration memeriksa duplikat/ditolak dan meloloskan undangan liga valid', () => {
  const rejectedRes = validateLeagueInviteForRegistration({
    rawCode: 'K7P9M2WX',
    invite: { code: 'K7P9M2WX', tournamentId: 't1', active: true },
    tournament: { id: 't1', type: 'league', status: 'registration' },
    existingPlayer: { status: 'rejected' },
  });
  assert.equal(rejectedRes.valid, false);
  assert.match(rejectedRes.error || '', /ditolak/i);

  const alreadyJoinedRes = validateLeagueInviteForRegistration({
    rawCode: 'K7P9M2WX',
    invite: { code: 'K7P9M2WX', tournamentId: 't1', active: true },
    tournament: { id: 't1', type: 'league', status: 'registration' },
    existingPlayer: { status: 'accepted' },
  });
  assert.equal(alreadyJoinedRes.valid, false);
  assert.match(alreadyJoinedRes.error || '', /sudah terdaftar/i);

  const validRes = validateLeagueInviteForRegistration({
    rawCode: 'digiswiss:liga:k7p9m2wx',
    invite: { code: 'K7P9M2WX', tournamentId: 't1', active: true },
    tournament: { id: 't1', type: 'league', status: 'registration' },
    existingPlayer: null,
  });
  assert.equal(validRes.valid, true);
  assert.equal(validRes.code, 'K7P9M2WX');
});
