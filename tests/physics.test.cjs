require('./register.cjs');
const assert = require('node:assert/strict');
const { test } = require('node:test');
const {
  computeSpeed,
  referenceUncertainty,
  sessionErrorKmh,
  MARKING_LONG_EDGE_PX,
  MAX_PLAUSIBLE_TRAVEL_M,
  PITCH_LENGTH_M,
} = require('../src/physics/computeSpeed.ts');
const {
  travelWarning,
  resolveCalibrationMetres,
  shoeLengthCmFrom,
} = require('../src/physics/calibration.ts');
const { outerShoeCmFromEu } = require('../src/types/index.ts');

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

test('recording how a markers distance was measured narrows the reading', () => {
  const markers = (over) =>
    computeSpeed({
      ...stumpsDelivery(),
      calRealMetres: 20,
      calibrationMethod: 'markers',
      ...over,
    });

  const unrecorded = markers({});
  const taped = markers({ markerSource: 'measured' });
  const pacedBySize = markers({ markerSource: 'paced-shoe-size' });

  // The delivery is identical; only how well its ruler is known has changed.
  assert.equal(unrecorded.speedKmh, taped.speedKmh, 'the speed itself does not move');
  assert.ok(
    taped.errorKmh < unrecorded.errorKmh,
    `a taped distance should beat an unrecorded one, got ${taped.errorKmh} vs ${unrecorded.errorKmh}`,
  );
  // Nothing recorded has to assume the worst of the three.
  assert.equal(pacedBySize.errorKmh, unrecorded.errorKmh);
});

test('a paced markers distance is the pace count times the outer shoe', () => {
  // Pacing heel to toe measures the shoe with its sole, not the foot.
  assert.ok(Math.abs(outerShoeCmFromEu(41) - 28.547) < 0.001);

  const paced = (paces, shoeLengthCm) =>
    resolveCalibrationMetres(
      'markers',
      { source: 'paced-shoe-size', metres: '', paces },
      null,
      shoeLengthCm,
    );

  // The live sanity check the calibration screen shows: 15 paces at EU 41.
  const fifteen = paced('15', outerShoeCmFromEu(41));
  assert.ok(Math.abs(fifteen.metres - 4.28) < 0.01, `expected ~4.28 m, got ${fifteen.metres}`);
  assert.equal(fifteen.paceCount, 15);
  assert.equal(fifteen.problem, null);

  // Nothing typed yet is not an error; a nonsense count is.
  assert.deepEqual(paced('', 28.5), { metres: null, problem: null, paceCount: null });
  assert.ok(paced('0', 28.5).problem);
  assert.ok(paced('abc', 28.5).problem);
  // With no shoe on file there is no scale, and it says which is missing.
  assert.match(paced('15', null).problem, /shoe/);
  assert.equal(paced('15', null).metres, null);
});

test('shoe length comes from a measurement first and a size conversion second', () => {
  const shoe = { lengthCm: 27, sizeEu: 41 };
  assert.equal(shoeLengthCmFrom('paced-measured-shoe', shoe), 27, 'a measured shoe wins');
  assert.equal(shoeLengthCmFrom('paced-shoe-size', shoe), outerShoeCmFromEu(41));
  assert.equal(shoeLengthCmFrom('measured', shoe), null, 'a taped distance needs no shoe');

  // Each source can only use what the profile actually holds.
  assert.equal(shoeLengthCmFrom('paced-measured-shoe', { lengthCm: null, sizeEu: 41 }), null);
  assert.equal(shoeLengthCmFrom('paced-shoe-size', { lengthCm: 27, sizeEu: null }), null);
});

