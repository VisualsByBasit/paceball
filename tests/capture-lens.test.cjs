require('./register.cjs');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { test } = require('node:test');
const {
  LENS_LABEL,
  deviceForLens,
  hasUltraWide,
  ultraWideDevice,
} = require('../src/capture/lenses.ts');

// Normalised, because a Windows checkout converts line endings to CRLF.
const read = (file) =>
  fs.readFileSync(path.join(__dirname, '..', file), 'utf8').replace(/\r\n/g, '\n');

const wideBack = { id: 'back-wide', position: 'back', type: 'wide-angle' };
const ultraBack = { id: 'back-ultra', position: 'back', type: 'ultra-wide-angle' };
const ultraFront = { id: 'front-ultra', position: 'front', type: 'ultra-wide-angle' };
const virtualBack = { id: 'back-triple', position: 'back', type: 'triple' };

test('the ultra-wide option is absent unless such a camera really exists', () => {
  assert.equal(hasUltraWide([]), false);
  assert.equal(hasUltraWide([wideBack]), false);
  // A virtual device that can zoom out is not an ultra-wide camera to record on.
  assert.equal(hasUltraWide([wideBack, virtualBack]), false);
  // Nor is a front-facing one, for a delivery filmed on the back camera.
  assert.equal(hasUltraWide([wideBack, ultraFront]), false);
  assert.equal(hasUltraWide([wideBack, ultraBack]), true);
  assert.equal(ultraWideDevice([wideBack, ultraBack]), ultraBack);

  // And the screen only renders the picker when that is true.
  const capture = read('app/capture.tsx');
  assert.match(capture, /const ultraWideAvailable = hasUltraWide\(devices\);/);
  assert.match(capture, /\{!isRecording && !isProcessing && ultraWideAvailable \? \(/);
  assert.deepEqual(Object.keys(LENS_LABEL).sort(), ['ultra-wide', 'wide']);
});

test('asking for a lens the phone lacks falls back to the default camera', () => {
  assert.equal(deviceForLens('wide', [wideBack, ultraBack], wideBack), wideBack);
  assert.equal(deviceForLens('ultra-wide', [wideBack, ultraBack], wideBack), ultraBack);
  // No ultra-wide present: the camera still works rather than going undefined.
  assert.equal(deviceForLens('ultra-wide', [wideBack], wideBack), wideBack);
  assert.equal(deviceForLens('ultra-wide', [], undefined), undefined);
});

test('the pixel scale comes from the recorded frames, not from the camera', () => {
  // A wider lens fits more pitch into the same frame, so pixels per metre change
  // with it. That is safe only because every reading is calibrated from the
  // frames actually recorded, and nothing stores a scale tied to a camera.
  const capture = read('app/capture.tsx');
  assert.match(capture, /width: String\(info\.width\)/);
  assert.match(capture, /height: String\(info\.height\)/);
  assert.doesNotMatch(capture, /focalLength|fieldOfView|sensorSize/);

  // The session records the frame dimensions and the marks, and no lens.
  const session = read('src/types/index.ts');
  assert.doesNotMatch(session, /focalLength|lens|fieldOfView/i);

  // pixelsPerMetre is derived from the two calibration marks in those frames.
  const physics = read('src/physics/computeSpeed.ts');
  assert.match(physics, /const pixelsPerMetre = calPixels \/ calRealMetres;/);
  assert.match(physics, /const travelMetres = travelPixels \/ pixelsPerMetre;/);
  // And the saved scale is the marked one, rescaled by the frames' own factor.
  const result = read('app/result.tsx');
  assert.match(result, /pixelsPerMetre: result\.pixelsPerMetre \* saveGeometry\.factor/);
  assert.match(result, /restoredGeometry\(imageWidth, imageHeight, videoWidth, videoHeight\)/);
});

test('the lens picker copy uses no em dashes', () => {
  assert.doesNotMatch(read('src/capture/lenses.ts'), /—/);
  const capture = read('app/capture.tsx');
  const picker = capture.slice(capture.indexOf('ultraWideAvailable ? ('), capture.indexOf('showTips ? ('));
  assert.ok(picker.length > 0);
  assert.doesNotMatch(picker, /—/);
});
