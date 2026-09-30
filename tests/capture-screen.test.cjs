require('./register.cjs');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { test } = require('node:test');
const microphone = require('../src/capture/microphone.ts');
const { captureExposure } = require('../src/capture/exposure.ts');

// Normalised, because a Windows checkout converts line endings to CRLF.
const read = (file) =>
  fs.readFileSync(path.join(__dirname, '..', file), 'utf8').replace(/\r\n/g, '\n');

const CAPTURE = 'app/capture.tsx';

test('exposure starts from Settings, goes through the same clamp, and is never saved back', () => {
  const capture = read(CAPTURE);
  assert.match(capture, /const \[bias, setBias\] = useState<number>\(exposureBias\);/);
  assert.match(capture, /const exposure = captureExposure\(device, bias\);/);
  // Still sent to the camera, and still handed to Mark, exactly as before.
  assert.match(capture, /exposure=\{isFocused && sessionReady \? exposure : undefined\}/);
  assert.match(capture, /exposureBias: String\(exposure \?\? 0\)/);
  assert.doesNotMatch(capture, /updateSettings\(\{ exposureBias/);
  // The clamp itself is unchanged: a camera's own limits win.
  const device = { supportsExposureBias: true, minExposureBias: -2, maxExposureBias: 2 };
  assert.equal(captureExposure(device, -4), -2);
  assert.equal(captureExposure(device, -1), -1);
  assert.equal(captureExposure({ ...device, supportsExposureBias: false }, -1), undefined);
});

test('the exposure control is locked while recording and says so when the camera has none', () => {
  const capture = read(CAPTURE);
  assert.match(capture, /locked=\{isRecording \|\| isProcessing\}/);
  assert.match(capture, /const canDarken = !locked && steps\.darker;/);
  assert.match(capture, /const canBrighten = !locked && steps\.brighter;/);
  assert.match(capture, /Exposure uses camera auto on this phone\./);
  assert.match(capture, /Brighter video can mean more blur\. Use more light when you can\./);
  assert.match(capture, /exposureStep: \{\s*width: size\.target,\s*height: size\.target,/);
});

test('the preview shows the whole frame in a 3:4 box, with a guide that never claims to detect', () => {
  const capture = read(CAPTURE);
  assert.match(capture, /resizeMode="contain"/);
  assert.match(capture, /const PREVIEW_ASPECT_W = 3;\s*const PREVIEW_ASPECT_H = 4;/);
  // The plate names what belongs in frame for the reference Mark opens on.
  for (const [method, line] of [
    ['stumps', 'Fit both stumps, release and bounce'],
    ['markers', 'Fit both markers, release and bounce'],
    ['ball', 'Fit the ball in hand, release and bounce'],
    ['height', 'Fit the whole bowler, release and bounce'],
  ]) {
    assert.ok(capture.includes(`${method}: '${line}'`), method);
  }
  assert.match(capture, /<GuideOverlay\s+method=\{calibrationMethod\}\s+dimmed=\{isRecording\}\s+rotation=\{rotation\}\s+box=\{box\}\s+\/>/);
});

test('the quality chip says Standard unless the higher bitrate is really requested', () => {
  const capture = read(CAPTURE);
  assert.match(capture, /right=\{bitRate !== null \? \(\s*<View style=\{styles\.qualityMark\}>[\s\S]*?PRO QUALITY[\s\S]*?\) : \([\s\S]*?STANDARD/);
});

test('the record button follows the recorder, and taps once after it starts or stops', () => {
  const capture = read(CAPTURE);
  assert.match(capture, /<RecordButtonFace\s+recording=\{isRecording\}/);
  const face = read('src/ui/RecordButtonFace.tsx');
  assert.match(face, /withTiming\(to, \{ duration: motion\.record, easing: Easing\.linear \}\)/);
  assert.match(face, /width: size\.record,\s*height: size\.record,/);
  assert.match(face, /\[size\.recordInner, size\.recordInner \* SQUARE_SHARE\]/);
  assert.match(capture, /if \(wasRecording\.current === capture\.isRecording\) return;\s*wasRecording\.current = capture\.isRecording;\s*Haptics\.impactAsync\(Haptics\.ImpactFeedbackStyle\.Light\)/);
});

test('the microphone sheet asks once, and closing it without an answer asks again next time', () => {
  assert.equal(microphone.MICROPHONE_OFFER_TITLE, 'Record sound too?');
  assert.equal(microphone.MICROPHONE_OFFER_ALLOW, 'Allow microphone');
  assert.equal(microphone.MICROPHONE_OFFER_SKIP, 'Continue without sound');
  const capture = read(CAPTURE);
  assert.match(capture, /onClose=\{\(\) => setOfferingMicrophone\(false\)\}/);
  assert.match(capture, /onPress=\{\(\) => answerMicrophone\(true\)\}/);
  assert.match(capture, /onPress=\{\(\) => answerMicrophone\(false\)\}/);
});

test('the allowance is one line and a reset day, and Pro sees none of it', () => {
  const line = read('src/ui/AllowanceLine.tsx');
  assert.match(line, /if \(line === null\) return null;/);
  assert.match(line, /\{usedUp \? <Text style=\{styles\.mark\}>!<\/Text> : null\}/);
  assert.doesNotMatch(line, /ProgressBar|<Svg|<Circle|strokeDasharray/);
  assert.match(read(CAPTURE), /<AllowanceLine line=\{allowanceNote\} allowance=\{allowance\} weekday=\{weekdayOf\} \/>/);
});

test('Capture and its pieces take every colour and size from tokens', () => {
  for (const file of [CAPTURE, 'src/ui/AllowanceLine.tsx', 'src/ui/RecordButtonFace.tsx']) {
    const source = read(file);
    assert.doesNotMatch(source, /#[0-9a-f]{3,8}\b/i, `${file} hardcodes a colour`);
    const styles = source.slice(source.indexOf('StyleSheet.create'));
    assert.doesNotMatch(
      styles.replace(/\bflex(Grow|Shrink)?:\s*[01]\b/g, ''),
      /:\s*-?\d+(\.\d+)?\s*[,}\n]/,
      `${file} hardcodes a size`,
    );
  }
  assert.match(read(CAPTURE), /const LENS_FADE_OUT_MS = motion\.lens\.out;\s*const LENS_FADE_IN_MS = motion\.lens\.in;/);
});

test('exposure steps across the camera\'s whole range, above 0 as well as below', () => {
  const { exposureSteps, stepExposure } = require('../src/capture/exposure.ts');
  const wide = { minExposureBias: -12, maxExposureBias: 12 };
  // The bug: the control stepped through the Settings defaults, -4 to 0, so it
  // could never go brighter than 0 on any camera.
  assert.equal(stepExposure(0, 1, wide), 1);
  assert.equal(stepExposure(1, 1, wide), 2);
  assert.equal(stepExposure(-4, -1, wide), -5);
  assert.deepEqual(exposureSteps(0, wide), { darker: true, brighter: true });
  // Held to the camera's own ends, and off where a step would change nothing.
  assert.equal(stepExposure(12, 1, wide), 12);
  assert.deepEqual(exposureSteps(12, wide), { darker: true, brighter: false });
  assert.deepEqual(exposureSteps(-12, wide), { darker: false, brighter: true });
  // A camera that really stops at 0 stops there, honestly.
  assert.deepEqual(exposureSteps(0, { minExposureBias: -2, maxExposureBias: 0 }), { darker: true, brighter: false });
  // And Capture no longer steps through the Settings list at all.
  const capture = read(CAPTURE);
  assert.doesNotMatch(capture, /EXPOSURE_BIAS_OPTIONS/);
  assert.match(capture, /onChange\(stepExposure\(exposure, 1, device\)\)/);
  assert.match(capture, /onChange\(stepExposure\(exposure, -1, device\)\)/);
});

test('held sideways either way, rotated content lands with its bottom on the ground', () => {
  const { uiRotation } = require('../src/capture/orientation.ts');
  // Where the ground is on the portrait-locked screen, as seen on the phone:
  // vision-camera reports 'right' with the phone turned anticlockwise, so the
  // ground runs along the screen's left edge, and 'left' the mirror of that.
  const groundSide = { right: 'left', left: 'right' };
  // Where the bottom of rotated content ends up. RN turns clockwise for a
  // positive angle, with y pointing down the screen.
  const bottomAfter = (deg) => {
    const t = (deg * Math.PI) / 180;
    const x = Math.round(-Math.sin(t));
    const y = Math.round(Math.cos(t));
    return x === -1 ? 'left' : x === 1 ? 'right' : y === 1 ? 'bottom' : 'top';
  };
  for (const orientation of ['right', 'left']) {
    // The guide's baseline is drawn along the bottom of its frame, and text
    // reads upright when its bottom faces the ground: one check pins both.
    assert.equal(bottomAfter(uiRotation(orientation)), groundSide[orientation], orientation);
  }
  assert.equal(bottomAfter(uiRotation('up')), 'bottom');
  // The baseline really is the bottom of the turned frame.
  assert.match(read(CAPTURE), /baselineRow: \{[^}]*bottom: space\.xxl,/);
});

test('the framing guide is drawn in lime, and its plate stays an opaque bg plate', () => {
  const capture = read(CAPTURE);
  const style = (name) => capture.slice(capture.indexOf(`  ${name}: {`), capture.indexOf('},', capture.indexOf(`  ${name}: {`)));
  for (const name of ['bracket', 'baseline', 'stumpIcon', 'markerIcon']) {
    assert.match(style(name), /colors\.accent/, name);
    assert.doesNotMatch(style(name), /colors\.text/, name);
  }
  assert.match(style('plate'), /backgroundColor: colors\.bg/);
  assert.match(capture, /plateText: \{ \.\.\.type\.caption, color: colors\.text/);
});

test('held sideways, the overlay turns to meet the phone and the recording does not', () => {
  const { uiRotation } = require('../src/capture/orientation.ts');
  assert.equal(uiRotation('up'), 0);
  assert.equal(uiRotation(undefined), 0);
  assert.equal(uiRotation('right'), 90);
  assert.equal(uiRotation('left'), -90);
  assert.equal(uiRotation('down'), 0, 'upside down is left alone');

  const capture = read(CAPTURE);
  // Physical orientation, from vision-camera itself: nothing new installed.
  assert.match(capture, /const rotation = uiRotation\(useOrientation\('device'\)\);/);
  // The guide inside the viewfinder, and only it, turns to the landscape framing.
  assert.match(capture, /<RotateInPlace deg=\{rotation\} style=\{\[styles\.guideFrame, frame\]\}>/);
  assert.match(capture, /width: box\.height,\s*height: box\.width,/);
  assert.match(read('src/ui/RotateInPlace.tsx'), /transform: \[\{ rotate: `\$\{turn\.value\}deg` \}\]/);
  // The recording is untouched: no orientation reaches the camera, the
  // recorder, or what Mark is handed.
  const camera = capture.slice(capture.indexOf('<Camera'), capture.indexOf('/>', capture.indexOf('<Camera')));
  assert.doesNotMatch(camera, /rotation|orientation/i);
  const onFinished = capture.slice(capture.indexOf('const onFinished'), capture.indexOf('const onAudioFailure'));
  assert.doesNotMatch(onFinished, /rotation|orientation/i);
  assert.doesNotMatch(read('src/capture/useCapture.ts'), /useOrientation|uiRotation/);
});

test('turning the phone sideways never turns, moves or reflows a control', () => {
  const capture = read(CAPTURE);
  // The rotation reaches exactly one place: the guide inside the viewfinder.
  assert.equal((capture.match(/<RotateInPlace\b/g) ?? []).length, 1);
  assert.equal((capture.match(/rotation=\{rotation\}/g) ?? []).length, 1);
  assert.match(capture, /<GuideOverlay[^>]*rotation=\{rotation\}/);
  const overlay = capture.slice(capture.indexOf('function GuideOverlay'), capture.indexOf('function ExposureControl'));
  assert.match(overlay, /<RotateInPlace deg=\{rotation\}/);

  // Everything under the viewfinder: lens, exposure and its value, Delay,
  // Sound, Length, the record button, the time readout and the hints. None of
  // it reads the orientation, and no style it uses carries a transform, so its
  // layout is the same whichever way the phone is held.
  const controls = capture.slice(capture.indexOf('<View style={[styles.controls'), capture.indexOf('<BottomSheet'));
  assert.ok(controls.includes('<ExposureControl') && controls.includes('styles.chipRow') && controls.includes('<RecordButtonFace'));
  assert.doesNotMatch(controls, /rotation|RotateInPlace|transform|useOrientation/);
  for (const name of ['ExposureControl', 'LengthStep']) {
    const body = capture.slice(capture.indexOf(`function ${name}`), capture.indexOf('\n}\n', capture.indexOf(`function ${name}`)));
    assert.doesNotMatch(body, /rotation|RotateInPlace|transform/, name);
  }
  const styles = capture.slice(capture.indexOf('StyleSheet.create'));
  assert.doesNotMatch(styles, /transform|rotate/);
  assert.doesNotMatch(read('src/ui/RecordButtonFace.tsx'), /rotate/);
  // The countdown over the preview stays upright too.
  const count = capture.slice(capture.indexOf('{countdown !== null ? ('), capture.indexOf('{switchingLens ? ('));
  assert.doesNotMatch(count, /rotation|RotateInPlace/);
});

test('Length steps from until stopped to 30 s, and a set length stops by itself', () => {
  const rl = require('../src/capture/recordLength.ts');
  const { DEFAULT_SETTINGS, parseSettings } = require('../src/settings/settings.ts');
  assert.deepEqual([...rl.RECORD_LENGTH_OPTIONS], [0, 3, 5, 10, 15, 20, 30]);
  assert.equal(DEFAULT_SETTINGS.recordLength, 0, 'until stopped, like a camera app');
  assert.equal(rl.recordLengthLabel(0), 'Until stopped');
  assert.equal(rl.recordLengthLabel(15), '15 s');
  // Minus from 3 s goes back to until stopped; the ends hold.
  assert.equal(rl.stepRecordLength(3, -1), 0);
  assert.equal(rl.stepRecordLength(0, 1), 3);
  assert.equal(rl.stepRecordLength(0, -1), 0);
  assert.equal(rl.stepRecordLength(30, 1), 30);
  assert.equal(rl.canStepRecordLength(0, -1), false);
  assert.equal(rl.canStepRecordLength(30, 1), false);
  // Remembered, and a stored value that is no longer offered falls back.
  assert.equal(parseSettings({ recordLength: 20 }).recordLength, 20);
  assert.equal(parseSettings({ recordLength: 7 }).recordLength, 0);
  // Never below the 3-second minimum, so stopping at the length is always allowed.
  const { MIN_RECORDING_MS } = require('../src/capture/recording.ts');
  for (const s of rl.RECORD_LENGTH_OPTIONS.filter(Boolean)) assert.ok(s * 1000 >= MIN_RECORDING_MS, s);
  assert.equal(rl.reachedLength(4999, 5), false);
  assert.equal(rl.reachedLength(5000, 5), true);
  assert.equal(rl.reachedLength(600_000, 0), false, 'until stopped never stops itself');
  // The readout counts down with a length, and up without one.
  assert.equal(rl.readoutMs(1200, 5, true), 3800);
  assert.equal(rl.readoutMs(9000, 5, true), 0);
  assert.equal(rl.readoutMs(0, 5, false), 5000);
  assert.equal(rl.readoutMs(1200, 0, true), 1200);

  const capture = read(CAPTURE);
  const auto = capture.slice(capture.indexOf('const autoStopped'), capture.indexOf('}, [capture, recordLength]);'));
  assert.match(auto, /reachedLength\(capture\.elapsedMs, recordLength\)/);
  assert.match(auto, /Haptics\.notificationAsync/);
  assert.match(auto, /void capture\.stop\(\);/);
  // Tapping stop early still goes through the same locked stop.
  assert.match(capture, /isRecording\s*\? capture\.stop/);
  assert.match(capture, /formatElapsed\(readoutMs\(elapsedMs, recordLength, isRecording\)\)/);
});

test('Delay, Sound and Length sit in one row of equal-height chips that never clip', () => {
  const capture = read(CAPTURE);
  const row = capture.slice(capture.indexOf('<View style={styles.chipRow}>'), capture.indexOf('{sound.denied ? ('));
  const order = ['>DELAY<', '>SOUND<', '>LENGTH<'].map((label) => row.indexOf(label));
  assert.ok(order.every((i) => i > 0) && order[0] < order[1] && order[1] < order[2], String(order));
  // Stretched to one height; no chip limits its lines, so words wrap at a space rather than clip.
  assert.match(capture, /chipRow: \{ flexDirection: 'row', alignItems: 'stretch'/);
  assert.doesNotMatch(row, /numberOfLines|adjustsFontSizeToFit|height: /);
  // Each half of the stepper is a target of at least 48 dp.
  assert.match(capture, /lengthChip: \{ flex: 1, minWidth: size\.target \* 2,/);
  // Sound says which it is, and a refusal is one muted line with the way to fix it.
  assert.match(row, /accessibilityLabel=\{sound\.on \? 'Sound on' : 'Sound off'\}/);
  const microphone = require('../src/capture/microphone.ts');
  assert.equal(microphone.MICROPHONE_DENIED_LINE, 'Microphone permission is off. Turn it on in Settings to record sound.');
  assert.match(capture, /\{sound\.denied \? \(\s*<Text style=\{styles\.micLine\}>/);
  assert.match(capture, /micLine: \{ \.\.\.type\.caption, color: colors\.muted \}/);
});
