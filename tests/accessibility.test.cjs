const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { test } = require('node:test');
const ts = require('typescript');

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
  const mark = read('app/mark.tsx');
  assert.match(mark.slice(mark.indexOf('onPress={() => setSelected(s.key)}')), chip);
  assert.match(mark.slice(mark.indexOf('onPress={() => setMarkConfidence(option.key)}')), chip);
  const analysis = read('app/analysis.tsx');
  assert.match(analysis.slice(analysis.indexOf('onPress={() => changeRate(r.rate)}')), chip);
  assert.match(analysis.slice(analysis.indexOf('onPress={toggleSound}')), chip);
  const capture = read('app/capture.tsx');
  assert.match(capture.slice(capture.indexOf('onPress={() => chooseLens(option)}')), chip);
  const history = read('app/history.tsx');
  assert.match(history.slice(history.indexOf('onPress={() => setRange(r.key)}')), /hitSlop=\{\{ top: space\.xs, bottom: space\.md \}\}/);
  // The picked point says so, not only by colour.
  assert.match(mark, /accessibilityState=\{\{ selected: isActive \}\}/);
});

test('the reading on Result is one stop for a screen reader, range included', () => {
  const result = read('app/result.tsx');
  assert.match(result, /accessibilityLabel=\{`Average speed to bounce, \$\{formatSpeed\(state\.speedKmh, unit\)\} \$\{unitSpoken\(unit\)\}, plus or minus \$\{errorIn\(state\.errorKmh, unit\)\}`\}/);
  // Only on the measured branch: nothing is read out for a delivery without a speed.
  const hero = result.slice(result.indexOf('<View\n          style={styles.hero}'));
  assert.ok(result.indexOf("state.kind === 'not-seen'") < result.indexOf('<View\n          style={styles.hero}'));
  assert.ok(hero.length > 0);
});

test('a trend that cannot be read says so in words, not as a function call', () => {
  const history = read('app/history.tsx');
  assert.doesNotMatch(history, /threw`\}<\/Text>/);
  assert.match(history, /Could not read your deliveries for the trend/);
});
