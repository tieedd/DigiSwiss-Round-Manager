import test from 'node:test';
import assert from 'node:assert/strict';
import {
  isUpdateAvailable,
  compareVersions,
  parseSemver,
  resolveReleaseFromTag
} from '../services/versionService.ts';
import {
  shouldShowUpdatePopup,
  constructReleaseDownloadUrl,
  isAllowedApkUrl
} from '../utils/nativeHelpers.ts';

test('LOGIKA MURNI VERSI: parseSemver, isUpdateAvailable, dan compareVersions', () => {
  // Parsing semver valid dan pembuangan awalan v
  assert.deepEqual(parseSemver('1.0.0'), [1, 0, 0]);
  assert.deepEqual(parseSemver('v1.4.2'), [1, 4, 2]);
  assert.deepEqual(parseSemver('  v2.10.3  '), [2, 10, 3]);
  assert.equal(parseSemver('invalid'), null);
  assert.equal(parseSemver(''), null);
  assert.equal(parseSemver(null), null);

  // isUpdateAvailable: hanya true bila versi terbaru lebih besar dari versi saat ini
  assert.equal(isUpdateAvailable('1.0.1', '1.0.0'), true);
  assert.equal(isUpdateAvailable('v1.1.0', '1.0.9'), true);
  assert.equal(isUpdateAvailable('1.0.10', '1.0.2'), true);
  assert.equal(isUpdateAvailable('2.0.0', '1.9.9'), true);

  // Versi sama atau lebih rendah menghasilkan false
  assert.equal(isUpdateAvailable('1.0.0', '1.0.0'), false);
  assert.equal(isUpdateAvailable('v1.0.0', '1.0.0'), false);
  assert.equal(isUpdateAvailable('0.9.9', '1.0.0'), false);
  assert.equal(isUpdateAvailable('1.0.0', '1.0.1'), false);
  assert.equal(isUpdateAvailable(null, '1.0.0'), false);
  assert.equal(isUpdateAvailable('invalid', '1.0.0'), false);

  // compareVersions
  assert.equal(compareVersions('1.0.1', '1.0.0'), 1);
  assert.equal(compareVersions('1.0.0', '1.0.0'), 0);
  assert.equal(compareVersions('1.0.0', '1.0.1'), -1);
  assert.equal(compareVersions('1.10.0', '1.2.0'), 1);
});

test('LOGIKA MURNI POPUP: Keputusan tampil sekali per login, Lain kali menutup di sesi yang sama, tidak tampil di layar auth', () => {
  // 1. Saat user berhasil login di layar utama dan ada update baru -> Popup WAJIB tampil
  const initialLoginState = {
    hasUpdate: true,
    isPopupDismissed: false,
    isAllowedScreen: true // Layar utama
  };
  assert.equal(shouldShowUpdatePopup(initialLoginState), true);

  // 2. Tidak boleh tampil di layar Login, Ganti Password, atau Buat PIN
  const authSetupScreens = [
    { hasUpdate: true, isPopupDismissed: false, isAllowedScreen: false }, // LoginView
    { hasUpdate: true, isPopupDismissed: false, isAllowedScreen: false }, // ChangePasswordView
    { hasUpdate: true, isPopupDismissed: false, isAllowedScreen: false }  // CreatePinView
  ];
  for (const screenState of authSetupScreens) {
    assert.equal(shouldShowUpdatePopup(screenState), false);
  }

  // 3. User menekan "Lain kali": popup ditutup untuk sisa sesi (isPopupDismissed = true)
  const afterDismissState = {
    hasUpdate: true,
    isPopupDismissed: true,
    isAllowedScreen: true
  };
  assert.equal(shouldShowUpdatePopup(afterDismissState), false);

  // 4. Di tengah sesi yang sama berpindah tab / layar utama, popup tetap TIDAK muncul lagi
  const tabChangeState = {
    hasUpdate: true,
    isPopupDismissed: true,
    isAllowedScreen: true
  };
  assert.equal(shouldShowUpdatePopup(tabChangeState), false);

  // 5. User logout lalu login kembali di sesi baru (resetPopupOnNewLogin() -> isPopupDismissed = false)
  const nextLoginState = {
    hasUpdate: true,
    isPopupDismissed: false, // Reset pada login baru
    isAllowedScreen: true
  };
  assert.equal(shouldShowUpdatePopup(nextLoginState), true);

  // 6. Jika tidak ada update, popup tidak pernah tampil
  const noUpdateState = {
    hasUpdate: false,
    isPopupDismissed: false,
    isAllowedScreen: true
  };
  assert.equal(shouldShowUpdatePopup(noUpdateState), false);
});

