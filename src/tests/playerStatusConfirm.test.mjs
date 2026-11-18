import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildWaitingStatusConfirmContent,
  filterWaitingPlayers,
  getAlreadyProcessedMessage,
  getWaitingStatusSuccessToast,
  isPlayerStillWaitingInList,
  isPlayerWaiting,
} from '../utils/playerStatusConfirmLogic.ts';

test('WAITING LIST CONFIRM: teks dialog untuk aksi terima satu pemain', () => {
  const content = buildWaitingStatusConfirmContent({
    action: 'accept',
    playerId: 'p1',
    playerName: 'Taichi Yagami',
  });

  assert.equal(content.title, 'Terima Peserta?');
  assert.equal(content.message, 'Terima Taichi Yagami sebagai peserta resmi?');
  assert.equal(content.cancelLabel, 'Batal');
  assert.equal(content.confirmLabel, 'Ya, Terima');
  assert.equal(content.confirmVariant, 'primary');
});

test('WAITING LIST CONFIRM: teks dialog untuk aksi tolak satu pemain', () => {
  const content = buildWaitingStatusConfirmContent({
    action: 'reject',
    playerId: 'p2',
    playerName: 'Yamato Ishida',
  });

  assert.equal(content.title, 'Tolak Peserta?');
  assert.equal(content.message, 'Tolak Yamato Ishida? Pemain ini tidak akan ikut turnamen.');
  assert.equal(content.cancelLabel, 'Batal');
  assert.equal(content.confirmLabel, 'Ya, Tolak');
  assert.equal(content.confirmVariant, 'danger');
});

test('WAITING LIST CONFIRM: teks dialog terima semua dan pluralisasi jumlah', () => {
  const single = buildWaitingStatusConfirmContent({
    action: 'acceptAll',
    waitingCount: 1,
  });
  assert.equal(single.title, 'Terima Semua?');
  assert.equal(single.message, 'Terima 1 pemain di Waiting List?');
  assert.equal(single.cancelLabel, 'Batal');
  assert.equal(single.confirmLabel, 'Ya, Terima Semua');
  assert.equal(single.confirmVariant, 'primary');

  const multi = buildWaitingStatusConfirmContent({
    action: 'acceptAll',
    waitingCount: 7,
  });
  assert.equal(multi.title, 'Terima Semua?');
  assert.equal(multi.message, 'Terima 7 pemain di Waiting List?');

  const clampedNegative = buildWaitingStatusConfirmContent({
    action: 'acceptAll',
    waitingCount: -3,
  });
  assert.equal(clampedNegative.message, 'Terima 0 pemain di Waiting List?');
});

test('WAITING LIST CONFIRM: fallback nama kosong dan pesan toast sukses/sudah diproses', () => {
  const fallback = buildWaitingStatusConfirmContent({
    action: 'accept',
    playerId: 'p3',
    playerName: '   ',
  });
  assert.equal(fallback.message, 'Terima Pemain sebagai peserta resmi?');

  assert.equal(getWaitingStatusSuccessToast('accept', { playerName: 'Sora' }), 'Sora diterima');
  assert.equal(getWaitingStatusSuccessToast('reject', { playerName: 'Koushiro' }), 'Koushiro ditolak');
  assert.equal(
    getWaitingStatusSuccessToast('acceptAll', { count: 1 }),
    '1 pemain di Waiting List diterima'
  );
  assert.equal(
    getWaitingStatusSuccessToast('acceptAll', { count: 4 }),
    '4 pemain di Waiting List diterima'
  );

  assert.equal(
    getAlreadyProcessedMessage('accept', 'Mimi'),
    'Mimi sudah tidak berstatus Waiting List.'
  );
  assert.equal(
    getAlreadyProcessedMessage('acceptAll'),
    'Semua pemain di Waiting List sudah diproses sebelumnya.'
  );
});

test('WAITING LIST CONFIRM: pengecekan apakah pemain masih berstatus waiting', () => {
  assert.equal(isPlayerWaiting({ status: 'waiting' }), true);
  assert.equal(isPlayerWaiting({ status: 'accepted' }), false);
  assert.equal(isPlayerWaiting({ status: 'rejected' }), false);
  assert.equal(isPlayerWaiting({ status: 'dropped' }), false);
  assert.equal(isPlayerWaiting(null), false);
  assert.equal(isPlayerWaiting(undefined), false);

  const players = [
    { id: 'u1', name: 'Pemain 1', status: 'waiting' },
    { id: 'u2', name: 'Pemain 2', status: 'accepted' },
    { id: 'u3', name: 'Pemain 3', status: 'rejected' },
  ];

  assert.equal(isPlayerStillWaitingInList(players, 'u1'), true);
  assert.equal(isPlayerStillWaitingInList(players, 'u2'), false);
  assert.equal(isPlayerStillWaitingInList(players, 'u3'), false);
  assert.equal(isPlayerStillWaitingInList(players, 'tidak_ada'), false);
  assert.equal(isPlayerStillWaitingInList(players, ''), false);

  const onlyWaiting = filterWaitingPlayers(players);
  assert.deepEqual(
    onlyWaiting.map((p) => p.id),
    ['u1']
  );
});
