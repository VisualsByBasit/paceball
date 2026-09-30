require('./register.cjs');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { test } = require('node:test');
const {
  deliveriesPerDay,
  monotoneControls,
  nearestIndex,
  percent,
  statsSummary,
  tileColumns,
  confidenceOf,
} = require('../src/ui/stats.ts');

// Normalised, because a Windows checkout converts line endings to CRLF.
const read = (file) =>
  fs.readFileSync(path.join(__dirname, '..', file), 'utf8').replace(/\r\n/g, '\n');

const DAY = 24 * 60 * 60 * 1000;
const NOW = new Date(2026, 8, 30, 15, 0, 0).getTime();
const measured = (speedKmh, errorKmh) => ({ kind: 'measured', speedKmh, errorKmh });
const d = (id, daysAgo, state, confidence = 'seen') => ({ id, createdAt: NOW - daysAgo * DAY, state, confidence });

test('every figure comes from the saved deliveries, and implausible ones only count as saved', () => {
  const list = [
    d('today-a', 0, measured(128.4, 3.1)),
    d('today-b', 0, { kind: 'not-seen' }, 'guessed'),
    d('wild', 1, measured(20000, 3)),
    d('two', 2, measured(132.2, 3.4), 'uncertain'),
    d('unusable', 3, { kind: 'unusable' }),
    d('old', 20, measured(118.0, 2.9)),
  ];
  const s = statsSummary(list, 'kmh', NOW);
  assert.equal(s.deliveries, 6, 'every saved delivery');
  assert.equal(s.measured, 3, 'measured and plausible only');
  assert.equal(s.thisWeek, 5);
  assert.equal(s.best.id, 'two', 'never the 20000 km/h reading');
  assert.deepEqual(s.points.map((p) => p.id), ['old', 'two', 'today-a'], 'oldest to newest');
  // Every point carries its own range.
  for (const p of s.points) assert.match(p.view.range, /^± \d/);
  assert.deepEqual(s.confidence, { seen: 3, uncertain: 1, guessed: 1, total: 5 });
  assert.deepEqual(s.outcome, { measured: 3, noSpeed: 2 });
  assert.equal(s.toCheck, 1);
  assert.equal(s.perDay.length, 7);
  assert.deepEqual(s.perDay.map((x) => x.count), [0, 0, 0, 1, 1, 1, 2], 'today last');
});

test('nothing saved: zeros and nulls, never a speed or NaN', () => {
  const s = statsSummary([], 'kmh', NOW);
  assert.equal(s.deliveries, 0);
  assert.equal(s.best, null);
  assert.deepEqual(s.points, []);
  assert.ok(s.perDay.every((x) => x.count === 0));
  assert.equal(percent(0, 0), 0);
  assert.equal(percent(1, 3), 33);
  // An old record without markConfidence reads as seen; a guessed bounce as guessed.
  assert.equal(confidenceOf(measured(120, 3), undefined), 'seen');
  assert.equal(confidenceOf({ kind: 'not-seen' }, undefined), 'guessed');
});

test('deliveries per day are the last seven local days, today last', () => {
  const days = deliveriesPerDay([NOW, NOW - DAY, NOW - 8 * DAY], NOW);
  assert.equal(days.length, 7);
  assert.equal(days[6].count, 1);
  assert.equal(days[5].count, 1);
  assert.equal(days.reduce((n, x) => n + x.count, 0), 2, 'a delivery older than a week is not drawn');
  for (let i = 1; i < 7; i++) assert.ok(days[i].start > days[i - 1].start);
});