test('LOGIKA MURNI JALUR CADANGAN: Resolusi rilis dari tag header Location saat GitHub API gagal', () => {
  // Tag yang diekstrak dari header Location GitHub (misal v1.4.0)
  const rawTag = 'v1.4.0';
  const resolved = resolveReleaseFromTag(rawTag, '1.0.0');

  // Tag dibersihkan dari awalan "v" untuk latestVersion
  assert.equal(resolved.latestVersion, '1.4.0');
  assert.equal(resolved.currentVersion, '1.0.0');
  assert.equal(resolved.hasUpdate, true);

  // Download URL mengikuti pola resmi tieedd/DigiSwiss-Round-Manager
  const expectedDownloadUrl =
    'https://github.com/tieedd/DigiSwiss-Round-Manager/releases/download/v1.4.0/DigiSwiss-Round-v1.4.0.apk';
  assert.equal(resolved.downloadUrl, expectedDownloadUrl);

  const expectedHtmlUrl =
    'https://github.com/tieedd/DigiSwiss-Round-Manager/releases/tag/v1.4.0';
  assert.equal(resolved.htmlUrl, expectedHtmlUrl);

  // URL yang dihasilkan wajib diizinkan oleh isAllowedApkUrl
  assert.equal(isAllowedApkUrl(resolved.downloadUrl), true);

  // constructReleaseDownloadUrl menghasilkan URL yang identik
  assert.equal(constructReleaseDownloadUrl('1.4.0'), expectedDownloadUrl);
  assert.equal(constructReleaseDownloadUrl('v1.4.0'), expectedDownloadUrl);
});

test('LOGIKA MURNI VALIDASI KEAMANAN REPO: isAllowedApkUrl membatasi ketat ke tieedd/DigiSwiss-Round-Manager', () => {
  // Diterima: repo resmi tieedd/DigiSwiss-Round-Manager
  assert.equal(
    isAllowedApkUrl('https://github.com/tieedd/DigiSwiss-Round-Manager/releases/download/v1.0.0/DigiSwiss-Round-v1.0.0.apk'),
    true
  );
  assert.equal(
    isAllowedApkUrl('https://github.com/tieedd/digiswiss-round-manager/releases/download/v1.0.0/app-release.apk'),
    true
  );

  // Diterima: host redirect CDN asset resmi GitHub
  assert.equal(
    isAllowedApkUrl('https://objects.githubusercontent.com/github-production-release-asset/123/app.apk'),
    true
  );

  // DITOLAK: repositori repo lain di GitHub
  assert.equal(
    isAllowedApkUrl('https://github.com/darryhafidh/digiswiss-round/releases/download/v1.0.0/app.apk'),
    false
  );
  assert.equal(
    isAllowedApkUrl('https://github.com/attacker/malicious-repo/releases/download/v1.0.0/app.apk'),
    false
  );
  assert.equal(
    isAllowedApkUrl('https://github.com/tieedd/other-project/releases/download/v1.0.0/app.apk'),
    false
  );

  // DITOLAK: protokol selain https
  assert.equal(
    isAllowedApkUrl('http://github.com/tieedd/DigiSwiss-Round-Manager/releases/download/v1.0.0/DigiSwiss-Round-v1.0.0.apk'),
    false
  );

  // DITOLAK: ekstensi selain .apk
  assert.equal(
    isAllowedApkUrl('https://github.com/tieedd/DigiSwiss-Round-Manager/releases/download/v1.0.0/readme.txt'),
    false
  );
});
