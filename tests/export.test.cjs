require('./register.cjs');
const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const { createMockSession } = require('../src/data/mockData.ts');
const { exportGeometry, frameFileName, EXPORT_WIDTH, EXPORT_HEIGHT } = require('../src/export/layout.ts');
const { drawCard } = require('../src/export/drawCard.ts');
const { captureExposure } = require('../src/capture/exposure.ts');
const { restoredGeometry } = require('../src/data/geometry.ts');

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
  const palette = { bg: '#0A0B0D', surface: '#14161A', text: '#FFFFFF', muted: '#8A9099', accent: '#D4FF3F' };
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
      const brightPixels = (fromY, toY) => {
        let count = 0;
        for (let i = fromY * EXPORT_WIDTH * 4; i < toY * EXPORT_WIDTH * 4; i += 4) {
          if (pixels[i] > 100 && pixels[i + 1] > 100) count++;
        }
        return count;
      };
      assert.ok(brightPixels(0, 180) > 1000, 'Speed and uncertainty text are actually visible');
      assert.ok(brightPixels(890, 1080) > 1000, 'Measurement labels are visible');
      assert.equal(brightPixels(1100, 1200) > 100, watermark, 'Only branded variant draws the wordmark');
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
