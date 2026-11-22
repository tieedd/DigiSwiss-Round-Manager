import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  createBackStack,
  createRootBackController,
  DOUBLE_BACK_EXIT_WINDOW_MS,
  EXIT_TOAST_MESSAGE,
  getHomeTabForRole,
} from '../utils/backStack.ts';

test('BACK 1: stack LIFO menutup lapisan paling atas terlebih dahulu dan mendukung unregister', () => {
  const stack = createBackStack();
  const closed = [];

  assert.equal(stack.handleBack(), false);
  assert.equal(stack.size(), 0);

  const idA = stack.register(() => closed.push('A'));
  const idB = stack.register(() => closed.push('B'));
  const idC = stack.register(() => closed.push('C'));
  assert.equal(stack.size(), 3);

  // Hapus lapisan tengah (B) tanpa mengganggu urutan A -> C
  assert.equal(stack.unregister(idB), true);
  assert.equal(stack.unregister('tidak_ada'), false);
  assert.equal(stack.size(), 2);

  // Back pertama menutup C
  assert.equal(stack.handleBack(), true);
  assert.deepEqual(closed, ['C']);
  assert.equal(stack.size(), 1);

  // Back kedua menutup A
  assert.equal(stack.handleBack(), true);
  assert.deepEqual(closed, ['C', 'A']);
  assert.equal(stack.size(), 0);

  // Stack kosong -> false
  assert.equal(stack.handleBack(), false);
  assert.equal(stack.unregister(idA), false);
  assert.equal(stack.unregister(idC), false);
});

test('BACK 2: lapisan dengan blocked=true menahan penutupan sambil tetap mengonsumsi tombol Back, dan bisa dibuka kembali tanpa ubah urutan LIFO', () => {
  const stack = createBackStack();
  const closed = [];

  stack.register(() => closed.push('modal_bawah'));
  const topId = stack.register(() => closed.push('sheet_atas'), { blocked: true });

  // Saat blocked=true, Back mengonsumsi event (true) tanpa menutup sheet atau modal di bawahnya
  assert.equal(stack.handleBack(), true);
  assert.deepEqual(closed, []);
  assert.equal(stack.size(), 2);

  // Setelah operasi selesai (blocked=false), urutan LIFO tetap menutup sheet_atas lebih dulu
  assert.equal(stack.update(topId, { blocked: false }), true);
  assert.equal(stack.handleBack(), true);
  assert.deepEqual(closed, ['sheet_atas']);
  assert.equal(stack.size(), 1);

  // Berikutnya menutup modal_bawah
  assert.equal(stack.handleBack(), true);
  assert.deepEqual(closed, ['sheet_atas', 'modal_bawah']);
  assert.equal(stack.size(), 0);
});

test('BACK 3: root controller memprioritaskan lapisan, lalu kembali ke tab beranda sesuai peran, lalu double-back 2 detik untuk keluar', () => {
  assert.equal(getHomeTabForRole('player'), 'tournaments');
  assert.equal(getHomeTabForRole('organizer'), 'my_tournaments');
  assert.equal(getHomeTabForRole('admin'), 'users');
  assert.equal(getHomeTabForRole(null), 'tournaments');

  const stack = createBackStack();
  const controller = createRootBackController({ exitWindowMs: DOUBLE_BACK_EXIT_WINDOW_MS });
  const closed = [];

  stack.register(() => closed.push('detail_modal'));

  // 1) Ada lapisan terbuka walau sedang di tab non-beranda -> tutup lapisan dulu
  const step1 = controller.handle({
    stack,
    isAuthenticated: true,
    activeTab: 'history',
    homeTab: 'tournaments',
    nowMs: 1000,
  });
  assert.deepEqual(step1, { handled: true, action: 'layer_closed' });
  assert.deepEqual(closed, ['detail_modal']);

  // 2) Tidak ada lapisan, masih di tab non-beranda -> kembali ke tab beranda
  const step2 = controller.handle({
    stack,
    isAuthenticated: true,
    activeTab: 'history',
    homeTab: 'tournaments',
    nowMs: 1500,
  });
  assert.deepEqual(step2, {
    handled: true,
    action: 'switch_to_home',
    nextTab: 'tournaments',
  });

  // 3) Sudah di beranda -> tekan pertama tampilkan toast keluar
  const step3 = controller.handle({
    stack,
    isAuthenticated: true,
    activeTab: 'tournaments',
    homeTab: 'tournaments',
    nowMs: 2000,
  });
  assert.deepEqual(step3, {
    handled: true,
    action: 'show_exit_toast',
    toastMessage: EXIT_TOAST_MESSAGE,
  });
  assert.equal(EXIT_TOAST_MESSAGE, 'Tekan sekali lagi untuk keluar');

  // 4) Tekan kedua setelah > 2000ms -> reset, tampilkan toast lagi
  const step4 = controller.handle({
    stack,
    isAuthenticated: true,
    activeTab: 'tournaments',
    homeTab: 'tournaments',
    nowMs: 4500,
  });
  assert.deepEqual(step4, {
    handled: true,
    action: 'show_exit_toast',
    toastMessage: EXIT_TOAST_MESSAGE,
  });

  // 5) Tekan lagi dalam <= 2000ms (4500 + 1800 = 6300) -> keluar aplikasi (handled: false)
  const step5 = controller.handle({
    stack,
    isAuthenticated: true,
    activeTab: 'tournaments',
    homeTab: 'tournaments',
    nowMs: 6300,
  });
  assert.deepEqual(step5, {
    handled: false,
    action: 'exit_app',
  });

  // 6) Layar login (belum login) tanpa lapisan juga mengikuti double-back exit (termasuk tepat di batas 2000ms)
  const guestPrompt = controller.handle({
    stack,
    isAuthenticated: false,
    nowMs: 10_000,
  });
  assert.equal(guestPrompt.handled, true);
  assert.equal(guestPrompt.action, 'show_exit_toast');

  const guestExit = controller.handle({
    stack,
    isAuthenticated: false,
    nowMs: 12_000,
  });
  assert.equal(guestExit.handled, false);
  assert.equal(guestExit.action, 'exit_app');
});
