require('./register.cjs');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { test } = require('node:test');
const {
  implausible,
  readingCautions,
  CHECK_READING,
  OFF_SCALE_CAUTION,
  WIDE_RANGE_CAUTION,
} = require('../src/ui/gauge.ts');
const {
  countsAsReading,
  countingDeliveries,
  latestMeasured,
  measuredCount,
  needsChecking,
  personalBest,
} = require('../src/ui/deliveries.ts');
const { compareSelectability } = require('../src/ui/compareSelection.ts');
const { readingView } = require('../src/ui/reading.ts');

// Normalised, because a Windows checkout converts line endings to CRLF.
const read = (file) =>
  fs.readFileSync(path.join(__dirname, '..', file), 'utf8').replace(/\r\n/g, '\n');

const measured = (speedKmh, errorKmh) => ({ kind: 'measured', speedKmh, errorKmh });
const delivery = (id, createdAt, state) => ({ id, createdAt, state });

test('implausible: off the dial (speed or its upper bound) or a range wider than 25 km/h', () => {
  assert.equal(implausible(measured(124.8, 3.1), 'kmh'), false);
  assert.equal(implausible(measured(181, 2), 'kmh'), true, 'the speed itself past 180');
  assert.equal(implausible(measured(176, 5), 'kmh'), true, 'the upper bound past 180');
  assert.equal(implausible(measured(179, 1), 'kmh'), false, 'the upper bound on 180 is on the dial');
  assert.equal(implausible(measured(120, 25.1), 'kmh'), true, 'wider than plus or minus 25');
  assert.equal(implausible(measured(120, 25), 'kmh'), false, 'exactly 25 is not wider');
  // 110 mph is the mph dial's end: 178 km/h is 110.6 mph displayed.
  assert.equal(implausible(measured(178, 0.5), 'mph'), true);
  assert.equal(implausible(measured(178, 0.5), 'kmh'), false);
  assert.equal(implausible(measured(20000, 3), 'kmh'), true);
  // The same two rules as the cautions, because it is the cautions.
  assert.deepEqual(readingCautions(measured(20000, 30), 'kmh'), [OFF_SCALE_CAUTION, WIDE_RANGE_CAUTION]);
  assert.equal(CHECK_READING, 'Check this reading');
});

test('a 20000 km/h reading never becomes the personal best; the next plausible one does', () => {
  const list = [
    delivery('wild', 3, measured(20000, 3)),
    delivery('wide', 2, measured(150, 40)),
    delivery('real', 1, measured(132.4, 3.2)),
    delivery('slow', 0, measured(118.0, 2.9)),
    delivery('guess', 4, { kind: 'not-seen' }),
  ];
  assert.equal(personalBest(list, 'kmh').id, 'real');
  assert.equal(personalBest(list, 'mph').id, 'real');
  // With nothing plausible there is no best at all, never the wild one.
  assert.equal(personalBest([list[0], list[1]], 'kmh'), null);
  // And the newest reading that counts is the latest, the count leaves them out.
  assert.equal(latestMeasured(list, 'kmh').id, 'real');
  assert.equal(measuredCount(list, 'kmh'), 2);
  assert.deepEqual(countingDeliveries(list, 'kmh').map((d) => d.id), ['real', 'slow']);
  assert.equal(countsAsReading({ kind: 'unusable' }, 'kmh'), false);
  assert.equal(needsChecking(list[0].state, 'kmh'), true);
  assert.equal(needsChecking(list[2].state, 'kmh'), false);
  assert.equal(needsChecking({ kind: 'not-seen' }, 'kmh'), false);
  // The reading itself is untouched: shown exactly as computed.
  assert.equal(readingView(list[0].state, 'kmh').speed, '20000.0');
  assert.equal(readingView(list[0].state, 'kmh').range, '± 3 km/h');
});

test('an implausible reading is never offered in Compare', () => {
  const blocked = compareSelectability(measured(20000, 3), 'kmh');
  assert.equal(blocked.selectable, false);
  assert.equal(blocked.reason, "Can't compare: check this reading");
  assert.equal(compareSelectability(measured(120, 30), 'kmh').selectable, false);
  assert.equal(compareSelectability(measured(120, 3), 'kmh').selectable, true);
  // History counts only comparable readings toward showing Compare at all.
  const history = read('app/history.tsx');
  assert.match(history, /\[\.\.\.states\.values\(\)\]\.filter\(\(s\) => countsAsReading\(s, unit\)\)\.length/);
});

test('one rule, used everywhere: best, hero, trend, Stats, Compare and the tags', () => {
  // Nothing else restates the thresholds.
  const files = [
    'app/index.tsx', 'app/history.tsx', 'app/stats.tsx', 'app/analysis.tsx', 'app/compare.tsx',
    'app/result.tsx', 'src/ui/deliveries.ts', 'src/ui/compareSelection.ts',
  ];
  for (const file of files) {
    assert.doesNotMatch(read(file), /WIDE_RANGE_KMH|GAUGE_MAX|\b180\b|\b110\b/, file);
  }
  assert.match(read('src/ui/deliveries.ts'), /return state\.kind === 'measured' && !implausible\(state, unit\);/);
  // Home's hero is the best by that rule; its cards say when to check.
  const home = read('app/index.tsx');
  assert.match(home, /personalBest\(listed, unit\)/);
  assert.match(home, /check=\{needsChecking\(d\.state, unit\)\}/);
  // History: the trend and its best leave them out, the rows tag them.
  const history = read('app/history.tsx');
  assert.match(history, /if \(!reading \|\| !countsAsReading\(reading, unit\)\) continue;/);
  assert.match(history, /const check = needsChecking\(reading, unit\);/);
  assert.match(history, /check=\{check\}/);
  // Stats: every figure from the deliveries that count.
  const stats = read('app/stats.tsx');
  assert.match(stats, /personalBest\(deliveries, unit\)/);
  // Analysis shows it as computed, with the tag.
  const analysis = read('app/analysis.tsx');
  assert.match(analysis, /\{needsChecking\(state, unit\) \? \(\s*<CheckTag center \/>/);
  // The tag is words and an icon, never colour alone.
  const tag = read('src/ui/CheckTag.tsx');
  assert.match(tag, /\{CHECK_READING\}/);
  assert.match(tag, /accessibilityLabel=\{`Caution\. \$\{CHECK_READING\}\.`\}/);
  assert.match(read('src/ui/DeliveryRow.tsx'), /\{check && reading\.kind === 'measured' \? <CheckTag \/> : null\}/);
  assert.match(read('src/ui/DeliveryCard.tsx'), /\{check \? <CheckTag \/> : null\}/);
});