test('a taped markers distance is taken as typed', () => {
  const taped = (metres) =>
    resolveCalibrationMetres('markers', { source: 'measured', metres, paces: '' }, null, null);

  assert.equal(taped('4.5').metres, 4.5);
  assert.equal(taped('4,5').metres, 4.5, 'comma decimals are what many keyboards offer');
  assert.equal(taped('4.5').paceCount, null, 'nothing was paced');
  assert.equal(taped('').problem, null, 'an empty field is not yet wrong');
  assert.ok(taped('nonsense').problem);
  assert.ok(taped('500').problem, 'outside the sane bounds for a marker gap');
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

/**
 * A delivery as it sits on disk: marked on the capped JPEG, then scaled up to
 * the video's own pixels on the way to storage — points, pixelsPerMetre and all.
 * `over` lands on the record, so a test can age it back to what v1 saved.
 */
const storedDelivery = (videoLongEdge = 1920, over = {}) => {
  const marked = stumpsDelivery();
  const factor = videoLongEdge / MARKING_LONG_EDGE_PX;
  const scale = (p) => ({ x: p.x * factor, y: p.y * factor, frame: p.frame });
  const result = computeSpeed(marked);
  return {
    id: 'stored',
    createdAt: 0,
    playerId: 'p',
    videoPath: 'file:///clip.mp4',
    framesDir: 'file:///frames',
    fps: marked.fps,
    frameCount: 180,
    width: videoLongEdge,
    height: Math.round((videoLongEdge * 9) / 16),
    exposureBias: 0,
    calibrationMethod: marked.calibrationMethod,
    calA: scale(marked.calA),
    calB: scale(marked.calB),
    calRealMetres: marked.calRealMetres,
    pixelsPerMetre: result.pixelsPerMetre * factor,
    release: scale(marked.release),
    bounce: scale(marked.bounce),
    markConfidence: marked.markConfidence,
    travelMetres: result.travelMetres,
    speedKmh: result.speedKmh,
    errorKmh: result.errorKmh,
    uncertaintyModelVersion: 2,
    releaseSpeedKmh: null,
    releaseAngleDeg: null,
    ...over,
  };
};

test('a stored delivery recomputes to exactly the range it was marked with', () => {
  const marked = stumpsDelivery();
  const asMarked = computeSpeed(marked);

  // The record holds the same four marks in the video's own pixels. Reading it
  // back has to give the range the taps earned, not a tighter one — which only
  // holds if sigma is scaled out of the stored space the same way the points
  // were scaled into it. Every clip size has to agree on one answer.
  for (const longEdge of [MARKING_LONG_EDGE_PX, 1920, 2160, 3840]) {
    assert.equal(
      sessionErrorKmh(storedDelivery(longEdge)),
      asMarked.errorKmh,
      `a ${longEdge} px clip reads back differently`,
    );
  }

  // A clip smaller than the cap was never scaled at all, so it is read as marked.
  assert.equal(sessionErrorKmh(storedDelivery(720)), asMarked.errorKmh);
});

test('a v1 record recomputes wider without its speed moving', () => {
  // What v1 wrote: frame timing alone, treating the ruler and both markings as
  // exact. It is stored as it was written, so the recomputation is what widens it.
  const stored = storedDelivery(1920, {
    uncertaintyModelVersion: 1,
    errorKmh: Math.ceil(computeSpeed(stumpsDelivery()).speedKmh * (2 / 20)),
  });

  const recomputed = sessionErrorKmh(stored);
  assert.ok(recomputed >= stored.errorKmh, 'the extra terms can only widen it');
  assert.ok(Number.isInteger(recomputed), 'the range is whole km/h');
  assert.equal(stored.uncertaintyModelVersion, 1, 'nothing on the record is touched');
  assert.equal(stored.speedKmh, computeSpeed(stumpsDelivery()).speedKmh);

  // Stumps 1720 px apart barely move the range — timing dominates there, which
  // is why v1 got away with it. A v1 record scaled against a ball 18 px across
  // in the stored frame is the reading that was wrong, and it widens hugely.
  const ball = computeSpeed(ballDelivery());
  const onBall = storedDelivery(1920, {
    uncertaintyModelVersion: 1,
    calibrationMethod: 'ball',
    calRealMetres: 0.072,
    calA: { x: 750, y: 450, frame: 4 },
    calB: { x: 768, y: 450, frame: 4 },
    errorKmh: Math.ceil(ball.speedKmh * (2 / 20)),
    speedKmh: ball.speedKmh,
  });
  assert.ok(
    sessionErrorKmh(onBall) > onBall.errorKmh * 4,
    `a ball-scaled v1 reading has to own up, got ${sessionErrorKmh(onBall)} from ${onBall.errorKmh}`,
  );
});

test('a stored session takes the defaults its record never recorded', () => {
  const asMarked = computeSpeed(stumpsDelivery());

  // markConfidence predates the question on a legacy record, and reads as seen.
  const { markConfidence, ...legacy } = storedDelivery();
  assert.equal(markConfidence, 'seen');
  assert.equal(sessionErrorKmh(legacy), asMarked.errorKmh);

  // A legacy markers session recorded no source, so it takes the widest of the
  // three rather than the reading it would have got from a taped distance.
  const markers = (over) =>
    sessionErrorKmh(storedDelivery(1920, { calibrationMethod: 'markers', ...over }));
  assert.ok(markers({}) > markers({ markerSource: 'measured' }));
  assert.equal(markers({}), markers({ markerSource: 'paced-shoe-size' }));
});

test('a stored session with nothing to widen returns no range', () => {
  // A guessed bounce has no speed for a range to sit either side of.
  assert.equal(
    sessionErrorKmh(storedDelivery(1920, { markConfidence: 'guessed', speedKmh: null, errorKmh: null })),
    null,
  );

  // Degenerate marks give nothing rather than throwing — this runs on a read,
  // and a bad record should not take the whole read down with it.
  const same = { x: 10, y: 10, frame: 4 };
  assert.equal(sessionErrorKmh(storedDelivery(1920, { calA: same, calB: same })), null);
  assert.equal(sessionErrorKmh(storedDelivery(1920, { release: same, bounce: { ...same, frame: 9 } })), null);
});

test('an uncertain stored bounce recomputes wider than a seen one', () => {
  assert.ok(
    sessionErrorKmh(storedDelivery(1920, { markConfidence: 'uncertain' })) >
      sessionErrorKmh(storedDelivery(1920, { markConfidence: 'seen' })),
  );
});
