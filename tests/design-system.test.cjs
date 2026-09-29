const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { test } = require('node:test');

// Normalised, because a Windows checkout converts line endings to CRLF.
const read = (file) =>
  fs.readFileSync(path.join(__dirname, '..', file), 'utf8').replace(/\r\n/g, '\n');

/** The file without its comments, for asserting what the code does not do. */
const code = (file) =>
  read(file)
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');

/** The shared pieces the redesign builds every screen from. */
const SHARED = [
  'src/ui/ActionButton.tsx',
  'src/ui/Notice.tsx',
  'src/ui/BottomSheet.tsx',
  'src/ui/AppBar.tsx',
  'src/ui/DeliveryCard.tsx',
];

/** No hex colour anywhere, and no bare number as a style value. */
function assertTokensOnly(file) {
  const source = read(file);
  assert.doesNotMatch(source, /#[0-9a-f]{3,8}\b/i, `${file} hardcodes a colour`);
  const styles = source.slice(source.indexOf('StyleSheet.create'));
  assert.ok(styles.length > 0, `${file} has a stylesheet`);
  // flex, flexGrow and flexShrink are layout ratios, not sizes the tokens could name.
  assert.doesNotMatch(
    styles.replace(/\bflex(Grow|Shrink)?:\s*[01]\b/g, ''),
    /:\s*-?\d+(\.\d+)?\s*[,}\n]/,
    `${file} hardcodes a size`,
  );
}

test('every type size carries its line height', () => {
  const tokens = read('src/ui/tokens.ts');
  const block = tokens.slice(tokens.indexOf('export const type = {'), tokens.indexOf('tabular,', tokens.indexOf('export const type = {')));
  const sizes = block.split('\n').filter((line) => /fontSize:/.test(line));
  assert.ok(sizes.length >= 9, 'found the type sizes');
  for (const line of sizes) assert.match(line, /lineHeight: \d+/, line.trim());
  // Outdoors, in daylight: body is 16 on 24.
  assert.match(block, /body:\s+\{ fontSize: 16, lineHeight: 24,/);
});

test('the brief\'s tokens exist, so no screen has to invent one', () => {
  const tokens = read('src/ui/tokens.ts');
  assert.match(tokens, /control: '#626A76'/);
  for (const name of ['heroCompact', 'reading', 'button']) assert.match(tokens, new RegExp(`\\b${name}:\\s+\\{ fontSize:`));
  for (const name of ['target: 48', 'button: 56', 'record: 80', 'recordInner: 64', 'detent: 72', 'loupe: 96', 'row: 80']) {
    assert.match(tokens, new RegExp(`\\b${name},`));
  }
  assert.match(tokens, /nav: 180,/);
  assert.match(tokens, /sheet: \{ in: 220, out: 180 \}/);
  assert.match(tokens, /press: \{ in: 80, out: 120 \}/);
  assert.match(tokens, /lock: \{ bail: 180, colour: 120 \}/);
  // The purchase celebration, rebuilt at about 2.5 s at AB's request (was the brief's 1100 ms emblem).
  assert.match(tokens, /celebrate: \{[\s\S]*?total: 2500,/);
  assert.match(tokens, /standardCurve: \[0\.2, 0, 0, 1\]/);
});

test('the shared pieces take every colour and size from tokens', () => {
  for (const file of SHARED) assertTokensOnly(file);
});

test('buttons answer a press with their outline and never by scaling', () => {
  const button = read('src/ui/ActionButton.tsx');
  assert.doesNotMatch(code('src/ui/ActionButton.tsx'), /scale/);
  assert.match(button, /interpolateColor\(pressed\.value, \[0, 1\], \[look\.border, colors\.text\]\)/);
  assert.match(button, /duration: motion\.press\.in, easing: Easing\.linear/);
  assert.match(button, /duration: motion\.press\.out, easing: Easing\.linear/);
  // Lime carries bg text, never white.
  assert.match(button, /primary: \{ fill: colors\.accent, border: colors\.accent, label: colors\.bg \}/);
  // Primary is 56 high, 24 across, radius 14.
  assert.match(button, /minHeight: size\.button,\s*borderRadius: radius\.md,/);
  assert.match(button, /paddingHorizontal: space\.lg,/);
});

test('a disabled button says why in words, and a busy one says what it is doing', () => {
  const button = read('src/ui/ActionButton.tsx');
  assert.match(button, /\{disabledReason !== null \? \(\s*<Text style=\{styles\.reason\}/);
  assert.match(button, /\{busy \?\? label\}/);
  assert.match(button, /accessibilityState=\{\{ disabled, busy: busy !== null \}\}/);
});

test('a notice names its tone with a glyph and a word, and never leaves on a timer', () => {
  const notice = read('src/ui/Notice.tsx');
  for (const tone of ['info', 'caution', 'error', 'success']) {
    assert.match(notice, new RegExp(`${tone}: \\{ glyph: '[^']+', word: '[^']+',`));
  }
  assert.doesNotMatch(code('src/ui/Notice.tsx'), /setTimeout|exiting=/);
  assert.match(notice, /entering=\{FadeIn\.duration\(motion\.notice\)\}/);
});

test('a sheet is flat, closes from a 48 dp target, and waits for its exit', () => {
  const sheet = read('src/ui/BottomSheet.tsx');
  assert.doesNotMatch(code('src/ui/BottomSheet.tsx'), /shadow|elevation/i);
  assert.match(sheet, /minWidth: size\.target,\s*minHeight: size\.target,/);
  assert.match(sheet, /borderTopLeftRadius: radius\.xl,/);
  assert.match(sheet, /duration: motion\.sheet\.in/);
  assert.match(sheet, /if \(finished\) scheduleOnRN\(setMounted, false\);/);
  assert.match(sheet, /useReducedMotion\(\)/);
});
