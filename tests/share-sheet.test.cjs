const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { test } = require('node:test');

// Normalised, because a Windows checkout converts line endings to CRLF.
const read = (file) =>
  fs.readFileSync(path.join(__dirname, '..', file), 'utf8').replace(/\r\n/g, '\n');

test('Result and Analysis open one share sheet, not two versions of it', () => {
  // The bug: Result built its own sheet (branded or clean by entitlement, no
  // way to remove the watermark), while Analysis had another with the clean
  // export beside it. Now both render the same component and nothing else.
  for (const file of ['app/result.tsx', 'app/analysis.tsx']) {
    const source = read(file);
    assert.match(source, /import \{ DeliveryShareSheet \} from '\.\.\/src\/ui\/DeliveryShareSheet';/, file);
    assert.equal((source.match(/<DeliveryShareSheet\b/g) ?? []).length, 1, file);
    assert.doesNotMatch(source, /<ShareChoice|<SessionActions|<VideoActions|CleanExport|renderExport|shareExport|saveExportToGallery/, file);
  }
  // Result opens it from "Share reading", once saved.
  const result = read('app/result.tsx');
  assert.match(result, /label="Share reading"\s+onPress=\{\(\) => setSharing\(true\)\}/);
});

test('the sheet: Image card or Video clip, create, remove the watermark, share or save', () => {
  const sheet = read('src/ui/DeliveryShareSheet.tsx');
  assert.match(sheet, /export const SHARE_TITLE = 'Share reading';/);
  assert.match(sheet, /export const CREATE_IMAGE = 'Create image';/);
  assert.match(sheet, /export const REMOVE_WATERMARK = 'Remove watermark';/);
  assert.match(sheet, /<BottomSheet visible=\{visible\} title=\{SHARE_TITLE\} onClose=\{onClose\}>/);
  const choice = read('src/ui/ShareChoice.tsx');
  assert.match(choice, /label: 'Image card'/);
  assert.match(choice, /label: 'Video clip'/);
  // Share and save only once an image exists, and each on that image.
  const made = sheet.slice(sheet.indexOf('{made ? ('));
  assert.match(made, /label="Share"/);
  assert.match(made, /shareExport\(made\.path\)/);
  assert.match(made, /label="Save to gallery"/);
  assert.match(made, /saveExportToGallery\(made\.path\)/);
  // Delete only where the caller asks for it, asked in History's words.
  assert.match(sheet, /\{onDeleted \? <DeleteAction sessionId=\{sessionId\} onDeleted=\{onDeleted\} \/> : null\}/);
  assert.match(sheet, /createDeliveryDelete\(\{/);
  assert.doesNotMatch(read('app/result.tsx').slice(read('app/result.tsx').indexOf('<DeliveryShareSheet')), /^[^\n]*onDeleted/);
  assert.doesNotMatch(sheet, /—/);
});

test('a created image is shown from its own PNG, full width and contained, above Share and Save', () => {
  const sheet = read('src/ui/DeliveryShareSheet.tsx');
  const made = sheet.slice(sheet.indexOf('{made ? ('), sheet.indexOf(') : null}', sheet.indexOf('{made ? (')));
  // The real output file, not a re-render: the path renderExport wrote.
  assert.match(sheet, /setMade\(\{ path: result\.imagePath, clean: withoutWatermark \}\)/);
  assert.match(made, /<Image\s+key=\{made\.path\}\s+source=\{\{ uri: made\.path \}\}\s+style=\{styles\.preview\}\s+resizeMode="contain"/);
  // Before the actions, so they sit under it.
  assert.ok(made.indexOf('<Image') < made.indexOf('label="Share"'));
  assert.ok(made.indexOf('label="Share"') < made.indexOf('label="Save to gallery"'));
  assert.match(sheet, /preview: \{\s*width: '100%',\s*aspectRatio: EXPORT_WIDTH \/ EXPORT_HEIGHT,/);
  // Branded or clean, whichever was made last.
  assert.match(made, /made\.clean \? 'IMAGE WITHOUT WATERMARK' : 'IMAGE WITH WATERMARK'/);
});