test('the speed line is smooth but never bends past the readings it joins', () => {
  const cubic = (p0, c1, c2, p1, t) =>
    (1 - t) ** 3 * p0 + 3 * (1 - t) ** 2 * t * c1 + 3 * (1 - t) * t ** 2 * c2 + t ** 3 * p1;
  const series = [
    [120, 131, 124, 124, 140, 118],
    [100, 100, 100],
    [130, 90, 135, 80],
  ];
  for (const ys of series) {
    const xs = ys.map((_, i) => i * 40);
    const controls = monotoneControls(xs, ys);
    assert.equal(controls.length, ys.length - 1);
    controls.forEach(({ c1, c2 }, i) => {
      const lo = Math.min(ys[i], ys[i + 1]);
      const hi = Math.max(ys[i], ys[i + 1]);
      for (let k = 0; k <= 50; k++) {
        const y = cubic(ys[i], c1[1], c2[1], ys[i + 1], k / 50);
        assert.ok(y >= lo - 1e-9 && y <= hi + 1e-9, `segment ${i} leaves [${lo}, ${hi}] at ${y}`);
      }
    });
  }
  assert.deepEqual(monotoneControls([0], [120]), []);
  assert.equal(nearestIndex([0, 50, 100], 70), 1);
  assert.equal(nearestIndex([0, 50, 100], 99), 2);
});

test('no tile text can overrun its tile, at any width or text size', () => {
  // The bug: locked tiles set the title and a LOCKED word side by side, neither
  // able to shrink (React Native's flexShrink defaults to 0), in half-width
  // tiles. "Measured deliveries" in the letter-spaced label face is wider than
  // half a phone, so the two ran into each other and off the tile.
  const minTile = 104;
  const gap = 8;
  for (let width = 260; width <= 900; width += 7) {
    for (const scale of [0.85, 1, 1.15, 1.3, 1.5, 2]) {
      const n = tileColumns(width, scale, minTile, gap, 3);
      assert.ok(n >= 1 && n <= 3);
      if (n > 1) assert.ok((width - gap * (n - 1)) / n >= minTile * Math.max(scale, 1), `${width} at ${scale}`);
    }
  }
  const stats = read('app/stats.tsx');
  assert.match(stats, /tileColumns\(contentWidth, fontScale, size\.kpiMin, space\.sm, 3\)/);
  // No LOCKED word competing with a title for the row, and nothing cut short.
  assert.doesNotMatch(stats, />\s*LOCKED\s*</);
  assert.doesNotMatch(stats, /numberOfLines/);
  // Every card title takes the rest of its row and wraps, at a space.
  assert.match(read('src/ui/StatCard.tsx'), /title: \{ \.\.\.type\.label, color: colors\.muted, flex: 1, flexShrink: 1 \}/);
  for (const style of ['kpiTitle', 'lockedText', 'listDate']) {
    assert.match(stats, new RegExp(`${style}: \\{[^}]*flexShrink: 1`), style);
  }
  assert.match(read('src/ui/tokens.ts'), /kpiMin: 75,/);
});

