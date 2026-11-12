import test from 'node:test';
import assert from 'node:assert/strict';
import {
  isValidOtaManifest,
  validateOtaManifest,
  resolveUpdateMode,
  buildUpdatePresentation,
  getUpdateModeLabel
} from '../services/otaService.ts';

test('LOGIKA OTA: isValidOtaManifest validasi ketat format manifest', () => {
  // 1. Valid manifest
  assert.equal(
    isValidOtaManifest({
      version: '1.2.0',
      bundle: 'DigiSwiss-Round-web-v1.2.0.zip',
      sha256: 'a1b2c3d4e5f67890123456789abcdef0123456789abcdef0123456789abcdef0',
      minNativeVersion: '1.0.0'
    }),
    true
  );

  // 2. Hash kosong
  assert.equal(
    isValidOtaManifest({
      version: '1.2.0',
      bundle: 'DigiSwiss-Round-web-v1.2.0.zip',
      sha256: '',
      minNativeVersion: '1.0.0'
    }),
    false
  );

  // 3. Hash salah panjang (misal 32 karakter atau 63 karakter)
  assert.equal(
    isValidOtaManifest({
      version: '1.2.0',
      bundle: 'DigiSwiss-Round-web-v1.2.0.zip',
      sha256: 'a'.repeat(63),
      minNativeVersion: '1.0.0'
    }),
    false
  );
  assert.equal(
    isValidOtaManifest({
      version: '1.2.0',
      bundle: 'DigiSwiss-Round-web-v1.2.0.zip',
      sha256: 'a'.repeat(65),
      minNativeVersion: '1.0.0'
    }),
    false
  );
  assert.equal(
    isValidOtaManifest({
      version: '1.2.0',
      bundle: 'DigiSwiss-Round-web-v1.2.0.zip',
      sha256: 'not-hex'.repeat(10),
      minNativeVersion: '1.0.0'
    }),
    false
  );

  // 4. Versi aneh seperti "../1.0.0" atau "invalid"
  assert.equal(
    isValidOtaManifest({
      version: '../1.0.0',
      bundle: 'bundle.zip',
      sha256: 'a'.repeat(64),
      minNativeVersion: '1.0.0'
    }),
    false
  );
  assert.equal(
    isValidOtaManifest({
      version: '1.0',
      bundle: 'bundle.zip',
      sha256: 'a'.repeat(64),
      minNativeVersion: '1.0.0'
    }),
    false
  );

  // 5. Bundle berisi path traversal atau bukan file zip murni
  assert.equal(
    isValidOtaManifest({
      version: '1.2.0',
      bundle: '../bundle.zip',
      sha256: 'a'.repeat(64),
      minNativeVersion: '1.0.0'
    }),
    false
  );
  assert.equal(
    isValidOtaManifest({
      version: '1.2.0',
      bundle: 'folder/bundle.zip',
      sha256: 'a'.repeat(64),
      minNativeVersion: '1.0.0'
    }),
    false
  );
  assert.equal(
    isValidOtaManifest({
      version: '1.2.0',
      bundle: 'bundle.tar.gz',
      sha256: 'a'.repeat(64),
      minNativeVersion: '1.0.0'
    }),
    false
  );

  // 6. Manifest bukan objek atau null
  assert.equal(isValidOtaManifest(null), false);
  assert.equal(isValidOtaManifest(undefined), false);
  assert.equal(isValidOtaManifest('string'), false);
});

