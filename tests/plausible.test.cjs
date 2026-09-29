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
const { heroDelivery } = require('../src/ui/deliveries.ts');
const { statsSummary } = require('../src/ui/stats.ts');
const { errorIn, speedIn } = require('../src/ui/units.ts');
const { offScale } = require('../src/ui/gauge.ts');

// Normalised, because a Windows checkout converts line endings to CRLF.
const read = (file) =>
  fs.readFileSync(path.join(__dirname, '..', file), 'utf8').replace(/\r\n/g, '\n');

const measured = (speedKmh, errorKmh) => ({ kind: 'measured', speedKmh, errorKmh });
const delivery = (id, createdAt, state) => ({ id, createdAt, state });

test('implausible, decided in km/h only: over 180 km/h, or a range wider than 25 km/h', () => {
  assert.equal(implausible(measured(124.8, 3.1)), false);
  assert.equal(implausible(measured(181, 2)), true, 'over 180');
  assert.equal(implausible(measured(180, 2)), false, '180 itself is not over');
  assert.equal(implausible(measured(120, 25.1)), true, 'wider than plus or minus 25');
  assert.equal(implausible(measured(120, 25)), false, 'exactly 25 is not wider');
  assert.equal(implausible(measured(20000, 3)), true);
  // The same two rules as the cautions, because it is the cautions.
  assert.deepEqual(readingCautions(measured(20000, 30)), [OFF_SCALE_CAUTION, WIDE_RANGE_CAUTION]);
  assert.equal(CHECK_READING, 'Check this reading');
  // The rule takes no unit at all, so no setting can move it.
  assert.equal(implausible.length, 1);
  assert.equal(readingCautions.length, 1);
});

test('a 178 km/h reading counts in both units; a 185 km/h reading counts in neither', () => {
  // 178 km/h is 110.6 mph, past the mph dial's 110. It still counts: the dial
  // only says where its needle rests.
  const list = [
    delivery('fast', 2, measured(178, 3)),
    delivery('wild', 1, measured(185, 3)),
    delivery('slow', 0, measured(120, 3)),
  ];
  for (const unit of ['kmh', 'mph']) {
    const view = readingView(list[0].state, unit);
    assert.equal(personalBest(list).id, 'fast', unit);
    assert.equal(heroDelivery(list, null).delivery.id, 'fast', unit);
    assert.equal(heroDelivery(list, 'wild').delivery.id, 'fast', `${unit}: the 185 never shows as the hero`);
    assert.equal(compareSelectability(list[0].state).selectable, true, unit);
    assert.equal(compareSelectability(list[1].state).selectable, false, unit);
    assert.equal(needsChecking(list[0].state), false, unit);
    assert.equal(needsChecking(list[1].state), true, unit);
    const summary = statsSummary(list.map((d) => ({ ...d, confidence: 'seen' })), unit, 10);
    assert.deepEqual(summary.points.map((p) => p.id), ['slow', 'fast'], unit);
    assert.equal(summary.toCheck, 1, unit);
    assert.equal(summary.best.id, 'fast', unit);
    assert.ok(view.value > 0);
  }
  // The mph dial still ends at 110 and says so for the 178.
  assert.equal(offScale(speedIn(178, 'mph'), errorIn(3, 'mph'), 'mph'), true);
  assert.equal(offScale(178, 3, 'kmh'), true, 'its range tops 180 on the km/h dial too');
});

test('a 20000 km/h reading never becomes the personal best; the next plausible one does', () => {
  const list = [
    delivery('wild', 3, measured(20000, 3)),
    delivery('wide', 2, measured(150, 40)),
    delivery('real', 1, measured(132.4, 3.2)),
    delivery('slow', 0, measured(118.0, 2.9)),
    delivery('guess', 4, { kind: 'not-seen' }),
  ];
  assert.equal(personalBest(list).id, 'real');
  assert.equal(personalBest(list).id, 'real');
  // With nothing plausible there is no best at all, never the wild one.
  assert.equal(personalBest([list[0], list[1]]), null);
  // And the newest reading that counts is the latest, the count leaves them out.
  assert.equal(latestMeasured(list).id, 'real');
  assert.equal(measuredCount(list), 2);
  assert.deepEqual(countingDeliveries(list).map((d) => d.id), ['real', 'slow']);
  assert.equal(countsAsReading({ kind: 'unusable' }), false);
  assert.equal(needsChecking(list[0].state), true);
  assert.equal(needsChecking(list[2].state), false);
  assert.equal(needsChecking({ kind: 'not-seen' }), false);
  // The reading itself is untouched: shown exactly as computed.
  assert.equal(readingView(list[0].state, 'kmh').speed, '20000.0');
  assert.equal(readingView(list[0].state, 'kmh').range, '± 3 km/h');
});

test('an implausible reading is never offered in Compare', () => {
  const blocked = compareSelectability(measured(20000, 3));
  assert.equal(blocked.selectable, false);
  assert.equal(blocked.reason, "Can't compare: check this reading");
  assert.equal(compareSelectability(measured(120, 30)).selectable, false);
  assert.equal(compareSelectability(measured(120, 3)).selectable, true);
  // History counts only comparable readings toward showing Compare at all.
  const history = read('app/history.tsx');
  assert.match(history, /\[\.\.\.states\.values\(\)\]\.filter\(\(s\) => countsAsReading\(s\)\)\.length/);
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
  assert.match(read('src/ui/deliveries.ts'), /return state\.kind === 'measured' && !implausible\(state\);/);
  // Home's hero is the best by that rule; its cards say when to check.
  const home = read('app/index.tsx');
  assert.match(home, /personalBest\(listed\)/);
  assert.match(home, /check=\{needsChecking\(d\.state\)\}/);
  // History: the trend and its best leave them out, the rows tag them.
  const history = read('app/history.tsx');
  assert.match(history, /if \(!reading \|\| !countsAsReading\(reading\)\) continue;/);
  assert.match(history, /const check = needsChecking\(reading\);/);
  assert.match(history, /check=\{check\}/);
  // Stats: every figure from the deliveries that count.
  const stats = read('app/stats.tsx');
  assert.match(stats, /statsSummary\(deliveries, unit, Date\.now\(\)\)/);
  const summary = read('src/ui/stats.ts');
  assert.match(summary, /best: personalBest\(list\),/);
  assert.match(summary, /const counted = list\.filter\(\(d\) => !needsChecking\(d\.state\)\);/);
  // Analysis shows it as computed, with the tag.
  const analysis = read('app/analysis.tsx');
  assert.match(analysis, /\{needsChecking\(state\) \? \(\s*<CheckTag center \/>/);
  // The tag is words and an icon, never colour alone.
  const tag = read('src/ui/CheckTag.tsx');
  assert.match(tag, /\{CHECK_READING\}/);
  assert.match(tag, /accessibilityLabel=\{`Caution\. \$\{CHECK_READING\}\.`\}/);
  assert.match(read('src/ui/DeliveryRow.tsx'), /\{check && reading\.kind === 'measured' \? <CheckTag \/> : null\}/);
  assert.match(read('src/ui/DeliveryCard.tsx'), /\{check \? <CheckTag \/> : null\}/);
});
