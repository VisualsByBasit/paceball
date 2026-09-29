require('./register.cjs');
const assert = require('node:assert/strict');
const { test } = require('node:test');
const { createMockSession } = require('../src/data/mockData.ts');
const { measurementState } = require('../src/physics/measurementState.ts');
const {
  planVideoExport, outputShortSide, VIDEO_MAX_EDGE, VIDEO_BEFORE_RELEASE_MS, VIDEO_AFTER_BOUNCE_MS,
} = require('../src/export/videoPlan.ts');

const source = (durationMs, width = 1920, height = 1080, rotationDegrees = 0) =>
  ({ width, height, rotationDegrees, durationMs });
/** Frame times as a steady recording would report them. */
const timing = (session) => ({
  releaseMs: (session.release.frame / session.fps) * 1_000,
  bounceMs: (session.bounce.frame / session.fps) * 1_000,
});

test('video plan trims from half a second before release to 0.75 s after bounce', () => {
  assert.equal(VIDEO_BEFORE_RELEASE_MS, 500);
  assert.equal(VIDEO_AFTER_BOUNCE_MS, 750);
  const session = createMockSession('trim', 120);
  session.fps = 50;
  session.release.frame = 100;
  session.bounce.frame = 125;
  const plan = planVideoExport(session, source(4_000), { isPro: false }, timing(session));
  assert.equal(plan.inputVideoPath, session.videoPath);
  assert.equal(plan.clipStartMs, 1_500);
  assert.equal(plan.clipEndMs, 3_250);
  assert.equal(plan.includeAudio, false);
  assert.equal(plan.watermark, true);
  assert.deepEqual(plan.source, source(4_000));
  assert.equal(plan.overlay.width, session.width);
  assert.equal(plan.overlay.height, session.height);
  assert.deepEqual(plan.overlay.release, session.release);
  assert.deepEqual(plan.overlay.bounce, session.bounce);
  assert.equal(plan.overlay.releaseAtMs, 500);
  assert.equal(plan.overlay.bounceAtMs, 1_000);
  assert.equal(plan.overlay.frameToleranceMs, 10);
});

test('the clip is timed from the verified frame times, not frame / fps', () => {
  const session = createMockSession('verified', 120);
  session.fps = 60;
  session.release.frame = 60;
  session.bounce.frame = 90;
  // A recording whose frames run a little late of the average rate.
  const plan = planVideoExport(session, source(4_000), { isPro: false }, { releaseMs: 1_012, bounceMs: 1_530 });
  assert.equal(plan.clipStartMs, 512);
  assert.equal(plan.clipEndMs, 2_280);
  assert.equal(plan.overlay.releaseAtMs, 500);
  assert.equal(plan.overlay.bounceAtMs, 1_018);
  // Times that disagree with the marks by more than a frame slip are refused.
  assert.throws(() => planVideoExport(session, source(4_000), { isPro: false }, { releaseMs: 1_400, bounceMs: 1_530 }),
    /do not line up/);
  for (const bad of [undefined, { releaseMs: -1, bounceMs: 1_500 }, { releaseMs: 1_500, bounceMs: 1_000 },
    { releaseMs: NaN, bounceMs: 1_500 }, { releaseMs: 1_000 }]) {
    assert.throws(() => planVideoExport(session, source(4_000), { isPro: false }, bad), /verify/);
  }
});

test('trim padding clamps to the real video bounds', () => {
  const session = createMockSession('edge', 120);
  session.fps = 60;
  session.release.frame = 1;
  session.bounce.frame = 170;
  const plan = planVideoExport(session, source(3_000), { isPro: true, includeAudio: true }, timing(session));
  assert.equal(plan.clipStartMs, 0);
  assert.equal(plan.clipEndMs, 3_000);
  assert.equal(plan.includeAudio, true);
  assert.equal(plan.watermark, false);
});

test('the long edge is capped at 1080, keeping the aspect, and never scaled up', () => {
  assert.equal(VIDEO_MAX_EDGE, 1080);
  assert.equal(outputShortSide(source(1, 1920, 1080)), 606);
  assert.equal(outputShortSide(source(1, 1080, 1920)), 606);
  assert.equal(outputShortSide(source(1, 3840, 2160)), 606);
  assert.equal(outputShortSide(source(1, 1280, 720)), 606);
  for (const [w, h] of [[1920, 1080], [3840, 2160], [1280, 720], [1440, 1080]]) {
    const short = outputShortSide(source(1, w, h));
    assert.equal(short % 2, 0, 'even');
    assert.ok((short * Math.max(w, h)) / Math.min(w, h) <= 1080, 'long edge within 1080');
    assert.ok(short < Math.min(w, h), 'down only');
  }
  // Already small enough: kept at its own size.
  assert.equal(outputShortSide(source(1, 1080, 608)), 0);
  assert.equal(outputShortSide(source(1, 640, 480)), 0);
  const session = createMockSession('size', 120);
  assert.equal(planVideoExport(session, source(5_000, 3840, 2160), { isPro: false }, timing(session)).outputShortSide, 606);
});

