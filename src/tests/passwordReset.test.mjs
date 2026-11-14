import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  createResetCodeWithAuth,
  normalizeResetCode,
  normalizeResetPin,
  normalizeResetUsername,
  PasswordResetError,
  resetPasswordWithCode,
  resetPasswordWithPin,
} from '../services/passwordResetClient.ts';
import { RESET_API_URL } from '../config/resetApi.ts';

test('RESET PASSWORD: normalisasi username, kode reset, dan PIN', () => {
  assert.equal(normalizeResetUsername('  Taichi.Yagami  '), 'taichi.yagami');
  assert.equal(normalizeResetUsername('PLAYER_01'), 'player_01');
  assert.equal(normalizeResetUsername(''), '');

  assert.equal(normalizeResetCode('  ab12 cd34 ef  '), 'AB12CD34EF');
  assert.equal(normalizeResetCode('x9y8\tz7w6\n54'), 'X9Y8Z7W654');

  assert.equal(normalizeResetPin('12a3b4c5678'), '123456');
  assert.equal(normalizeResetPin(' 09-87-65 '), '098765');
});

test('RESET PASSWORD: resetPasswordWithPin mengirim POST text/plain tanpa header lain dan menangani sukses', async () => {
  let capturedUrl = '';
  let capturedInit = null;

  const mockFetch = async (url, init) => {
    capturedUrl = url;
    capturedInit = init;
    return {
      text: async () => JSON.stringify({ ok: true, mode: 'pin', needsNewPin: false }),
    };
  };

  const res = await resetPasswordWithPin('  PlayerOne ', '12a3456', 'BaruAman!23', mockFetch);
  assert.deepEqual(res, { ok: true, mode: 'pin', needsNewPin: false });
  assert.equal(capturedUrl, RESET_API_URL);
  assert.equal(capturedInit.method, 'POST');
  assert.equal(capturedInit.redirect, 'follow');
  assert.deepEqual(capturedInit.headers, {
    'Content-Type': 'text/plain;charset=utf-8',
  });

  const sentBody = JSON.parse(capturedInit.body);
  assert.deepEqual(sentBody, {
    action: 'resetWithPin',
    username: 'playerone',
    pin: '123456',
    newPassword: 'BaruAman!23',
  });
});

test('RESET PASSWORD: resetPasswordWithCode mengirim payload ter-normalisasi dan mengembalikan needsNewPin true', async () => {
  let sentBody = null;

  const mockFetch = async (_url, init) => {
    sentBody = JSON.parse(init.body);
    return {
      text: async () => JSON.stringify({ ok: true, mode: 'code', needsNewPin: true }),
    };
  };

  const res = await resetPasswordWithCode('  UserDemo ', ' ab12 cd34 ef ', 'PassBaru!99', mockFetch);
  assert.deepEqual(res, { ok: true, mode: 'code', needsNewPin: true });
  assert.deepEqual(sentBody, {
    action: 'resetWithCode',
    username: 'userdemo',
    code: 'AB12CD34EF',
    newPassword: 'PassBaru!99',
  });
});

test('RESET PASSWORD: error mismatch dan locked membawa remainingAttempts dan lockedUntil', async () => {
  const mismatchFetch = async () => ({
    text: async () =>
      JSON.stringify({
        ok: false,
        code: 'mismatch',
        message: 'PIN tidak cocok.',
        remainingAttempts: 3,
      }),
  });

  await assert.rejects(
    () => resetPasswordWithPin('playerone', '111111', 'PasswordBaru123', mismatchFetch),
    (err) => {
      assert.ok(err instanceof PasswordResetError);
      assert.equal(err.code, 'mismatch');
      assert.equal(err.message, 'PIN tidak cocok.');
      assert.equal(err.remainingAttempts, 3);
      return true;
    }
  );

  const lockTs = Date.now() + 15 * 60 * 1000;
  const lockedFetch = async () => ({
    text: async () =>
      JSON.stringify({
        ok: false,
        code: 'locked',
        message: 'Akun dikunci sementara.',
        lockedUntil: lockTs,
      }),
  });

  await assert.rejects(
    () => resetPasswordWithPin('playerone', '111111', 'PasswordBaru123', lockedFetch),
    (err) => {
      assert.ok(err instanceof PasswordResetError);
      assert.equal(err.code, 'locked');
      assert.equal(err.lockedUntil, lockTs);
      return true;
    }
  );
});

test('RESET PASSWORD: error jaringan, respons non-JSON, dan timeout ditangani jelas', async () => {
  const networkFetch = async () => {
    throw new TypeError('Failed to fetch');
  };

  await assert.rejects(
    () => resetPasswordWithPin('playerone', '123456', 'PasswordBaru123', networkFetch),
    (err) => {
      assert.ok(err instanceof PasswordResetError);
      assert.equal(err.code, 'network_error');
      assert.equal(err.message, 'Tidak dapat menghubungi server reset. Periksa koneksi internet.');
      return true;
    }
  );

  const nonJsonFetch = async () => ({
    text: async () => '<html>502 Bad Gateway</html>',
  });

  await assert.rejects(
    () => resetPasswordWithCode('playerone', 'ABCD123456', 'PasswordBaru123', nonJsonFetch),
    (err) => {
      assert.ok(err instanceof PasswordResetError);
      assert.equal(err.code, 'invalid_response');
      return true;
    }
  );

  const timeoutFetch = async () => {
    const abortErr = new Error('The operation was aborted');
    abortErr.name = 'AbortError';
    throw abortErr;
  };

  await assert.rejects(
    () => resetPasswordWithPin('playerone', '123456', 'PasswordBaru123', timeoutFetch),
    (err) => {
      assert.ok(err instanceof PasswordResetError);
      assert.equal(err.code, 'timeout');
      return true;
    }
  );
});

