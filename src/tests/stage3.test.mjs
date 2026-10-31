import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import {
  canAccessAdminUsers,
  validateRoleChange,
  validateStatusToggle
} from '../utils/adminHelpers.ts';
import { formatIndonesianDateTime } from '../utils/dateHelpers.ts';

// 1. Tes: Pengguna biasa tidak bisa membuka halaman Pengguna walau mengetahui rutenya
test('otorisasi rute: pengguna biasa (player/organizer) ditolak mengakses halaman Pengguna', () => {
  assert.equal(canAccessAdminUsers('player'), false, 'Peran player harus ditolak');
  assert.equal(canAccessAdminUsers('organizer'), false, 'Peran organizer harus ditolak');
  assert.equal(canAccessAdminUsers(null), false, 'Tanpa peran harus ditolak');
  assert.equal(canAccessAdminUsers(undefined), false, 'Peran undefined harus ditolak');
  assert.equal(canAccessAdminUsers('guest'), false, 'Peran guest harus ditolak');
  assert.equal(canAccessAdminUsers('admin'), true, 'Hanya peran admin yang diizinkan');
});

// 2. Tes: Perubahan peran tanpa password admin ditolak
test('validasi aksi sensitif: perubahan peran tanpa password admin ditolak', () => {
  // Tanpa password sama sekali
  const noPassResult = validateRoleChange({
    adminRole: 'admin',
    targetUsername: 'taichi',
    currentRole: 'player',
    newRole: 'organizer',
    adminPassword: '',
  });
  assert.equal(noPassResult.allowed, false, 'Perubahan peran tanpa password harus ditolak');
  assert.match(noPassResult.reason || '', /password/i);

  // Password hanya spasi
  const emptyPassResult = validateRoleChange({
    adminRole: 'admin',
    targetUsername: 'taichi',
    currentRole: 'player',
    newRole: 'organizer',
    adminPassword: '   ',
  });
  assert.equal(emptyPassResult.allowed, false, 'Password kosong harus ditolak');

  // Dengan password yang terisi dan peran yang sah: diizinkan
  const validResult = validateRoleChange({
    adminRole: 'admin',
    targetUsername: 'taichi',
    currentRole: 'player',
    newRole: 'organizer',
    adminPassword: 'SuperSecretAdminPassword123!',
  });
  assert.equal(validResult.allowed, true, 'Perubahan dengan password admin yang sah harus diizinkan');
});

// 3. Tes: Peran Admin Utama (admindss) tidak dapat diubah oleh siapapun
test('perlindungan akun: peran Admin Utama tidak dapat diubah', () => {
  const result = validateRoleChange({
    adminRole: 'admin',
    targetUsername: 'admindss',
    currentRole: 'admin',
    newRole: 'player',
    adminPassword: 'ValidPassword123!',
  });
  assert.equal(result.allowed, false, 'Admin Utama tidak boleh dapat diubah perannya');
  assert.match(result.reason || '', /Admin Utama/i);
});

// 4. Tes: Peran baru hanya boleh player atau organizer (tidak bisa membuat admin baru)
test('otorisasi peran: peran baru hanya boleh player atau organizer', () => {
  const adminRoleResult = validateRoleChange({
    adminRole: 'admin',
    targetUsername: 'yamato',
    currentRole: 'player',
    newRole: 'admin',
    adminPassword: 'ValidPassword123!',
  });
  assert.equal(adminRoleResult.allowed, false, 'Pemberian peran admin baru harus ditolak');

  const invalidRoleResult = validateRoleChange({
    adminRole: 'admin',
    targetUsername: 'yamato',
    currentRole: 'player',
    newRole: 'superadmin',
    adminPassword: 'ValidPassword123!',
  });
  assert.equal(invalidRoleResult.allowed, false, 'Peran asing harus ditolak');
});

// 5. Tes: Deaktivasi/aktivasi tanpa password ditolak dan Admin Utama terlindungi
test('validasi status: penonaktifan akun wajib password dan Admin Utama terlindungi', () => {
  // Tanpa password
  const noPassStatus = validateStatusToggle({
    adminRole: 'admin',
    targetUsername: 'user1',
    adminPassword: '',
  });
  assert.equal(noPassStatus.allowed, false);

  // Admin Utama tidak bisa dinonaktifkan
  const mainAdminStatus = validateStatusToggle({
    adminRole: 'admin',
    targetUsername: 'admindss',
    adminPassword: 'ValidPassword123!',
  });
  assert.equal(mainAdminStatus.allowed, false);
});

// 6. Tes: Tidak ada fitur "simulasi peran" di antarmuka
test('integritas antarmuka: memastikan tidak ada fitur atau teks simulasi peran', () => {
  const dirs = ['src/views', 'src/components', 'src/App.tsx'];
  function checkNoRoleSimulation(dirPath) {
    const stat = fs.statSync(dirPath);
    if (!stat.isDirectory()) {
      const content = fs.readFileSync(dirPath, 'utf8');
      assert.equal(
        content.toLowerCase().includes('simulasi peran'),
        false,
        `Teks simulasi peran ditemukan di ${dirPath}`
      );
      return;
    }
    const files = fs.readdirSync(dirPath);
    for (const f of files) {
      const full = path.join(dirPath, f);
      const s = fs.statSync(full);
      if (s.isDirectory()) {
        checkNoRoleSimulation(full);
      } else if (/\.(tsx|jsx|html)$/.test(f)) {
        const content = fs.readFileSync(full, 'utf8');
        assert.equal(
          content.toLowerCase().includes('simulasi peran'),
          false,
          `Teks simulasi peran ditemukan di ${full}`
        );
      }
    }
  }

  for (const d of dirs) {
    checkNoRoleSimulation(path.resolve(process.cwd(), d));
  }
});

// 7. Tes: Pemformatan tanggal dan waktu Indonesia
test('dateHelpers: formatIndonesianDateTime memformat waktu dengan format Indonesia', () => {
  const timestamp = new Date('2026-10-29T23:30:00Z').getTime();
  const formatted = formatIndonesianDateTime(timestamp);
  assert.ok(formatted.includes('2026'));
  assert.ok(formatted.includes('WIB'));
});
