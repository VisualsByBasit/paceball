require('./register.cjs');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { test } = require('node:test');
const {
  FREE_ANALYSES_PER_WEEK,
  FREE_WINDOW_MS,
  analysesInWindow,
  freeAnalysesLeft,
} = require('../src/purchases/freeLimit.ts');
const {
  canAnalyse,
  canCompare,
  canExportWithoutWatermark,
} = require('../src/purchases/gates.ts');
const {
  PRO_ENTITLEMENT_ID,
  isProActive,
  purchaseOutcome,
  restoreOutcome,
} = require('../src/purchases/entitlement.ts');

// Normalised, because a Windows checkout converts line endings to CRLF.
const read = (file) =>
  fs.readFileSync(path.join(__dirname, '..', file), 'utf8').replace(/\r\n/g, '\n');

const NOW = Date.UTC(2026, 8, 18, 12, 0, 0);
const at = (msAgo, playerId = 'me') => ({ createdAt: NOW - msAgo, playerId });
const MINUTE = 60 * 1000;

test('the weekly count takes only this player, inside the rolling window', () => {
  assert.equal(FREE_ANALYSES_PER_WEEK, 3);
  assert.equal(analysesInWindow([], NOW, 'me'), 0);
  assert.equal(analysesInWindow([at(MINUTE)], NOW, null), 0, 'no player, no count');

  // Another bowler's deliveries are not this bowler's allowance.
  const mixed = [at(MINUTE), at(2 * MINUTE, 'them'), at(3 * MINUTE)];
  assert.equal(analysesInWindow(mixed, NOW, 'me'), 2);
  assert.equal(analysesInWindow(mixed, NOW, 'them'), 1);

  // A record with an unusable timestamp is not counted, and does not throw.
  assert.equal(analysesInWindow([{ createdAt: NaN, playerId: 'me' }], NOW, 'me'), 0);
});

test('the window edge is exclusive, so the allowance comes back after 7 days', () => {
  const justInside = analysesInWindow([at(FREE_WINDOW_MS - 1)], NOW, 'me');
  const exactly = analysesInWindow([at(FREE_WINDOW_MS)], NOW, 'me');
  const justOutside = analysesInWindow([at(FREE_WINDOW_MS + 1)], NOW, 'me');
  assert.equal(justInside, 1, 'a millisecond inside still counts');
  assert.equal(exactly, 0, 'exactly seven days old has left the window');
  assert.equal(justOutside, 0);

  // A clock ahead of the window must not hand back free analyses.
  assert.equal(analysesInWindow([at(-MINUTE)], NOW, 'me'), 1);
});

test('the third delivery is allowed and the fourth is not', () => {
  const free = (used) => ({ isPro: false, analysesLast7Days: used });
  const saved = [];
  for (let i = 1; i <= 4; i += 1) {
    const used = analysesInWindow(saved, NOW, 'me');
    const allowed = canAnalyse(free(used));
    assert.equal(allowed, i <= 3, `delivery ${i}`);
    saved.push(at(i * MINUTE));
  }

  assert.equal(freeAnalysesLeft(0), 3);
  assert.equal(freeAnalysesLeft(2), 1);
  assert.equal(freeAnalysesLeft(3), 0);
  assert.equal(freeAnalysesLeft(9), 0, 'never negative');

  // Pro is not counted at all.
  assert.equal(canAnalyse({ isPro: true, analysesLast7Days: 99 }), true);
});

test('each gate answers for a free user and for Pro', () => {
  const free = { isPro: false, analysesLast7Days: 0 };
  const spent = { isPro: false, analysesLast7Days: 3 };
  const pro = { isPro: true, analysesLast7Days: 0 };

  assert.equal(canCompare(free), false);
  assert.equal(canCompare(pro), true);
  assert.equal(canAnalyse(free), true);
  assert.equal(canAnalyse(spent), false);
  assert.equal(canAnalyse({ isPro: true, analysesLast7Days: 3 }), true);
  assert.equal(canExportWithoutWatermark(free), false);
  assert.equal(canExportWithoutWatermark(pro), true);
});

test('Pro is read off the entitlement the store sent, never assumed', () => {
  const info = (active) => ({ entitlements: { all: active, active } });
  const pro = { isActive: true, expirationDate: '2027-09-18T00:00:00Z', willRenew: true };

  assert.equal(isProActive(null), false, 'no customer info is not Pro');
  assert.equal(isProActive(info({})), false);
  assert.equal(isProActive(info({ other: pro })), false, 'another entitlement is not Pro');
  assert.equal(isProActive(info({ [PRO_ENTITLEMENT_ID]: { ...pro, isActive: false } })), false);
  assert.equal(isProActive(info({ [PRO_ENTITLEMENT_ID]: pro })), true);

  // A purchase that came back without the entitlement is not a success.
  assert.deepEqual(purchaseOutcome(info({})), { status: 'not-active' });
  assert.deepEqual(purchaseOutcome(info({ [PRO_ENTITLEMENT_ID]: pro })), {
    status: 'purchased',
    expiresAt: pro.expirationDate,
    willRenew: true,
  });
  assert.deepEqual(restoreOutcome(info({})), { status: 'nothing' });
});

