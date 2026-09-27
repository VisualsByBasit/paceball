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

function assertTokensOnly(file) {
  const source = read(file);
  assert.doesNotMatch(source, /#[0-9a-f]{3,8}\b/i, `${file} hardcodes a colour`);
  const styles = source.slice(source.indexOf('StyleSheet.create'));
  assert.doesNotMatch(
    styles.replace(/\bflex(Grow|Shrink)?:\s*[01]\b/g, ''),
    /:\s*-?\d+(\.\d+)?\s*[,}\n]/,
    `${file} hardcodes a size`,
  );
}

test('a mark is lime only while it is the one in hand', () => {
  const marker = read('src/ui/FrameMarker.tsx');
  assert.match(marker, /const tint = active \? colors\.accent : colors\.text;/);
  assert.doesNotMatch(code('src/ui/FrameMarker.tsx'), /\bball\b/);
});

test('an uncertain bounce is a hollow diamond, and a guessed one is struck out and says so', () => {
  const marker = read('src/ui/FrameMarker.tsx');
  assert.match(marker, /confidence === 'uncertain' \? \(\s*<View style=\{\[styles\.diamond/);
  assert.match(marker, /confidence === 'guessed' \? \(\s*<>\s*<View style=\{\[styles\.tickH, styles\.crossA/);
  assert.match(marker, /\{confidence === 'guessed' \? 'Guessed' : label\}/);
  // Every screen that draws a bounce says how well it was seen.
  assert.match(read('app/mark.tsx'), /confidence=\{s\.key === 'bounce' \? markConfidence : undefined\}/);
  assert.match(read('app/analysis.tsx'), /confidence=\{m\.key === 'bounce' \? session\.markConfidence : undefined\}/);
  assert.match(read('app/result.tsx'), /confidence=\{confidence\}/);
});

test('the scrubber is 72 dp and never reaches a frame that is not there yet', () => {
  const strip = read('src/ui/motion/DetentStrip.tsx');
  assert.match(strip, /height: size\.detent,/);
  assert.match(strip, /const limit = Math\.max\(0, Math\.min\(count - 1, max \?\? count - 1\)\);/);
  // Every way of moving it stops at the limit: a drag, a throw, the placement
  // from outside, and a screen reader's step.
  assert.match(strip, /clamp\(x, cell \/ 2, \(last \+ 0\.5\) \* cell\)/);
  assert.match(strip, /clamp\(Math\.floor\(\(x \+ vx \* motion\.throw\) \/ cell\), 0, last\)/);
  assert.match(strip, /const x = \(clamp\(index, 0, limit\) \+ 0\.5\) \* item;/);
  assert.match(strip, /const next = clamp\(index \+ step, 0, limit\);/);
});

test('the scrubber keeps its springs, and hundreds of frames cost one moving bar', () => {
  const strip = read('src/ui/motion/DetentStrip.tsx');
  assert.match(strip, /withSpring\(clamp\(x, cell \/ 2, \(last \+ 0\.5\) \* cell\), motion\.drag\)/);
  assert.match(strip, /withSpring\(\(target \+ 0\.5\) \* cell, motion\.settle,/);
  assert.match(strip, /withSpring\(BAR_SELECTED, motion\.pop\)/);
  // The bars are drawn once and only redrawn when the reachable limit moves.
  assert.match(strip, /const Bars = memo\(function Bars/);
  const bars = strip.slice(strip.indexOf('const Bars = memo'));
  assert.doesNotMatch(bars.slice(0, bars.indexOf('const styles')), /useAnimatedStyle|Animated\./);
  // A tick for each frame crossed under the hand, as before.
  assert.match(strip, /Haptics\.selectionAsync\(\)/);
});

test('the loupe samples the real frame and appears only while a finger is down', () => {
  const loupe = read('src/ui/Loupe.tsx');
  assert.match(loupe, /width: size\.loupe,\s*height: size\.loupe,/);
  assert.match(loupe, /source=\{\{ uri \}\}/);
  assert.match(loupe, /opacity: shown\.value,/);
  // Straight on and off with the finger: nothing about it animates by itself.
  assert.doesNotMatch(code('src/ui/Loupe.tsx'), /withTiming|withSpring/);
});

test('the marking pieces take every colour and size from tokens', () => {
  for (const file of ['src/ui/FrameMarker.tsx', 'src/ui/motion/DetentStrip.tsx', 'src/ui/Loupe.tsx']) {
    assertTokensOnly(file);
  }
});
