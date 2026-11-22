import test from 'node:test';
import assert from 'node:assert/strict';
import { resolvePlayerMatchState } from '../utils/playerMatchStateLogic.ts';
import {
  normalizePlayerName,
  findAccountPlayerWithSameName,
  detectDuplicatePlayerNames,
  detectPreflightIssues,
  busyAccountIds,
  isEligibleLinkTarget,
  getEligibleLinkAccounts,
  validateLinkTarget,
  findDuplicatePlayersInRound,
  planPlayerLink,
  chunkOperations,
} from '../utils/playerLinkLogic.ts';

test('1. resolvePlayerMatchState: Akun belum ikut turnamen menghasilkan not_joined', () => {
  const res = resolvePlayerMatchState(null, 0, [], 'u1', 'Taichi');
  assert.equal(res.state, 'not_joined');
  assert.equal(res.hasMatches, false);
  assert.equal(
    res.message,
    'Belum ada turnamen aktif yang Anda ikuti. Daftarkan diri Anda di menu Turnamen.'
  );
  assert.equal(String(res), res.message);
});

test('2. resolvePlayerMatchState: Status waiting menghasilkan pesan menunggu organizer', () => {
  const res = resolvePlayerMatchState('waiting', 0, [], 'u1', 'Taichi');
  assert.equal(res.state, 'waiting');
  assert.equal(res.hasMatches, false);
  assert.equal(
    res.message,
    'Anda masih di Waiting List. Menunggu organizer menerima Anda.'
  );
});

test('3. resolvePlayerMatchState: Status rejected menghasilkan pesan pendaftaran ditolak', () => {
  const res = resolvePlayerMatchState('rejected', 0, [], 'u1', 'Taichi');
  assert.equal(res.state, 'rejected');
  assert.equal(res.hasMatches, false);
  assert.equal(
    res.message,
    'Pendaftaran Anda ditolak organizer untuk turnamen ini.'
  );
});

test('4. resolvePlayerMatchState: Status dropped menghasilkan pesan ditandai drop', () => {
  const res = resolvePlayerMatchState('dropped', 0, [], 'u1', 'Taichi');
  assert.equal(res.state, 'dropped');
  assert.equal(res.hasMatches, false);
  assert.equal(res.message, 'Anda ditandai drop pada turnamen ini.');
});

test('5. resolvePlayerMatchState: Status accepted tapi belum ada pairing ronde menghasilkan no_rounds', () => {
  const res = resolvePlayerMatchState('accepted', 0, [], 'u1', 'Taichi');
  assert.equal(res.state, 'no_rounds');
  assert.equal(res.hasMatches, false);
  assert.equal(res.message, 'Menunggu organizer membuat pairing ronde.');
});

test('6. resolvePlayerMatchState: Status accepted dan UID ada di pairing menghasilkan has_matches', () => {
  const matches = [
    { id: 'm1', round: 1, p1Id: 'u1', p1Name: 'Taichi', p2Id: 'u2', p2Name: 'Yamato' },
  ];
  const res = resolvePlayerMatchState('accepted', 1, matches, 'u1', 'Taichi');
  assert.equal(res.state, 'has_matches');
  assert.equal(res.hasMatches, true);
  assert.equal(res.message, '');
});

test('7. resolvePlayerMatchState: Status accepted, pairing ada tapi UID tidak ada (tanpa kecocokan nama)', () => {
  const matches = [
    { id: 'm1', round: 1, p1Id: 'u2', p1Name: 'Yamato', p2Id: 'u3', p2Name: 'Sora' },
  ];
  const res = resolvePlayerMatchState('accepted', 1, matches, 'u1', 'Taichi');
  assert.equal(res.state, 'not_in_pairing');
  assert.equal(res.hasMatches, false);
  assert.equal(
    res.message,
    'Pairing sudah dibuat tetapi akun Anda tidak ada di dalamnya. Hubungi organizer.'
  );
});

test('8. resolvePlayerMatchState: Status accepted, pairing ada tapi nama ada dengan ID manual berbeda', () => {
  const matches = [
    { id: 'm1', round: 1, p1Id: 'manual_99', p1Name: 'taichi yagami', p2Id: 'u2', p2Name: 'Yamato' },
  ];
  const res = resolvePlayerMatchState('accepted', 1, matches, 'u1', 'Taichi Yagami');
  assert.equal(res.state, 'not_in_pairing_name_matched');
  assert.equal(res.hasMatches, false);
  assert.equal(
    res.message,
    'Pairing sudah dibuat tetapi akun Anda tidak ada di dalamnya. Hubungi organizer. Nama Anda ada di pairing tetapi belum terhubung ke akun Anda. Minta organizer menautkan akun Anda.'
  );
});

