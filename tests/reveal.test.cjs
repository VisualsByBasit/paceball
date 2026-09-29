require('./register.cjs');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { test } = require('node:test');
const { shouldStartReveal, sweptValue } = require('../src/ui/reveal.ts');
const { countUpText } = require('../src/ui/reading.ts');
const { needleDeg, gaugeMax } = require('../src/ui/gauge.ts');

// Normalised, because a Windows checkout converts line endings to CRLF.
const read = (file) =>
  fs.readFileSync(path.join(__dirname, '..', file), 'utf8').replace(/\r\n/g, '\n');

test('the reading arrives over exactly 1000 ms on the settle curve', () => {
  const tokens = read('src/ui/tokens.ts');
  assert.match(tokens, /countUp: 1000,/);
  assert.match(tokens, /settleCurve: \[0\.16, 1, 0\.3, 1\] as const/);
  const reveal = read('src/ui/motion/useReveal.ts');
  assert.match(reveal, /const SETTLE = Easing\.bezier\(\.\.\.motion\.settleCurve\);/);
  assert.match(reveal, /progress\.value = withTiming\(1, \{ duration: motion\.countUp, easing: SETTLE \}/);
});

test('the sweep waits for the screen to arrive, and plays once', () => {
  // The bug: the sweep started on mount, while Result was still being drawn in
  // and the push from Mark was still running. The sweep runs on the clock, so
  // the frames spent mounting were skipped and the needle jumped. Walk the
  // screen's arrival and the sweep may start only at the end of it.
  const arriving = [
    { ready: true, laidOut: false, settled: false, started: false }, // mounted
    { ready: true, laidOut: true, settled: false, started: false }, // laid out, transition running
  ];
  for (const gate of arriving) assert.equal(shouldStartReveal(gate), false, JSON.stringify(gate));
  assert.equal(shouldStartReveal({ ready: true, laidOut: true, settled: true, started: false }), true);
  // Never without a reading, never before layout, and never a second time.
  assert.equal(shouldStartReveal({ ready: false, laidOut: true, settled: true, started: false }), false);
  assert.equal(shouldStartReveal({ ready: true, laidOut: false, settled: true, started: false }), false);
  assert.equal(shouldStartReveal({ ready: true, laidOut: true, settled: true, started: true }), false);

  const reveal = read('src/ui/motion/useReveal.ts');
  // Only through that gate, and one frame later so the sweep's first frame is drawn.
  assert.match(reveal, /if \(!shouldStartReveal\(\{ ready, laidOut, settled, started: started\.current \}\)\) return;\s*\/\/[^\n]*\n\s*const frame = requestAnimationFrame\(/);
  // Settled by the transition ending, listened for before the first paint,
  // with a token-timed fallback for a screen that arrives without one.
  assert.match(reveal, /useLayoutEffect\(\(\) => \{\s*if \(settled\) return;\s*const unsubscribe = navigation\.addListener\('transitionEnd'/);
  assert.match(reveal, /setTimeout\(\(\) => setSettled\(true\), motion\.revealWait\)/);
  assert.match(read('src/ui/tokens.ts'), /revealWait: \d+,/);
  // Laid out only once the view has a size.
  assert.match(reveal, /if \(e\.nativeEvent\.layout\.width > 0\) setLaidOut\(true\);/);
});

test('one driver on the UI thread: the needle and the number cannot drift apart', () => {
  const gauge = read('src/ui/SpeedGauge.tsx');
  const count = read('src/ui/motion/CountUpReading.tsx');
  // Neither runs a clock, holds the count in React state, or ticks a timer.
  for (const [file, source] of [['SpeedGauge', gauge], ['CountUpReading', count]]) {
    assert.doesNotMatch(source, /withTiming\(|useEffect|setInterval|setTimeout|useState/, file);
  }
  assert.doesNotMatch(read('src/ui/motion/useReveal.ts'), /setInterval/);
  // Both read the same shared value, the same way.
  assert.match(gauge, /sweptValue\(progress\.value, value\)/);
  assert.match(count, /sweptValue\(progress\.value, value\)/);
  // Result hands the one reveal to both, and waits on the reading's layout.
  const result = read('app/result.tsx');
  assert.equal((result.match(/useReveal\(/g) ?? []).length, 1);
  assert.match(result, /const reveal = useReveal\(\{ ready: result !== null && result\.speedKmh !== null \}\);/);
  assert.match(result, /<SpeedGauge reading=\{view\} unit=\{unit\} width=\{[^}]+\} sweep=\{reveal\} \/>/);
  assert.match(result, /reveal=\{reveal\}/);
  assert.match(result, /<View style=\{styles\.reading\} onLayout=\{reveal\.onLayout\}>/);
  // The hook runs before Result's early return, so it is never conditional.
  assert.ok(result.indexOf('useReveal({') < result.indexOf('if (!result) {'));

  // On every frame the needle points at exactly the number being shown.
  const value = 142.3;
  const max = gaugeMax('kmh');
  for (let frame = 0; frame <= 62; frame++) {
    const p = frame / 60;
    const shown = sweptValue(p, value);
    assert.ok(shown <= value + 1e-9, `frame ${frame} passes the reading`);
    assert.ok(Number(countUpText(shown, value, 1)) <= value);
    assert.equal(needleDeg(shown, value, max), needleDeg(sweptValue(p, value), value, max));
  }
  assert.equal(sweptValue(0, value), 0);
  assert.equal(sweptValue(1, value), value);
  assert.equal(sweptValue(1.2, value), value);
  assert.equal(sweptValue(-0.1, value), 0);
});

test('the settle curve never overshoots over the whole 1000 ms', () => {
  // x(t), y(t) of the cubic bezier; y must never pass 1 at any sampled frame.
  const [x1, y1, x2, y2] = [0.16, 1, 0.3, 1];
  const bez = (a, b, t) => 3 * (1 - t) ** 2 * t * a + 3 * (1 - t) * t ** 2 * b + t ** 3;
  let last = 0;
  for (let i = 0; i <= 1000; i++) {
    const t = i / 1000;
    const x = bez(x1, x2, t);
    const y = bez(y1, y2, t);
    assert.ok(y <= 1 + 1e-12 && y >= last - 1e-12, `not monotonic or overshoots at t=${t}`);
    assert.ok(x >= 0 && x <= 1);
    last = y;
  }
});
