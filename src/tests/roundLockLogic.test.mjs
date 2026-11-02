import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isRoundLocked } from '../utils/roundLockLogic.ts';

test('isRoundLocked: seluruh ronde terkunci jika turnamen finished', () => {
  assert.equal(isRoundLocked(1, 3, 'finished'), true);
  assert.equal(isRoundLocked(2, 3, 'finished'), true);
  assert.equal(isRoundLocked(3, 3, 'finished'), true);
});

test('isRoundLocked: seluruh ronde terkunci jika turnamen status registration', () => {
  assert.equal(isRoundLocked(1, 1, 'registration'), true);
  assert.equal(isRoundLocked(2, 1, 'registration'), true);
});

test('isRoundLocked: pada turnamen running, ronde < currentRound terkunci', () => {
  assert.equal(isRoundLocked(1, 2, 'running'), true);
  assert.equal(isRoundLocked(1, 3, 'running'), true);
  assert.equal(isRoundLocked(2, 3, 'running'), true);
});

test('isRoundLocked: pada turnamen running, ronde aktif (round === currentRound) terbuka', () => {
  assert.equal(isRoundLocked(1, 1, 'running'), false);
  assert.equal(isRoundLocked(2, 2, 'running'), false);
  assert.equal(isRoundLocked(3, 3, 'running'), false);
});
