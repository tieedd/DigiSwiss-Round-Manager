import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

test('LAYOUT: LoginView tidak menggunakan fixed atau absolute untuk ThemeToggle', () => {
  const filePath = path.resolve('src/views/LoginView.tsx');
  const content = fs.readFileSync(filePath, 'utf-8');

  // Pastikan ThemeToggle ada
  assert.ok(content.includes('<ThemeToggle'), 'ThemeToggle harus ada di LoginView');

  // Cari blok pembungkus ThemeToggle
  const togglePattern = /<div[^>]*>\s*<ThemeToggle[^>]*\/>\s*<\/div>/s;
  const match = content.match(togglePattern);
  assert.ok(match, 'ThemeToggle harus dibungkus dalam div kontainer');

  const wrapperTag = match[0];
  assert.ok(!wrapperTag.includes('fixed'), 'Wrapper ThemeToggle tidak boleh memiliki kelas fixed');
  assert.ok(!wrapperTag.includes('absolute'), 'Wrapper ThemeToggle tidak boleh memiliki kelas absolute');
  assert.ok(!wrapperTag.includes('-top-'), 'Wrapper ThemeToggle tidak boleh memiliki margin/posisi top negatif');
  assert.ok(!wrapperTag.includes('translate'), 'Wrapper ThemeToggle tidak boleh memiliki kelas translate');
  assert.ok(wrapperTag.includes('justify-end'), 'Wrapper ThemeToggle harus menggunakan justify-end');
});

test('LAYOUT: LoginView menggunakan page-pad-top, page-pad-bottom, 100dvh, dan overflow-y-auto', () => {
  const filePath = path.resolve('src/views/LoginView.tsx');
  const content = fs.readFileSync(filePath, 'utf-8');

  assert.ok(content.includes('page-pad-top'), 'LoginView harus menggunakan kelas page-pad-top');
  assert.ok(content.includes('page-pad-bottom'), 'LoginView harus menggunakan kelas page-pad-bottom');
  assert.ok(content.includes('overflow-y-auto'), 'LoginView harus mendukung scrolling dengan overflow-y-auto');
  assert.ok(content.includes('100dvh'), 'LoginView harus menggunakan min-height 100dvh');

  // Tidak boleh menumpuk safe-top bersamaan dengan py-8 pada kontainer utama
  assert.ok(!content.includes('py-8 safe-top'), 'Tidak boleh menumpuk safe-top dengan py-8');
});

test('LAYOUT: index.css mendefinisikan utilitas .page-pad-top dan .page-pad-bottom', () => {
  const filePath = path.resolve('src/index.css');
  const content = fs.readFileSync(filePath, 'utf-8');

  assert.ok(content.includes('.page-pad-top'), 'index.css harus mendefinisikan .page-pad-top');
  assert.ok(content.includes('env(safe-area-inset-top'), 'page-pad-top harus menyertakan env(safe-area-inset-top');
  assert.ok(content.includes('.page-pad-bottom'), 'index.css harus mendefinisikan .page-pad-bottom');
  assert.ok(content.includes('env(safe-area-inset-bottom'), 'page-pad-bottom harus menyertakan env(safe-area-inset-bottom');
});

test('LAYOUT: Input component menerapkan scrollIntoView pada onFocus', () => {
  const filePath = path.resolve('src/components/common/Input.tsx');
  const content = fs.readFileSync(filePath, 'utf-8');

  assert.ok(content.includes('scrollIntoView'), 'Input harus memanggil scrollIntoView pada event focus');
  assert.ok(content.includes("block: 'center'"), "Input harus menggunakan block: 'center' pada scrollIntoView");
});
