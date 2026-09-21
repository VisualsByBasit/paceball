require('./register.cjs');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { test } = require('node:test');
const { createHoldRepeat } = require('../src/ui/holdRepeat.ts');

// Normalised, because a Windows checkout converts line endings to CRLF.
const read = (file) =>
  fs.readFileSync(path.join(__dirname, '..', file), 'utf8').replace(/\r\n/g, '\n');

/** A clock the test moves by hand. */
function fakeTimers() {
  let now = 0;
  let nextId = 1;
  const pending = new Map();
  const timers = {
    setTimeout: (fn, ms) => {
      const id = nextId++;
      pending.set(id, { fn, at: now + ms });
      return id;
    },
    clearTimeout: (id) => pending.delete(id),
    setInterval: (fn, ms) => {
      const id = nextId++;
      pending.set(id, { fn, at: now + ms, every: ms });
      return id;
    },
    clearInterval: (id) => pending.delete(id),
  };
  const advance = (ms) => {
    const end = now + ms;
    for (;;) {
      let due = null;
      for (const [id, t] of pending) if (t.at <= end && (!due || t.at < due[1].at)) due = [id, t];
      if (!due) break;
      const [id, t] = due;
      now = t.at;
      if (t.every) t.at += t.every;
      else pending.delete(id);
      t.fn();
    }
    now = end;
  };
  return { timers, advance, pending: () => pending.size };
}

function setup() {
  const clock = fakeTimers();
  const steps = [];
  const hold = createHoldRepeat({
    delay: 400,
    interval: 75,
    onStep: (first) => steps.push(first),
    timers: clock.timers,
  });
  return { clock, steps, hold };
}

test('a tap moves exactly one frame', () => {
  const { clock, steps, hold } = setup();
  hold.pressIn();
  clock.advance(100);
  // Release: onPressOut, then onPress, as React Native orders them.
  hold.stop();
  hold.press();
  clock.advance(2000);
  assert.deepEqual(steps, [true]);
});

test('a hold repeats after the delay, at a steady rate', () => {
  const { clock, steps, hold } = setup();
  hold.pressIn();
  assert.deepEqual(steps, [true], 'one step on touch');
  clock.advance(399);
  assert.equal(steps.length, 1, 'nothing more before the delay');
  clock.advance(1 + 75);
  assert.equal(steps.length, 2);
  clock.advance(75 * 4);
  assert.equal(steps.length, 6);
  // Only the touch itself is a first step, so only it earns the haptic.
  assert.deepEqual(steps.slice(1), [false, false, false, false, false]);
});

test('release stops the repeat, and nothing fires after it', () => {
  const { clock, steps, hold } = setup();
  hold.pressIn();
  clock.advance(700);
  const count = steps.length;
  assert.ok(count > 1);
  hold.stop();
  hold.press();
  clock.advance(5000);
  assert.equal(steps.length, count);
  assert.equal(hold.holding, false);
  assert.equal(clock.pending(), 0);
});

test('a cancelled touch before the delay never starts repeating', () => {
  const { clock, steps, hold } = setup();
  hold.pressIn();
  // Cancel reaches the button as onPressOut with no onPress after it.
  hold.stop();
  clock.advance(5000);
  assert.equal(steps.length, 1);
  assert.equal(clock.pending(), 0);
});

test('a cancelled touch does not swallow the next activation', () => {
  const { clock, steps, hold } = setup();
  hold.pressIn();
  // Cancel: onPressOut with no onPress behind it, and then the turn ends.
  hold.stop();
  clock.advance(0);
  assert.deepEqual(steps, [true], 'the cancel itself adds nothing');

  // A screen reader activating the button now brings no touch of its own, so
  // it has to step. Before the fix the cancelled touch was still standing and
  // this press was spent clearing it, moving no frame.
  hold.press();
  assert.deepEqual(steps, [true, true], 'the activation still steps');
  clock.advance(5000);
  assert.deepEqual(steps, [true, true]);
  assert.equal(clock.pending(), 0);
});

