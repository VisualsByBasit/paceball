const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { test } = require('node:test');

// Normalised, because a Windows checkout converts line endings to CRLF.
const source = fs
  .readFileSync(path.join(__dirname, '..', 'app', 'analysis.tsx'), 'utf8')
  .replace(/\r\n/g, '\n');

/** The JSX from `start` up to and including the first `end` after it. */
function region(start, end) {
  const from = source.indexOf(start);
  assert.notEqual(from, -1, `missing: ${start}`);
  const to = source.indexOf(end, from);
  assert.notEqual(to, -1, `missing: ${end}`);
  return source.slice(from, to + end.length);
}

test('a past delivery can be shared from Analysis, but only a measured one', () => {
  assert.equal((source.match(/<SessionActions\b/g) ?? []).length, 1);

  // Both the Share button and the sheet holding SessionActions sit behind the
  // measured guard, and measured comes from measurementState, never the record.
  assert.match(source, /const state = useMemo\(\(\) => measurementState\(session\), \[session\]\);/);
  assert.match(source, /const measured = state\.kind === 'measured';/);
  assert.match(source, /\{measured \? \(\s*<Pressable\s+style=\{\[styles\.shareButton/);
  const sheet = region('{measured ? (\n        <Modal', '</Modal>');
  assert.match(sheet, /<SessionActions\b/);

  assert.doesNotMatch(source, /session\.speedKmh|session\.errorKmh/);
});

test('deleting from Analysis leaves the screen for the dead record', () => {
  const actions = region('<SessionActions', '/>');
  assert.match(actions, /sessionId=\{session\.id\}/);
  assert.match(actions, /onDeleted=\{\(\) => \{[\s\S]*onBack\(\);[\s\S]*\}\}/);
});

test('the share controls keep the stage out of the layout and use no em dashes', () => {
  // A Modal overlays the screen, so opening it takes no height from the stage.
  const sheet = region('{measured ? (\n        <Modal', '</Modal>');
  const button = region('{measured ? (\n            <Pressable', '</Pressable>');
  for (const copy of [sheet, button]) assert.doesNotMatch(copy, /—/);
});
