import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  LEAGUE_INVITE_ALPHABET,
  LEAGUE_INVITE_CODE_LENGTH,
  LEAGUE_INVITE_CLAIMS_VERSION,
  generateLeagueInviteCode,
  isValidLeagueInviteCodeFormat,
  normalizeLeagueInviteInput,
  formatLeagueInviteQrPayload,
  validateLeagueInviteForRegistration,
  buildLeagueInviteClaimPayload,
  buildLeaguePlayerPayload,
  executeTwoStepLeagueRegistration,
  shouldShowLegacyInviteRegenerateWarning,
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

test('INVITE 7: payload inviteClaims dan players (tanpa inviteCode) terbentuk benar', () => {
  const claimPayload = buildLeagueInviteClaimPayload('k7p9m2wx', 1700000000000);
  assert.deepEqual(claimPayload, {
    inviteCode: 'K7P9M2WX',
    createdAt: 1700000000000,
  });

  const playerPayload = buildLeaguePlayerPayload(
    { uid: 'uid_abc', name: 'Taichi' },
    1700000000000
  );
  assert.equal('inviteCode' in playerPayload, false);
  assert.deepEqual(playerPayload, {
    id: 'uid_abc',
    name: 'Taichi',
    uid: 'uid_abc',
    manual: false,
    status: 'accepted',
    joinedAt: 1700000000000,
  });
});

test('INVITE 8: executeTwoStepLeagueRegistration membuat klaim lalu pemain, dan rollback klaim jika langkah 2 gagal', async () => {
  // Skenario sukses: urutan langkah 1 -> langkah 2, tanpa rollback
  const order = [];
  const res = await executeTwoStepLeagueRegistration({
    createClaim: async () => {
      order.push('createClaim');
    },
    createPlayer: async () => {
      order.push('createPlayer');
    },
    rollbackClaim: async () => {
      order.push('rollbackClaim');
    },
  });
  assert.deepEqual(res, { claimCreated: true, playerCreated: true });
  assert.deepEqual(order, ['createClaim', 'createPlayer']);

  // Skenario gagal di langkah 2: klaim yang baru dibuat wajib dihapus kembali (rollback)
  const failOrder = [];
  await assert.rejects(
    () =>
      executeTwoStepLeagueRegistration({
        createClaim: async () => {
          failOrder.push('createClaim');
        },
        createPlayer: async () => {
          failOrder.push('createPlayer');
          throw new Error('permission-denied');
        },
        rollbackClaim: async () => {
          failOrder.push('rollbackClaim');
        },
      }),
    /permission-denied/
  );
  assert.deepEqual(failOrder, ['createClaim', 'createPlayer', 'rollbackClaim']);

  // Skenario gagal di langkah 1: langkah 2 dan rollback tidak dipanggil
  const step1FailOrder = [];
  await assert.rejects(
    () =>
      executeTwoStepLeagueRegistration({
        createClaim: async () => {
          step1FailOrder.push('createClaim');
          throw new Error('invalid-invite');
        },
        createPlayer: async () => {
          step1FailOrder.push('createPlayer');
        },
        rollbackClaim: async () => {
          step1FailOrder.push('rollbackClaim');
        },
      }),
    /invalid-invite/
  );
  assert.deepEqual(step1FailOrder, ['createClaim']);
});

test('INVITE 9: shouldShowLegacyInviteRegenerateWarning aktif untuk undangan lama dan hilang setelah Buat Ulang Kode (v2)', () => {
  assert.equal(shouldShowLegacyInviteRegenerateWarning(null), false);
  assert.equal(
    shouldShowLegacyInviteRegenerateWarning({ code: 'OLD12345', active: false }),
    false
  );
  assert.equal(
    shouldShowLegacyInviteRegenerateWarning({ code: 'OLD12345', active: true }),
    true
  );
  assert.equal(
    shouldShowLegacyInviteRegenerateWarning({
      code: 'NEW23456',
      active: true,
      inviteVersion: LEAGUE_INVITE_CLAIMS_VERSION,
    }),
    false
  );
});

test('INVITE 10: firestore.rules menegakkan inviteClaims dan melarang inviteCode di dokumen players', () => {
  const rulesText = fs.readFileSync(
    new URL('../../firestore.rules', import.meta.url),
    'utf8'
  );
  assert.match(rulesText, /match \/inviteClaims\/\{pid\}/);
  assert.match(rulesText, /!\('inviteCode' in request\.resource\.data\)/);
  assert.match(rulesText, /exists\(\/databases\/\$\(database\)\/documents\/tournaments\/\$\(tid\)\/inviteClaims\/\$\(pid\)\)/);
  assert.match(rulesText, /allow update: if false;/);
});
