import test from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateRemainingTime,
  getTimerDisplayCategory,
  formatTimerMs,
  canResumeTimer,
  canPauseTimer
} from '../utils/timerLogic.ts';
import {
  OFFICIAL_DECK_COLORS,
  validateDeckSubmission,
  calculateDeckFillProgress,
  generateStandingsCsv,
  generateStandingsText
} from '../utils/deckExportLogic.ts';

test('Tahap 8 TES TIMER: Hitung sisa waktu timer saat idle, running, paused, dan expired', () => {
  const durationMs = 45 * 60 * 1000; // 45 menit = 2.700.000 ms

  // 1. Kasus idle
  const idleTimer = {
    status: 'idle',
    durationMs: durationMs,
    remainingMs: durationMs
  };
  assert.equal(calculateRemainingTime(idleTimer, Date.now()), durationMs);

  // 2. Kasus running dengan selisih waktu server
  const serverNow = 1000000;
  const startedAt = 900000; // telah berjalan 100.000 ms (100 detik)
  const runningTimer = {
    status: 'running',
    durationMs: durationMs,
    remainingMs: durationMs,
    startedAt: startedAt
  };
  const expectedRemaining = durationMs - 100000;
  assert.equal(calculateRemainingTime(runningTimer, serverNow), expectedRemaining);

  // 3. Kasus running yang telah habis waktunya (lewat dari durationMs)
  const expiredRunningTimer = {
    status: 'running',
    durationMs: durationMs,
    remainingMs: durationMs,
    startedAt: serverNow - (durationMs + 5000)
  };
  assert.equal(calculateRemainingTime(expiredRunningTimer, serverNow), 0);

  // 4. Kasus paused
  const pausedTimer = {
    status: 'paused',
    durationMs: durationMs,
    remainingMs: 120000
  };
  assert.equal(calculateRemainingTime(pausedTimer, serverNow), 120000);
});

test('Tahap 8 TES TIMER: Warna kuning pada sisa 5 menit, merah saat habis, dan format MM:SS', () => {
  // > 5 menit -> 'normal'
  assert.equal(getTimerDisplayCategory(6 * 60 * 1000, 'running'), 'normal');

  // Tepat 5 menit (300.000 ms) -> 'warning' (kuning)
  assert.equal(getTimerDisplayCategory(5 * 60 * 1000, 'running'), 'warning');

  // 2 menit -> 'warning' (kuning)
  assert.equal(getTimerDisplayCategory(2 * 60 * 1000, 'running'), 'warning');

  // 0 ms -> 'expired' (merah)
  assert.equal(getTimerDisplayCategory(0, 'running'), 'expired');

  // Status expired -> 'expired' (merah)
  assert.equal(getTimerDisplayCategory(0, 'expired'), 'expired');

  // Format waktu
  assert.equal(formatTimerMs(45 * 60 * 1000), '45:00');
  assert.equal(formatTimerMs(4 * 60 * 1000 + 35 * 1000), '04:35');
  assert.equal(formatTimerMs(0), '00:00');
});

test('Tahap 8 TES TIMER: Lanjutkan hanya valid dari status dijeda; timer yang habis hanya bisa di-reset', () => {
  // Lanjutkan dari status paused dengan sisa waktu > 0 -> VALID
  assert.equal(
    canResumeTimer({ status: 'paused', durationMs: 2700000, remainingMs: 500000 }),
    true
  );

  // Lanjutkan dari status idle -> TIDAK VALID
  assert.equal(
    canResumeTimer({ status: 'idle', durationMs: 2700000, remainingMs: 2700000 }),
    false
  );

  // Lanjutkan dari status running -> TIDAK VALID
  assert.equal(
    canResumeTimer({ status: 'running', durationMs: 2700000, remainingMs: 500000 }),
    false
  );

  // Lanjutkan dari timer yang habis (remainingMs = 0) -> TIDAK VALID (hanya bisa di-reset)
  assert.equal(
    canResumeTimer({ status: 'paused', durationMs: 2700000, remainingMs: 0 }),
    false
  );
  assert.equal(
    canResumeTimer({ status: 'expired', durationMs: 2700000, remainingMs: 0 }),
    false
  );
});