test('the store layer reports cancellation and never claims an unchecked success', () => {
  const sdk = read('src/purchases/sdk.ts');
  // Success comes from the returned customer info, not from the call resolving.
  assert.match(sdk, /const result = await Purchases\.purchasePackage\(pkg\);\s*return purchaseOutcome\(result\.customerInfo\);/);
  assert.match(sdk, /if \(cancelled\(e\)\) return \{ status: 'cancelled' \};/);
  assert.match(sdk, /PURCHASES_ERROR_CODE\.PURCHASE_CANCELLED_ERROR/);
  // Without a key there is no store, so calls say so instead of pretending.
  assert.match(sdk, /if \(!configurePurchases\(\)\) return \{ status: 'unavailable' \};/);
  assert.match(sdk, /process\.env\.EXPO_PUBLIC_REVENUECAT_ANDROID_KEY/);

  // The entitlement is kept current by the SDK's listener, not only at startup.
  const provider = read('src/purchases/PurchasesProvider.tsx');
  assert.match(provider, /watchCustomerInfo\(\(info\) => \{\s*if \(alive\) setPro\(proStatus\(info\)\);/);
  assert.match(provider, /const live = packages\.current\.get\(pkg\.identifier\);/);
});

test('every trigger routes to the paywall with its own context', () => {
  const triggers = [
    ['app/capture.tsx', 'limit'],
    ['app/analysis.tsx', 'export'],
    ['app/history.tsx', 'compare'],
    ['app/settings.tsx', 'pro'],
  ];
  for (const [file, context] of triggers) {
    const source = read(file);
    assert.match(
      source,
      new RegExp(`pathname: '/paywall', params: \\{ context: '${context}' \\}`),
      `${file} opens the paywall with context '${context}'`,
    );
  }

  // Each trigger asks its own gate first.
  assert.match(read('app/capture.tsx'), /const allowed = canAnalyse\(entitlements\);/);
  assert.match(read('app/analysis.tsx'), /if \(!canExportWithoutWatermark\(entitlements\)\) \{/);
  assert.match(read('app/history.tsx'), /if \(!canCompare\(entitlements\)\) \{/);
  // The Settings row is there whatever the entitlement, so Pro can be found.
  assert.match(read('app/settings.tsx'), /<Section title="PACEBALL PRO">/);
  assert.match(read('app/settings.tsx'), /MANAGE_SUBSCRIPTION_URL/);

  // And the paywall has copy for each of them.
  const paywall = read('app/paywall.tsx');
  for (const context of ['export', 'limit', 'compare', 'pro']) {
    assert.match(paywall, new RegExp(`^  ${context}: \\{`, 'm'), `paywall copy for '${context}'`);
  }
});

test('the paywall renders the offering it was given, and no price of its own', () => {
  const paywall = read('app/paywall.tsx');
  assert.doesNotMatch(paywall, /[$€£₹¥]\s?\d/);
  assert.doesNotMatch(paywall, /\d+\.\d{2}\b/);
  // The offering comes from the provider: the store's when configured, the mock
  // when not. The paywall itself never picks one.
  assert.match(paywall, /const plans = useMemo\(\(\) => plansIn\(offering\), \[offering\]\);/);
  assert.doesNotMatch(paywall, /MOCK_OFFERING/);
  // Annual first, so it is preselected, and the trial is whatever the store says.
  assert.match(paywall, /const PLAN_ORDER: PlanPeriod\[\] = \['annual', 'monthly'\];/);
  assert.match(paywall, /trialDays\(/);
});

test('the dev override cannot be reached outside __DEV__', () => {
  const debug = read('app/debug.tsx');
  // The only render of the override is guarded by __DEV__, which is a
  // compile-time constant, so a production bundle drops the branch.
  assert.equal((debug.match(/<ProOverride\b/g) ?? []).length, 1);
  assert.match(debug, /\{__DEV__ \? <ProOverride \/> : null\}/);

  // And the provider refuses it even if something rendered it anyway.
  const provider = read('src/purchases/PurchasesProvider.tsx');
  assert.match(provider, /if \(!__DEV__\) return;\s*setDevOverrideState\(value\);/);
  assert.match(provider, /const override = __DEV__ \? devOverride : null;/);
  assert.match(provider, /devOverride: __DEV__ \? devOverride : null,/);
  // No other screen can force the entitlement.
  for (const file of ['app/paywall.tsx', 'app/settings.tsx', 'app/capture.tsx', 'app/history.tsx']) {
    assert.doesNotMatch(read(file), /setDevOverride/, file);
  }
});

test('the new copy uses no em dashes', () => {
  for (const file of [
    'src/purchases/freeLimit.ts',
    'src/purchases/gates.ts',
    'src/purchases/sdk.ts',
    'src/purchases/PurchasesProvider.tsx',
  ]) {
    assert.doesNotMatch(read(file), /—/, file);
  }

  // The copy added to each screen this task touched.
  const paywall = read('app/paywall.tsx');
  const proCopy = paywall.slice(paywall.indexOf('  pro: {'), paywall.indexOf('};', paywall.indexOf('  pro: {')));
  assert.doesNotMatch(proCopy, /—/);
  assert.doesNotMatch(paywall.slice(paywall.indexOf('function purchaseNote')), /—/);

  const settings = read('app/settings.tsx');
  const proSection = settings.slice(
    settings.indexOf('<Section title="PACEBALL PRO">'),
    settings.indexOf('<Section title="READINGS">'),
  );
  assert.ok(proSection.length > 0);
  assert.doesNotMatch(proSection, /—/);

  const analysis = read('app/analysis.tsx');
  const cleanExport = analysis.slice(
    analysis.indexOf('function CleanExport'),
    analysis.indexOf('function Stat('),
  );
  assert.ok(cleanExport.length > 0);
  assert.doesNotMatch(cleanExport, /—/);

  const capture = read('app/capture.tsx');
  assert.match(capture, /That's your free analyses for this week\. Tap to see Pro\./);
});