test('LOGIKA OTA: validateOtaManifest validasi format manifest dan hash sha256', () => {
  // 1. Manifest valid lengkap
  const validManifest = {
    version: '1.2.0',
    bundle: 'DigiSwiss-Round-web-v1.2.0.zip',
    sha256: 'A1B2C3D4E5F67890123456789ABCDEF0123456789ABCDEF0123456789ABCDEF0',
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

  // 3. Kasus invalid
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

test('LOGIKA OTA: buildUpdatePresentation satu sumber kebenaran popup & banner', () => {
  const dummySha = 'a'.repeat(64);

  // 1. latest 1.9.1 dari releaseInfo, manifest gagal -> visible, latestVersion 1.9.1, mode 'apk'
  const case1 = buildUpdatePresentation({
    releaseInfo: {
      hasUpdate: true,
      currentVersion: '1.9.0',
      latestVersion: '1.9.1',
      error: false
    },
    decision: {
      mode: 'none',
      latestVersion: '',
      currentWebVersion: '1.9.0',
      minNativeVersion: '1.0',
      nativeVersion: '1.9.0',
      hasUpdate: false,
      error: true,
      reason: 'Manifest gagal'
    },
    currentWebVersion: '1.9.0',
    nativeVersion: '1.9.0'
  });
  assert.equal(case1.visible, true);
  assert.equal(case1.latestVersion, '1.9.1');
  assert.equal(case1.mode, 'apk');
  assert.equal(case1.currentVersionLabel, '1.9.0');
  assert.equal(
    case1.downloadSource,
    'https://github.com/tieedd/DigiSwiss-Round-Manager/releases/download/v1.9.1/DigiSwiss-Round-v1.9.1.apk'
  );
  assert.equal(getUpdateModeLabel(case1.mode), 'Pembaruan Aplikasi (Perlu APK Baru)');

  // 2. manifest 1.9.0 basi, releaseInfo 1.9.1 -> latestVersion 1.9.1, tidak pernah tampil 1.9.0 -> 1.9.0
  const case2 = buildUpdatePresentation({
    releaseInfo: {
      hasUpdate: true,
      currentVersion: '1.9.0',
      latestVersion: '1.9.1',
      error: false
    },
    decision: {
      mode: 'none',
      latestVersion: '1.9.0',
      currentWebVersion: '1.9.0',
      minNativeVersion: '1.9.0',
      nativeVersion: '1.9.0',
      hasUpdate: false,
      manifest: {
        version: '1.9.0',
        bundle: 'DigiSwiss-Round-web-v1.9.0.zip',
        sha256: dummySha,
        minNativeVersion: '1.9.0'
      },
      reason: 'Stale manifest'
    },
    currentWebVersion: '1.9.0',
    nativeVersion: '1.9.0'
  });
  assert.equal(case2.visible, true);
  assert.equal(case2.latestVersion, '1.9.1');
  assert.equal(case2.mode, 'apk');
  assert.notEqual(case2.latestVersion, '1.9.0');
  assert.equal(case2.currentVersionLabel, '1.9.0');

  // 3. semua sama (1.9.1 vs 1.9.1) -> visible false
  const case3 = buildUpdatePresentation({
    releaseInfo: {
      hasUpdate: false,
      currentVersion: '1.9.1',
      latestVersion: '1.9.1',
      error: false
    },
    decision: {
      mode: 'none',
      latestVersion: '1.9.1',
      currentWebVersion: '1.9.1',
      minNativeVersion: '1.9.1',
      nativeVersion: '1.9.1',
      hasUpdate: false,
      manifest: {
        version: '1.9.1',
        bundle: 'DigiSwiss-Round-web-v1.9.1.zip',
        sha256: dummySha,
        minNativeVersion: '1.9.1'
      },
      reason: 'Sudah terbaru'
    },
    currentWebVersion: '1.9.1',
    nativeVersion: '1.9.1'
  });
  assert.equal(case3.visible, false);
  assert.equal(case3.mode, 'none');
  assert.equal(getUpdateModeLabel(case3.mode), '');

  // 4. web 1.9.1, native 1.9.1, manifest 1.9.2 minNative 1.9.1 -> mode 'ota'
  const case4 = buildUpdatePresentation({
    releaseInfo: {
      hasUpdate: true,
      currentVersion: '1.9.1',
      latestVersion: '1.9.2',
      error: false
    },
    decision: {
      mode: 'ota',
      latestVersion: '1.9.2',
      currentWebVersion: '1.9.1',
      minNativeVersion: '1.9.1',
      nativeVersion: '1.9.1',
      hasUpdate: true,
      manifest: {
        version: '1.9.2',
        bundle: 'DigiSwiss-Round-web-v1.9.2.zip',
        sha256: dummySha,
        minNativeVersion: '1.9.1'
      },
      reason: 'OTA'
    },
    currentWebVersion: '1.9.1',
    nativeVersion: '1.9.1'
  });
  assert.equal(case4.visible, true);
  assert.equal(case4.latestVersion, '1.9.2');
  assert.equal(case4.mode, 'ota');
  assert.equal(case4.currentVersionLabel, '1.9.1');
  assert.equal(
    case4.downloadSource,
    'https://github.com/tieedd/DigiSwiss-Round-Manager/releases/download/v1.9.2/DigiSwiss-Round-web-v1.9.2.zip'
  );
  assert.equal(getUpdateModeLabel(case4.mode), 'Pembaruan Web Cepat (OTA)');

  // 5. native 1.9.0, manifest 1.9.1 minNative 1.9.1 -> mode 'apk', currentVersionLabel = native
  const case5 = buildUpdatePresentation({
    releaseInfo: {
      hasUpdate: true,
      currentVersion: '1.9.0',
      latestVersion: '1.9.1',
      error: false
    },
    decision: {
      mode: 'apk',
      latestVersion: '1.9.1',
      currentWebVersion: '1.9.1',
      minNativeVersion: '1.9.1',
      nativeVersion: '1.9.0',
      hasUpdate: true,
      manifest: {
        version: '1.9.1',
        bundle: 'DigiSwiss-Round-web-v1.9.1.zip',
        sha256: dummySha,
        minNativeVersion: '1.9.1'
      },
      reason: 'Need APK'
    },
    currentWebVersion: '1.9.1',
    nativeVersion: '1.9.0'
  });
  assert.equal(case5.visible, true);
  assert.equal(case5.latestVersion, '1.9.1');
  assert.equal(case5.mode, 'apk');
  assert.equal(case5.currentVersionLabel, '1.9.0');

  // 6. semua sumber gagal -> visible false
  const case6 = buildUpdatePresentation({
    releaseInfo: {
      hasUpdate: false,
      currentVersion: '1.9.0',
      latestVersion: '1.9.0',
      error: true
    },
    decision: {
      mode: 'none',
      latestVersion: '',
      currentWebVersion: '1.9.0',
      minNativeVersion: '1.0',
      nativeVersion: '1.9.0',
      hasUpdate: false,
      error: true,
      reason: 'Gagal'
    },
    currentWebVersion: '1.9.0',
    nativeVersion: '1.9.0'
  });
  assert.equal(case6.visible, false);
  assert.equal(case6.mode, 'none');

  // 7. Tambahan: jika native sudah >= latestVersion tapi web tertinggal dan manifest gagal -> jangan tampil vX -> vX
  const case7 = buildUpdatePresentation({
    releaseInfo: {
      hasUpdate: true,
      currentVersion: '1.9.0',
      latestVersion: '1.9.1',
      error: false
    },
    decision: null,
    currentWebVersion: '1.9.0',
    nativeVersion: '1.9.1'
  });
  assert.equal(case7.visible, false);
  assert.equal(case7.mode, 'none');
});
