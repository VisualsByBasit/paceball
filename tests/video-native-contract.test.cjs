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

test('native HUD: a free clip always carries the strip, between the speed and its range', () => {
  const draw = hud();
  const reading = draw.slice(draw.indexOf('private fun drawReading'), draw.indexOf('private fun ring'));
  const speed = reading.indexOf('request.speedText');
  const strip = reading.indexOf('request.stripText');
  const range = reading.indexOf('request.rangeText');
  assert.ok(speed > 0 && speed < strip && strip < range, 'speed, strip, range, in that order');
  assert.match(reading, /if \(request\.watermark\) \{[\s\S]*?drawRect\(0f, y, canvas\.width\.toFloat\(\)/, 'edge to edge');
  // Native refuses a free export it could not brand, rather than writing it clean.
  assert.match(exporter(), /if \(request\.watermark && request\.stripText\.isBlank\(\)\) \{\s*throw/);
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
