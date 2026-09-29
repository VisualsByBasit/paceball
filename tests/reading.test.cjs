require('./register.cjs');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { test } = require('node:test');
const ts = require('typescript');
const { countUpText, readingView, revealStart, READING_DECIMALS } = require('../src/ui/reading.ts');

// Normalised, because a Windows checkout converts line endings to CRLF.
const read = (file) =>
  fs.readFileSync(path.join(__dirname, '..', file), 'utf8').replace(/\r\n/g, '\n');

function parse(file) {
  return ts.createSourceFile(file, read(file), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
}

/** Every JSX opening element in a file, with its tag and the names of its props. */
function elements(file) {
  const source = parse(file);
  const found = [];
  const visit = (node) => {
    const opening = ts.isJsxElement(node) ? node.openingElement : ts.isJsxSelfClosingElement(node) ? node : null;
    if (opening) {
      found.push({
        tag: opening.tagName.getText(source),
        props: Object.fromEntries(
          opening.attributes.properties
            .filter((p) => p.name)
            .map((p) => [p.name.getText(source), p.initializer ? p.initializer.getText(source) : 'true']),
        ),
      });
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return found;
}

/** The JSX expressions `{text}` in a file, each with whether anything above it could skip it. */
function expressions(file, text) {
  const source = parse(file);
  const found = [];
  const visit = (node) => {
    if (ts.isJsxExpression(node) && node.expression && node.expression.getText(source) === text) {
      let conditional = false;
      for (let up = node.parent; up && !ts.isReturnStatement(up); up = up.parent) {
        if (ts.isConditionalExpression(up)) conditional = true;
        if (ts.isBinaryExpression(up) && ['&&', '||', '??'].includes(up.operatorToken.getText(source))) conditional = true;
      }
      found.push({ conditional });
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return found;
}

const measured = { kind: 'measured', speedKmh: 124.8, errorKmh: 3.1 };

test('a measured reading carries its range, in the spoken sentence too', () => {
  const view = readingView(measured, 'kmh');
  assert.equal(view.kind, 'measured');
  assert.equal(view.speed, '124.8');
  assert.equal(view.unit, 'km/h');
  assert.equal(view.range, '± 3.1 km/h');
  assert.equal(view.method, 'Release to bounce');
  assert.equal(
    view.spoken,
    'Average speed, release to bounce: 124.8 kilometres per hour, plus or minus 3.1.',
  );
  // What is counted up to is exactly what is written.
  assert.equal(view.value.toFixed(view.decimals), view.speed);
  assert.equal(view.decimals, READING_DECIMALS);

  // Converted for display only, and the range rounded up in the new unit.
  const mph = readingView(measured, 'mph');
  assert.equal(mph.speed, (124.8 / 1.609344).toFixed(1));
  assert.equal(mph.range, '± 2 mph');
  assert.match(mph.spoken, /miles per hour, plus or minus 2\.$/);
  assert.equal(mph.value.toFixed(mph.decimals), mph.speed);
});

test('a delivery with no reading carries no number at all', () => {
  for (const kind of ['not-seen', 'unusable']) {
    for (const unit of ['kmh', 'mph']) {
      const view = readingView({ kind }, unit);
      assert.deepEqual(view, { kind: 'none', cause: kind });
      assert.ok(Object.values(view).every((v) => typeof v !== 'number'), `${kind} holds a number`);
    }
  }
});

test('the count never shows more than was measured', () => {
  // The count's own curve: every y control point within 0 to 1 keeps the
  // whole curve inside that band, so it settles onto 1 without passing it.
  const tokens = read('src/ui/tokens.ts');
  const [, x1, y1, x2, y2] = tokens.match(/settleCurve: \[([\d.]+), ([\d.]+), ([\d.]+), ([\d.]+)\]/).map(Number);
  for (const y of [y1, y2]) assert.ok(y >= 0 && y <= 1, `control point ${y} lets the count overshoot`);
  for (let i = 0; i <= 1000; i += 1) {
    const t = i / 1000;
    const y = 3 * (1 - t) ** 2 * t * y1 + 3 * (1 - t) * t ** 2 * y2 + t ** 3;
    assert.ok(y <= 1 + 1e-12, `the curve passes 1 at t=${t}`);
  }
  assert.ok(x1 >= 0 && x1 <= 1 && x2 >= 0 && x2 <= 1);

  // And each frame's text is held at or under the reading, even past the end.
  for (const value of [0.1, 9.95, 87.35, 124.8, 124.85, 159.99]) {
    const final = value.toFixed(1);
    assert.equal(countUpText(value, value, 1), final);
    for (let shown = -5; shown <= value * 1.5; shown += value / 97) {
      assert.ok(Number(countUpText(shown, value, 1)) <= Number(final), `${shown} of ${value}`);
    }
  }
});

test('reduced motion starts a reveal where it ends', () => {
  assert.deepEqual(revealStart(124.8, true), { shown: 124.8, landed: 1 });
  assert.deepEqual(revealStart(124.8, false), { shown: 0, landed: 0 });

  // Everything that moves reads the system setting and goes straight to final.
  for (const file of ['src/ui/motion/useReveal.ts', 'src/ui/WicketLock.tsx', 'src/ui/motion/PathDots.tsx']) {
    assert.match(read(file), /useReducedMotion\(\)/, file);
  }
  // The reading is still when it is not revealed, or when its reveal is.
  assert.match(read('src/ui/ReadingBlock.tsx'), /const still = !reveal \|\| reveal\.still;/);
  assert.match(read('src/ui/motion/useReveal.ts'), /const start = revealStart\(1, still\);/);
  const count = read('src/ui/motion/CountUpReading.tsx');
  assert.match(count, /text: countUpText\(sweptValue\(progress\.value, value\), value, decimals\)/);
  assert.match(read('src/ui/motion/PathDots.tsx'), /if \(reduced\) \{\s*drawn\.value = count;\s*return;/);
});

test('ReadingBlock cannot draw a speed without its range', () => {
  const block = read('src/ui/ReadingBlock.tsx');
  // Only a measured reading goes in, and it always carries its range.
  assert.match(block, /reading: MeasuredReading;/);
  const ranges = expressions('src/ui/ReadingBlock.tsx', 'reading.range');
  assert.equal(ranges.length, 1);
  assert.equal(ranges[0].conditional, false, 'the range is behind a condition');
  // The number is drawn only here, beside that range.
  assert.equal(expressions('src/ui/ReadingBlock.tsx', 'reading.speed').length + (block.match(/value=\{reading\.value\}/g) ?? []).length, 2);
});

test('a reading is one stop for a screen reader, and the count is not a stop of its own', () => {
  const groups = elements('src/ui/ReadingBlock.tsx').filter((e) => 'accessible' in e.props);
  assert.equal(groups.length, 1);
  assert.equal(groups[0].props.accessibilityLabel, '{reading.spoken}');
  assert.ok(!elements('src/ui/motion/CountUpReading.tsx').some((e) => 'accessible' in e.props));
  // Announced once, after it lands, and only for a reading that is arriving.
  const block = read('src/ui/ReadingBlock.tsx');
  assert.match(block, /if \(reveal && !announced\.current\) \{\s*announced\.current = true;\s*AccessibilityInfo\.announceForAccessibility\(reading\.spoken\);/);
});

test('the number counts in white and turns lime once, with the wicket', () => {
  const block = read('src/ui/ReadingBlock.tsx');
  assert.match(block, /countingColor=\{colors\.text\}\s*landedColor=\{colors\.accent\}/);
  // After the bail has fallen, over the same time the wicket takes to turn.
  const reveal = read('src/ui/motion/useReveal.ts');
  assert.match(reveal, /withDelay\(\s*motion\.lock\.bail,\s*withTiming\(1, \{ duration: motion\.lock\.colour/);
  const wicket = read('src/ui/WicketLock.tsx');
  assert.match(wicket, /withTiming\(1, \{ duration: motion\.lock\.bail, easing: SETTLE \}/);
  assert.match(wicket, /withTiming\(1, \{ duration: motion\.lock\.colour, easing: Easing\.linear \}/);
  assert.match(wicket, /Haptics\.ImpactFeedbackStyle\.Light/);
  // Once: a second lock does nothing.
  assert.match(wicket, /if \(!locked \|\| didLock\.current\) return;\s*didLock\.current = true;/);
});

test('the reading pieces take every colour and size from tokens', () => {
  for (const file of ['src/ui/ReadingBlock.tsx', 'src/ui/WicketLock.tsx']) {
    const source = read(file);
    assert.doesNotMatch(source, /#[0-9a-f]{3,8}\b/i, `${file} hardcodes a colour`);
    const styles = source.slice(source.indexOf('StyleSheet.create'));
    assert.doesNotMatch(
      styles.replace(/\bflex(Grow|Shrink)?:\s*[01]\b/g, ''),
      /:\s*-?\d+(\.\d+)?\s*[,}\n]/,
      `${file} hardcodes a size`,
    );
  }
});

test('once the count lands it holds the final reading through any later render', () => {
  const { heldText } = require('../src/ui/reading.ts');
  // React's own copy of the text: the start while counting, the reading after.
  assert.equal(heldText(false, 124.8, 1, 0), '0.0');
  assert.equal(heldText(true, 124.8, 1, 0), '124.8');
  assert.equal(heldText(true, 124.8, 1, 124.8), '124.8');

  const count = read('src/ui/motion/CountUpReading.tsx');
  // Controlled by that text, never an uncontrolled defaultValue React would
  // re-send as "0.0" on the next commit (the bug: it dropped back to zero
  // about a second after landing, when the wicket lock re-rendered Result).
  assert.match(count, /value=\{heldText\(done, value, decimals, 0\)\}/);
  assert.doesNotMatch(count, /defaultValue=/);
  // Nothing a parent re-render changes can restart the count: the reveal
  // plays once, and the screen holds one reveal for its whole life.
  const reveal = read('src/ui/motion/useReveal.ts');
  assert.match(reveal, /scheduleOnRN\(setDone, true\)/);
  assert.match(reveal, /started: started\.current/);
  assert.match(reveal, /started\.current = true;/);
  // The screen never remounts the reading with a changing key.
  assert.doesNotMatch(read('app/result.tsx'), /<ReadingBlock[^>]*\bkey=/);
});
