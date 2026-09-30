require('./register.cjs');
const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const { createMockSession } = require('../src/data/mockData.ts');
const { exportGeometry, frameFileName, PHOTO, EXPORT_WIDTH, EXPORT_HEIGHT, CARD } = require('../src/export/layout.ts');
const { drawCard, cardCautions, cardDate, wrapText } = require('../src/export/drawCard.ts');
const { measurementState } = require('../src/physics/measurementState.ts');
const { captureExposure } = require('../src/capture/exposure.ts');
const { restoredGeometry } = require('../src/data/geometry.ts');
const { drawMock } = require('./card-mock.cjs');

test('export card uses the recomputed range and refuses unusable marks', () => {
  const session = createMockSession('legacy-card', 125);
  session.errorKmh = 1;
  const reading = measurementState(session);
  assert.equal(reading.kind, 'measured');
  assert.notEqual(reading.errorKmh, 1);
  const labels = drawMock(session, true).map((d) => d.value);
  assert.ok(labels.includes(`± ${reading.errorKmh} km/h`));
  assert.ok(!labels.includes('± 1 km/h'));

  const unusable = { ...session, calB: { ...session.calA } };
  assert.throws(() => drawCard(null, null, null, unusable, true, null, null), /no measured speed/);
});

test('saved calibration and points share the same pixel scale after upscaling', () => {
  const geometry = restoredGeometry(1280, 720, 1920, 1080);
  const a = { x: 100, y: 400, frame: 0 };
  const b = { x: 900, y: 400, frame: 0 };
  const beforeScale = 800 / 20.12;
  const storedA = geometry.scale(a);
  const storedB = geometry.scale(b);
  assert.equal(geometry.factor, 1.5);
  assert.equal(Math.hypot(storedB.x - storedA.x, storedB.y - storedA.y) / (beforeScale * geometry.factor), 20.12);
  const portrait = restoredGeometry(720, 1280, 1920, 1080);
  assert.deepEqual([portrait.width, portrait.height], [1080, 1920]);
});

test('maps full-resolution points to downscaled landscape frames without cropping', () => {
  const session = createMockSession('landscape', 125);
  session.release = { x: 0, y: 0, frame: 5 };
  session.bounce = { x: 960, y: 540, frame: 25 };
  const g = exportGeometry(session, 1280, 720);
  assert.deepEqual(g.release, { x: g.rect.x, y: g.rect.y });
  assert.deepEqual(g.bounce, { x: g.rect.x + g.rect.width / 2, y: g.rect.y + g.rect.height / 2 });
  assert.equal(g.rect.width / g.rect.height, 1920 / 1080);
});

test('fits portrait footage and refuses invalid or rotated coordinate spaces', () => {
  const session = { ...createMockSession('portrait', 125), width: 1080, height: 1920 };
  const g = exportGeometry(session, 720, 1280);
  // Contained in the card's frame panel: the full height, centred across it.
  assert.ok(Math.abs(g.rect.height - PHOTO.height) < 1e-9);
  assert.ok(g.rect.x > PHOTO.x);
  assert.throws(() => exportGeometry(session, 1280, 720), /orientation/);
  assert.throws(() => exportGeometry(session, 0, 720), /dimensions/);
  assert.equal(frameFileName(42), 'frame_00042.jpg');
  assert.throws(() => frameFileName(-1), /Invalid/);
});

test('clamps exposure for different cameras and handles unsupported bias', () => {
  assert.equal(captureExposure({ supportsExposureBias: true, minExposureBias: -2, maxExposureBias: 2 }), -2);
  assert.equal(captureExposure({ supportsExposureBias: true, minExposureBias: -20, maxExposureBias: 20 }), -4);
  assert.equal(captureExposure(undefined), undefined);
  assert.equal(captureExposure({ supportsExposureBias: false, minExposureBias: 0, maxExposureBias: 0 }), undefined);
});

test('the card says where its range comes from', () => {
  // The range is recomputed from the marks by measurementState, not read off
  // the record, so the card must not credit the saved reading with it.
  const card = fs.readFileSync(path.join(__dirname, '..', 'src', 'export', 'drawCard.ts'), 'utf8');
  assert.doesNotMatch(card, /Speed and uncertainty from the saved reading/);
  assert.match(card, /range recomputed from its marks/);
  assert.match(card, /const reading = measurementState\(session\);/);
});

