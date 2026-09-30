const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { test } = require('node:test');

const root = path.join(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

test('frame extractor uses the exact Media3 version already selected by expo-video', () => {
  const expoVideo = read('node_modules/expo-video/android/build.gradle');
  const frameExtractor = read('modules/frame-extractor/android/build.gradle');
  const expected = expoVideo.match(/androidxMedia3Version\s*=\s*"([^"]+)"/)?.[1];
  const actual = frameExtractor.match(/androidxMedia3Version\s*=\s*"([^"]+)"/)?.[1];
  assert.ok(expected, 'expo-video must declare its Media3 version');
  assert.equal(actual, expected);
});

test('native export transforms the original MP4 and does not rebuild capped JPEGs', () => {
  const native = read('modules/frame-extractor/android/src/main/java/expo/modules/frameextractor/VideoExporter.kt');
  assert.match(native, /MediaItem\.Builder\(\)[\s\S]*setUri\(Uri\.fromFile\(input\)\)/);
  assert.match(native, /setClippingConfiguration/);
  assert.match(native, /setRemoveAudio\(!request\.includeAudio\)/);
  assert.match(native, /OverlayEffect/);
  assert.doesNotMatch(native, /framesDir|frame_\%|\.jpg/i);
});

test('native export fails closed around files, bad coordinates and partial output', () => {
  const native = read('modules/frame-extractor/android/src/main/java/expo/modules/frameextractor/VideoExporter.kt');
  assert.match(native, /privateOutput\(request\.outputPath\)/);
  assert.match(native, /context\.filesDir[\s\S]*context\.cacheDir/);
  assert.match(native, /does not match source/);
  assert.match(native, /job\.output\.delete\(\)/);
  assert.match(native, /job\.transformer\.cancel\(\)/);
});

test('the debug-only entry is gone now the share sheet exports video', () => {
  const debug = read('app/debug.tsx');
  assert.doesNotMatch(debug, /VideoExportSpike|createSessionVideoExport|renderSessionVideo/);
});

const exporter = () => read('modules/frame-extractor/android/src/main/java/expo/modules/frameextractor/VideoExporter.kt');
/** The HUD's drawing, from the overlay class to the coordinate mapping. */
const hud = () => {
  const native = exporter();
  return native.slice(native.indexOf('private class PaceballOverlay'), native.indexOf('private fun map('));
};

