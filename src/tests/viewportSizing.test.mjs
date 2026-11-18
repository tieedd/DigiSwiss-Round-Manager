import test from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateModalMaxHeight,
  resolveModalMaxHeightCss,
  DEFAULT_MODAL_TOP_MARGIN,
  DEFAULT_MODAL_BOTTOM_MARGIN,
  MIN_MODAL_MAX_HEIGHT,
  MODAL_MAX_HEIGHT_CSS_FALLBACK,
} from '../utils/viewportSizing.ts';

test('VIEWPORT 1: Viewport normal mengurangi inset atas/bawah dan margin dengan akurat', () => {
  const result = calculateModalMaxHeight({
    viewportHeight: 844,
    safeTop: 44,
    safeBottom: 24,
  });

  const expected = 844 - 44 - 24 - DEFAULT_MODAL_TOP_MARGIN - DEFAULT_MODAL_BOTTOM_MARGIN;
  assert.equal(result, expected);
  assert.equal(result, 756);
});

test('VIEWPORT 2: Viewport kecil saat keyboard terbuka tetap menghitung tinggi sisa tanpa negatif', () => {
  // Simulasi viewport visualViewport menyusut menjadi 340px karena soft keyboard
  const result = calculateModalMaxHeight({
    viewportHeight: 340,
    safeTop: 28,
    safeBottom: 0,
    topMargin: 8,
    bottomMargin: 12,
  });

  assert.equal(result, 292);
  assert.ok(result >= MIN_MODAL_MAX_HEIGHT);
  assert.ok(result <= 340);
});

test('VIEWPORT 3: Inset besar menjaga batas minimum yang masuk akal dan tidak melebihi tinggi viewport', () => {
  // Skenario A: viewport cukup besar (500px), inset sangat besar -> jaga batas minimum 200px
  const largeInsetResult = calculateModalMaxHeight({
    viewportHeight: 500,
    safeTop: 220,
    safeBottom: 200,
  });
  assert.equal(largeInsetResult, MIN_MODAL_MAX_HEIGHT);

  // Skenario B: viewport sangat sempit (160px < MIN_MODAL_MAX_HEIGHT), hasil tetap >= 0 dan <= viewport
  const tinyViewportResult = calculateModalMaxHeight({
    viewportHeight: 160,
    safeTop: 120,
    safeBottom: 80,
  });
  assert.equal(tinyViewportResult, 160);
  assert.ok(tinyViewportResult > 0);
});

test('VIEWPORT 4: Nilai mustahil (0, negatif, NaN) aman dan tidak pernah menghasilkan nilai negatif', () => {
  assert.equal(calculateModalMaxHeight({ viewportHeight: 0 }), MIN_MODAL_MAX_HEIGHT);
  assert.equal(calculateModalMaxHeight({ viewportHeight: -400 }), MIN_MODAL_MAX_HEIGHT);
  assert.equal(calculateModalMaxHeight({ viewportHeight: Number.NaN }), MIN_MODAL_MAX_HEIGHT);

  // Inset/margin negatif di-clamp ke 0 agar tidak melebihi tinggi viewport
  const negInsets = calculateModalMaxHeight({
    viewportHeight: 700,
    safeTop: -50,
    safeBottom: -30,
    topMargin: -10,
    bottomMargin: -20,
  });
  assert.equal(negInsets, 700);
});

test('VIEWPORT 5: resolveModalMaxHeightCss menghasilkan px valid atau fallback 100dvh tanpa vh', () => {
  assert.equal(resolveModalMaxHeightCss(512.8), '512px');
  assert.equal(resolveModalMaxHeightCss(0), MODAL_MAX_HEIGHT_CSS_FALLBACK);
  assert.equal(resolveModalMaxHeightCss(-100), MODAL_MAX_HEIGHT_CSS_FALLBACK);
  assert.equal(resolveModalMaxHeightCss(null), MODAL_MAX_HEIGHT_CSS_FALLBACK);
  assert.ok(MODAL_MAX_HEIGHT_CSS_FALLBACK.includes('100dvh'));
  assert.equal(/(^|[^d])vh\b/.test(MODAL_MAX_HEIGHT_CSS_FALLBACK), false);
});
