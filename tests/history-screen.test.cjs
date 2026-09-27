require('./register.cjs');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { test } = require('node:test');
const { DELETE_CONFIRM, DELETE_KEEP, DELETE_MESSAGE, DELETE_TITLE } = require('../src/ui/deleteDelivery.ts');

// Normalised, because a Windows checkout converts line endings to CRLF.
const read = (file) =>
  fs.readFileSync(path.join(__dirname, '..', file), 'utf8').replace(/\r\n/g, '\n');

const HISTORY = 'app/history.tsx';

test('the delete confirmation names what goes and what each answer does', () => {
  assert.equal(DELETE_TITLE, 'Delete this delivery?');
  assert.equal(DELETE_MESSAGE, 'Its video, marks and reading will be removed from this phone.');
  assert.equal(DELETE_KEEP, 'Keep delivery');
  assert.equal(DELETE_CONFIRM, 'Delete delivery');
});

test('History lists deliveries by day as DeliveryRows, speeds only with their ranges', () => {
  const history = read(HISTORY);
  assert.match(history, /const rows = groupByDay\(loaded\.sessions, Date\.now\(\),/);
  assert.match(history, /<DeliveryRow\s+thumb=\{uri\}\s+reading=\{view\}/);
  assert.match(history, /const view = readingView\(reading, unit\);/);
  // A deleted row fades, and the rows below close the gap.
  assert.match(history, /exiting=\{FadeOut\.duration\(motion\.collapse\)\}/);
  assert.match(history, /itemLayoutAnimation=\{LinearTransition\.duration\(motion\.collapse\)\}/);
  assert.match(history, /Loading deliveries…/);
  assert.doesNotMatch(history, /ActivityIndicator|function BestBlock/);
});

test('compare starts from the top and counts down to two at the foot', () => {
  const history = read(HISTORY);
  assert.match(history, /!selecting && measuredCount >= COMPARE_COUNT \? \(\s*<Pressable\s+style=\{styles\.compareButton\}\s+onPress=\{startCompare\}/);
  assert.match(history, /\{compareFooterLabel\(picked\.length\)\}/);
  assert.match(history, /'Choose two measured deliveries'/);
  // The tab bar gives way to the compare bar while picking.
  assert.match(history, /\) : \(\s*<TabBar current="history" \/>\s*\)\}/);
});

test('History takes every colour and size from tokens', () => {
  const source = read(HISTORY);
  assert.doesNotMatch(source, /#[0-9a-f]{3,8}\b/i);
  const styles = source.slice(source.indexOf('StyleSheet.create'));
  assert.doesNotMatch(styles.replace(/\bflex(Grow|Shrink)?:\s*[01]\b/g, ''), /:\s*-?\d+(\.\d+)?\s*[,}\n]/);
});
