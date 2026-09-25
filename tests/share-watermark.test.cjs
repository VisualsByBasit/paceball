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

test('Result shares a clean card for Pro and a branded one for everyone else', () => {
  const result = read('app/result.tsx');
  // The gate decides, read from the entitlement when the card is made.
  assert.match(result, /<SessionActions\s+sessionId=\{savedId\}\s+watermark=\{!canExportWithoutWatermark\(entitlements\)\}\s*\/>/);
  assert.match(result, /const entitlements = useEntitlements\(\);/);
  // Still only for a measured delivery.
  assert.match(result, /\{savedId && measured \? \(/);
  // Analysis keeps its branded card beside the separate clean export.
  const analysis = read('app/analysis.tsx');
  const actions = analysis.slice(analysis.indexOf('<SessionActions'), analysis.indexOf('/>', analysis.indexOf('<SessionActions')));
  assert.doesNotMatch(actions, /watermark/);
});
