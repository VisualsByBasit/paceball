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

test('held sideways, the overlay turns to meet the phone and the recording does not', () => {
  const { uiRotation } = require('../src/capture/orientation.ts');
  assert.equal(uiRotation('up'), 0);
  assert.equal(uiRotation(undefined), 0);
  assert.equal(uiRotation('right'), -90);
  assert.equal(uiRotation('left'), 90);
  assert.equal(uiRotation('down'), 0, 'upside down is left alone');

  const capture = read(CAPTURE);
  // Physical orientation, from vision-camera itself: nothing new installed.
  assert.match(capture, /const rotation = uiRotation\(useOrientation\('device'\)\);/);
  // The guide's baseline, stumps and label turn to the landscape framing.
  assert.match(capture, /<RotateInPlace deg=\{rotation\} style=\{\[styles\.guideFrame, frame\]\}>/);
  assert.match(capture, /width: box\.height,\s*height: box\.width,/);
  // Labels and controls turn in place: lens chips, exposure, timer, sound,
  // the quality chip and the record button's countdown.
  assert.ok((capture.match(/<RotateInPlace deg=\{rotation\}/g) ?? []).length >= 10);
  assert.match(read('src/ui/RotateInPlace.tsx'), /transform: \[\{ rotate: `\$\{turn\.value\}deg` \}\]/);
  // The recording is untouched: no orientation reaches the camera, the
  // recorder, or what Mark is handed.
  const camera = capture.slice(capture.indexOf('<Camera'), capture.indexOf('/>', capture.indexOf('<Camera')));
  assert.doesNotMatch(camera, /rotation|orientation/i);
  const onFinished = capture.slice(capture.indexOf('const onFinished'), capture.indexOf('const onAudioFailure'));
  assert.doesNotMatch(onFinished, /rotation|orientation/i);
  assert.doesNotMatch(read('src/capture/useCapture.ts'), /useOrientation|uiRotation/);
});
