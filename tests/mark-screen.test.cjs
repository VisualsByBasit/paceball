const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { test } = require('node:test');

// Normalised, because a Windows checkout converts line endings to CRLF.
const read = (file) =>
  fs.readFileSync(path.join(__dirname, '..', file), 'utf8').replace(/\r\n/g, '\n');

/** The file without its comments, for asserting what the code does not do. */
const code = (file) =>
  read(file)
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '')
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, '');

const MARK = 'app/mark.tsx';

test('Mark hands Result every param it reads, a guessed bounce included', () => {
  const mark = read(MARK);
  const push = mark.slice(mark.indexOf('const onNext = useCallback'), mark.indexOf('], [', mark.indexOf('const onNext = useCallback')));
  assert.match(push, /pathname: '\/result'/);
  for (const key of [
    'videoPath,', 'framesDir: framesDirUri(videoPath)', 'fps: String(fps)', 'captureFps:', 'frameCount: String(total)',
    'durationMs:', 'width:', 'height:', 'exposureBias:', 'imageWidth: String(imageSize.w)',
    'imageHeight: String(imageSize.h)', 'calibrationMethod: method', 'calRealMetres: String(calRealMetres)',
    "markerSource: markers.source", 'paceCount: String(calibration.paceCount)', 'calA: JSON.stringify(points.calA)',
    'calB: JSON.stringify(points.calB)', 'release: JSON.stringify(points.release)',
    'bounce: JSON.stringify(points.bounce)', 'markConfidence,',
  ]) {
    assert.ok(push.includes(key), key);
  }
  // A guessed bounce takes the same route: only the label changes.
  assert.match(mark, /label=\{guessed \? 'Continue without speed' : 'Show reading'\}\s*onPress=\{onNext\}/);
});

test('a tap places the point and moves on; there is no confirm per step', () => {
  const mark = read(MARK);
  assert.match(mark, /<Pressable\s+onPress=\{place\}\s+disabled=\{!canPlace\}/);
  assert.doesNotMatch(code(MARK), /Confirm reference|Confirm release/);
  // The next step is still the first one without a point.
  assert.match(mark, /selected \?\? steps\.find\(\(s\) => points\[s\.key\] === null\)\?\.key \?\? null/);
});

test('no point lands until the frame it is recorded against is the one on screen', () => {
  const mark = read(MARK);
  assert.match(mark, /const frameShown = currentUri !== null && shownUri === currentUri;/);
  assert.match(mark, /const canPlace = fit !== null && frameShown && activeStep !== null;/);
  assert.match(mark, /onLoadEnd=\{\(\) => setShownUri\(currentUri\)\}/);
  assert.match(mark, /\{frameShown \? null : \(\s*<View style=\{styles\.plate\}>\s*<Text style=\{styles\.plateText\}>Loading frame…<\/Text>/);
});

test('the loupe shows only while a finger is down where a point can go', () => {
  const mark = read(MARK);
  assert.match(mark, /onTouchStart=\{\(e\) => \{\s*if \(!canPlace\) return;/);
  assert.match(mark, /onTouchEnd=\{\(\) => \{\s*loupeOn\.value = 0;/);
  assert.match(mark, /onTouchCancel=\{\(\) => \{\s*loupeOn\.value = 0;/);
  assert.match(mark, /<Loupe\s+uri=\{currentUri\}/);
});

test('each reference keeps its own hint, and the ball steps say which frame', () => {
  const mark = read(MARK);
  assert.match(mark, /hint: spec\.a\.hint,/);
  assert.match(mark, /hint: spec\.b\.hint,/);
  assert.match(mark, /activeStep\s*\?\s*activeStep\.hint/);
  assert.match(mark, /helper: 'Choose the first frame where the ball has left the hand\.'/);
  assert.match(mark, /helper: 'Choose the first frame where the ball touches the ground\.'/);
});

test('the frame control is previous, a 72 dp strip that stops at the decoded frames, and next', () => {
  const mark = read(MARK);
  assert.doesNotMatch(mark, /FrameScrubber/);
  assert.match(mark, /<DetentStrip\s+count=\{total\}\s+index=\{current\}\s+max=\{scrubMax\}\s+onChange=\{setCurrent\}/);
  assert.match(mark, /Frame \{current\} of \{Math\.max\(0, total - 1\)\} · \{fps\.toFixed\(2\)\} fps/);
  assert.match(mark, /frameCaption: \{\s*\.\.\.type\.caption,\s*\.\.\.type\.tabular,/);
  assert.match(mark, /stepButton: \{\s*width: size\.target,\s*height: size\.target,/);
});

test('a placed point taps once, and marks that stop making sense warn once', () => {
  const mark = read(MARK);
  const place = mark.slice(mark.indexOf('const place = useCallback'), mark.indexOf('const undo = useCallback'));
  assert.match(place, /Haptics\.impactAsync\(Haptics\.ImpactFeedbackStyle\.Light\)/);
  assert.match(mark, /if \(problem !== null && !hadProblem\.current\) \{\s*Haptics\.notificationAsync\(Haptics\.NotificationFeedbackType\.Warning\)/);
});

test('the bounce question keeps its three answers, as a 48 dp segmented control', () => {
  const mark = read(MARK);
  for (const key of ['seen', 'uncertain', 'guessed']) assert.match(mark, new RegExp(`key: '${key}',`));
  assert.match(mark, /COULD YOU SEE THE BALL IN THE BOUNCE FRAME\?/);
  assert.match(mark, /<View style=\{styles\.segments\} accessibilityRole="radiogroup">/);
});

test('the scale reference is a full-width choice with the chosen one in lime, every field kept', () => {
  const step = read('src/ui/CalibrationStep.tsx');
  assert.match(step, /optionSelected: \{ borderColor: colors\.accent \}/);
  assert.match(step, /option: \{\s*minHeight: size\.target,/);
  for (const field of ['HEEL-TO-TOE PACES', 'DISTANCE BETWEEN THE MARKERS', 'YOUR EU SHOE SIZE', 'OUTER SHOE LENGTH', 'HOW DID YOU MEASURE IT?']) {
    assert.ok(step.includes(field), field);
  }
  // Why marking cannot start yet is said under the button.
  assert.match(step, /disabledReason=\{\s*canConfirm \? null : \(problem \?\? 'Enter the distance between the markers\.'\)\s*\}/);
});

test('Mark and the scale step take every colour and size from tokens', () => {
  for (const file of [MARK, 'src/ui/CalibrationStep.tsx']) {
    const source = read(file);
    assert.doesNotMatch(source, /#[0-9a-f]{3,8}\b/i, `${file} hardcodes a colour`);
    const styles = source.slice(source.indexOf('StyleSheet.create'));
    assert.doesNotMatch(
      styles.replace(/\bflex(Grow|Shrink)?:\s*[012]\b/g, ''),
      /:\s*-?\d+(\.\d+)?\s*[,}\n]/,
      `${file} hardcodes a size`,
    );
  }
});