test('9. Pendeteksi nama ganda: findAccountPlayerWithSameName mendeteksi akun dengan variasi huruf besar-kecil dan spasi', () => {
  const players = [
    { id: 'acc_1', uid: 'acc_1', name: 'Yamato Ishida', status: 'waiting', manual: false },
    { id: 'acc_2', uid: 'acc_2', name: 'Sora Takenouchi', status: 'accepted', manual: false },
    { id: 'man_1', name: 'Koushiro Izumi', status: 'accepted', manual: true },
  ];

  // Cocok dengan variasi case & spasi
  const found = findAccountPlayerWithSameName('  yamato   ishida  ', players);
  assert.ok(found);
  assert.equal(found.id, 'acc_1');

  // Mengabaikan peserta manual lain
  const notFoundManual = findAccountPlayerWithSameName('Koushiro Izumi', players);
  assert.equal(notFoundManual, null);

  // Tidak ditemukan jika nama tidak ada
  const notFound = findAccountPlayerWithSameName('Mimi Tachikawa', players);
  assert.equal(notFound, null);
});

test('10. detectDuplicatePlayerNames dan detectPreflightIssues mendeteksi nama ganda dan akun waiting', () => {
  const players = [
    { id: 'acc_1', uid: 'acc_1', name: 'Taichi Yagami', status: 'waiting', manual: false },
    { id: 'acc_2', uid: 'acc_2', name: 'Yamato Ishida', status: 'accepted', manual: false },
    { id: 'man_1', name: 'yamato ishida', status: 'accepted', manual: true },
    { id: 'man_2', name: 'Takeru Takaishi', status: 'accepted', manual: true },
  ];

  const dupes = detectDuplicatePlayerNames(players);
  assert.equal(dupes.length, 1);
  assert.equal(dupes[0].manualPlayer.id, 'man_1');
  assert.equal(dupes[0].accountPlayer.id, 'acc_2');

  const preflight = detectPreflightIssues(players);
  assert.equal(preflight.hasIssues, true);
  assert.equal(preflight.waitingAccountPlayers.length, 1);
  assert.equal(preflight.waitingAccountPlayers[0].id, 'acc_1');
  assert.equal(preflight.duplicatePairs.length, 1);
});

test('11. planPlayerLink: Mengganti p1Id dan p2Id di seluruh ronde dan match archived, menerima akun, dan menghapus manual', () => {
  const tid = 'tourney_abc';
  const manualPlayer = { id: 'man_123', name: 'Yamato Manual' };
  const targetAccount = { id: 'acc_456', uid: 'acc_456', name: 'Yamato Ishida', status: 'waiting' };
  const allMatches = [
    // Ronde 1: manual sebagai p1
    { id: 'match_r1_1', round: 1, p1Id: 'man_123', p1Name: 'Yamato Manual', p2Id: 'u3', p2Name: 'Sora' },
    // Ronde 1 archived: manual sebagai p2
    { id: 'match_r1_archived', round: 1, archived: true, p1Id: 'u4', p1Name: 'Taichi', p2Id: 'man_123', p2Name: 'Yamato Manual' },
    // Ronde 2: manual sebagai p2
    { id: 'match_r2_1', round: 2, p1Id: 'u5', p1Name: 'Koushiro', p2Id: 'man_123', p2Name: 'Yamato Manual' },
    // Match lain tidak terpengaruh
    { id: 'match_r2_2', round: 2, p1Id: 'u6', p1Name: 'Mimi', p2Id: 'u7', p2Name: 'Joe' },
  ];
  const actor = { uid: 'org_1', name: 'Organizer DSS' };

  const ops = planPlayerLink(tid, manualPlayer, targetAccount, allMatches, actor);

  // Operasi yang diharapkan:
  // 1. update_player (status waiting -> accepted)
  // 2. update_match match_r1_1
  // 3. update_match match_r1_archived
  // 4. update_match match_r2_1
  // 5. delete_player man_123
  // 6. audit_log PLAYER_LINKED
  assert.equal(ops.length, 6);

  // 1. update_player
  assert.equal(ops[0].type, 'update_player');
  assert.equal(ops[0].path, 'tournaments/tourney_abc/players/acc_456');
  assert.equal(ops[0].data.status, 'accepted');

  // 2. update_match match_r1_1
  assert.equal(ops[1].type, 'update_match');
  assert.equal(ops[1].matchId, 'match_r1_1');
  assert.equal(ops[1].data.p1Id, 'acc_456');
  assert.equal(ops[1].data.p1Name, 'Yamato Ishida');

  // 3. update_match match_r1_archived
  assert.equal(ops[2].type, 'update_match');
  assert.equal(ops[2].matchId, 'match_r1_archived');
  assert.equal(ops[2].data.p2Id, 'acc_456');
  assert.equal(ops[2].data.p2Name, 'Yamato Ishida');

  // 4. update_match match_r2_1
  assert.equal(ops[3].type, 'update_match');
  assert.equal(ops[3].matchId, 'match_r2_1');
  assert.equal(ops[3].data.p2Id, 'acc_456');
  assert.equal(ops[3].data.p2Name, 'Yamato Ishida');

  // 5. delete_player
  assert.equal(ops[4].type, 'delete_player');
  assert.equal(ops[4].path, 'tournaments/tourney_abc/players/man_123');

  // 6. audit_log
  assert.equal(ops[5].type, 'audit_log');
  assert.equal(ops[5].data.action, 'PLAYER_LINKED');
  assert.equal(ops[5].data.details.matchesUpdatedCount, 3);
  assert.equal(ops[5].data.details.targetAccountUid, 'acc_456');
});