test('Tahap 8 TES DECK: Validasi nama deck dan warna deck (chip toggle, minimal 1, warna resmi)', () => {
  // Warna resmi Bandai Digimon TCG
  const expectedColors = ['Merah', 'Biru', 'Kuning', 'Hijau', 'Hitam', 'Ungu', 'Putih'];
  assert.deepEqual([...OFFICIAL_DECK_COLORS], expectedColors);

  // Validasi deck valid dengan 1 warna
  const res1 = validateDeckSubmission('Red Hybrid', ['Merah']);
  assert.equal(res1.valid, true);

  // Validasi deck valid dengan multi-warna (misal Biru/Hijau)
  const res2 = validateDeckSubmission('Imperialdramon', ['Biru', 'Hijau']);
  assert.equal(res2.valid, true);

  // Error: Nama deck kosong
  const res3 = validateDeckSubmission('', ['Kuning']);
  assert.equal(res3.valid, false);
  assert.match(res3.error, /Nama deck tidak boleh kosong/);

  // Error: Tanpa warna (0 chip terpilih)
  const res4 = validateDeckSubmission('ShineGreymon', []);
  assert.equal(res4.valid, false);
  assert.match(res4.error, /minimal 1 warna deck/);

  // Error: Warna di luar daftar resmi
  const res5 = validateDeckSubmission('Custom Deck', ['Coklat']);
  assert.equal(res5.valid, false);
  assert.match(res5.error, /tidak valid/);
});

test('Tahap 8 TES DECK: Penghitung "X dari Y deck sudah diisi"', () => {
  const dummyParticipations = [
    { id: '1', name: 'Player A', deckName: 'Red Hybrid', deckColors: ['Merah'] },
    { id: '2', name: 'Player B', deckName: 'MirageGaogamon', deckColors: ['Biru'] },
    { id: '3', name: 'Player C', deckName: '', deckColors: [] },
    { id: '4', name: 'Player D', deckName: 'BloomHydra', deckColors: ['Hijau'] }
  ];

  const progress = calculateDeckFillProgress(dummyParticipations);
  assert.equal(progress.total, 4);
  assert.equal(progress.filled, 3);
  assert.equal(progress.percentage, 75);
  assert.equal(progress.isAllFilled, false);
});

test('Tahap 8 TES EKSPOR: Ekspor CSV dan Teks hasil akhir turnamen', () => {
  const sampleParticipations = [
    {
      id: 't1_p1',
      tournamentId: 't1',
      tournamentName: 'Digimon Store Cup',
      date: '2026-10-31',
      format: 'BO3',
      playerId: 'p1',
      uid: 'u1',
      organizerId: 'org1',
      name: 'AgumonMaster',
      rank: 1,
      wins: 3,
      losses: 0,
      gamesWon: 6,
      gamesLost: 1,
      points: 9,
      omw: 66.67,
      gw: 85.71,
      ogw: 55.55,
      deckName: 'WarGreymon OTK',
      deckColors: ['Merah', 'Hitam'],
      isManual: false
    },
    {
      id: 't1_p2',
      tournamentId: 't1',
      tournamentName: 'Digimon Store Cup',
      date: '2026-10-31',
      format: 'BO3',
      playerId: 'p2',
      uid: null,
      organizerId: 'org1',
      name: 'GabumonFan (Manual)',
      rank: 2,
      wins: 2,
      losses: 1,
      gamesWon: 4,
      gamesLost: 3,
      points: 6,
      omw: 55.55,
      gw: 57.14,
      ogw: 60.00,
      deckName: 'Garurumon X',
      deckColors: ['Biru'],
      isManual: true
    }
  ];

  // 1. Verifikasi CSV
  const csv = generateStandingsCsv('Digimon Store Cup', sampleParticipations);
  assert.ok(csv.includes('Peringkat,Nama Pemain,Tipe Peserta,Nama Deck,Warna Deck,Total Poin'));
  assert.ok(csv.includes('"1","AgumonMaster"'));
  assert.ok(csv.includes('"WarGreymon OTK","Merah/Hitam"'));
  assert.ok(csv.includes('"Manual"'));

  // 2. Verifikasi Teks
  const text = generateStandingsText('Digimon Store Cup', '2026-10-31', 'BO3', sampleParticipations);
  assert.ok(text.includes('HASIL AKHIR TURNAMEN: DIGIMON STORE CUP'));
  assert.ok(text.includes('AgumonMaster'));
  assert.ok(text.includes('WarGreymon OTK [Merah/Hitam]'));
  assert.ok(text.includes('OMW: 66.67%'));
});
