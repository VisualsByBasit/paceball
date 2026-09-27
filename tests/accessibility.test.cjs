require('./register.cjs');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { test } = require('node:test');
const ts = require('typescript');
const { readingView } = require('../src/ui/reading.ts');

const ROOT = path.join(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(ROOT, file), 'utf8').replace(/\r\n/g, '\n');

function sources(dir) {
  return fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true }).flatMap((entry) => {
    const rel = path.join(dir, entry.name);
    if (entry.isDirectory()) return sources(rel);
    return entry.name.endsWith('.tsx') ? [rel] : [];
  });
}

/** Every <Pressable> in a file, with the props it was given. */
function pressables(file) {
  const text = fs.readFileSync(path.join(ROOT, file), 'utf8');
  const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const found = [];
  const visit = (node) => {
    const opening = ts.isJsxElement(node) ? node.openingElement : ts.isJsxSelfClosingElement(node) ? node : null;
    if (opening && opening.tagName.getText(source) === 'Pressable') {
      const props = opening.attributes.properties.filter((p) => p.name).map((p) => p.name.getText(source));
      const { line } = source.getLineAndCharacterOfPosition(node.getStart(source));
      found.push({ line: line + 1, props });
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return found;
}

test('every control tells a screen reader what it is', () => {
  // The debug screen is a development tool that release builds redirect away from.
  const files = [...sources('app'), ...sources('src')].filter((file) => !file.endsWith('debug.tsx'));
  const missing = files.flatMap((file) =>
    pressables(file)
      .filter(({ props }) => !props.includes('accessibilityRole') && !props.includes('accessibilityElementsHidden'))
      .map(({ line }) => `${file}:${line}`),
  );
  assert.deepEqual(missing, []);
});

test('the small chips reach 48 dp under the finger without changing how they look', () => {
  // Each is about 26 dp tall; hitSlop adds to what the finger can hit and
  // nothing to what is drawn. Vertical only, so a chip never takes its
  // neighbour's taps.
  const chip = /hitSlop=\{\{ top: space\.md, bottom: space\.sm \}\}/;
  // Mark's step list and bounce confidence are no longer small chips: they are
  // drawn 48 dp tall, so they need no slop to reach it.
  const mark = read('app/mark.tsx');
  const stepPress = mark.slice(mark.indexOf('onPress={() => setSelected(s.key)}'));
  assert.match(stepPress.slice(0, stepPress.indexOf('<Text')), /style=\{\[styles\.step,/);
  assert.match(mark, /step: \{\s*flex: 1,\s*minHeight: size\.target,/);
  const confidencePress = mark.slice(mark.indexOf('onPress={() => setMarkConfidence(option.key)}'));
  assert.match(confidencePress.slice(0, confidencePress.indexOf('<Text')), /style=\{\[styles\.segment,/);
  assert.match(mark, /segment: \{\s*flex: 1,\s*minHeight: size\.target,/);
  const analysis = read('app/analysis.tsx');
  // Analysis's rate chips and sound switch are drawn 48 dp now, so they need no slop.
  assert.match(analysis, /rate: \{\s*minHeight: size\.target,/);
  // The lens choice is drawn 48 dp now, as Mark's controls are.
  const capture = read('app/capture.tsx');
  assert.match(capture, /lens: \{\s*minWidth: size\.target,\s*minHeight: size\.target,/);
  const history = read('app/history.tsx');
  assert.match(history.slice(history.indexOf('onPress={() => setRange(r.key)}')), /hitSlop=\{\{ top: space\.xs, bottom: space\.md \}\}/);
  // The picked point says so, not only by colour.
  assert.match(mark, /accessibilityState=\{\{ selected: isActive \}\}/);
});

test('the reading on Result is one stop for a screen reader, range included', () => {
  const result = read('app/result.tsx');
  const block = read('src/ui/ReadingBlock.tsx');
  // Result never writes a speed, a range or its spoken form itself: all three
  // come from readingView, and only ReadingBlock draws them.
  assert.doesNotMatch(result, /formatSpeed|speedIn\(|errorIn\(|unitSpoken/);
  assert.match(result, /const view = readingView\(state, unit\);/);
  // One stop, and what it says is the whole reading, range included.
  assert.match(block, /accessible\s+accessibilityRole="text"\s+accessibilityLabel=\{reading\.spoken\}/);
  const measured = readingView({ kind: 'measured', speedKmh: 124.8, errorKmh: 3.1 }, 'kmh');
  assert.equal(measured.spoken, 'Average speed, release to bounce: 124.8 kilometres per hour, plus or minus 3.1.');
  // Measured only: ReadingBlock takes nothing but a measured reading, Result
  // reaches it only on the measured branch, and a delivery without a speed has
  // nothing in it to read out.
  assert.match(block, /reading: MeasuredReading;/);
  assert.match(result, /\{view\.kind === 'measured' \? \(\s*<View style=\{styles\.reading\}>/);
  for (const kind of ['not-seen', 'unusable']) {
    assert.deepEqual(readingView({ kind }, 'kmh'), { kind: 'none', cause: kind });
  }
});

test('a trend that cannot be read says so in words, not as a function call', () => {
  const history = read('app/history.tsx');
  assert.doesNotMatch(history, /threw`\}<\/Text>/);
  assert.match(history, /Could not read your deliveries for the trend/);
});
