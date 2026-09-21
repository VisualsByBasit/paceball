const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { test } = require('node:test');

const root = path.join(__dirname, '..');
const appJson = () => JSON.parse(fs.readFileSync(path.join(root, 'app.json'), 'utf8')).expo;

test('the UI is locked to portrait', () => {
  // Nothing was built for landscape: rotating hid the frame on Mark and the
  // shutter on Capture. This locks the UI only. Clips are still recorded and
  // marked in whatever orientation the phone was held in, which the export and
  // frame tests cover separately.
  assert.equal(appJson().orientation, 'portrait');
});