test('12. chunkOperations: Memotong batch dengan batas maksimal 400', () => {
  assert.deepEqual(chunkOperations([]), []);

  const ops400 = Array.from({ length: 400 }, (_, i) => ({ id: i }));
  const chunks400 = chunkOperations(ops400, 400);
  assert.equal(chunks400.length, 1);
  assert.equal(chunks400[0].length, 400);

  const ops850 = Array.from({ length: 850 }, (_, i) => ({ id: i }));
  const chunks850 = chunkOperations(ops850, 400);
  assert.equal(chunks850.length, 3);
  assert.equal(chunks850[0].length, 400);
  assert.equal(chunks850[1].length, 400);
  assert.equal(chunks850[2].length, 50);
});

test('13. validateLinkTarget & planPlayerLink: Target tanpa pertandingan diterima, target yang sudah punya pertandingan ditolak', () => {
  const manualPlayer = { id: 'man_1', name: 'Taichi Manual' };
  const cleanTarget = { id: 'acc_clean', uid: 'acc_clean', name: 'Taichi', status: 'accepted', manual: false };
  const busyTarget = { id: 'acc_busy', uid: 'acc_busy', name: 'Yamato', status: 'accepted', manual: false };
  const allMatches = [
    { id: 'm1', round: 1, table: 1, p1Id: 'man_1', p1Name: 'Taichi Manual', p2Id: 'u3', p2Name: 'Sora' },
    { id: 'm2', round: 2, table: 1, p1Id: 'u4', p1Name: 'Koushiro', p2Id: 'acc_busy', p2Name: 'Yamato' },
  ];

  // Target tanpa pertandingan diterima
  assert.doesNotThrow(() => validateLinkTarget(manualPlayer, cleanTarget, allMatches));
  const ops = planPlayerLink('t1', manualPlayer, cleanTarget, allMatches, { uid: 'org1', name: 'Org' });
  assert.ok(ops.some((op) => op.type === 'update_match' && op.matchId === 'm1'));

  // Target yang sudah punya pertandingan di turnamen ini ditolak (baik lewat validateLinkTarget maupun planPlayerLink)
  assert.throws(
    () => validateLinkTarget(manualPlayer, busyTarget, allMatches),
    /Akun Yamato sudah memiliki pertandingan di turnamen ini, sehingga tidak bisa ditautkan\./
  );
  assert.throws(
    () => planPlayerLink('t1', manualPlayer, busyTarget, allMatches, { uid: 'org1', name: 'Org' }),
    /Akun Yamato sudah memiliki pertandingan di turnamen ini, sehingga tidak bisa ditautkan\./
  );
});

test('14. validateLinkTarget: Target manual, dropped, dan rejected ditolak', () => {
  const manualPlayer = { id: 'man_1', name: 'Taichi Manual' };

  assert.throws(
    () =>
      validateLinkTarget(
        manualPlayer,
        { id: 'man_2', name: 'Yamato Manual', status: 'accepted', manual: true },
        []
      ),
    /Tujuan tautan harus berupa akun\./
  );

  assert.throws(
    () =>
      validateLinkTarget(
        manualPlayer,
        { id: 'acc_drop', uid: 'acc_drop', name: 'Yamato', status: 'dropped', manual: false },
        []
      ),
    /Akun Yamato berstatus dropped dan tidak dapat ditautkan\./
  );

  assert.throws(
    () =>
      validateLinkTarget(
        manualPlayer,
        { id: 'acc_rej', uid: 'acc_rej', name: 'Sora', status: 'rejected', manual: false },
        []
      ),
    /Akun Sora berstatus rejected dan tidak dapat ditautkan\./
  );
});

