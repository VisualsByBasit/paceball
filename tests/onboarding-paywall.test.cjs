require('./register.cjs');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { test } = require('node:test');
const { shouldShowOnboardingPaywall } = require('../src/purchases/onboarding.ts');
const { DEFAULT_SETTINGS, parseSettings } = require('../src/settings/settings.ts');

// Normalised, because a Windows checkout converts line endings to CRLF.
const read = (file) =>
  fs.readFileSync(path.join(__dirname, '..', file), 'utf8').replace(/\r\n/g, '\n');

const fresh = { shown: false, isPro: false, configured: true, loading: false };

test('the onboarding paywall is shown once and only once', () => {
  // A fresh install has not seen it, and a free user with a working store gets it.
  assert.equal(DEFAULT_SETTINGS.onboardingPaywallShown, false);
  let settings = parseSettings({});
  assert.equal(shouldShowOnboardingPaywall({ ...fresh, shown: settings.onboardingPaywallShown }), true);

  // Showing it records that it was shown, and the stored flag survives a reload.
  settings = parseSettings(JSON.parse(JSON.stringify({ ...settings, onboardingPaywallShown: true })));
  assert.equal(settings.onboardingPaywallShown, true);
  assert.equal(shouldShowOnboardingPaywall({ ...fresh, shown: settings.onboardingPaywallShown }), false);

  // Only a real true counts as shown; junk reads as not shown rather than throwing.
  assert.equal(parseSettings({ onboardingPaywallShown: 'yes' }).onboardingPaywallShown, false);

  // The flag is written before the paywall opens, so buying, skipping and
  // closing the app on it all count as the one showing.
  const camera = read('app/setup/camera.tsx');
  assert.match(
    camera,
    /if \(offerPro\) \{[\s\S]*?updateSettings\(\{ onboardingPaywallShown: true \}\);[\s\S]*?router\.push\(\{ pathname: '\/paywall', params: \{ context: 'onboarding' \} \}\);/,
  );
  assert.match(camera, /shown: getSettings\(\)\.onboardingPaywallShown,/);
  // Nothing ever sets it back.
  for (const file of ['app/paywall.tsx', 'app/settings.tsx', 'app/setup/camera.tsx', 'app/capture.tsx']) {
    assert.doesNotMatch(read(file), /onboardingPaywallShown: false/, file);
  }
});

test('skipping the onboarding paywall leaves the user free and moves on to the camera', () => {
  const paywall = read('app/paywall.tsx');
  // The dismiss only navigates: on to capture, buying and restoring nothing.
  assert.match(paywall, /if \(context === 'onboarding'\) router\.replace\('\/capture'\);\s*else router\.back\(\);/);
  assert.match(paywall, /onPress=\{leave\}/);
  const leave = paywall.slice(paywall.indexOf('const leave = useCallback'), paywall.indexOf('const restored ='));
  assert.ok(leave.length > 0);
  assert.doesNotMatch(leave, /purchase|restore|updateSettings/);
  // And it is plainly there, not small print.
  assert.match(paywall, /context === 'onboarding' && styles\.dismissOutlined/);
  assert.match(paywall, /dismiss: 'Start with the free plan'/);
});

test('the onboarding copy leads with what Pro gives, not a limit', () => {
  const paywall = read('app/paywall.tsx');
  assert.match(paywall, /^  onboarding: \{/m);
  assert.match(paywall, /raw === 'onboarding'/);
  const start = paywall.indexOf('  onboarding: {');
  const copy = paywall.slice(start, paywall.indexOf('},', start));
  assert.doesNotMatch(copy, /limit|allowance|left this week|run out|\d+ free/i);
  assert.doesNotMatch(copy, /—/);
  assert.doesNotMatch(copy, /Upgrade to Pro|Not now|Continue free/);
});

test('a Pro user never sees the onboarding paywall', () => {
  assert.equal(shouldShowOnboardingPaywall({ ...fresh, isPro: true }), false);
  // Nor while the store has not yet said whether they are Pro.
  assert.equal(shouldShowOnboardingPaywall({ ...fresh, loading: true }), false);
  assert.match(read('app/setup/camera.tsx'), /const \{ isPro, configured, loading \} = usePurchases\(\);/);
});

test('the onboarding paywall is not shown when purchases are unconfigured', () => {
  assert.equal(shouldShowOnboardingPaywall({ ...fresh, configured: false }), false);
  // `configured` is the provider's purchasesConfigured(), not a guess.
  assert.match(read('src/purchases/PurchasesProvider.tsx'), /const configured = purchasesConfigured\(\);/);
  // Not offered, for whatever reason, setup goes straight to the camera.
  assert.match(read('app/setup/camera.tsx'), /\} else \{\s*router\.push\('\/capture'\);/);
});
