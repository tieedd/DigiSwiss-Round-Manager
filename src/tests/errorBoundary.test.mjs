import test from 'node:test';
import assert from 'node:assert/strict';
import { formatSafeErrorDetails } from '../utils/errorBoundaryLogic.ts';

test('formatSafeErrorDetails memformat nama, pesan, dan potongan pendek stack tanpa PII', () => {
  const longStack = [
    'Error: Boom',
    '    at line1 (a.tsx:1:1)',
    '    at line2 (a.tsx:2:1)',
    '    at line3 (a.tsx:3:1)',
    '    at line4 (a.tsx:4:1)',
    '    at line5 (a.tsx:5:1)',
    '    at line6 (a.tsx:6:1)',
    '    at line7 (a.tsx:7:1)',
    '    at line8 (a.tsx:8:1)',
    '    at line9 (a.tsx:9:1)',
  ].join('\n');

  const out = formatSafeErrorDetails(
    { name: 'TypeError', message: 'Cannot read properties of null', stack: longStack },
    '\n    at TournamentDetailModal\n    at App\n    at ErrorBoundary\n    at C4\n    at C5\n    at C6\n    at C7'
  );

  assert.match(out, /^TypeError: Cannot read properties of null/);
  assert.ok(out.includes('at line7 (a.tsx:7:1)'));
  assert.ok(!out.includes('at line9 (a.tsx:9:1)'), 'stack harus dipotong pendek');
  assert.ok(out.includes('at C5'));
  assert.ok(!out.includes('at C7'), 'componentStack harus dipotong pendek');
});

test('formatSafeErrorDetails aman saat error kosong atau pesan sangat panjang', () => {
  const longMsg = 'X'.repeat(400);
  const out = formatSafeErrorDetails({ message: longMsg });
  assert.ok(out.startsWith('Error: '));
  assert.ok(out.endsWith('...'));
  assert.ok(out.length <= 320);

  const fallback = formatSafeErrorDetails(null);
  assert.equal(fallback, 'Error: Terjadi kesalahan tidak dikenal');
});