test('15. validateLinkTarget & planPlayerLink: Manual dan target berada pada ronde yang sama ditolak', () => {
  const manualPlayer = { id: 'man_1', name: 'Taichi Manual' };
  const targetSameRound = { id: 'acc_1', uid: 'acc_1', name: 'Taichi', status: 'accepted', manual: false };
  const matchesSameRound = [
    { id: 'm1', round: 1, table: 1, p1Id: 'man_1', p1Name: 'Taichi Manual', p2Id: 'u2', p2Name: 'Yamato' },
    { id: 'm2', round: 1, table: 2, p1Id: 'acc_1', p1Name: 'Taichi', p2Id: 'u3', p2Name: 'Sora' },
  ];

  assert.throws(
    () => validateLinkTarget(manualPlayer, targetSameRound, matchesSameRound),
    /sudah memiliki pertandingan.*ronde yang sama.*Ronde 1.*tidak bisa ditautkan/i
  );
  assert.throws(
    () => planPlayerLink('t1', manualPlayer, targetSameRound, matchesSameRound, { uid: 'org1', name: 'Org' }),
    /sudah memiliki pertandingan.*ronde yang sama/i
  );
});

test('16. busyAccountIds dan getEligibleLinkAccounts menyaring akun yang sudah bertanding dan status tidak valid', () => {
  const matches = [
    { id: 'm1', round: 1, table: 1, p1Id: 'u1', p2Id: 'u2' },
    { id: 'm2', round: 1, table: 2, p1Id: 'u3', p2Id: null },
  ];

  const busy = busyAccountIds(matches);
  assert.deepEqual([...busy].sort(), ['u1', 'u2', 'u3']);

  const players = [
    { id: 'u1', uid: 'u1', name: 'Busy Acc', status: 'accepted', manual: false },
    { id: 'u4', uid: 'u4', name: 'Free Waiting', status: 'waiting', manual: false },
    { id: 'u5', uid: 'u5', name: 'Free Accepted', status: 'accepted', manual: false },
    { id: 'u6', uid: 'u6', name: 'Dropped Acc', status: 'dropped', manual: false },
    { id: 'u7', uid: 'u7', name: 'Rejected Acc', status: 'rejected', manual: false },
    { id: 'man_1', name: 'Manual 1', status: 'accepted', manual: true },
  ];

  assert.equal(isEligibleLinkTarget(players[0], busy), false);
  assert.equal(isEligibleLinkTarget(players[1], busy), true);
  const eligible = getEligibleLinkAccounts(players, busy);
  assert.deepEqual(
    eligible.map((p) => p.id),
    ['u4', 'u5']
  );
});

test('17. findDuplicatePlayersInRound: Mendeteksi satu pemain di dua meja pada ronde yang sama dan mengabaikan lintas ronde / arsip / BYE', () => {
  const matches = [
    // Ronde 1 normal: u1 main 1x, u2 BYE, u3 BYE
    { id: 'r1_m1', round: 1, table: 1, p1Id: 'u1', p1Name: 'Taichi', p2Id: 'u4', p2Name: 'Sora' },
    { id: 'r1_m2', round: 1, table: 2, p1Id: 'u2', p1Name: 'Yamato', p2Id: null, p2Name: 'BYE' },
    { id: 'r1_m3', round: 1, table: 3, p1Id: 'u3', p1Name: 'Mimi', p2Id: null, p2Name: 'BYE' },
    // Ronde 2 duplikat: u1 tampil di Meja 1 dan Meja 2
    { id: 'r2_m1', round: 2, table: 1, p1Id: 'u1', p1Name: 'Taichi', p2Id: 'u2', p2Name: 'Yamato' },
    { id: 'r2_m2', round: 2, table: 2, p1Id: 'u3', p1Name: 'Mimi', p2Id: 'u1', p2Name: 'Taichi' },
    // Match arsip di Ronde 1 tidak boleh menimbulkan positif palsu
    { id: 'r1_arch', round: 1, archived: true, table: 1, p1Id: 'u1', p1Name: 'Taichi', p2Id: 'u2', p2Name: 'Yamato' },
  ];

  const dupes = findDuplicatePlayersInRound(matches);
  assert.equal(dupes.length, 1);
  assert.equal(dupes[0].round, 2);
  assert.equal(dupes[0].playerId, 'u1');
  assert.equal(dupes[0].name, 'Taichi');
  assert.equal(dupes[0].count, 2);
  assert.deepEqual(dupes[0].tables, [1, 2]);
});

