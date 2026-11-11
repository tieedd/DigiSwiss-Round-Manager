import test from 'node:test';
import assert from 'node:assert/strict';
import { shouldShowNextRoundPause } from '../utils/roundPauseLogic.ts';
import { isAllowedApkUrl, sanitizeFileName } from '../utils/nativeHelpers.ts';

test('Tahap 10 TES JEDA RONDE: shouldShowNextRoundPause mengembalikan true hanya bila semua terkonfirmasi, bukan ronde terakhir, dan ronde berikutnya belum ada', () => {
  const allConfirmed = [
    { id: 'm1', status: 'confirmed' },
    { id: 'm2', status: 'confirmed' }
  ];
  const somePending = [
    { id: 'm1', status: 'confirmed' },
    { id: 'm2', status: 'pending' }
  ];

  // 1. Sukses: semua terkonfirmasi, ronde 1 dari 3, ronde 2 belum dibuat
  assert.equal(
    shouldShowNextRoundPause(allConfirmed, 1, 3, false),
    true,
    'Harus true saat semua terkonfirmasi di ronde 1 dan ronde 2 belum ada'
  );

  // 2. Ronde 2 dari 3, belum ada ronde 3
  assert.equal(
    shouldShowNextRoundPause(allConfirmed, 2, 3, false),
    true,
    'Harus true saat semua terkonfirmasi di ronde 2 dan ronde 3 belum ada'
  );

  // 3. Masih ada pertandingan pending
  assert.equal(
    shouldShowNextRoundPause(somePending, 1, 3, false),
    false,
    'Harus false jika masih ada pertandingan pending'
  );

  // 4. Ronde terakhir (round == totalRounds): kartu jeda ronde berikutnya tidak muncul, beralih ke Akhiri Turnamen
  assert.equal(
    shouldShowNextRoundPause(allConfirmed, 3, 3, false),
    false,
    'Harus false pada ronde terakhir karena dialihkan ke tombol Akhiri Turnamen'
  );

  // 5. Ronde berikutnya sudah ada (nextRoundExists == true)
  assert.equal(
    shouldShowNextRoundPause(allConfirmed, 1, 3, true),
    false,
    'Harus false jika ronde berikutnya sudah dibuat'
  );

  // 6. Data kosong atau null
  assert.equal(shouldShowNextRoundPause([], 1, 3, false), false);
  assert.equal(shouldShowNextRoundPause(null, 1, 3, false), false);
  assert.equal(shouldShowNextRoundPause(undefined, 1, 3, false), false);
});

test('Tahap 10 TES VALIDASI URL APK: isAllowedApkUrl memverifikasi protokol https dan host resmi GitHub', () => {
  // URL rilis GitHub valid
  assert.equal(
    isAllowedApkUrl('https://github.com/tieedd/DigiSwiss-Round-Manager/releases/download/v1.0.1/app-release.apk'),
    true
  );
  assert.equal(
    isAllowedApkUrl('https://github.com/user/repo/releases/download/v2.0.0/digiswiss.apk'),
    true
  );

  // Asset host redirect resmi GitHub
  assert.equal(
    isAllowedApkUrl('https://objects.githubusercontent.com/github-production-release-asset-2e65be/12345/app.apk'),
    true
  );

  // Ditolak: protokol http biasa
  assert.equal(
    isAllowedApkUrl('http://github.com/tieedd/DigiSwiss-Round-Manager/releases/download/v1.0.1/app-release.apk'),
    false
  );

  // Ditolak: domain selain github.com / objects.githubusercontent.com
  assert.equal(
    isAllowedApkUrl('https://malicious-site.com/releases/download/v1.0.1/app.apk'),
    false
  );
  assert.equal(
    isAllowedApkUrl('https://github.com.evil.com/app.apk'),
    false
  );

  // Ditolak: bukan rilis download atau bukan file .apk
  assert.equal(
    isAllowedApkUrl('https://github.com/tieedd/DigiSwiss-Round-Manager/blob/main/app-release.apk'),
    false
  );
  assert.equal(
    isAllowedApkUrl('https://github.com/tieedd/DigiSwiss-Round-Manager/releases/download/v1.0.1/readme.txt'),
    false
  );

  // Nilai kosong / non-string
  assert.equal(isAllowedApkUrl(''), false);
  assert.equal(isAllowedApkUrl(null), false);
  assert.equal(isAllowedApkUrl(undefined), false);
});

test('Tahap 10 TES SANITASI NAMA FILE: sanitizeFileName mencegah path traversal dan karakter terlarang', () => {
  // Path traversal dicegah
  assert.equal(sanitizeFileName('../../etc/passwd'), 'etc_passwd');
  assert.equal(sanitizeFileName('..\\..\\windows\\system32'), 'windows_system32');

  // Karakter ilegal diganti underscore
  assert.equal(sanitizeFileName('Hasil Turnamen: Grand Prix [2026].csv'), 'Hasil_Turnamen_Grand_Prix_2026_.csv');
  assert.equal(sanitizeFileName('Hasil-Ronde-1_Final.png'), 'Hasil-Ronde-1_Final.png');

  // Fallback untuk string kosong
  assert.equal(sanitizeFileName(''), 'file');
  assert.equal(sanitizeFileName(null), 'file');
  assert.equal(sanitizeFileName(undefined), 'file');
  assert.equal(sanitizeFileName('///'), 'file');
});

test('Tahap 10 TES LOGIKA TOAST: Siklus hidup toast (satu toast per waktu, jeda saat sentuh, dan tutup manual)', () => {
  let currentToast = null;
  let timerActive = false;
  let remainingMs = 5000;
  let counter = 0;

  const showToast = (toast) => {
    // Satu pop-up pada satu waktu (menggantikan yang lama)
    counter++;
    currentToast = { ...toast, id: `toast_${Date.now()}_${counter}` };
    remainingMs = toast.durationMs || 5000;
    timerActive = true;
  };

  const pauseTimer = (elapsedMs) => {
    timerActive = false;
    remainingMs = Math.max(0, remainingMs - elapsedMs);
  };

  const resumeTimer = () => {
    timerActive = true;
  };

  const dismissToast = () => {
    currentToast = null;
    timerActive = false;
  };

  // 1. Buat toast baru
  showToast({
    type: 'success',
    title: 'Ekspor berhasil',
    description: 'File tersimpan di folder Unduhan.'
  });
  assert.ok(currentToast);
  assert.equal(currentToast.type, 'success');
  assert.equal(currentToast.title, 'Ekspor berhasil');
  assert.equal(timerActive, true);
  assert.equal(remainingMs, 5000);

  // 2. Jeda saat disentuh (misal disentuh setelah 2 detik berlalu)
  pauseTimer(2000);
  assert.equal(timerActive, false);
  assert.equal(remainingMs, 3000);

  // 3. Lanjutkan saat dilepas
  resumeTimer();
  assert.equal(timerActive, true);

  // 4. Toast baru menggantikan toast lama
  const prevId = currentToast.id;
  showToast({
    type: 'error',
    title: 'Unduhan gagal',
    description: 'Periksa koneksi lalu coba lagi.'
  });
  assert.notEqual(currentToast.id, prevId);
  assert.equal(currentToast.type, 'error');
  assert.equal(currentToast.title, 'Unduhan gagal');
  assert.equal(remainingMs, 5000);

  // 5. Tutup manual (tombol X)
  dismissToast();
  assert.equal(currentToast, null);
  assert.equal(timerActive, false);
});
