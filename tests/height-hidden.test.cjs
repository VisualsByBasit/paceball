require('./register.cjs');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { test } = require('node:test');
const {
  CALIBRATION_ORDER,
  CALIBRATION_SPECS,
  OFFERED_CALIBRATIONS,
  isCalibrationMethod,
  offeredCalibration,
} = require('../src/physics/calibration.ts');
const { referenceUncertainty } = require('../src/physics/computeSpeed.ts');
const { measurementState } = require('../src/physics/measurementState.ts');
const { readingView } = require('../src/ui/reading.ts');
const { createMockSession } = require('../src/data/mockData.ts');

// Normalised, because a Windows checkout converts line endings to CRLF.
const read = (file) =>
  fs.readFileSync(path.join(__dirname, '..', file), 'utf8').replace(/\r\n/g, '\n');

test('the pickers offer stumps, markers and ball, and not height', () => {
  assert.deepEqual(OFFERED_CALIBRATIONS, ['stumps', 'markers', 'ball']);
  // Mark's reference picker and Settings' default both list only those.
  assert.match(read('src/ui/CalibrationStep.tsx'), /\{OFFERED_CALIBRATIONS\.map\(\(key\) => \{/);
  assert.doesNotMatch(read('src/ui/CalibrationStep.tsx'), /CALIBRATION_ORDER/);
  const settings = read('app/settings.tsx');
  assert.match(settings, /\{OFFERED_CALIBRATIONS\.map\(\(method\) => \{/);
  assert.doesNotMatch(settings, /CALIBRATION_ORDER/);
  // A default saved as height opens Mark, Capture's guide and Settings on stumps.
  assert.equal(offeredCalibration('height'), 'stumps');
  assert.equal(offeredCalibration('ball'), 'ball');
  assert.match(read('app/mark.tsx'), /offeredCalibration\(getSettings\(\)\.calibrationMethod\)/);
  assert.match(read('app/capture.tsx'), /const calibrationMethod = offeredCalibration\(savedMethod\);/);
  assert.match(settings, /const on = offeredCalibration\(settings\.calibrationMethod\) === method;/);
});

test('no screen asks for or shows a height', () => {
  const settings = read('app/settings.tsx');
  assert.doesNotMatch(settings, /player\.heightCm/);
  assert.doesNotMatch(read('app/setup/player.tsx'), /<TextInput[^>]*[Hh]eight/);
  assert.doesNotMatch(read('app/setup/player.tsx'), /heightCm/);
});

test('a delivery saved against a height still opens and reads as it did', () => {
  // The method, its spec and its uncertainty are all still there.
  assert.ok(CALIBRATION_ORDER.includes('height'));
  assert.equal(isCalibrationMethod('height'), true);
  assert.equal(CALIBRATION_SPECS.height.short, 'Height');
  assert.equal(referenceUncertainty('height'), 0.02);

  // A bowler 1.80 m tall, 400 px head to foot, and a ball that travelled 11 m.
  const session = createMockSession('height-delivery', 120);
  const ppm = 400 / 1.8;
  session.calibrationMethod = 'height';
  session.calRealMetres = 1.8;
  session.calA = { x: 900, y: 300, frame: session.release.frame };
  session.calB = { x: 900, y: 700, frame: session.release.frame };
  session.pixelsPerMetre = ppm;
  session.bounce = { ...session.bounce, x: session.release.x + 11 * ppm, y: session.release.y };
  session.uncertaintyModelVersion = 2;
  const state = measurementState(session);
  assert.equal(state.kind, 'measured');
  assert.ok(state.errorKmh > 0);
  const view = readingView(state, 'kmh');
  assert.equal(view.kind, 'measured');
  assert.equal(view.speed, session.speedKmh.toFixed(1));
});
