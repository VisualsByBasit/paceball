require('./register.cjs');
const assert = require('node:assert/strict');
const { test } = require('node:test');
const { createMockSession } = require('../src/data/mockData.ts');
const { measurementState } = require('../src/physics/measurementState.ts');
const { planVideoExport } = require('../src/export/videoPlan.ts');

const source = (durationMs) => ({ width: 1920, height: 1080, rotationDegrees: 0, durationMs });

test('video plan trims the original clip around release and bounce', () => {
  const session = createMockSession('trim', 120);
  session.fps = 50;
  session.release.frame = 100;
  session.bounce.frame = 125;
  const plan = planVideoExport(session, source(4_000), { isPro: false });
  assert.equal(plan.inputVideoPath, session.videoPath);
  assert.equal(plan.clipStartMs, 1_000);
  assert.equal(plan.clipEndMs, 3_500);
  assert.equal(plan.includeAudio, false);
  assert.equal(plan.watermark, true);
  assert.deepEqual(plan.source, source(4_000));
  assert.equal(plan.overlay.width, session.width);
  assert.equal(plan.overlay.height, session.height);
  assert.deepEqual(plan.overlay.release, session.release);
  assert.deepEqual(plan.overlay.bounce, session.bounce);
  assert.equal(plan.overlay.releaseAtMs, 1_000);
  assert.equal(plan.overlay.bounceAtMs, 1_500);
});

test('trim padding clamps to the real video bounds', () => {
  const session = createMockSession('edge', 120);
  session.fps = 60;
  session.release.frame = 1;
  session.bounce.frame = 170;
  const plan = planVideoExport(session, source(3_000), { isPro: true, includeAudio: true });
  assert.equal(plan.clipStartMs, 0);
  assert.equal(plan.clipEndMs, 3_000);
  assert.equal(plan.includeAudio, true);
  assert.equal(plan.watermark, false);
});

test('the HUD carries only marked points and the recomputed measured range', () => {
  const session = createMockSession('legacy', 125);
  session.errorKmh = 1;
  const reading = measurementState(session);
  assert.equal(reading.kind, 'measured');
  const plan = planVideoExport(session, source(5_000), { isPro: false });
  assert.equal(plan.overlay.kind, 'mark-to-mark');
  assert.equal(plan.overlay.speedKmh, reading.speedKmh);
  assert.equal(plan.overlay.errorKmh, reading.errorKmh);
  assert.notEqual(plan.overlay.errorKmh, 1);
  assert.match(plan.overlay.pathLabel, /NOT A TRACKED BALL PATH/);
  assert.equal('trackedPositions' in plan.overlay, false);
  assert.deepEqual(plan.overlay.calibrationA, session.calA);
  assert.deepEqual(plan.overlay.calibrationB, session.calB);
  plan.overlay.release.x = 7;
  assert.notEqual(session.release.x, 7, 'the plan does not mutate the saved marks');
});

test('guessed and unusable deliveries cannot produce a share video plan', () => {
  const guessed = createMockSession('guessed', 120);
  guessed.markConfidence = 'guessed';
  guessed.speedKmh = null;
  guessed.errorKmh = null;
  assert.throws(() => planVideoExport(guessed, source(5_000), { isPro: false }), /no measured speed/);

  const unusable = createMockSession('unusable', 120);
  unusable.calB = { ...unusable.calA };
  assert.throws(() => planVideoExport(unusable, source(5_000), { isPro: true }), /no measured speed/);
});

test('invalid duration, out-of-video marks and implicit audio permission are rejected', () => {
  const session = createMockSession('bounds', 120);
  assert.throws(() => planVideoExport(session, source(0), { isPro: false }), /source metadata/);
  assert.throws(() => planVideoExport(session, source(NaN), { isPro: false }), /source metadata/);
  assert.throws(() => planVideoExport(session, source(5_000.5), { isPro: false }), /source metadata/);
  assert.throws(() => planVideoExport(session, { ...source(5_000), width: 0 }, { isPro: false }), /source metadata/);
  assert.throws(() => planVideoExport(session, { ...source(5_000), rotationDegrees: 45 }, { isPro: false }), /source metadata/);
  assert.throws(() => planVideoExport(session, source(100), { isPro: false }), /outside the source video/);
  assert.throws(() => planVideoExport(session, source(5_000), { isPro: false, includeAudio: 'yes' }), /options/);
  assert.throws(() => planVideoExport(session, source(5_000), { isPro: undefined }), /options/);
});
