require('./register.cjs');
const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const { createMockSession } = require('../src/data/mockData.ts');
const { exportGeometry, frameFileName, cardLayout, CARD, EXPORT_WIDTH, EXPORT_HEIGHT } = require('../src/export/layout.ts');
const { drawCard, cardCautions, cardDate, wrapText, CARD_STRIP } = require('../src/export/drawCard.ts');
const { measurementState } = require('../src/physics/measurementState.ts');
const { captureExposure } = require('../src/capture/exposure.ts');
const { restoredGeometry } = require('../src/data/geometry.ts');

test('export card uses the recomputed range and refuses unusable marks', () => {
  const session = createMockSession('legacy-card', 125);
  session.errorKmh = 1;
  const reading = measurementState(session);
  assert.equal(reading.kind, 'measured');
  assert.notEqual(reading.errorKmh, 1);

  const labels = [];
  const paint = { setAntiAlias() {}, setColor() {}, setStrokeWidth() {}, dispose() {} };
  const skia = {
    Paint: () => paint, Color: (color) => color,
    XYWHRect: (x, y, width, height) => ({ x, y, width, height }),
  };
  const canvas = {
    drawText: (value) => labels.push(value),
    drawRect() {}, drawImageRect() {}, drawLine() {}, drawCircle() {},
  };
  const photo = { width: () => 1920, height: () => 1080 };
  const colors = { bg: '#000', surface: '#111', text: '#fff', muted: '#aaa', accent: '#0f0' };
  drawCard(skia, canvas, photo, session, true, () => null, colors);
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
  assert.equal(g.rect.height, 660);
  assert.ok(g.rect.x > 48);
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

test('renders genuine PNGs with Skia for both orientations and watermark variants', async () => {
  const CanvasKitInit = require('canvaskit-wasm/bin/full/canvaskit.js');
  const kit = await CanvasKitInit({ locateFile: () => require.resolve('canvaskit-wasm/bin/full/canvaskit.wasm') });
  const { JsiSkApi } = require('@shopify/react-native-skia/lib/commonjs/skia/web');
  const skia = JsiSkApi(kit);
  const fontPath = [process.env.PACEBALL_TEST_FONT, 'C:/Windows/Fonts/arial.ttf',
    '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf', '/System/Library/Fonts/Supplemental/Arial.ttf']
    .find((p) => p && fs.existsSync(p));
  assert.ok(fontPath, 'Set PACEBALL_TEST_FONT to a local TTF for the real renderer test.');
  const fontData = skia.Data.fromBytes(fs.readFileSync(fontPath));
  const typeface = skia.Typeface.MakeFreeTypeFaceFromData(fontData);
  assert.ok(typeface);
  const palette = { bg: '#0A0B0D', surface: '#14161A', text: '#FFFFFF', muted: '#8A9099', accent: '#D4FF3F', warn: '#FFC247' };
  const artifacts = process.env.PACEBALL_TEST_ARTIFACTS;
  if (artifacts) fs.mkdirSync(artifacts, { recursive: true });
  for (const portrait of [false, true]) {
    const session = createMockSession('render-test', 128.4);
    if (portrait) {
      session.width = 1080; session.height = 1920;
      session.release = { x: 240, y: 430, frame: 42 };
      session.bounce = { x: 800, y: 1600, frame: 60 };
    }
    const source = skia.Surface.Make(session.width, session.height);
    const paint = skia.Paint();
    paint.setColor(skia.Color('#324734'));
    source.getCanvas().drawPaint(paint);
    paint.setColor(skia.Color('#b3aa85'));
    source.getCanvas().drawRect(skia.XYWHRect(0, session.height * 0.7, session.width, session.height * 0.12), paint);
    source.flush();
    const photo = source.makeImageSnapshot();
    const outputs = [];
    for (const watermark of [true, false]) {
      const surface = skia.Surface.Make(EXPORT_WIDTH, EXPORT_HEIGHT);
      const fonts = [];
      drawCard(skia, surface.getCanvas(), photo, session, watermark, (size) => {
        const font = skia.Font(typeface, size); fonts.push(font); return font;
      }, palette);
      surface.flush();
      const snapshot = surface.makeImageSnapshot();
      const pixels = snapshot.readPixels();
      assert.ok(pixels instanceof Uint8Array);
      const brightPixels = (fromY, toY, fromX = 0, toX = EXPORT_WIDTH) => {
        let count = 0;
        for (let y = fromY; y < toY; y++) {
          for (let x = fromX; x < toX; x++) {
            const i = (y * EXPORT_WIDTH + x) * 4;
            if (pixels[i] > 100 && pixels[i + 1] > 100) count++;
          }
        }
        return count;
      };
      const layout = cardLayout({ watermark, hasName: false, cautionLines: [], hasCaption: false });
      assert.ok(brightPixels(0, layout.speedBaseline + 10) > 1000, 'Speed text is actually visible');
      assert.ok(brightPixels(layout.rangeBaseline - 40, layout.rangeBaseline + 10) > 1000, 'Its range is visible');
      assert.ok(brightPixels(layout.dateBaseline - 30, EXPORT_HEIGHT) > 1000, 'Date and method note are visible');
      // The strip runs edge to edge, so the side margins beside it are lit only on a free card.
      const branded = cardLayout({ watermark: true, hasName: false, cautionLines: [], hasCaption: false }).strip;
      assert.equal(brightPixels(branded.top + 4, branded.top + branded.height - 4, 0, 40) > 1000, watermark,
        'Only the branded variant draws the full-width strip');
      const bytes = Buffer.from(snapshot.encodeToBytes(4)); // ImageFormat.PNG
      assert.deepEqual([...bytes.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10]);
      assert.equal(bytes.readUInt32BE(16), EXPORT_WIDTH);
      assert.equal(bytes.readUInt32BE(20), EXPORT_HEIGHT);
      assert.ok(bytes.length > 5000, 'PNG contains rendered content');
      outputs.push(bytes);
      if (artifacts) fs.writeFileSync(path.join(artifacts, `${portrait ? 'portrait' : 'landscape'}-${watermark ? 'branded' : 'clean'}.png`), bytes);
      snapshot.dispose(); surface.dispose(); fonts.forEach((font) => font.dispose());
    }
    assert.notDeepEqual(outputs[0], outputs[1], 'Watermark changes actual rendered pixels');
    photo.dispose(); source.dispose(); paint.dispose();
  }
  typeface.dispose(); fontData.dispose();
});

test('the card says where its range comes from', () => {
  // The range is recomputed from the marks by measurementState, not read off
  // the record, so the card must not credit the saved reading with it.
  const card = fs.readFileSync(path.join(__dirname, '..', 'src', 'export', 'drawCard.ts'), 'utf8');
  assert.doesNotMatch(card, /Speed and uncertainty from the saved reading/);
  assert.match(card, /range recomputed from its marks/);
  assert.match(card, /const reading = measurementState\(session\);/);
});

const mockCanvas = () => {
  const drawn = [];
  const paint = { setAntiAlias() {}, setColor() {}, setStrokeWidth() {}, dispose() {} };
  const skia = {
    Paint: () => paint, Color: (color) => color,
    XYWHRect: (x, y, width, height) => ({ x, y, width, height }),
  };
  const canvas = {
    drawText: (value, x, y) => drawn.push({ value, x, y }),
    drawRect() {}, drawImageRect() {}, drawLine() {}, drawCircle() {},
  };
  return { drawn, skia, canvas };
};
const cardPalette = { bg: '#000', surface: '#111', text: '#fff', muted: '#aaa', accent: '#0f0', warn: '#fa0' };
const drawMock = (session, watermark, playerName = 'Sam') => {
  const { drawn, skia, canvas } = mockCanvas();
  const photo = { width: () => session.width, height: () => session.height };
  drawCard(skia, canvas, photo, session, watermark, () => null, cardPalette, { playerName });
  return drawn;
};

test('the share card is 1080 x 1350 and carries the whole reading, whose it is and when', () => {
  assert.equal(EXPORT_WIDTH, 1080);
  assert.equal(EXPORT_HEIGHT, 1350);
  const session = createMockSession('card-content', 128.4, new Date(2026, 8, 29, 12).getTime());
  const reading = measurementState(session);
  const values = drawMock(session, false).map((d) => d.value);
  for (const expected of ['Paceball', `${reading.speedKmh.toFixed(1)} km/h`, `± ${reading.errorKmh} km/h`,
    'Average speed, release to bounce', 'Sam', 'Release', 'Bounce', 'Near', 'Far', 'Marked, not tracked',
    '29 September 2026', 'Estimated from marked distance and frame timing.']) {
    assert.ok(values.includes(expected), expected);
  }
  assert.equal(cardDate(new Date(2026, 0, 5, 12).getTime()), '5 January 2026');
});

test('the free strip sits between the speed and its range, and Pro only closes the gap', () => {
  const session = createMockSession('card-strip', 128.4);
  const free = drawMock(session, true);
  const pro = drawMock(session, false);
  const at = (drawn, value) => drawn.find((d) => d.value === value);
  const speed = at(free, `${session.speedKmh.toFixed(1)} km/h`);
  const range = at(free, `± ${measurementState(session).errorKmh} km/h`);
  const strip = at(free, CARD_STRIP);
  assert.equal(CARD_STRIP, 'PACEBALL · FREE');
  assert.ok(speed.y < strip.y && strip.y < range.y, 'speed, then the strip, then the range');
  assert.equal(at(pro, CARD_STRIP), undefined);

  const freeLayout = cardLayout({ watermark: true, hasName: true, cautionLines: [], hasCaption: false });
  const proLayout = cardLayout({ watermark: false, hasName: true, cautionLines: [], hasCaption: false });
  assert.ok(freeLayout.strip.top > freeLayout.speedBaseline);
  assert.ok(freeLayout.strip.top + freeLayout.strip.height < freeLayout.rangeBaseline - CARD.text.range * 0.74);
  const closed = freeLayout.strip.height + CARD.gap;
  assert.equal(proLayout.speedBaseline, freeLayout.speedBaseline);
  assert.equal(proLayout.rangeBaseline, freeLayout.rangeBaseline - closed);
  assert.equal(proLayout.nameBaseline, freeLayout.nameBaseline - closed);
  // The bottom edge does not move; the frame takes the space the strip gave up.
  assert.equal(proLayout.dateBaseline, freeLayout.dateBaseline);
  assert.equal(proLayout.photo.height, freeLayout.photo.height + closed);

  // Nothing else changes: the same text, in the same order, less the strip.
  assert.deepEqual(pro.map((d) => d.value), free.map((d) => d.value).filter((v) => v !== CARD_STRIP));
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
  const layout = cardLayout({ watermark: true, hasName: true, cautionLines: [4], hasCaption: false });
  assert.ok(layout.cautionTop > layout.photo.y + layout.photo.height);
  const cautionLines = drawMock(session, true).filter((d) => d.x === CARD.pad + 20 && d.value !== 'Caution');
  assert.ok(cautionLines.length > 1);
  for (const d of cautionLines) {
    assert.ok(d.x + d.value.length * CARD.text.caution * 0.56 <= EXPORT_WIDTH - CARD.pad, `"${d.value}" fits the card`);
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
