const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { test } = require('node:test');

// Normalised, because a Windows checkout converts line endings to CRLF.
const read = (file) =>
  fs.readFileSync(path.join(__dirname, '..', file), 'utf8').replace(/\r\n/g, '\n');

test('the share sheet offers an image card and a video clip, opening on the image', () => {
  const choice = read('src/ui/ShareChoice.tsx');
  assert.match(choice, /label: 'Image card'/);
  assert.match(choice, /label: 'Video clip'/);
  assert.match(choice, /useState<ShareKind>\('image'\)/);
  assert.match(choice, /minHeight: size\.target/);
  // The video side gets a way back to the image, for when a clip cannot be made.
  assert.match(choice, /video\(\(\) => setKind\('image'\)\)/);
});

test('Result and Analysis both offer the clip, only for a measured delivery, gated like the card', () => {
  const sheet = read('src/ui/DeliveryShareSheet.tsx');
  assert.match(sheet, /<ShareChoice/);
  assert.match(sheet, /<VideoActions sessionId=\{sessionId\} watermark=\{!clean\} onUseImage=\{useImage\} \/>/);
  assert.match(sheet, /const clean = canExportWithoutWatermark\(entitlements\);/);
  assert.match(read('app/result.tsx'), /\{savedId && measured \? \(\s*<DeliveryShareSheet visible=\{sharing\} onClose=\{\(\) => setSharing\(false\)\} sessionId=\{savedId\} \/>/);
  assert.match(read('app/analysis.tsx'), /\{measured \? \(\s*<DeliveryShareSheet\s+visible=\{sharing\}\s+onClose=\{\(\) => setSharing\(false\)\}\s+sessionId=\{session\.id\}/);
});

test('a free clip is branded unless the caller says the entitlement allows otherwise', () => {
  const video = read('src/export/VideoActions.tsx');
  assert.match(video, /watermark = true,/);
  assert.match(video, /createSessionVideoExport\(session, \{ isPro: !watermark, includeAudio: withSound \}\)/);
  assert.doesNotMatch(video, /isPro: true|watermark: false/);
});

test('guessed or unusable deliveries cannot export a clip', () => {
  const video = read('src/export/VideoActions.tsx');
  assert.match(video, /measurementState\(session\)\.kind !== 'measured'/);
  assert.match(video, /return <Notice tone="info">\{VIDEO_NEEDS_READING\}<\/Notice>;/);
  // The planner refuses them too, whoever calls it.
  assert.match(read('src/export/videoPlan.ts'), /if \(reading\.kind !== 'measured'\) \{\s*throw/);
});

test('progress is the encoder\'s or none, and cancelling says nothing was saved', () => {
  const video = read('src/export/VideoActions.tsx');
  assert.match(video, /setPhase\(\{ kind: 'running', progress: null \}\)/);
  assert.match(video, /current\.onProgress\(/);
  assert.match(video, /phase\.progress === null \? 'Creating video\.\.\.' : `Creating video\.\.\. \$\{phase\.progress\}%`/);
  assert.doesNotMatch(video, /setInterval|setTimeout/, 'no timer makes up progress');
  assert.match(video, /label="Cancel export"/);
  assert.match(video, /isCancelledExport\(error\) \? \{ kind: 'cancelled' \}/);
  assert.match(video, /Export cancelled\. Nothing was saved\./);
  // Leaving the sheet mid-export stops the encoder too.
  assert.match(video, /useEffect\(\(\) => \(\) => \{ void task\.current\?\.cancel\(\); \}, \[\]\);/);
});

test('a failed clip says so and offers the image, never a silent unbranded fallback', () => {
  const video = read('src/export/VideoActions.tsx');
  assert.match(video, /export const VIDEO_FAILED = 'Video could not be created\. Your delivery is safe\.';/);
  assert.match(video, /export const VIDEO_USE_IMAGE = 'Create an image instead';/);
  assert.match(video, /<Notice tone="error" live action=\{\{ label: VIDEO_USE_IMAGE, onPress: onUseImage \}\}>\{VIDEO_FAILED\}<\/Notice>/);
  // Nothing is rendered in its place: the failure path never calls another exporter.
  const failure = video.slice(video.indexOf('} catch (error) {'), video.indexOf('} finally {'));
  assert.doesNotMatch(failure, /renderExport|createSessionVideoExport|watermark/);
});

test('saving and sharing a clip only ever touch the exporter\'s own MP4s', () => {
  const actions = read('src/export/deliveryActions.ts');
  assert.match(actions, /new Directory\(Paths\.cache, 'paceball-video-exports'\)/);
  assert.match(actions, /!videoPath\.endsWith\('\.mp4'\)\) throw/);
  assert.match(actions, /mimeType: 'video\/mp4'/);
});

test('the video share copy uses no em dashes', () => {
  for (const file of ['src/export/VideoActions.tsx', 'src/ui/ShareChoice.tsx', 'src/export/videoPlan.ts',
    'modules/frame-extractor/android/src/main/java/expo/modules/frameextractor/VideoExporter.kt']) {
    assert.doesNotMatch(read(file), /—/, file);
  }
});
