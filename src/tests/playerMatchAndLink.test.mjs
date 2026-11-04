import test from 'node:test';
import assert from 'node:assert/strict';
import { resolvePlayerMatchState } from '../utils/playerMatchStateLogic.ts';
import {
  normalizePlayerName,
  findAccountPlayerWithSameName,
  detectDuplicatePlayerNames,
  detectPreflightIssues,
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