test('native HUD: the whole reading from the first frame, marks only from their own frames', () => {
  const draw = hud();
  // The reading is drawn on every frame, whatever the time, on an opaque plate.
  assert.match(draw, /drawReading\(canvas, plateTop, plateHeight, s\)/);
  assert.doesNotMatch(draw.slice(draw.indexOf('private fun drawReading')), /released|bounced|presentationTimeUs/);
  assert.match(draw, /private val bg = Color\.parseColor\(request\.colorBg\)/);
  assert.doesNotMatch(draw, /Color\.argb|Color\.rgb/, 'no translucent plates, no hardcoded colours');
  // Each mark waits for its frame.
  assert.match(draw, /val released = timeMs >= request\.releaseAtMs - request\.frameToleranceMs/);
  assert.match(draw, /val bounced = timeMs >= request\.bounceAtMs - request\.frameToleranceMs/);
  assert.match(draw, /if \(released\) \{[\s\S]*?"Release"/);
  assert.match(draw, /if \(bounced\) \{[\s\S]*?"Bounce"[\s\S]*?request\.pathText/);
  // No count-up, no moving ball, no interpolated position.
  assert.doesNotMatch(draw, /shownSpeed|fraction|speedKmh \*|roundToInt|lerp/);
  assert.doesNotMatch(draw, /AVG SPEED|MARK-TO-MARK|KM\/H/);
});

test('native HUD: a free clip carries the free card band, clear of the marks and the plate; Pro is clean', () => {
  const draw = hud();
  const native = exporter();
  // The reading plate no longer carries a strip; the band is its own drawing.
  const reading = draw.slice(draw.indexOf('private fun drawReading'), draw.indexOf('private fun drawBand'));
  assert.doesNotMatch(reading, /stripText|bandText|watermark/);
  assert.doesNotMatch(native, /stripText/);
  // Only on a free clip, placed from every mark, label and the path plate at once.
  const onDraw = draw.slice(draw.indexOf('override fun onDraw'), draw.indexOf('private fun rangeFits'));
  assert.match(onDraw, /if \(request\.watermark\) \{[\s\S]*?markBox\(release, s\), labelRect\(canvas, "Release", release, s\),[\s\S]*?markBox\(bounce, s\), labelRect\(canvas, "Bounce", bounce, s\),[\s\S]*?plateRect\(canvas, request\.pathText/);
  // Kept to the picture outside the reading's plate, so it never covers the HUD.
  assert.match(onDraw, /RectF\(0f, plateHeight, canvas\.width\.toFloat\(\), canvas\.height\.toFloat\(\)\)/);
  assert.match(onDraw, /RectF\(0f, 0f, canvas\.width\.toFloat\(\), plateTop\)/);
  // Drawn before the marks, so any mark would sit on top of it all the same.
  assert.ok(onDraw.indexOf('drawBand(') < onDraw.indexOf('if (released)'));
  const band = draw.slice(draw.indexOf('private fun drawBand'), draw.indexOf('private fun markBox'));
  assert.match(band, /canvas\.clipRect\(picture\)/);
  assert.match(band, /val angle = -30f/);
  assert.match(band, /canvas\.drawPath\(white, bandPaint\)[\s\S]*canvas\.drawPath\(lime, bandPaint\)[\s\S]*canvas\.drawText\(request\.bandText/);
  // The same search as the card's bandPlacement: out from the centre, 4 at a time, both ways.
  assert.match(band, /for \(offset in floatArrayOf\(step, -step\)\)/);
  assert.match(band, /val reach = abs\(across\(picture\)\.first\) \* 0\.62f/);
  // Native refuses a free export it could not brand, rather than writing it clean.
  assert.match(native, /if \(request\.watermark && \(request\.bandText\.isBlank\(\) \|\| request\.wordmarkWhite\.isBlank\(\)/);
  assert.match(native, /private val wordWhite: Path\? = if \(request\.watermark\) parseWordmark\(request\.wordmarkWhite\) else null/);
  // No new Media3 class for it: plain Android graphics only.
  assert.match(native, /^import android\.graphics\.RectF$/m);
});

test('the Kotlin wordmark parser reads every command the traced paths use, and nothing else', () => {
  require('./register.cjs');
  const { WORDMARK_PATHS } = require('../src/ui/wordmarkPaths.ts');
  for (const data of [WORDMARK_PATHS.white, WORDMARK_PATHS.lime]) {
    const tokens = data.trim().split(/\s+/);
    let i = 0;
    const arity = { M: 2, L: 2, Q: 4, Z: 0 };
    while (i < tokens.length) {
      assert.ok(tokens[i] in arity, `unknown command ${tokens[i]}`);
      const n = arity[tokens[i]];
      for (let k = 1; k <= n; k++) assert.ok(Number.isFinite(Number(tokens[i + k])), `${tokens[i]} at ${i}`);
      i += 1 + n;
    }
    assert.equal(tokens[0], 'M');
    assert.equal(tokens[tokens.length - 1], 'Z');
  }
  const parser = exporter().slice(exporter().indexOf('private fun parseWordmark'), exporter().indexOf('private class PaceballOverlay'));
  for (const command of ['"M"', '"L"', '"Q"', '"Z"']) assert.ok(parser.includes(command), command);
  assert.match(parser, /else -> throw IllegalArgumentException/);
});

test('native export scales down only, keeps the aspect, and reads verified frame times', () => {
  const native = exporter();
  assert.match(native, /if \(request\.outputShortSide > 0\) videoEffects\.add\(Presentation\.createForShortSide\(request\.outputShortSide\)\)/);
  // Scaled before the HUD is drawn, so the HUD is drawn at the shared size.
  assert.ok(native.indexOf('Presentation.createForShortSide') < native.indexOf('videoEffects.add(OverlayEffect'));
  assert.match(native, /outputShortSide >= min\(request\.sourceWidth, request\.sourceHeight\)/);
  const module = read('modules/frame-extractor/android/src/main/java/expo/modules/frameextractor/FrameExtractorModule.kt');
  const times = module.slice(module.indexOf('AsyncFunction("getFrameTimesMs")'), module.indexOf('AsyncFunction("exportVideo")'));
  assert.match(times, /extractor\.sampleTime/);
  assert.match(times, /times\.sort\(\)/);
  assert.doesNotMatch(times, /MediaCodec|getFrameAtIndex/, 'reads the container, decodes nothing');
});