test('free users: the best works, every other card is a dimmed outline, a Pro pill and one line, and one way to Pro', () => {
  const stats = read('app/stats.tsx');
  const locked = stats.slice(stats.indexOf('{LOCKED.map('), stats.indexOf('label="See Pro stats"'));
  assert.ok(locked.length > 0);
  // No real chart and no figure behind the lock: the player's data stays Pro.
  assert.doesNotMatch(locked, /SpeedChart|DayBars|SplitBar|BlurMask|summary\./);
  assert.match(locked, /<LockedTile icon=\{icon\} title=\{title\} preview=\{preview\} line=\{line\} \/>/);
  const tile = stats.slice(stats.indexOf('function LockedTile'), stats.indexOf('const styles'));
  assert.match(tile, /<LockedPreview kind=\{preview\} \/>/);
  assert.match(tile, /<ProPill \/>/);
  assert.doesNotMatch(tile, /summary|kpiValues/);
  // The preview is a fixed outline, drawn from no data at all.
  const charts = read('src/ui/StatsCharts.tsx');
  const preview = charts.slice(charts.indexOf('export function LockedPreview'), charts.indexOf('const styles'));
  assert.doesNotMatch(preview, /points|days\b|summary|<Text/);
  // One line each on what the card shows.
  const lockedList = stats.match(/const LOCKED = \[([\s\S]*?)\] as const;/)[1];
  assert.equal((lockedList.match(/\['/g) ?? []).length, 4);
  assert.equal((stats.match(/label="See Pro stats"/g) ?? []).length, 1);
  // The KPI tiles lock the same way, with the pill where the figure would be.
  assert.match(stats, /<LockedTile icon=\{icon\} title=\{title\} \/>/);
  // The personal best sits outside the lock.
  assert.ok(stats.indexOf('<TileHead icon="best" title="Personal best" />') < stats.indexOf('{pro ? (\n          <>'));
});

test('no speed without its range, and charts drawn with Skia alone', () => {
  const charts = read('src/ui/StatsCharts.tsx');
  // The tooltip shows the date, the speed and its range together.
  const tip = charts.slice(charts.indexOf('{pick && geometry ? ('), charts.indexOf(') : null}', charts.indexOf('{pick && geometry ? (')));
  assert.match(tip, /formatWhen\(pick\.t\)/);
  assert.match(tip, /pick\.view\.speed/);
  assert.match(tip, /pick\.view\.range/);
  // The range is drawn as a band around the line.
  assert.match(charts, /<Path path=\{geometry\.band\} color=\{colors\.accent\} opacity=\{opacity\.faint\} \/>/);
  const stats = read('app/stats.tsx');
  assert.match(stats, /\{p\.view\.speed\} <Text style=\{styles\.listRange\}>\{p\.view\.range\}<\/Text>/);
  assert.match(stats, /<ReadingBlock reading=\{bestView\} size="reading" face="tabular" \/>/);
  // No chart library: only Skia, React Native and Reanimated.
  for (const file of ['src/ui/StatsCharts.tsx', 'src/ui/StatCard.tsx', 'app/stats.tsx']) {
    const imports = [...read(file).matchAll(/from '([^']+)'/g)].map((m) => m[1]);
    for (const from of imports) {
      assert.ok(
        /^(react|react-native|@shopify\/react-native-skia|react-native-reanimated|expo-router|react-native-safe-area-context|\.{1,2}\/.*)$/.test(from),
        `${file} imports ${from}`,
      );
    }
    assert.doesNotMatch(read(file), /#[0-9a-f]{3,8}\b/i, `${file} hardcodes a colour`);
    assert.doesNotMatch(read(file), /—/, `${file} has an em dash`);
  }
});

test('Stats reads as a calm instrument: flat cards, no glow or gloss, plain tabular figures, one entrance', () => {
  const files = ['app/stats.tsx', 'src/ui/StatsCharts.tsx', 'src/ui/StatCard.tsx'];
  for (const file of files) {
    const source = read(file);
    // No glossy cards, lit badges, glows, gradients or shadows.
    assert.doesNotMatch(source, /<GlossCard\b|IconBadge|BlurMask|LinearGradient|RadialGradient|shadow|elevation/, file);
    // Figures in the app's own face with tabular digits, never monospace.
    assert.doesNotMatch(source, /type\.mono/, file);
    assert.doesNotMatch(source, /HalfGauge|MeasuredDonut|addArc/, file);
  }
  // The card: the surface, a hairline edge, the standard radius.
  const card = read('src/ui/StatCard.tsx');
  assert.match(card, /card: \{\s*backgroundColor: colors\.surface,\s*borderRadius: radius\.lg,\s*borderWidth: stroke\.hairline,\s*borderColor: colors\.line,/);
  // Titles in the label face, like FRAMING on Capture.
  assert.match(card, /\{title\.toUpperCase\(\)\}/);
  // Bounce confidence and measured vs no speed are one split bar each.
  const stats = read('app/stats.tsx');
  assert.equal((stats.match(/<SplitBar\b/g) ?? []).length, 2);
  assert.match(stats, /\{leftOut \? <Text style=\{styles\.note\}>\{leftOut\}<\/Text> : null\}/);
  // Deliveries per day: today's bar in full lime, the rest calmer.
  const charts = read('src/ui/StatsCharts.tsx');
  assert.match(charts, /opacity=\{i === today \? opacity\.full : opacity\.inactive\}/);
  // Speed over time rings its best reading.
  assert.match(charts, /geometry\.best/);
  // Everything arrives once, on the motion tokens, and is still with reduced motion.
  assert.match(card, /const reduced = useReducedMotion\(\);/);
  assert.match(card, /withTiming\(1, \{ duration: motion\.enter\.duration, easing: STANDARD \}\)/);
  assert.match(card, /index \* motion\.enter\.stagger/);
  assert.ok((stats.match(/<Rise\b/g) ?? []).length >= 7);
});
