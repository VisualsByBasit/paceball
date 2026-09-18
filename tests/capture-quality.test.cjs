require('./register.cjs');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { test } = require('node:test');
const {
  TIGHT_REFERENCE_FRACTION,
  referenceFraming,
  spanBetween,
} = require('../src/capture/framing.ts');
const { MAX_BIT_RATE, highBitRate, profileFrom } = require('../src/capture/bitrate.ts');
const { DEFAULT_SETTINGS, parseSettings } = require('../src/settings/settings.ts');

// Normalised, because a Windows checkout converts line endings to CRLF.
const read = (file) =>
  fs.readFileSync(path.join(__dirname, '..', file), 'utf8').replace(/\r\n/g, '\n');

test('framing is judged from the marked span against the frame width', () => {
  assert.equal(TIGHT_REFERENCE_FRACTION, 0.6);
  // Stumps marked right across a 1280 px frame: as tight as it gets.
  assert.deepEqual(referenceFraming(1200, 1280), { fraction: 1200 / 1280, tight: true });
  // Exactly at the threshold counts as tight; a hair under does not.
  assert.equal(referenceFraming(0.6 * 1280, 1280).tight, true);
  assert.equal(referenceFraming(0.6 * 1280 - 1, 1280).tight, false);
  // Shot from too far back: the reference is a third of the frame.
  assert.equal(referenceFraming(420, 1280).tight, false);

  // Nothing to judge from is not a verdict.
  assert.equal(referenceFraming(0, 1280), null);
  assert.equal(referenceFraming(600, 0), null);
  assert.equal(referenceFraming(NaN, 1280), null);

  // The span is the distance between the two marks, in their own pixels.
  assert.equal(spanBetween({ x: 100, y: 900 }, { x: 1100, y: 900 }), 1000);
  assert.equal(Math.round(spanBetween({ x: 0, y: 0 }, { x: 300, y: 400 })), 500);
});

test('capture guides the framing without claiming to have measured it', () => {
  const capture = read('app/capture.tsx');
  assert.match(capture, /Fit both ends of your reference inside the guide/);
  assert.match(capture, /the more of the frame it fills, the less the reading drifts/);
  // Shown before recording, dimmed while recording, and dismissable for the session.
  assert.match(capture, /<FramingGuide dimmed=\{isRecording\} onDismiss=\{\(\) => setShowGuide\(false\)\} \/>/);
  assert.match(capture, /guideDimmed: \{ opacity: opacity\.inactive \}/);
  // It is guidance: nothing here measures or checks the framing.
  assert.doesNotMatch(capture, /referenceFraming|framingCheck|80% of the frame/);

  // Result is where it can be said, because the marks exist by then.
  const result = read('app/result.tsx');
  assert.match(result, /referenceFraming\(spanBetween\(calA, calB\), imageWidth\)/);
  // And only for a reference laid along the pitch: a ball is small by nature.
  assert.match(result, /!framing\.tight && spec!\.rulerBoundsTravel && measured/);
});

test('the lens swap is covered by a fade, and is not called a zoom', () => {
  const capture = read('app/capture.tsx');
  assert.match(capture, /const LENS_FADE_MS = 200;/);
  assert.match(capture, /onPress=\{\(\) => chooseLens\(option\)\}/);
  // Out, swap, back in.
  assert.match(capture, /toValue: 0,[\s\S]*?setLens\(next\);[\s\S]*?toValue: 1,/);
  assert.match(capture, /opacity: previewFade/);
  // The label stays put: the picker is outside the faded preview.
  const faded = capture.slice(capture.indexOf('<Animated.View'), capture.indexOf('</Animated.View>'));
  assert.doesNotMatch(faded, /LENS_LABEL/);
  // The picker calls it a lens, never a zoom: it is a swap, not a ramp. Only the
  // comment saying so may use the word.
  const picker = capture.slice(capture.indexOf('ultraWideAvailable ? ('), capture.indexOf('showTips ? ('));
  assert.doesNotMatch(picker, /\bzoom\b/i);
  assert.doesNotMatch(read('src/capture/lenses.ts'), /zoom/i);
});

