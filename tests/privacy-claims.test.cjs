const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { test } = require('node:test');

const read = (file) => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');

/**
 * Opted-in crash reports go to Sentry and purchases go through RevenueCat, so
 * "nothing leaves" and "no uploads" are no longer true. The claim that is true
 * is narrower and stronger: Paceball never uploads videos or measurements.
 */
test('no screen claims that nothing at all leaves the phone', () => {
  for (const file of ['app/capture.tsx', 'app/setup/how-it-works.tsx', 'app/index.tsx']) {
    const source = read(file);
    assert.doesNotMatch(source, /Nothing leaves/i, file);
    assert.doesNotMatch(source, /no upload|UPLOADS.{0,2}EVER/i, file);
    assert.doesNotMatch(source, /Everything stays on this phone/i, file);
  }
});

test('the specific promise is made, with what can leave named beside it', () => {
  const howItWorks = read('app/setup/how-it-works.tsx');
  assert.match(howItWorks, /never uploads your videos or measurements/);
  assert.match(howItWorks, /crash reports if you turn them on/);
  assert.match(howItWorks, /RevenueCat/);
  assert.match(read('app/capture.tsx'), /never uploads\s+your videos or measurements/);
});
