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

test('the device spike is reachable only through the existing development debug route', () => {
  const debug = read('app/debug.tsx');
  assert.match(debug, /__DEV__ \? <VideoExportSpike session=\{session\} \/> : null/);
  // Recordings have no audio track, so there is nothing for a toggle to keep.
  assert.doesNotMatch(debug, /includeAudio|setIncludeAudio|Audio (on|off)/);
  assert.match(debug, /createSessionVideoExport\(session, \{ isPro \}\)/);
  assert.match(debug, /isPro \? 'Pro: clean overlay' : 'Free: Paceball watermark'/);
});