test('the share card is 1080 x 1350 and carries the whole reading, whose it is and when', () => {
  assert.equal(EXPORT_WIDTH, 1080);
  assert.equal(EXPORT_HEIGHT, 1350);
  const session = createMockSession('card-content', 128.4, new Date(2026, 8, 29, 12).getTime());
  const reading = measurementState(session);
  const values = drawMock(session, false).map((d) => d.value);
  // The wordmark is the traced logo, drawn as paths in white and lime, never
  // set in a system font.
  const { WORDMARK_PATHS } = require('../src/ui/wordmarkPaths.ts');
  const drawn = drawMock(session, false);
  const header = drawn.paths.filter((p) => p.rotated === 0);
  assert.equal(header.find((p) => p.svg === WORDMARK_PATHS.white)?.color, '#FFFFFF');
  assert.equal(header.find((p) => p.svg === WORDMARK_PATHS.lime)?.color, '#D4FF3F');
  assert.ok(!values.includes('PACEBALL') && !values.includes('P'));
  for (const expected of ['Bowling Speed', `${reading.speedKmh.toFixed(1)} km/h`, `± ${reading.errorKmh} km/h`,
    'Average speed, release to bounce', 'Sam', 'Release', 'Bounce', 'Near', 'Far', 'Marked, not tracked',
    '29 September 2026', 'Estimated from marked distance and frame timing.']) {
    assert.ok(values.includes(expected), expected);
  }
  assert.equal(cardDate(new Date(2026, 0, 5, 12).getTime()), '5 January 2026');
});

test('the card carries the cautions the reading carries, marked with the word', () => {
  const clean = createMockSession('card-clean', 128.4);
  assert.deepEqual(cardCautions(clean), []);
  assert.ok(!drawMock(clean, true).some((d) => d.value === 'Caution'));

  const far = { ...clean, travelMetres: 19.2 };
  const farText = drawMock(far, true).map((d) => d.value);
  assert.ok(farText.includes('Caution'));
  assert.match(farText.join(' '), /further than a cricket delivery can carry/);

  // A short reference: stumps marked across a tenth of the frame.
  const small = { ...clean, calA: { x: 900, y: 850, frame: 0 }, calB: { x: 1092, y: 850, frame: 0 } };
  assert.equal(measurementState(small).kind, 'measured');
  const cautions = cardCautions(small);
  assert.equal(cautions.length, 1);
  assert.match(cautions[0], /^Your reference filled about 10% of the frame\./);
  // Worded as Result words it, so the two never drift apart.
  const result = fs.readFileSync(path.join(__dirname, '..', 'app', 'result.tsx'), 'utf8');
  const tail = cautions[0].slice(cautions[0].indexOf('% of the frame.'));
  assert.ok(result.includes(tail), 'the card repeats the Result framing caution word for word');
  assert.match(drawMock(small, true).map((d) => d.value).join(' '), /Stand so both ends sit near/);

  // A ball is small in frame by nature, so it is never cautioned for that.
  const ball = { ...small, calibrationMethod: 'ball' };
  assert.ok(!cardCautions(ball).some((c) => c.startsWith('Your reference filled')));
});

test('caution text wraps inside the card', () => {
  const lines = wrapText('one two three four five six', 9, (line) => line.length);
  assert.deepEqual(lines, ['one two', 'three', 'four five', 'six']);
  const session = { ...createMockSession('card-wrap', 128.4), travelMetres: 19.2 };
  const drawn = drawMock(session, true);
  const label = drawn.find((d) => d.value === 'Caution');
  const cautionLines = drawn.filter((d) => d.x === label.x && d.value !== 'Caution');
  assert.ok(cautionLines.length > 1);
  const right = (EXPORT_WIDTH + CARD.width) / 2 - CARD.inset;
  for (const d of cautionLines) {
    assert.ok(d.x + d.value.length * CARD.text.caution * 0.56 <= right, `"${d.value}" fits the card`);
  }
});

test('ball and height references are drawn only on their own frame, else captioned', () => {
  const session = { ...createMockSession('card-ball', 128.4), calibrationMethod: 'ball', calRealMetres: 0.072 };
  session.calA = { x: 400, y: 430, frame: 10 };
  session.calB = { x: 430, y: 430, frame: 10 };
  const values = drawMock(session, true).map((d) => d.value);
  assert.ok(!values.includes('Left') && !values.includes('Right'));
  assert.ok(values.includes('Ball reference marked on frame 10'), values.join('|'));
});
