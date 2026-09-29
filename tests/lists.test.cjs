require('./register.cjs');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { test } = require('node:test');
const { compareFooterLabel, dayHeading, groupByDay, personalBest } = require('../src/ui/deliveries.ts');

// Normalised, because a Windows checkout converts line endings to CRLF.
const read = (file) =>
  fs.readFileSync(path.join(__dirname, '..', file), 'utf8').replace(/\r\n/g, '\n');

const measured = (speedKmh) => ({ kind: 'measured', speedKmh, errorKmh: 3 });

test('the personal best is the fastest measured delivery, most recent of equals, never a zero', () => {
  assert.equal(personalBest([]), null);
  assert.equal(personalBest([{ id: 'a', createdAt: 1, state: { kind: 'not-seen' } }]), null);
  const list = [
    { id: 'new', createdAt: 5, state: measured(120) },
    { id: 'guess', createdAt: 4, state: { kind: 'not-seen' } },
    { id: 'fast', createdAt: 3, state: measured(131.2) },
    { id: 'bad', createdAt: 2, state: { kind: 'unusable' } },
    { id: 'tie-old', createdAt: 1, state: measured(131.2) },
  ];
  assert.equal(personalBest(list).id, 'fast');
});

test('deliveries are grouped under Today, Yesterday and then the date', () => {
  const now = new Date(2026, 8, 27, 15, 0).getTime();
  const date = (t) => `D${new Date(t).getDate()}`;
  assert.equal(dayHeading(new Date(2026, 8, 27, 0, 5).getTime(), now, date), 'Today');
  assert.equal(dayHeading(new Date(2026, 8, 26, 23, 59).getTime(), now, date), 'Yesterday');
  assert.equal(dayHeading(new Date(2026, 8, 20, 12).getTime(), now, date), 'D20');
  const rows = groupByDay(
    [
      { id: 'a', createdAt: new Date(2026, 8, 27, 14).getTime() },
      { id: 'b', createdAt: new Date(2026, 8, 27, 9).getTime() },
      { id: 'c', createdAt: new Date(2026, 8, 25, 9).getTime() },
    ],
    now,
    date,
  );
  assert.deepEqual(
    rows.map((r) => (r.kind === 'day' ? r.heading : r.key)),
    ['Today', 'a', 'b', 'D25', 'c'],
  );
});

test('the compare footer counts down to two', () => {
  assert.equal(compareFooterLabel(0), 'Choose 2 deliveries');
  assert.equal(compareFooterLabel(1), 'Choose 1 more delivery');
  assert.equal(compareFooterLabel(2), 'Compare 2 deliveries');
});

test('the tab bar moves on a plain stack without growing it', () => {
  const tabs = read('src/ui/TabBar.tsx');
  // tabMove is in a .tsx file with React Native imports, so it is read, not run.
  assert.match(tabs, /if \(from === to\) return 'none';\s*if \(to === 'home'\) return 'home';\s*return from === 'home' \? 'push' : 'replace';/);
  assert.match(tabs, /case 'home':\s*router\.dismissTo\('\/'\);/);
  assert.match(tabs, /height: size\.tabBar,/);
  assert.match(tabs, /accessibilityRole="tab"\s+accessibilityState=\{\{ selected: on \}\}/);
});

test('a delivery row shows a speed only with its range, and a neutral reason without one', () => {
  const row = read('src/ui/DeliveryRow.tsx');
  assert.match(row, /reading: ReadingView;/);
  assert.match(row, /\{reading\.speed\}\s*<Text style=\{styles\.range\}> \{reading\.range\}<\/Text>/);
  assert.match(row, /noSpeed: \{ \.\.\.type\.body, color: colors\.muted/);
  assert.match(row, /minHeight: size\.row,/);
  assert.match(row, /width: size\.thumb,\s*height: size\.thumb,/);
});

test('routes rise and fade on the native stack', () => {
  assert.match(read('app/_layout.tsx'), /animation: 'fade_from_bottom',/);
});

test('the list pieces take every colour and size from tokens', () => {
  for (const file of ['src/ui/TabBar.tsx', 'src/ui/DeliveryRow.tsx', 'src/ui/EmptyState.tsx']) {
    const source = read(file);
    assert.doesNotMatch(source, /#[0-9a-f]{3,8}\b/i, file);
    const styles = source.slice(source.indexOf('StyleSheet.create'));
    assert.doesNotMatch(styles.replace(/\bflex(Grow|Shrink)?:\s*[01]\b/g, ''), /:\s*-?\d+(\.\d+)?\s*[,}\n]/, file);
  }
});

test('Stats: the best is free, the rest is Pro, and every number is a saved reading', () => {
  const { latestMeasured, measuredCount } = require('../src/ui/deliveries.ts');
  const list = [
    { id: 'guess', createdAt: 3, state: { kind: 'not-seen' } },
    { id: 'new', createdAt: 2, state: { kind: 'measured', speedKmh: 120, errorKmh: 3 } },
    { id: 'old', createdAt: 1, state: { kind: 'measured', speedKmh: 130, errorKmh: 3 } },
  ];
  assert.equal(latestMeasured(list).id, 'new');
  assert.equal(latestMeasured([]), null);
  assert.equal(measuredCount(list), 2);

  const stats = read('app/stats.tsx');
  assert.match(stats, /const pro = canSeeStats\(entitlements\);/);
  assert.match(stats, /<Tile title="Personal best" wide/);
  for (const name of ['Measured deliveries', 'Latest reading', 'Speed over time']) assert.ok(stats.includes(name), name);
  assert.match(stats, /label="See Pro stats"\s+onPress=\{\(\) => router\.push\(\{ pathname: '\/paywall', params: \{ context: 'stats' \} \}\)\}/);
  // Points with range bars, never a line through them, and no sample data.
  assert.doesNotMatch(stats, /<Path\b|<Polyline|<Line\b|MOCK_|sampleData/);
  assert.match(stats, /state: measurementState\(s\)/);
  assert.match(read('app/index.tsx'), /onPress=\{\(\) => router\.push\('\/stats'\)\}/);
  assert.match(read('src/purchases/gates.ts'), /export function canSeeStats\(entitlements: Entitlements\): boolean \{\s*return entitlements\.isPro;/);
});
