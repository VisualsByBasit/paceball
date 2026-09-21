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
const {
  MAX_BIT_RATE,
  MIN_PRO_GAIN,
  highBitRate,
  observedBitRate,
  profileFrom,
} = require('../src/capture/bitrate.ts');
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

test('the lens swap holds the preview dark until the new lens streams', () => {
  const capture = read('app/capture.tsx');
  assert.match(capture, /onPress=\{\(\) => chooseLens\(option\)\}/);
  // Out, swap, then wait: the fade back in is not on a timer of its own.
  assert.match(capture, /toValue: 0,[\s\S]*?setLens\(next\);[\s\S]*?setTimeout\(revealPreview, LENS_SWAP_TIMEOUT_MS\)/);
  const choose = capture.slice(capture.indexOf('const chooseLens'), capture.indexOf('useEffect(', capture.indexOf('const chooseLens')));
  assert.doesNotMatch(choose, /toValue: 1/);
  // It comes back on the new lens's first preview frame, or after the fallback.
  assert.match(capture, /onPreviewStarted=\{revealPreview\}/);
  assert.match(capture, /const LENS_SWAP_TIMEOUT_MS = 2000;/);
  const reveal = capture.slice(capture.indexOf('const revealPreview'), capture.indexOf('const chooseLens'));
  // A preview start that is not the end of a swap (the first one on opening) does nothing.
  assert.match(reveal, /if \(swapTimeout\.current === null\) return;/);
  assert.match(reveal, /toValue: 1/);
  assert.match(capture, /opacity: previewFade/);
  // While it waits the change reads as deliberate, and nothing can be recorded.
  assert.match(capture, /\{switchingLens \? \([\s\S]*?Switching lens/);
  assert.match(capture, /disabled=\{!sessionReady \|\| switchingLens \|\|/);
  assert.match(capture, /if \(next === lens \|\| switchingLens\) return;/);
  // The label stays put: the picker is outside the faded preview.
  const faded = capture.slice(capture.indexOf('<Animated.View'), capture.indexOf('</Animated.View>'));
  assert.doesNotMatch(faded, /LENS_LABEL|Switching lens/);
  // The picker calls it a lens, never a zoom: it is a swap, not a ramp. Only the
  // comment saying so may use the word.
  const picker = capture.slice(capture.indexOf('ultraWideAvailable ? ('), capture.indexOf('showTips ? ('));
  assert.doesNotMatch(picker, /\bzoom\b/i);
  assert.doesNotMatch(read('src/capture/lenses.ts'), /zoom/i);
});

test('a Pro target is only ever requested clearly above what the camera produced', () => {
  // The device result that exposed the old rule: this phone writes ~34 Mbps by
  // default at 1080p60, and a fixed bits-per-pixel target asked for ~15.
  const observed = 34_000_000;
  const profile = { width: 1920, height: 1080, fps: 59.94, defaultBitRate: observed };
  const target = highBitRate(profile);
  assert.ok(Number.isInteger(target));
  assert.ok(target > observed, 'never at or below the default');
  assert.ok(target >= observed * MIN_PRO_GAIN, 'clearly above, not a rounding step');
  assert.ok(target <= MAX_BIT_RATE);

  // Across the whole range, whatever comes back is null or clearly above.
  for (let mbps = 1; mbps <= 80; mbps += 0.5) {
    const bps = mbps * 1_000_000;
    const t = highBitRate({ ...profile, defaultBitRate: bps });
    if (t !== null) {
      assert.ok(t > bps && t >= bps * MIN_PRO_GAIN && t <= MAX_BIT_RATE, `${mbps} Mbps -> ${t}`);
    }
  }
  // A default already near the cap leaves no clearly higher target: none is asked for.
  assert.equal(highBitRate({ ...profile, defaultBitRate: 45_000_000 }), null);
  assert.equal(highBitRate({ ...profile, defaultBitRate: MAX_BIT_RATE }), null);
  assert.equal(highBitRate({ ...profile, defaultBitRate: 60_000_000 }), null);

  // No observed value yet: no target, the camera keeps its own default.
  assert.equal(highBitRate(null), null);
  assert.equal(highBitRate(undefined), null);
  assert.equal(highBitRate({ ...profile, defaultBitRate: null }), null);
  assert.equal(highBitRate({ ...profile, defaultBitRate: NaN }), null);
  // Resolution alone no longer produces a target.
  assert.equal(highBitRate({ width: 3840, height: 2160, fps: 60, defaultBitRate: null }), null);
});

test('the default bitrate is measured from a default recording, and only from one', () => {
  // File size over duration: 14.12 MB over 3.3 s.
  assert.equal(observedBitRate(14_120_000, 3300), Math.round((14_120_000 * 8) / 3.3));
  assert.equal(observedBitRate(0, 3300), null);
  assert.equal(observedBitRate(14_120_000, 0), null);
  assert.equal(observedBitRate(14_120_000, 200), null);
  assert.equal(observedBitRate(NaN, 3300), null);

  const info = { width: 1920, height: 1080, derivedFps: 59.94, durationMs: 3300 };

  // A fresh install: nothing stored, so nothing is requested, and that first
  // default recording is what gets measured.
  assert.equal(DEFAULT_SETTINGS.lastRecording, null);
  assert.equal(highBitRate(DEFAULT_SETTINGS.lastRecording), null);
  const first = profileFrom(info, 14_120_000, null, null);
  assert.deepEqual(first, {
    width: 1920,
    height: 1080,
    fps: 59.94,
    defaultBitRate: observedBitRate(14_120_000, 3300),
  });
  assert.ok(highBitRate(first) > first.defaultBitRate);

  // A recording made at a Pro target never replaces the default it was compared
  // against, so the target cannot ratchet itself upward.
  const afterPro = profileFrom(info, 30_000_000, highBitRate(first), first);
  assert.equal(afterPro.defaultBitRate, first.defaultBitRate);
  // Nor does a size that could not be read.
  assert.equal(profileFrom(info, null, null, first).defaultBitRate, first.defaultBitRate);
  assert.equal(profileFrom(info, null, null, null).defaultBitRate, null);
  assert.equal(profileFrom({ ...info, derivedFps: 0 }, 14_120_000, null, null), null);

  // Stored and read back. A profile saved before this was measured reads as
  // unmeasured, so an existing install records at the default next time.
  assert.deepEqual(parseSettings({ lastRecording: first }).lastRecording, first);
  assert.deepEqual(parseSettings({ lastRecording: { width: 1920, height: 1080, fps: 59.94 } }).lastRecording, {
    width: 1920,
    height: 1080,
    fps: 59.94,
    defaultBitRate: null,
  });
  assert.equal(parseSettings({ lastRecording: { width: 1920 } }).lastRecording, null);
});

test('capture requests the target and claims Pro quality only together', () => {
  const capture = read('app/capture.tsx');
  // One value decides both: the target handed to the encoder, and the mark.
  assert.match(capture, /const bitRate = canRecordHighBitrate\(entitlements\) \? highBitRate\(lastRecording\) : null;/);
  assert.match(capture, /bitRate === null \? \{ fileType: 'mp4' \} : \{ fileType: 'mp4', targetBitRate: bitRate \}/);
  assert.match(capture, /\{bitRate !== null \? \(\s*<View style=\{styles\.qualityMark\}>/);
  assert.equal(capture.match(/PRO QUALITY/g).length, 1);
  // The finished file is measured, with what was requested for it.
  assert.match(capture, /profileFrom\(\s*info,\s*fileSize\(path\),\s*bitRate,\s*getSettings\(\)\.lastRecording\s*\)/);
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
