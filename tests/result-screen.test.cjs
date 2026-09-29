const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { test } = require('node:test');
const ts = require('typescript');

const FILE = 'app/result.tsx';

// Normalised, because a Windows checkout converts line endings to CRLF.
const read = (file) =>
  fs.readFileSync(path.join(__dirname, '..', file), 'utf8').replace(/\r\n/g, '\n');

function parse(file) {
  return ts.createSourceFile(file, read(file), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
}

/** Every <tag> in a file, with the names of the props it was given. */
function propsOf(file, tag) {
  const source = parse(file);
  const found = [];
  const visit = (node) => {
    const opening = ts.isJsxElement(node) ? node.openingElement : ts.isJsxSelfClosingElement(node) ? node : null;
    if (opening && opening.tagName.getText(source) === tag) {
      found.push(opening.attributes.properties.filter((p) => p.name).map((p) => p.name.getText(source)));
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return found;
}

/** The conditions a piece of JSX text sits behind, innermost first. */
function conditionsAbove(file, text) {
  const source = parse(file);
  let result = null;
  const visit = (node) => {
    if (ts.isJsxText(node) && node.getText(source).trim() === text) {
      const conditions = [];
      for (let up = node.parent; up; up = up.parent) {
        if (ts.isConditionalExpression(up)) conditions.push(up.condition.getText(source));
        if (ts.isBinaryExpression(up) && ['&&', '||', '??'].includes(up.operatorToken.getText(source))) {
          conditions.push(up.left.getText(source));
        }
      }
      result = conditions;
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return result;
}

test('a delivery without a speed renders no number, no count and no wicket', () => {
  const result = read(FILE);
  // The no-speed branch is handed the cause and nothing else it could show.
  const noSpeed = propsOf(FILE, 'NoSpeed');
  assert.equal(noSpeed.length, 1);
  assert.deepEqual(noSpeed[0].sort(), ['cause', 'onRemark', 'remarkDisabled']);
  const body = result.slice(result.indexOf('function NoSpeed('), result.indexOf('function Evidence('));
  assert.doesNotMatch(body, /ReadingBlock|WicketLock|CountUpReading|speedKmh|\.speed\b|\.range\b/);
  assert.match(body, /No speed measured/);
  assert.match(body, /The bounce was guessed\. A guess cannot produce a reading\./);
  // No line for a distance nobody can read off the marks.
  assert.match(result, /connect=\{measured\}/);
});

test('the reading counts up, lands, and then the wicket locks', () => {
  const result = read(FILE);
  assert.match(result, /<ReadingBlock\s+reading=\{view\}\s+size=\{width < size\.compactBelow \? 'heroCompact' : 'hero'\}\s+reveal=\{reveal\}\s+\/>/);
  assert.match(result, /<WicketLock locked=\{reveal\.done\} \/>/);
  assert.equal(propsOf(FILE, 'WicketLock').length, 1);
});

test('before saving the footer is Save alone; share and Record another come after', () => {
  const result = read(FILE);
  const footer = result.slice(result.indexOf('const footer = ('), result.indexOf('return (', result.indexOf('const footer = (')));
  const [savedBranch, unsavedBranch] = footer.split(/\) : \(\s*<ActionButton\s+label=\{saveStatus === 'error'/);
  assert.ok(unsavedBranch, 'found both branches');
  assert.match(savedBranch, /\{saved \? \(/);
  assert.match(savedBranch, /label="Share reading"/);
  assert.match(savedBranch, /label="Record another"/);
  assert.doesNotMatch(unsavedBranch, /Share reading|Record another/);
  assert.match(unsavedBranch, /measured \? 'Save' : 'Save without speed'/);
  // Once, and back to the camera this delivery was recorded on.
  assert.equal(result.match(/Record another/g).length, 1);
  assert.match(savedBranch, /router\.dismissTo\('\/capture'\)/);
  // No share card without a measured speed, and the reason is said in words.
  assert.match(savedBranch, /disabledReason=\{measured \? null : 'A measured reading is needed to share a speed card\.'\}/);
});

test('a delivery without a speed can still be re-marked until it is saved', () => {
  const result = read(FILE);
  assert.match(result, /cause === 'not-seen' \? 'Re-mark the bounce' : 'Re-mark the delivery'/);
  assert.match(result, /onRemark=\{saved \? null : \(\) => router\.back\(\)\}/);
  assert.match(result, /variant="text"\s+label=\{cause === 'not-seen'/);
});

test('the evidence frame says it was marked, not tracked, and puts no mark on the wrong frame', () => {
  const result = read(FILE);
  // Shown whenever the frame is, whatever the reading.
  assert.deepEqual(conditionsAbove(FILE, 'Marked, not tracked'), ['scale > 0']);
  assert.match(result, /const bounceCaption = `Bounce marked on frame \$\{bounce\.frame\}`;/);
  // Stumps and markers stay put, so they are drawn. A ball or a bowler moves,
  // so they are drawn only if they were marked on the release frame itself.
  assert.match(result, /const refsOnFrame = !spec\.sameFrame \|\| \(calA\.frame === release\.frame && calB\.frame === release\.frame\);/);
  assert.match(result, /`\$\{spec\.short\} reference marked on frame \$\{calA\.frame\}`/);
  // Straight from release to bounce, never a curve.
  assert.match(result, /pointsAlong\(\s*\{ x: release\.x \* scale, y: release\.y \* scale \},\s*\{ x: bounce\.x \* scale, y: bounce\.y \* scale \},/);
  // Read from where the saved delivery keeps its frames once they have moved.
  assert.match(result, /framesDir=\{savedFramesDir \?\? framesDir\}/);
  assert.match(result, /setSavedFramesDir\(saved\.framesDir\);/);
});

test('cautions come right after the reading, before the evidence', () => {
  const result = read(FILE);
  const reading = result.indexOf('<ReadingBlock');
  const cautions = result.indexOf('<View style={styles.cautions}>');
  const evidence = result.indexOf('<Evidence');
  const working = result.indexOf('How this was measured');
  assert.ok(reading < cautions && cautions < evidence && evidence < working);
});

test('Result takes every colour and size from tokens', () => {
  const source = read(FILE);
  assert.doesNotMatch(source, /#[0-9a-f]{3,8}\b/i, 'hardcodes a colour');
  const styles = source.slice(source.indexOf('StyleSheet.create'));
  assert.doesNotMatch(
    styles.replace(/\bflex(Grow|Shrink)?:\s*[01]\b/g, ''),
    /:\s*-?\d+(\.\d+)?\s*[,}\n]/,
    'hardcodes a size',
  );
});

test('the page scrolls fully clear of the pinned footer, and the evidence is a finished card', () => {
  const result = read(FILE);
  assert.match(result, /onLayout=\{largeText \? undefined : \(e: LayoutChangeEvent\) => setFooterHeight\(e\.nativeEvent\.layout\.height\)\}/);
  assert.match(result, /\{ paddingBottom: largeText \? insets\.bottom \+ space\.lg : footerHeight \+ space\.lg \}/);
  const at = result.indexOf('footerSticky: {');
  const sticky = result.slice(at, result.indexOf('footerInFlow', at));
  assert.match(sticky, /\.\.\.StyleSheet\.absoluteFill,\s*top: undefined,/);
  // The card and its plate; the marks inside it are untouched.
  assert.match(result, /<Text style=\{styles\.evidencePlateText\}>RELEASE FRAME<\/Text>/);
  assert.match(result, /<Text style=\{styles\.plateText\}>Marked, not tracked<\/Text>/);
  const card = result.slice(result.indexOf('  evidence: {'), result.indexOf('  evidenceHead'));
  assert.match(card, /borderRadius: radius\.xl/);
});
