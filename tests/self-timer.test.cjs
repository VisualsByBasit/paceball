require('./register.cjs');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { test } = require('node:test');
const {
  SELF_TIMER_OPTIONS,
  nextSelfTimer,
  selfTimerLabel,
  startCountdown,
} = require('../src/capture/selfTimer.ts');
const { DEFAULT_SETTINGS, parseSettings } = require('../src/settings/settings.ts');

// Normalised, because a Windows checkout converts line endings to CRLF.
const read = (file) =>
  fs.readFileSync(path.join(__dirname, '..', file), 'utf8').replace(/\r\n/g, '\n');

/** A clock that only moves when told to, running whatever falls due. */
function fakeClock() {
  let now = 0;
  let queue = [];
  let next = 1;
  return {
    now: () => now,
    setTimeout: (fn, ms) => {
      const id = next++;
      queue.push({ id, at: now + ms, fn });
      return id;
    },
    clearTimeout: (id) => {
      queue = queue.filter((t) => t.id !== id);
    },
    advance(ms) {
      const end = now + ms;
      for (;;) {
        queue.sort((a, b) => a.at - b.at);
        const due = queue[0];
        if (!due || due.at > end) break;
        queue.shift();
        now = due.at;
        due.fn();
      }
      now = end;
    },
    pending: () => queue.length,
  };
}

test('Off, 3 s, 5 s and 10 s, stepping round, remembered in settings', () => {
  assert.deepEqual([...SELF_TIMER_OPTIONS], [0, 3, 5, 10]);
  assert.equal(nextSelfTimer(0), 3);
  assert.equal(nextSelfTimer(3), 5);
  assert.equal(nextSelfTimer(5), 10);
  assert.equal(nextSelfTimer(10), 0);
  assert.equal(selfTimerLabel(0), 'Timer off');
  assert.equal(selfTimerLabel(10), 'Timer 10 s');
  assert.equal(DEFAULT_SETTINGS.selfTimer, 0);
  assert.equal(parseSettings({ selfTimer: 5 }).selfTimer, 5);
  assert.equal(parseSettings({ selfTimer: 7 }).selfTimer, 0);
  const capture = read('app/capture.tsx');
  assert.match(capture, /onPress=\{\(\) => updateSettings\(\{ selfTimer: nextSelfTimer\(selfTimer\) \}\)\}/);
});

test('the countdown ticks each second, then starts once', () => {
  const clock = fakeClock();
  const ticks = [];
  let done = 0;
  startCountdown(3, { onTick: (n) => ticks.push([clock.now(), n]), onDone: () => (done += 1) }, clock);
  assert.deepEqual(ticks, [[0, 3]]);
  clock.advance(999);
  assert.equal(ticks.length, 1);
  clock.advance(1);
  assert.deepEqual(ticks, [[0, 3], [1000, 2]]);
  clock.advance(2000);
  assert.deepEqual(ticks.map((t) => t[1]), [3, 2, 1]);
  assert.equal(done, 1);
  clock.advance(5000);
  assert.equal(done, 1, 'never twice');
  assert.equal(clock.pending(), 0);
});

test('a late beat does not push the start later', () => {
  const clock = fakeClock();
  let doneAt = null;
  const realSet = clock.setTimeout;
  // The JS thread is busy: every beat runs 150 ms late.
  clock.setTimeout = (fn, ms) => realSet(fn, ms + 150);
  startCountdown(5, { onTick: () => undefined, onDone: () => (doneAt = clock.now()) }, clock);
  clock.advance(10_000);
  assert.ok(doneAt <= 5000 + 150, `started at ${doneAt}`);
});

test('cancelling stops it: nothing ticks and recording never starts', () => {
  const clock = fakeClock();
  const ticks = [];
  let done = 0;
  const count = startCountdown(10, { onTick: (n) => ticks.push(n), onDone: () => (done += 1) }, clock);
  clock.advance(2500);
  count.cancel();
  clock.advance(20_000);
  assert.deepEqual(ticks, [10, 9, 8]);
  assert.equal(done, 0);
  assert.equal(clock.pending(), 0);
  count.cancel();
});

test('Capture: record starts the count, tapping cancels, and the start is the same start', () => {
  const capture = read('app/capture.tsx');
  const begin = capture.slice(capture.indexOf('const beginRecording'), capture.indexOf('}, [selfTimer, capture]);'));
  // Off records at once, exactly as before.
  assert.match(begin, /if \(selfTimer === 0\) \{\s*capture\.start\(\);\s*return;\s*\}/);
  // Each second a light haptic; at the end the recorder's own start, only if
  // the camera is still ready.
  assert.match(begin, /Haptics\.impactAsync\(Haptics\.ImpactFeedbackStyle\.Light\)/);
  assert.match(begin, /if \(readyRef\.current\) startRef\.current\(\);/);
  // The shutter: stop while recording, cancel while counting, else begin.
  assert.match(capture, /isRecording\s*\? capture\.stop\s*: countdown !== null\s*\? cancelCountdown\s*:/);
  // Tapping the countdown cancels it, and it turns with the overlay rules.
  const overlay = capture.slice(capture.indexOf('{countdown !== null ? ('), capture.indexOf('{switchingLens ? ('));
  assert.match(overlay, /onPress=\{cancelCountdown\}/);
  assert.match(overlay, /<RotateInPlace deg=\{rotation\}>/);
  assert.match(capture, /countNumber: \{ \.\.\.type\.hero, \.\.\.type\.tabular, color: colors\.accent \}/);
  // Leaving, losing the camera or switching lens cancels it.
  assert.match(capture, /if \(!isFocused \|\| !sessionReady \|\| switchingLens\) cancelCountdown\(\);/);
  // Recording itself is untouched: the minimum and the recorder are the same.
  assert.match(capture, /Tap to record · \$\{MIN_RECORDING_MS \/ 1000\}s minimum/);
  assert.doesNotMatch(read('src/capture/selfTimer.ts'), /import /);
  // The chip is a 48 dp target and is off while recording or counting.
  assert.match(capture, /timerChip: \{\s*minWidth: size\.target,\s*minHeight: size\.target,/);
  assert.match(capture, /disabled=\{isRecording \|\| isProcessing \|\| countdown !== null\}/);
});