test('a cancelled touch leaves the touch after it clean', () => {
  const { clock, steps, hold } = setup();
  hold.pressIn();
  hold.stop();
  // A fresh touch arrives in the same turn, before the cancelled one is dropped.
  hold.pressIn();
  clock.advance(0);
  hold.stop();
  hold.press();
  clock.advance(5000);
  assert.deepEqual(steps, [true, true], 'one step per touch, no more');
  assert.equal(clock.pending(), 0);
});

test('a screen reader activate with no touch still steps once', () => {
  const { clock, steps, hold } = setup();
  hold.press();
  clock.advance(5000);
  assert.deepEqual(steps, [true]);
});

test('losing focus stops the hold', () => {
  const { clock, steps, hold } = setup();
  hold.pressIn();
  clock.advance(600);
  // What the focus effect's cleanup calls when the screen blurs.
  hold.stop();
  const count = steps.length;
  clock.advance(5000);
  assert.equal(steps.length, count);
  assert.equal(clock.pending(), 0);

  const hook = read('src/ui/useHoldRepeat.ts');
  assert.match(hook, /useFocusEffect\(\s*useCallback\(\(\) => \(\) => hold\.stop\(\), \[hold\]\)\s*\);/);
  assert.match(hook, /useEffect\(\(\) => \(\) => hold\.stop\(\), \[hold\]\);/);
  assert.match(hook, /onPressOut: hold\.stop,/);
});

test('both step buttons on Mark use the hold, with release and cancel wired', () => {
  const mark = read('app/mark.tsx');
  for (const name of ['stepBack', 'stepForward']) {
    assert.match(
      mark,
      new RegExp(`onPressIn=\\{${name}\\.onPressIn\\}\\s*onPressOut=\\{${name}\\.onPressOut\\}\\s*onPress=\\{${name}\\.onPress\\}`),
    );
  }
  assert.doesNotMatch(mark, /onPress=\{\(\) => step\(/);
  // Reaching either end stops the repeat heading for it.
  assert.match(mark, /if \(current === 0\) stepBack\.stop\(\);/);
  assert.match(mark, /if \(current >= scrubMax\) stepForward\.stop\(\);/);
  // Haptic on the press, not on every repeat tick.
  assert.match(mark, /if \(first\) Haptics\.selectionAsync\(\)/);
});

test('both step buttons on Analysis use the same hold, with release and cancel wired', () => {
  const analysis = read('app/analysis.tsx');
  assert.match(analysis, /import \{ useHoldRepeat \} from '\.\.\/src\/ui\/useHoldRepeat';/);
  for (const name of ['stepBack', 'stepForward']) {
    assert.match(
      analysis,
      new RegExp(`onPressIn=\\{${name}\\.onPressIn\\}\\s*onPressOut=\\{${name}\\.onPressOut\\}\\s*onPress=\\{${name}\\.onPress\\}`),
    );
  }
  assert.doesNotMatch(analysis, /onPress=\{\(\) => seek\(current [-+] 1\)\}/);
  // A repeat steps from the frame it last landed on, not a stale render's.
  assert.match(analysis, /seek\(currentRef\.current - 1\)/);
  assert.match(analysis, /seek\(currentRef\.current \+ 1\)/);
  assert.match(analysis, /currentRef\.current = next;\s*setCurrent\(next\);/);
  // Reaching either end stops the repeat heading for it.
  assert.match(analysis, /if \(current === 0\) stepBack\.stop\(\);/);
  assert.match(analysis, /if \(current >= max\) stepForward\.stop\(\);/);
  // Haptic on the press, not on every repeat tick.
  assert.match(analysis, /if \(first\) Haptics\.selectionAsync\(\)/);
  // The same delay and rate as Mark: both come from the one hook, which reads
  // them from the motion tokens rather than taking them per screen.
  assert.match(read('src/ui/useHoldRepeat.ts'), /delay: motion\.holdDelay,\s*interval: motion\.holdRepeat,/);
  assert.match(analysis, /useHoldRepeat\(\s*useCallback\(/);
  assert.doesNotMatch(analysis, /createHoldRepeat|holdDelay|holdRepeat:/);
});
