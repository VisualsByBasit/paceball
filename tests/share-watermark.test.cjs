const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { test } = require('node:test');

// Normalised, because a Windows checkout converts line endings to CRLF.
const read = (file) =>
  fs.readFileSync(path.join(__dirname, '..', file), 'utf8').replace(/\r\n/g, '\n');

test('the share card is branded unless the caller says the entitlement allows otherwise', () => {
  const actions = read('src/export/SessionActions.tsx');
  // Branded by default: a caller that says nothing gets the watermark.
  assert.match(actions, /watermark = true \}/);
  assert.match(actions, /renderExport\(\{ sessionId, watermark \}\)/);
  assert.doesNotMatch(actions, /watermark: false/);
});