test('the HUD carries the whole reading as the card writes it, and only marked points', () => {
  const session = createMockSession('legacy', 125);
  session.errorKmh = 1;
  const reading = measurementState(session);
  assert.equal(reading.kind, 'measured');
  const plan = planVideoExport(session, source(5_000), { isPro: false }, timing(session));
  const { overlay } = plan;
  assert.equal(overlay.kind, 'mark-to-mark');
  assert.equal(overlay.speedKmh, reading.speedKmh);
  assert.equal(overlay.errorKmh, reading.errorKmh);
  assert.notEqual(overlay.errorKmh, 1);
  assert.equal(overlay.speedText, `${reading.speedKmh.toFixed(1)} km/h`);
  assert.equal(overlay.rangeText, `± ${reading.errorKmh} km/h`);
  assert.equal(overlay.methodText, 'Average speed, release to bounce');
  assert.equal(overlay.pathLabel, 'Marked, not tracked');
  assert.equal(overlay.stripText, 'PACEBALL · FREE');
  assert.equal('trackedPositions' in overlay, false);
  assert.deepEqual(overlay.calibrationA, session.calA);
  assert.deepEqual(overlay.calibrationB, session.calB);
  assert.equal(overlay.showReferences, true);
  assert.deepEqual(overlay.referenceLabels, ['Near', 'Far']);
  assert.equal(overlay.bounceUncertain, false);
  overlay.release.x = 7;
  assert.notEqual(session.release.x, 7, 'the plan does not mutate the saved marks');

  // Pro drops the strip and nothing else.
  const pro = planVideoExport(session, source(5_000), { isPro: true }, timing(session)).overlay;
  assert.equal(pro.stripText, null);
  assert.equal(pro.speedText, overlay.speedText);
  assert.equal(pro.rangeText, overlay.rangeText);
});

test('ball and height references are left off the clip, and an uncertain bounce says so', () => {
  const session = { ...createMockSession('ball', 125), calibrationMethod: 'ball', calRealMetres: 0.072 };
  session.calA = { x: 400, y: 430, frame: 10 };
  session.calB = { x: 430, y: 430, frame: 10 };
  session.markConfidence = 'uncertain';
  const { overlay } = planVideoExport(session, source(5_000), { isPro: false }, timing(session));
  assert.equal(overlay.showReferences, false);
  assert.equal(overlay.bounceUncertain, true);
});

test('guessed and unusable deliveries cannot produce a share video plan', () => {
  const guessed = createMockSession('guessed', 120);
  guessed.markConfidence = 'guessed';
  guessed.speedKmh = null;
  guessed.errorKmh = null;
  assert.throws(() => planVideoExport(guessed, source(5_000), { isPro: false }, timing(guessed)), /no measured speed/);

  const unusable = createMockSession('unusable', 120);
  unusable.calB = { ...unusable.calA };
  assert.throws(() => planVideoExport(unusable, source(5_000), { isPro: true }, timing(unusable)), /no measured speed/);
});

test('invalid duration, out-of-video marks and implicit audio permission are rejected', () => {
  const session = createMockSession('bounds', 120);
  const t = timing(session);
  assert.throws(() => planVideoExport(session, source(0), { isPro: false }, t), /source metadata/);
  assert.throws(() => planVideoExport(session, source(NaN), { isPro: false }, t), /source metadata/);
  assert.throws(() => planVideoExport(session, source(5_000.5), { isPro: false }, t), /source metadata/);
  assert.throws(() => planVideoExport(session, { ...source(5_000), width: 0 }, { isPro: false }, t), /source metadata/);
  assert.throws(() => planVideoExport(session, { ...source(5_000), rotationDegrees: 45 }, { isPro: false }, t), /source metadata/);
  assert.throws(() => planVideoExport(session, source(100), { isPro: false }, t), /outside the source video/);
  assert.throws(() => planVideoExport(session, source(5_000), { isPro: false, includeAudio: 'yes' }, t), /options/);
  assert.throws(() => planVideoExport(session, source(5_000), { isPro: undefined }, t), /options/);
});
