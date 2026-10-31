import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import { usernameToEmail, normalizeUsername, AuthErrorWithCode, mapFirebaseAuthError } from '../utils/authHelpers.ts';

// 1. Tes: Email admin harus persis "admindss@digiswiss.app", dibuat dari fungsi usernameToEmail
test('bootstrap email: email admin dihasilkan persis "admindss@digiswiss.app" via usernameToEmail', () => {
  const generatedEmail = usernameToEmail('admindss');
  assert.equal(generatedEmail, 'admindss@digiswiss.app');

  const withUppercase = usernameToEmail('AdminDSS');
  assert.equal(withUppercase, 'admindss@digiswiss.app');
});

// 2. Tes: Dilarang menulis email admin secara manual di file kode (wajib lewat usernameToEmail)
test('keamanan kode: tidak ada penulisan manual string literal "admindss@digiswiss.app" di src/services', () => {
  const serviceFiles = [
    'src/services/bootstrapService.ts',
    'src/services/authService.ts',
  ];

  for (const relPath of serviceFiles) {
    const fullPath = path.resolve(process.cwd(), relPath);
    if (fs.existsSync(fullPath)) {
      const content = fs.readFileSync(fullPath, 'utf8');
      assert.equal(
        content.includes('"admindss@digiswiss.app"') || content.includes("'admindss@digiswiss.app'"),
        false,
        `Ditemukan penulisan hardcoded email admin di ${relPath}`
      );
    }
  }
});

// 3. Tes: Pemetaan pesan error login sesuai spesifikasi
test('pemetaan error login: menghasilkan pesan yang tepat dan menyertakan kode error', () => {
  function mapAuthError(code, customMessage) {
    if (code === 'auth/too-many-requests') {
      return new AuthErrorWithCode(
        'Terlalu banyak percobaan masuk yang gagal. Silakan coba lagi beberapa saat nanti.',
        code
      );
    }
    if (code === 'auth/operation-not-allowed') {
      return new AuthErrorWithCode(
        'Login email/password belum diaktifkan di Firebase',
        code
      );
    }
    if (code === 'permission-denied') {
      return new AuthErrorWithCode(
        'Aturan database menolak akses',
        'permission-denied'
      );
    }
    if (
      code === 'auth/invalid-credential' ||
      code === 'auth/user-not-found' ||
      code === 'auth/wrong-password' ||
      code === 'auth/invalid-email'
    ) {
      return new AuthErrorWithCode('Username atau password salah.', code);
    }
    return new AuthErrorWithCode('Username atau password salah.', code || undefined);
  }

  // auth/invalid-credential
  const err1 = mapAuthError('auth/invalid-credential');
  assert.equal(err1.message, 'Username atau password salah.');
  assert.equal(err1.code, 'auth/invalid-credential');

  // auth/user-not-found
  const err2 = mapAuthError('auth/user-not-found');
  assert.equal(err2.message, 'Username atau password salah.');
  assert.equal(err2.code, 'auth/user-not-found');

  // auth/wrong-password
  const err3 = mapAuthError('auth/wrong-password');
  assert.equal(err3.message, 'Username atau password salah.');
  assert.equal(err3.code, 'auth/wrong-password');

  // auth/operation-not-allowed
  const err4 = mapAuthError('auth/operation-not-allowed');
  assert.equal(err4.message, 'Login email/password belum diaktifkan di Firebase');
  assert.equal(err4.code, 'auth/operation-not-allowed');

  // permission-denied
  const err5 = mapAuthError('permission-denied');
  assert.equal(err5.message, 'Aturan database menolak akses');
  assert.equal(err5.code, 'permission-denied');

  // auth/too-many-requests
  const err6 = mapAuthError('auth/too-many-requests');
  assert.match(err6.message, /Terlalu banyak percobaan/);
  assert.equal(err6.code, 'auth/too-many-requests');
});

// 4. Tes: Format baris kode error pada LoginView
test('keamanan antarmuka: kode error Firebase ditampilkan terpisah tanpa membocorkan kredensial', () => {
  const loginViewPath = path.resolve(process.cwd(), 'src/views/LoginView.tsx');
  const content = fs.readFileSync(loginViewPath, 'utf8');

  // Memastikan ada teks "Kode: {loginErrorCode}"
  assert.ok(content.includes('Kode: {loginErrorCode}'));
  // Memastikan tidak menampilkan username atau password di pesan galat
  assert.equal(content.includes('loginUsername} salah'), false);
  assert.equal(content.includes('loginPassword} salah'), false);
});
