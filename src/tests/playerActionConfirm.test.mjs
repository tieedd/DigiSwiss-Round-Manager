import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildPlayerActionConfirmContent,
  getPlayerActionSuccessToast,
} from '../utils/playerActionConfirmLogic.ts';

test('PLAYER ACTION CONFIRM: teks dialog untuk aksi Tandai Dropped', () => {
  const content = buildPlayerActionConfirmContent({
    action: 'drop',
    playerId: 'p1',
    playerName: 'Taichi Yagami',
  });

  assert.equal(content.title, 'Drop Peserta?');
  assert.match(content.message, /Taichi Yagami/);
  assert.match(content.message, /tidak akan dipasangkan lagi di ronde berikutnya/i);
  assert.match(content.message, /poin dari ronde sebelumnya tetap tercatat/i);
  assert.match(content.message, /jumlah ronde turnamen tidak berubah/i);
  assert.equal(content.cancelLabel, 'Batal');
  assert.equal(content.confirmLabel, 'Ya, Drop');
  assert.equal(content.variant, 'danger');
});

test('PLAYER ACTION CONFIRM: teks dialog untuk aksi Hapus Peserta Manual', () => {
  const content = buildPlayerActionConfirmContent({
    action: 'deleteManual',
    playerId: 'manual_1',
    playerName: 'Takeru Takaishi',
  });

  assert.equal(content.title, 'Hapus Peserta?');
  assert.equal(
    content.message,
    'Hapus peserta manual Takeru Takaishi dari turnamen ini?'
  );
  assert.equal(content.cancelLabel, 'Batal');
  assert.equal(content.confirmLabel, 'Ya, Hapus');
  assert.equal(content.variant, 'danger');
});

test('PLAYER ACTION CONFIRM: fallback nama kosong dan pesan toast sukses', () => {
  const dropFallback = buildPlayerActionConfirmContent({
    action: 'drop',
    playerId: 'p2',
    playerName: '   ',
  });
  assert.match(dropFallback.message, /^Tandai Pemain sebagai dropped\?/);

  const deleteFallback = buildPlayerActionConfirmContent({
    action: 'deleteManual',
    playerId: 'manual_2',
    playerName: '',
  });
  assert.equal(
    deleteFallback.message,
    'Hapus peserta manual Pemain dari turnamen ini?'
  );

  assert.equal(
    getPlayerActionSuccessToast('drop', 'Sora Takenouchi'),
    'Sora Takenouchi ditandai dropped'
  );
  assert.equal(
    getPlayerActionSuccessToast('deleteManual', 'Koushiro Izumi'),
    'Peserta manual Koushiro Izumi dihapus'
  );
  assert.equal(
    getPlayerActionSuccessToast('drop', '  '),
    'Pemain ditandai dropped'
  );
});
