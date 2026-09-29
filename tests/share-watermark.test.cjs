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

test('the share sheet makes a branded card, and a clean one only for Pro', () => {
  const sheet = read('src/ui/DeliveryShareSheet.tsx');
  // The gate decides, read from the entitlement.
  assert.match(sheet, /const entitlements = useEntitlements\(\);\s*const clean = canExportWithoutWatermark\(entitlements\);/);
  // "Create image" is the free card for a free user, and the Pro card for Pro:
  // Pro gets the Pro card from either button.
  assert.match(sheet, /onPress=\{\(\) => create\(false\)\}/);
  assert.match(sheet, /renderExport\(\{ sessionId, watermark: !\(withoutWatermark \|\| clean\), unit \}\)/);
  assert.match(sheet, /setMade\(\{ path: result\.imagePath, clean: withoutWatermark \|\| clean \}\)/);
  // "Remove watermark" sells Pro to a free user, and makes the clean card only for Pro.
  const remove = sheet.slice(sheet.indexOf('const removeWatermark = () => {'), sheet.indexOf('return (', sheet.indexOf('const removeWatermark = () => {')));
  assert.match(remove, /if \(!clean\) \{[\s\S]*?router\.push\(\{ pathname: '\/paywall', params: \{ context: 'export' \} \}\);\s*return;\s*\}\s*create\(true\);/);
  // Still only for a measured delivery, on both screens.
  assert.match(read('app/result.tsx'), /\{savedId && measured \? \(\s*<DeliveryShareSheet/);
  assert.match(read('app/analysis.tsx'), /\{measured \? \(\s*<DeliveryShareSheet/);
});