test('ADMIN RESET CODE: reauthenticate wajib dijalankan lebih dulu dan tidak mengirim HTTP jika gagal', async () => {
  const callOrder = [];
  let fetchCalled = false;

  await assert.rejects(
    () =>
      createResetCodeWithAuth('PlayerOne', 60, 'wrong-admin-pass', {
        reauthenticate: async () => {
          callOrder.push('reauth');
          throw new Error('Password konfirmasi tidak sesuai.');
        },
        getIdToken: async () => {
          callOrder.push('token');
          return 'fake-token';
        },
        fetchImpl: async () => {
          fetchCalled = true;
          return { text: async () => JSON.stringify({ ok: true }) };
        },
      }),
    /Password konfirmasi tidak sesuai/
  );

  assert.deepEqual(callOrder, ['reauth']);
  assert.equal(fetchCalled, false, 'Tidak boleh memanggil server jika reauthenticate gagal');

  const callOrderOk = [];
  let postedBody = null;
  const expiresAt = Date.now() + 3600_000;

  const res = await createResetCodeWithAuth('  TargetUser ', 360, 'correct-admin-pass', {
    reauthenticate: async (pwd) => {
      assert.equal(pwd, 'correct-admin-pass');
      callOrderOk.push('reauth');
      return true;
    },
    getIdToken: async () => {
      callOrderOk.push('token');
      return 'fresh-id-token-xyz';
    },
    fetchImpl: async (_url, init) => {
      callOrderOk.push('fetch');
      postedBody = JSON.parse(init.body);
      return {
        text: async () =>
          JSON.stringify({
            ok: true,
            code: 'QWER5678TY',
            expiresAt,
            minutes: 360,
          }),
      };
    },
  });

  assert.deepEqual(callOrderOk, ['reauth', 'token', 'fetch']);
  assert.deepEqual(postedBody, {
    action: 'createResetCode',
    idToken: 'fresh-id-token-xyz',
    username: 'targetuser',
    minutes: 360,
  });
  assert.deepEqual(res, {
    ok: true,
    code: 'QWER5678TY',
    expiresAt,
    minutes: 360,
  });
});

test('KEAMANAN: tidak ada logging/penyimpanan PIN, password, kode reset, atau idToken serta aturan firestore & README aman', () => {
  const checkedFiles = [
    'src/config/resetApi.ts',
    'src/services/passwordResetClient.ts',
    'src/services/passwordResetService.ts',
    'src/views/LoginView.tsx',
  ];

  for (const relPath of checkedFiles) {
    const content = fs.readFileSync(path.resolve(relPath), 'utf-8');
    assert.equal(
      /console\.(log|info|debug|warn|error)\s*\(/.test(content),
      false,
      `${relPath} tidak boleh memanggil console.* agar data sensitif tidak tercetak`
    );
    assert.equal(
      /(localStorage|sessionStorage)\.(setItem|getItem)/.test(content),
      false,
      `${relPath} tidak boleh menyimpan state ke localStorage/sessionStorage`
    );
  }

  const adminUsersContent = fs.readFileSync(path.resolve('src/views/admin/AdminUsersView.tsx'), 'utf-8');
  assert.equal(
    /console\.(log|info|debug|warn|error).*?(resetAdminPassword|generatedResetResult|resetCode|idToken|pin)/i.test(adminUsersContent),
    false,
    'AdminUsersView tidak boleh mencetak password admin atau kode reset ke console'
  );
  assert.equal(
    /recordAuditLog\s*\([^)]*(generatedResetResult|resetAdminPassword|resetCode)/i.test(adminUsersContent),
    false,
    'AdminUsersView tidak boleh mencatat kode reset atau password ke audit log'
  );

  const rulesContent = fs.readFileSync(path.resolve('firestore.rules'), 'utf-8');
  assert.ok(
    /match\s+\/resetGuards\/\{docId\}\s*\{\s*allow read, write: if false;\s*\}/s.test(rulesContent),
    'firestore.rules harus menolak eksplisit read/write pada resetGuards'
  );
  assert.ok(
    /match\s+\/resetCodes\/\{docId\}\s*\{\s*allow read, write: if false;\s*\}/s.test(rulesContent),
    'firestore.rules harus menolak eksplisit read/write pada resetCodes'
  );

  const readmeContent = fs.readFileSync(path.resolve('README.md'), 'utf-8');
  assert.equal(
    readmeContent.includes('script.google.com/macros'),
    false,
    'README.md tidak boleh mencantumkan URL rahasia RESET_API_URL'
  );
});
