require('./register.cjs');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { test } = require('node:test');
const { speedVerdict } = require('../src/ui/speedVerdict.ts');
const {
  COMPARE_COUNT,
  compareSelectability,
  orderForCompare,
  togglePick,
} = require('../src/ui/compareSelection.ts');
const { canCompare } = require('../src/purchases/gates.ts');

// Normalised, because a Windows checkout converts line endings to CRLF.
const read = (file) =>
  fs.readFileSync(path.join(__dirname, '..', file), 'utf8').replace(/\r\n/g, '\n');

test('overlapping ranges are too close to call; a clear gap names the faster one', () => {
  // 0.3 apart, each good to 4: Diff.better would crown B. The ranges say no.
  const close = speedVerdict({ speed: 120.0, error: 4 }, { speed: 120.3, error: 4 });
  assert.equal(close.kind, 'too-close');
  assert.ok(Math.abs(close.delta - 0.3) < 1e-9, 'the delta is still reported');

  const newerFaster = speedVerdict({ speed: 110.0, error: 3 }, { speed: 125.0, error: 4 });
  assert.deepEqual(newerFaster, { kind: 'faster', faster: 'b', delta: 15 });

  const olderFaster = speedVerdict({ speed: 130.0, error: 2 }, { speed: 118.5, error: 3 });
  assert.equal(olderFaster.kind, 'faster');
  assert.equal(olderFaster.faster, 'a');
  assert.ok(olderFaster.delta < 0, 'delta is B - A');
});

test('ranges that exactly touch count as too close', () => {
  assert.equal(speedVerdict({ speed: 120, error: 3 }, { speed: 126, error: 3 }).kind, 'too-close');
  assert.equal(speedVerdict({ speed: 126, error: 3 }, { speed: 120, error: 3 }).kind, 'too-close');
  // Float noise on displayed decimals must not turn a touch into a gap.
  assert.equal(speedVerdict({ speed: 120.1, error: 3 }, { speed: 126.1, error: 3 }).kind, 'too-close');
  // Past the touch, it is a real gap.
  assert.equal(speedVerdict({ speed: 120, error: 3 }, { speed: 126.1, error: 3 }).kind, 'faster');
});

test('not-seen and unusable deliveries cannot be selected in History', () => {
  assert.deepEqual(compareSelectability({ kind: 'measured', speedKmh: 120, errorKmh: 4 }), {
    selectable: true,
  });
  for (const kind of ['not-seen', 'unusable']) {
    const result = compareSelectability({ kind });
    assert.equal(result.selectable, false, kind);
    assert.ok(result.reason.length > 0, `${kind} says why`);
  }

  // History wires the rule into the row: blocked rows are disabled and dimmed,
  // and only rows that are selectable get a pick marker.
  const history = read('app/history.tsx');
  assert.match(history, /selectability: compareSelectability\(reading\)/);
  assert.match(history, /const blocked = select !== null && !select\.selectability\.selectable;/);
  assert.match(history, /disabled=\{blocked\}/);
  assert.match(history, /blocked && styles\.off/);
});

test('picking stops at two, and the older delivery is A', () => {
  assert.equal(COMPARE_COUNT, 2);
  let picked = togglePick([], 'x');
  picked = togglePick(picked, 'y');
  assert.deepEqual(togglePick(picked, 'z'), ['x', 'y'], 'a third tap drops nothing');
  assert.deepEqual(togglePick(picked, 'x'), ['y'], 'tapping a pick unpicks it');

  const older = { id: 'b', createdAt: 1 };
  const newer = { id: 'a', createdAt: 2 };
  assert.deepEqual(orderForCompare(newer, older), [older, newer]);
  assert.deepEqual(orderForCompare(older, newer), [older, newer]);
  const tie = { id: 'c', createdAt: 1 };
  assert.deepEqual(orderForCompare(tie, older), [older, tie], 'ties fall back to id');
});

test('compare goes through one gate, from History and from the screen', () => {
  assert.equal(canCompare(), true, 'open until the RevenueCat entitlement replaces it');
  const history = read('app/history.tsx');
  const compare = read('app/compare.tsx');
  assert.match(history, /if \(!canCompare\(\)\) \{\s*router\.push\(\{ pathname: '\/paywall', params: \{ context: 'compare' \} \}\);/);
  assert.match(compare, /if \(!canCompare\(\)\) \{\s*return <Redirect href=\{\{ pathname: '\/paywall', params: \{ context: 'compare' \} \}\} \/>;/);
});

test('compare.tsx takes every colour and size from tokens', () => {
  const source = read('app/compare.tsx');
  assert.doesNotMatch(source, /#[0-9a-f]{3,8}\b/i, 'hardcodes a colour');
  const styles = source.slice(source.indexOf('StyleSheet.create'));
  // A bare number as a style value. flex, flexGrow and flexShrink are layout
  // ratios, not sizes the tokens could name.
  assert.doesNotMatch(
    styles.replace(/\bflex(Grow|Shrink)?:\s*[01]\b/g, ''),
    /:\s*-?\d+(\.\d+)?\s*[,}\n]/,
    'hardcodes a size',
  );
});

test('compare.tsx reads speed and error only through measurementState', () => {
  const source = read('app/compare.tsx');
  assert.doesNotMatch(source, /session\.(speedKmh|errorKmh)/);
  // Nor straight off the records getComparison hands back.
  assert.doesNotMatch(source, /result\.[ab]\.(speedKmh|errorKmh)/);
  assert.match(source, /measurementState\(session\)/);
  // Diff.better ignores the error ranges, so it never decides anything here.
  assert.doesNotMatch(source, /\.better\b/);
  assert.match(source, /speedVerdict\(/);
});

test('the new copy uses no em dashes', () => {
  for (const file of [
    'app/compare.tsx',
    'src/ui/compareSelection.ts',
    'src/ui/speedVerdict.ts',
    'src/purchases/gates.ts',
  ]) {
    assert.doesNotMatch(read(file), /—/, file);
  }
  // History's new select-mode copy: from the list header through the confirm bar.
  const history = read('app/history.tsx');
  const from = history.indexOf('<View style={styles.listTop}>');
  const to = history.indexOf('</View>', history.indexOf('style={styles.compareBar'));
  assert.ok(from !== -1 && to > from, 'select-mode JSX found');
  const selectMode = history.slice(from, to);
  assert.match(selectMode, /PICK TWO TO COMPARE/);
  assert.doesNotMatch(selectMode, /—/);
  // The dimmed-row reasons live in compareSelection.ts, checked above.

  const paywall = read('app/paywall.tsx');
  const compareCopy = paywall.slice(paywall.indexOf('  compare: {'), paywall.indexOf('};', paywall.indexOf('  compare: {')));
  assert.doesNotMatch(compareCopy, /—/);
});
