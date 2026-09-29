require('./register.cjs');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { test } = require('node:test');
const {
  bandDeg,
  GAUGE_START_DEG,
  GAUGE_SWEEP_DEG,
  gaugeMax,
  gaugeTicks,
  needleDeg,
  offScale,
  readingCautions,
  OFF_SCALE_CAUTION,
  WIDE_RANGE_CAUTION,
} = require('../src/ui/gauge.ts');
const { readingView } = require('../src/ui/reading.ts');

// Normalised, because a Windows checkout converts line endings to CRLF.
const read = (file) =>
  fs.readFileSync(path.join(__dirname, '..', file), 'utf8').replace(/\r\n/g, '\n');

test('the dial is fixed at 0 to 180 km/h and 0 to 110 mph, never stretched', () => {
  assert.equal(gaugeMax('kmh'), 180);
  assert.equal(gaugeMax('mph'), 110);
  const ticks = gaugeTicks('kmh');
  assert.equal(ticks[0].value, 0);
  assert.equal(ticks[ticks.length - 1].value, 180);
  assert.deepEqual(ticks.filter((t) => t.major).map((t) => t.value), [0, 20, 40, 60, 80, 100, 120, 140, 160, 180]);
  assert.equal(gaugeTicks('mph').filter((t) => t.major).length, 12);
  // Past the end, the needle rests on the end stop and the dial says so.
  assert.equal(needleDeg(200, 200, 180), GAUGE_START_DEG + GAUGE_SWEEP_DEG);
  assert.equal(offScale(176, 12, 'kmh'), true);
  assert.equal(offScale(150, 5, 'kmh'), false);
  const gauge = read('src/ui/SpeedGauge.tsx');
  assert.match(gauge, /const max = gaugeMax\(unit\);/);
  assert.match(gauge, /beyond \? OFF_SCALE_LABEL/);
});

test('cautions for a reading off the scale or with a very wide range, display only', () => {
  const at = (speedKmh, errorKmh) =>
    readingCautions({ speedKmh, errorKmh }, { value: speedKmh, error: errorKmh }, 'kmh');
  assert.deepEqual(at(124.8, 3.1), []);
  assert.deepEqual(at(176, 12), [OFF_SCALE_CAUTION]);
  assert.deepEqual(at(120, 26), [WIDE_RANGE_CAUTION]);
  assert.equal(OFF_SCALE_CAUTION, 'This reading is faster than a bowled ball can be. Check the reference and your marks.');
  assert.equal(WIDE_RANGE_CAUTION, 'The range is very wide. Re-marking or a clearer clip will narrow it.');
  const result = read('app/result.tsx');
  assert.match(result, /readingCautions\(state, \{ value: view\.value, error: view\.error \}, unit\)/);
  assert.match(result, /<Notice key=\{line\} tone="caution">\{line\}<\/Notice>/);
});

test('the needle sweeps to the reading and never past it', () => {
  const value = 124.8;
  const max = gaugeMax('kmh');
  const at = GAUGE_START_DEG + GAUGE_SWEEP_DEG * (value / max);
  assert.equal(needleDeg(0, value, max), GAUGE_START_DEG);
  assert.ok(Math.abs(needleDeg(value, value, max) - at) < 1e-9);
  for (let shown = -10; shown <= value * 1.5; shown += 3.7) {
    assert.ok(needleDeg(shown, value, max) <= at + 1e-9, `${shown} passes the reading`);
  }
  // Same curve and duration as the number, so they land together.
  const gauge = read('src/ui/SpeedGauge.tsx');
  assert.match(gauge, /withTiming\(value, \{ duration: motion\.countUp, easing: SETTLE \}/);
  assert.match(gauge, /needleDeg\(shown\.value, value, max\)/);
  assert.doesNotMatch(gauge, /withSpring/);
});

test('the band is the measured range, lower to upper bound, never below zero', () => {
  const max = 180;
  const band = bandDeg(124.8, 3.1, max);
  assert.ok(Math.abs(band.from - (GAUGE_START_DEG + GAUGE_SWEEP_DEG * (121.7 / max))) < 1e-9);
  assert.ok(Math.abs(band.sweep - GAUGE_SWEEP_DEG * (6.2 / max)) < 1e-9);
  assert.equal(bandDeg(2, 5, max).from, GAUGE_START_DEG);
  // The gauge takes the range from the reading itself, in the display unit.
  assert.equal(readingView({ kind: 'measured', speedKmh: 124.8, errorKmh: 3.1 }, 'kmh').error, 3.1);
  assert.equal(readingView({ kind: 'measured', speedKmh: 124.8, errorKmh: 3.1 }, 'mph').error, 2);
});

test('reduced motion shows the gauge landed, and a delivery without a speed has none', () => {
  const gauge = read('src/ui/SpeedGauge.tsx');
  assert.match(gauge, /const shown = useSharedValue\(reduced \? value : 0\);/);
  assert.match(gauge, /if \(reduced\) \{\s*shown\.value = value;\s*landed\.value = 1;\s*return;/);
  assert.match(gauge, /reading: MeasuredReading;/);
  const result = read('app/result.tsx');
  const measured = result.slice(result.indexOf("{view.kind === 'measured' ? ("), result.indexOf('<NoSpeed'));
  assert.match(measured, /<SpeedGauge reading=\{view\} unit=\{unit\}/);
  const noSpeed = result.slice(result.indexOf('function NoSpeed('), result.indexOf('function Evidence('));
  assert.doesNotMatch(noSpeed, /SpeedGauge/);
  assert.equal((result.match(/<SpeedGauge\b/g) ?? []).length, 1);
});

test('the gauge takes every colour and size from tokens', () => {
  const source = read('src/ui/SpeedGauge.tsx');
  assert.doesNotMatch(source, /#[0-9a-f]{3,8}\b/i);
  const styles = source.slice(source.indexOf('StyleSheet.create'));
  assert.doesNotMatch(styles.replace(/\bflex(Grow|Shrink)?:\s*[01]\b/g, ''), /:\s*-?\d+(\.\d+)?\s*[,}\n]/);
});