test('a Pro bitrate is scaled to what the camera produced, and falls back', () => {
  // 1080p60 as this phone actually recorded it.
  const profile = { width: 1920, height: 1080, fps: 59.94 };
  const target = highBitRate(profile);
  assert.ok(target > 0 && Number.isInteger(target));
  assert.equal(target, Math.round(1920 * 1080 * 59.94 * 0.12));
  assert.ok(target <= MAX_BIT_RATE);

  // Nothing recorded yet, or a profile that cannot be trusted: no target at all,
  // so the camera keeps its own default rather than being asked for a number
  // nothing supports.
  assert.equal(highBitRate(null), null);
  assert.equal(highBitRate(undefined), null);
  assert.equal(highBitRate({ width: 0, height: 1080, fps: 60 }), null);
  assert.equal(highBitRate({ width: 1920, height: 1080, fps: NaN }), null);
  // A tiny frame gains nothing, so it is left alone too.
  assert.equal(highBitRate({ width: 320, height: 240, fps: 30 }), null);
  // A huge one is capped rather than asking for something absurd.
  assert.equal(highBitRate({ width: 7680, height: 4320, fps: 120 }), MAX_BIT_RATE);

  // The profile is read off the finished file, never assumed from the camera.
  assert.deepEqual(profileFrom({ width: 1920, height: 1080, derivedFps: 59.94 }), profile);
  assert.equal(profileFrom({ width: 1920, height: 1080, derivedFps: 0 }), null);
  assert.equal(DEFAULT_SETTINGS.lastRecording, null);
  assert.deepEqual(parseSettings({ lastRecording: profile }).lastRecording, profile);
  assert.equal(parseSettings({ lastRecording: { width: 1920 } }).lastRecording, null);
});

test('bitrate changes the encode only, not what the measurement reads', () => {
  const capture = read('app/capture.tsx');
  // The dimensions and fps handed to marking still come from the recorded file.
  assert.match(capture, /fps: String\(info\.derivedFps\)/);
  assert.match(capture, /width: String\(info\.width\)/);
  assert.match(capture, /height: String\(info\.height\)/);
  // targetBitRate is the only thing the gate adds, and only when there is one.
  assert.match(capture, /bitRate === null \? \{ fileType: 'mp4' \} : \{ fileType: 'mp4', targetBitRate: bitRate \}/);
  // Nothing about resolution or frame rate is touched by it.
  const bitrate = read('src/capture/bitrate.ts');
  assert.doesNotMatch(bitrate, /targetResolution|CAPTURE_FPS|constraints/);
  // The claim on screen is quality, never frame rate, and only when it is on.
  assert.match(capture, /\{bitRate !== null \? \(/);
  assert.match(capture, /PRO QUALITY/);
  const mark = capture.slice(capture.indexOf('qualityMark'), capture.indexOf('<View style={styles.timerRow}>'));
  assert.doesNotMatch(mark, /fps|frame rate|120/i);
});

test('the new copy uses no em dashes', () => {
  for (const file of ['src/capture/framing.ts', 'src/capture/bitrate.ts']) {
    assert.doesNotMatch(read(file), /—/, file);
  }
  const capture = read('app/capture.tsx');
  const guide = capture.slice(capture.indexOf('function FramingGuide'), capture.indexOf('const SHUTTER_SIZE'));
  assert.ok(guide.length > 0);
  assert.doesNotMatch(guide, /—/);

  const result = read('app/result.tsx');
  const caution = result.slice(result.indexOf('Your reference filled about'), result.indexOf('Stand so both ends'));
  assert.ok(caution.length > 0);
  assert.doesNotMatch(caution, /—/);
});
