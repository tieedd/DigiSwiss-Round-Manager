import test from 'node:test';
import assert from 'node:assert/strict';
import { formatAuditLogValue } from '../utils/auditLogDisplay.ts';

test('AUDIT LOG DISPLAY: null, undefined, dan string kosong ditangani aman', () => {
  for (const input of [null, undefined, '', '   ', '\n\t ']) {
    const res = formatAuditLogValue(input);
    assert.equal(res.kind, 'empty');
    assert.deepEqual(res.lines, []);
    assert.equal(res.text, '-');
  }
});

test('AUDIT LOG DISPLAY: string biasa non-JSON dipertahankan sebagai teks biasa', () => {
  const plain = formatAuditLogValue('registration');
  assert.equal(plain.kind, 'text');
  assert.deepEqual(plain.lines, []);
  assert.equal(plain.text, 'registration');

  const pathLike = formatAuditLogValue('tournaments/abc123def456/matches/m1');
  assert.equal(pathLike.kind, 'text');
  assert.equal(pathLike.text, 'tournaments/abc123def456/matches/m1');

  // Array JSON bukan objek key-value, jadi tetap ditampilkan sebagai teks
  const arr = formatAuditLogValue('["Merah","Biru"]');
  assert.equal(arr.kind, 'text');
  assert.equal(arr.text, '["Merah","Biru"]');
});

test('AUDIT LOG DISPLAY: JSON objek datar diubah menjadi daftar baris kunci: nilai', () => {
  const raw = '{"tournamentCount":5,"playersCount":8,"active":true,"note":null,"totalDeleted":37}';
  const res = formatAuditLogValue(raw);

  assert.equal(res.kind, 'json');
  assert.deepEqual(res.lines, [
    { key: 'tournamentCount', value: '5' },
    { key: 'playersCount', value: '8' },
    { key: 'active', value: 'true' },
    { key: 'note', value: 'null' },
    { key: 'totalDeleted', value: '37' },
  ]);
  assert.equal(
    res.text,
    [
      'tournamentCount: 5',
      'playersCount: 8',
      'active: true',
      'note: null',
      'totalDeleted: 37',
    ].join('\n')
  );

  // Objek kosong {} tidak menghasilkan daftar kosong tak terbaca
  const emptyObj = formatAuditLogValue('{}');
  assert.equal(emptyObj.kind, 'text');
  assert.equal(emptyObj.text, '{}');
});

test('AUDIT LOG DISPLAY: JSON bersarang diratakan dengan notasi titik dan array diformat rapi', () => {
  const raw = JSON.stringify({
    round: 3,
    winner: {
      id: 'user_123',
      name: 'Budi Santoso',
      meta: { seed: 4 },
    },
    scores: [2, 1],
    extra: {},
  });

  const res = formatAuditLogValue(raw);
  assert.equal(res.kind, 'json');
  assert.deepEqual(res.lines, [
    { key: 'round', value: '3' },
    { key: 'winner.id', value: 'user_123' },
    { key: 'winner.name', value: 'Budi Santoso' },
    { key: 'winner.meta.seed', value: '4' },
    { key: 'scores', value: '[2, 1]' },
    { key: 'extra', value: '{}' },
  ]);
});

test('AUDIT LOG DISPLAY: JSON rusak fallback ke teks biasa tanpa error', () => {
  const broken = '{"tournamentCount":5,"playersCount":8,"incomplete":';
  const res = formatAuditLogValue(broken);

  assert.equal(res.kind, 'text');
  assert.deepEqual(res.lines, []);
  assert.equal(res.text, broken);
});

test('AUDIT LOG DISPLAY: nilai sangat panjang (teks & JSON) dibatasi secara aman', () => {
  const hugeToken = 'x'.repeat(2500);
  const resText = formatAuditLogValue(hugeToken);
  assert.equal(resText.kind, 'text');
  assert.equal(resText.text.length, 2000);
  assert.ok(resText.text.endsWith('...'));

  // JSON dengan nilai properti sangat panjang
  const longJson = JSON.stringify({
    targetPath: 'p'.repeat(2400),
    count: 10,
  });
  const resLongVal = formatAuditLogValue(longJson);
  assert.equal(resLongVal.kind, 'json');
  assert.equal(resLongVal.lines[0].key, 'targetPath');
  assert.equal(resLongVal.lines[0].value.length, 2000);
  assert.ok(resLongVal.lines[0].value.endsWith('...'));
  assert.equal(resLongVal.lines[1].key, 'count');
  assert.equal(resLongVal.lines[1].value, '10');

  // JSON dengan sangat banyak properti dibatasi aman via maxEntries
  const manyKeysObj = {};
  for (let i = 1; i <= 75; i++) {
    manyKeysObj[`field_${i}`] = i;
  }
  const resMany = formatAuditLogValue(JSON.stringify(manyKeysObj));
  assert.equal(resMany.kind, 'json');
  assert.equal(resMany.lines.length, 61); // 60 entri + 1 penanda '...'
  assert.equal(resMany.lines[60].key, '...');
  assert.equal(resMany.lines[60].value, 'dibatasi 60 entri');
});
