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
  for (const file of ['app/capture.tsx', 'app/setup/how-it-works.tsx', 'app/index.tsx', 'app/diagnostics.tsx']) {
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

test('the privacy screen names what leaves the phone, where it goes and when', () => {
  const privacy = read('app/diagnostics.tsx');
  assert.match(privacy, /Your videos and measurements stay on this phone\./);
  assert.match(privacy, /never uploads your videos or measurements/);
  // On the phone, except for the user's own backup, which is said beside it.
  assert.match(privacy, /Android's own backup can copy app data to your backup/);
  // Purchases: both parties named, and when each is contacted.
  assert.match(privacy, /Google Play and RevenueCat/);
  assert.match(privacy, /When the app opens, it asks RevenueCat whether this phone has Pro/);
  assert.match(privacy, /When you subscribe or restore, your purchase goes through Google Play and RevenueCat\./);
  assert.match(privacy, /never receive your videos, names or speeds/);
  // A build with no key says nothing is sent, rather than describing a store it lacks.
  assert.match(privacy, /\{purchasesConfigured\(\)\s*\?/);
  assert.match(privacy, /Purchases are not set up in this build, so nothing is sent to Google Play or RevenueCat\./);
  // Crash reports: Sentry, opt-in only.
  assert.match(privacy, /Crash reports go to Sentry only if you opt in\./);

  // Not overstated the other way: the check at launch is not dressed up as a choice.
  const howItWorks = read('app/setup/how-it-works.tsx');
  assert.doesNotMatch(howItWorks, /only if you choose it/);
  assert.match(howItWorks, /a check with RevenueCat when the app opens/);
  for (const file of ['app/diagnostics.tsx', 'app/setup/how-it-works.tsx']) {
    assert.doesNotMatch(read(file), /never leave the phone|nothing leaves/i, file);
  }
});
