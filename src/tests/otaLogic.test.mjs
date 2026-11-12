import test from 'node:test';
import assert from 'node:assert/strict';
import {
  validateOtaManifest,
  resolveUpdateMode
} from '../services/otaService.ts';

test('LOGIKA OTA: validateOtaManifest validasi format manifest dan hash sha256', () => {
  // 1. Manifest valid lengkap
  const validManifest = {
    version: '1.2.0',
    bundle: 'DigiSwiss-Round-web-v1.2.0.zip',
    sha256: 'a1b2c3d4e5f67890123456789abcdef0123456789abcdef0123456789abcdef0',
    minNativeVersion: '1.0.0'
  };
  const res1 = validateOtaManifest(validManifest);
  assert.equal(res1.valid, true, 'Manifest valid harus lolos validasi');
  assert.ok(res1.manifest);
  assert.equal(res1.manifest.version, '1.2.0');
  assert.equal(res1.manifest.bundle, 'DigiSwiss-Round-web-v1.2.0.zip');
  assert.equal(res1.manifest.sha256, 'a1b2c3d4e5f67890123456789abcdef0123456789abcdef0123456789abcdef0');
  assert.equal(res1.manifest.minNativeVersion, '1.0.0');

  // 2. Manifest tanpa minNativeVersion default ke '1.0'
  const manifestNoMinNative = {
    version: '1.3.0',
    bundle: 'bundle.zip',
    sha256: '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef'
  };
  const res2 = validateOtaManifest(manifestNoMinNative);
  assert.equal(res2.valid, true);
  assert.equal(res2.manifest?.minNativeVersion, '1.0');

  // 3. Kasus invalid: bukan objek, version kosong, bundle kosong, sha256 terlalu pendek
  assert.equal(validateOtaManifest(null).valid, false);
  assert.equal(validateOtaManifest(undefined).valid, false);
  assert.equal(validateOtaManifest('string').valid, false);
  assert.equal(validateOtaManifest({ version: '', bundle: 'b.zip', sha256: 'a'.repeat(64) }).valid, false);
  assert.equal(validateOtaManifest({ version: '1.0.0', bundle: '', sha256: 'a'.repeat(64) }).valid, false);
  assert.equal(validateOtaManifest({ version: '1.0.0', bundle: 'b.zip', sha256: 'pendek' }).valid, false);
});

test('LOGIKA OTA: resolveUpdateMode keputusan murni antara ota, apk, atau none', () => {
  const currentWebVersion = '1.0.0';

  // 1. Tidak ada versi baru (versi web saat ini sudah >= versi manifest) -> mode: 'none'
  const decisionSame = resolveUpdateMode({
    latestWebVersion: '1.0.0',
    currentWebVersion,
    minNativeVersion: '1.0.0',
    currentNativeVersion: '1.0.0'
  });
  assert.equal(decisionSame.hasUpdate, false);
  assert.equal(decisionSame.mode, 'none');

  const decisionOlder = resolveUpdateMode({
    latestWebVersion: '0.9.5',
    currentWebVersion,
    minNativeVersion: '1.0.0',
    currentNativeVersion: '1.0.0'
  });
  assert.equal(decisionOlder.hasUpdate, false);
  assert.equal(decisionOlder.mode, 'none');

  // 2. Ada versi baru web (1.2.0 > 1.0.0) DAN native memenuhi syarat (native 1.0.0 >= minNative 1.0.0) -> mode: 'ota'
  const decisionOta = resolveUpdateMode({
    latestWebVersion: '1.2.0',
    currentWebVersion,
    minNativeVersion: '1.0.0',
    currentNativeVersion: '1.0.0'
  });
  assert.equal(decisionOta.hasUpdate, true);
  assert.equal(decisionOta.mode, 'ota');
  assert.equal(decisionOta.latestVersion, '1.2.0');
  assert.ok(decisionOta.reason.includes('OTA'));

  // 3. Ada versi baru web (1.2.0 > 1.0.0) TETAPI native tidak memenuhi syarat (native 1.0.0 < minNative 1.1.0) -> mode: 'apk'
  const decisionApk = resolveUpdateMode({
    latestWebVersion: '1.2.0',
    currentWebVersion,
    minNativeVersion: '1.1.0',
    currentNativeVersion: '1.0.0'
  });
  assert.equal(decisionApk.hasUpdate, true);
  assert.equal(decisionApk.mode, 'apk');
  assert.equal(decisionApk.minNativeVersion, '1.1.0');
  assert.ok(decisionApk.reason.includes('APK'));

  // 4. Native version tidak diketahui atau kosong -> fallback perbandingan (default '1.0')
  const decisionApkHigherMin = resolveUpdateMode({
    latestWebVersion: '1.2.0',
    currentWebVersion,
    minNativeVersion: '2.0.0',
    currentNativeVersion: '1.0.0'
  });
  assert.equal(decisionApkHigherMin.hasUpdate, true);
  assert.equal(decisionApkHigherMin.mode, 'apk');

  // 5. Parameter kosong/null -> mode: 'none'
  const decisionNull = resolveUpdateMode({
    latestWebVersion: null,
    currentWebVersion,
    minNativeVersion: '1.0.0',
    currentNativeVersion: '1.0.0'
  });
  assert.equal(decisionNull.hasUpdate, false);
  assert.equal(decisionNull.mode, 'none');
});
