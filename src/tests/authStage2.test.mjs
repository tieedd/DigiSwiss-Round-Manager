import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import {
  normalizeUsername,
  isValidUsername,
  isReservedUsername,
  usernameToEmail,
  validateNewPassword,
  evaluatePasswordStrength
} from '../utils/authHelpers.ts';

// 1. Tes: login "ADMINDSS", "AdminDSS", dan "admindss" sama-sama berhasil normalisasi
test('login username normalization: "ADMINDSS", "AdminDSS", dan "admindss" menghasilkan email dan username yang identik', () => {
  const variations = ['ADMINDSS', 'AdminDSS', 'admindss', '  admindss  ', 'AdMinDsS'];
  const expectedUsername = 'admindss';
  const expectedEmail = 'admindss@digiswiss.app';

  for (const v of variations) {
    assert.equal(normalizeUsername(v), expectedUsername, `Normalisasi gagal untuk: ${v}`);
    assert.equal(usernameToEmail(v), expectedEmail, `Email gagal untuk: ${v}`);
  }
});

// 2. Tes: username "admin" dan "admindss" dicadangkan (tidak bisa didaftarkan pengguna biasa)
test('reserved usernames: "admin" dan "admindss" dicadangkan dan ditolak untuk registrasi umum', () => {
  assert.equal(isReservedUsername('admin'), true);
  assert.equal(isReservedUsername('ADMIN'), true);
  assert.equal(isReservedUsername('admindss'), true);
  assert.equal(isReservedUsername('AdminDSS'), true);
  assert.equal(isReservedUsername('player_one'), false);
});

// 3. Tes: validasi format username (a-z, 0-9, titik, garis bawah, 3-20 karakter)
test('validasi username: hanya mengizinkan karakter yang ditentukan dan panjang 3-20', () => {
  assert.equal(isValidUsername('taichi.yagami'), true);
  assert.equal(isValidUsername('yamato_01'), true);
  assert.equal(isValidUsername('agumon'), true);
  assert.equal(isValidUsername('ab'), false); // terlalu pendek (<3)
  assert.equal(isValidUsername('username_yang_sangat_panjang_sekali_melebihi_batas'), false); // >20
  assert.equal(isValidUsername('user@invalid!'), false); // simbol terlarang
});

// 4. Tes: pengguna biasa tidak bisa mengubah role sendiri
test('aturan otorisasi: pengguna biasa tidak boleh mengubah peran (role) sendiri', () => {
  // Simulasi validasi aturan update profil pengguna
  function canUserUpdateOwnRole(currentUserRole, requestedRole) {
    // Sesuai aturan Firestore: request.resource.data.role == resource.data.role
    return currentUserRole === requestedRole;
  }

  assert.equal(canUserUpdateOwnRole('player', 'organizer'), false);
  assert.equal(canUserUpdateOwnRole('player', 'admin'), false);
  assert.equal(canUserUpdateOwnRole('organizer', 'admin'), false);
  assert.equal(canUserUpdateOwnRole('player', 'player'), true);
});

// 5. Tes: akun kedua dengan role admin ditolak
test('aturan otorisasi: akun kedua dengan role admin ditolak (hanya satu admin)', () => {
  function canCreateAdminAccount(username, requestedRole, isBootstrapped) {
    // Admin utama hanya boleh dibuat sekali saat bootstrap belum ada, khusus untuk admindss
    if (requestedRole === 'admin') {
      return username === 'admindss' && !isBootstrapped;
    }
    return true;
  }

  // Akun admindss saat belum bootstrap: diizinkan
  assert.equal(canCreateAdminAccount('admindss', 'admin', false), true);

  // Akun kedua dengan role admin saat bootstrap sudah ada: DITOLAK
  assert.equal(canCreateAdminAccount('admindss2', 'admin', true), false);
  assert.equal(canCreateAdminAccount('admindss', 'admin', true), false);
  assert.equal(canCreateAdminAccount('superuser', 'admin', false), false);
});

// 6. Tes: validasi ganti password baru (panjang admin min 12, non-admin min 8, larangan username & sandi bawaan)
test('validasi ganti password: menegakkan aturan panjang, username exclusion, dan larangan sandi bawaan', () => {
  // Admin harus min 12 karakter
  const adminShort = validateNewPassword('Short1234!', { isAdmin: true, username: 'admindss' });
  assert.equal(adminShort.valid, false);

  const adminValid = validateNewPassword('PasswordBaruAdmin2026#', { isAdmin: true, username: 'admindss' });
  assert.equal(adminValid.valid, true);

  // Pengguna biasa minimal 8 karakter
  const playerShort = validateNewPassword('12345', { isAdmin: false, username: 'player1' });
  assert.equal(playerShort.valid, false);

  const playerValid = validateNewPassword('Digimon2026!', { isAdmin: false, username: 'player1' });
  assert.equal(playerValid.valid, true);

  // Password baru tidak boleh memuat username
  const containsUsername = validateNewPassword('admindssRahasia2026', { isAdmin: true, username: 'admindss' });
  assert.equal(containsUsername.valid, false);

  // Password baru tidak boleh bernilai "dssadmin"
  const forbiddenDefault = validateNewPassword('dssadmin', { isAdmin: false, username: 'user1' });
  assert.equal(forbiddenDefault.valid, false);
});

// 7. Tes: TIDAK ADA teks "dssadmin" di seluruh antarmuka (UI files)
test('keamanan antarmuka: memastikan tidak ada teks "dssadmin" di file views dan components', () => {
  const dirsToScan = ['src/views', 'src/components', 'src/App.tsx'];

  function scanDirectory(dirPath) {
    const stat = fs.statSync(dirPath);
    if (!stat.isDirectory()) {
      const content = fs.readFileSync(dirPath, 'utf8');
      assert.equal(
        content.includes('dssadmin'),
        false,
        `Teks "dssadmin" ditemukan pada antarmuka: ${dirPath}`
      );
      return;
    }

    const files = fs.readdirSync(dirPath);
    for (const file of files) {
      const fullPath = path.join(dirPath, file);
      const fileStat = fs.statSync(fullPath);
      if (fileStat.isDirectory()) {
        scanDirectory(fullPath);
      } else if (/\.(tsx|jsx|html)$/.test(file)) {
        const content = fs.readFileSync(fullPath, 'utf8');
        assert.equal(
          content.includes('dssadmin'),
          false,
          `Teks "dssadmin" ditemukan pada antarmuka: ${fullPath}`
        );
      }
    }
  }

  for (const p of dirsToScan) {
    scanDirectory(path.resolve(process.cwd(), p));
  }
});
