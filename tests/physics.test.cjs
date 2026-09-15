require('./register.cjs');
const assert = require('node:assert/strict');
const { test } = require('node:test');
const {
  computeSpeed,
  referenceUncertainty,
  MAX_PLAUSIBLE_TRAVEL_M,
  PITCH_LENGTH_M,
} = require('../src/physics/computeSpeed.ts');
const { travelWarning } = require('../src/physics/calibration.ts');

/**
 * A delivery marked against both sets of stumps 1000 px apart: ~11 m of travel
 * in 20 frames at 60 fps, which is a little under 120 km/h.
 */
const stumpsDelivery = (over = {}) => ({
  calA: { x: 0, y: 900, frame: 0 },
  calB: { x: 1000, y: 900, frame: 0 },
  release: { x: 100, y: 400, frame: 10 },
  bounce: { x: 650, y: 400, frame: 30 },
  calRealMetres: PITCH_LENGTH_M,
  fps: 60,
  calibrationMethod: 'stumps',
  markConfidence: 'seen',
  ...over,
});

/** The same delivery, scaled against a ball only 12 px across in frame. */
const ballDelivery = (over = {}) => ({
  ...stumpsDelivery(),
  calA: { x: 500, y: 300, frame: 4 },
  calB: { x: 512, y: 300, frame: 4 },
  calRealMetres: 0.072,
  calibrationMethod: 'ball',
  ...over,
});

const relative = (result) => result.errorKmh / result.speedKmh;

test('the error range combines timing, reference and both pixel markings', () => {
  const result = computeSpeed(stumpsDelivery());

  // Timing alone was the whole model before. Adding independent terms can only
  // widen it, never narrow it.
  const timingOnly = Math.ceil(result.speedKmh * (2 / result.frameDelta));
  assert.ok(result.errorKmh >= timingOnly, 'combining terms never narrows the range');
  assert.ok(Number.isInteger(result.errorKmh), 'the range is whole km/h');
  assert.ok(result.errorKmh > 0);

  // Stumps 1000 px apart make the pixel terms small, so timing still dominates.
  assert.ok(relative(result) < 0.12, `stumps stay tight, got ${relative(result)}`);
});

test('a ball only 12 px across reports itself as wide as it really is', () => {
  const ball = computeSpeed(ballDelivery());
  const stumps = computeSpeed(stumpsDelivery());

  // +/-3 px across a 12 px ball is 50%, and the reading has to say so rather
  // than inheriting the tight range that frame timing alone would give.
  assert.ok(relative(ball) > 0.4, `expected a wide range, got ${relative(ball)}`);
  assert.ok(relative(ball) > relative(stumps) * 4);
  // Both readings used the same release and bounce marks over the same frames.
  // Only the ruler they were scaled against differs, and that alone is what
  // widens the range — the speeds themselves differ because the scale does.
  assert.equal(ball.frameDelta, stumps.frameDelta);
  assert.ok(ball.speedKmh > 0);
});

test('an uncertain bounce widens both the timing and the marking terms', () => {
  const seen = computeSpeed(stumpsDelivery());
  const uncertain = computeSpeed(stumpsDelivery({ markConfidence: 'uncertain' }));

  assert.equal(uncertain.speedKmh, seen.speedKmh, 'the speed itself is unchanged');
  assert.ok(uncertain.errorKmh > seen.errorKmh, 'an uncertain mark is worth less');
});

test('a guessed bounce produces no speed at all', () => {
  const guessed = computeSpeed(stumpsDelivery({ markConfidence: 'guessed' }));

  assert.equal(guessed.speedKmh, null, 'no number is invented');
  assert.equal(guessed.errorKmh, null, 'and no range is invented for it');
  // Where the marks sit is still reported — only the reading is withheld.
  assert.ok(guessed.travelMetres > 0);
  assert.ok(guessed.pixelsPerMetre > 0);
  assert.equal(guessed.frameDelta, 20);
});

test('each reference length carries its own uncertainty', () => {
  assert.equal(referenceUncertainty('stumps'), 0.005);
  assert.equal(referenceUncertainty('ball'), 0.01);
  assert.equal(referenceUncertainty('height'), 0.02);
  assert.equal(referenceUncertainty('markers', 'measured'), 0.005);
  assert.equal(referenceUncertainty('markers', 'paced-measured-shoe'), 0.01);
  assert.equal(referenceUncertainty('markers', 'paced-shoe-size'), 0.05);

  // Stored data cannot say how an old markers distance was established, so it
  // takes the widest rather than flattering itself with the narrowest.
  assert.equal(referenceUncertainty('markers'), referenceUncertainty('markers', 'paced-shoe-size'));
});

test('pixel uncertainty scales with the space the points are given in', () => {
  // Points marked on the 1280 px JPEG and the same points scaled up to a 3840 px
  // video describe one marking, so they must report one error range. That only
  // holds if sigma is scaled by the same factor the points were.
  const factor = 3;
  const scale = (p) => ({ x: p.x * factor, y: p.y * factor, frame: p.frame });
  const marked = stumpsDelivery();
  const inVideoSpace = computeSpeed({
    ...marked,
    calA: scale(marked.calA),
    calB: scale(marked.calB),
    release: scale(marked.release),
    bounce: scale(marked.bounce),
    pixelSigma: 3 * factor,
  });

  assert.equal(inVideoSpace.errorKmh, computeSpeed(marked).errorKmh);
  assert.throws(() => computeSpeed(stumpsDelivery({ pixelSigma: 0 })), /positive/);
});

test('travel warns against the chosen ruler and against what a delivery can do', () => {
  // The ruler bound only means something where the reference is laid along the
  // pitch. A normal delivery dwarfs a ball or a bowler, so those must stay quiet.
  assert.equal(travelWarning(11, PITCH_LENGTH_M, 'stumps'), null);
  assert.equal(travelWarning(11, 0.072, 'ball'), null);
  assert.equal(travelWarning(11, 1.8, 'height'), null);

  assert.equal(travelWarning(16.1, PITCH_LENGTH_M, 'stumps').kind, 'ruler');
  // The shape of the 302 km/h reading: markers calibration that used to warn
  // about nothing at all.
  assert.equal(travelWarning(11, 5, 'markers').kind, 'ruler');

  // The physical bound holds for every method, whatever the ruler was.
  for (const [cal, method] of [[PITCH_LENGTH_M, 'stumps'], [5, 'markers'], [0.072, 'ball'], [1.8, 'height']]) {
    assert.equal(travelWarning(MAX_PLAUSIBLE_TRAVEL_M + 1, cal, method).kind, 'impossible');
  }

  // No lower bound — a short indoor throw off markers is legitimately short.
  assert.equal(travelWarning(3, 20.12, 'stumps'), null);
  assert.equal(travelWarning(2.5, 20.12, 'stumps'), null);
});
