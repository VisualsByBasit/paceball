require('./register.cjs');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { test } = require('node:test');
const {
  FREE_ANALYSES_PER_PERIOD,
  PERIOD_MS,
  allowanceIn,
  allowanceLine,
  nextReset,
  periodIndex,
  readAllowance,
  resolveAnchor,
} = require('../src/purchases/freeLimit.ts');
const { plansIn, selectedPlan } = require('../src/purchases/offering.ts');
const { MOCK_OFFERING, offeringOnScreen } = require('../src/purchases/mockOffering.ts');
const { DEFAULT_SETTINGS, parseSettings } = require('../src/settings/settings.ts');
const {
  canAddPlayer,
  canAnalyse,
  canCompare,
  canExportWithoutWatermark,
  canRecordHighBitrate,
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

const MINUTE = 60 * 1000;
const DAY = 24 * 60 * 60 * 1000;
/** A saved delivery. `msAgo` is kept for callers that count back from `createdAt`. */
const at = (msAgo, playerId = 'me', createdAt = 0) => ({ createdAt: createdAt - msAgo, playerId });

test('the anchor is the first ever analysis, set once and never moved', () => {
  const first = Date.UTC(2026, 8, 1, 9, 30);
  const saved = [at(0, 'me', first + 3 * DAY), at(0, 'me', first), at(0, 'them', first - DAY)];

  // With nothing stored, the anchor is the oldest delivery on file, so an
  // install that already has deliveries anchors to its real first analysis.
  assert.equal(resolveAnchor(null, saved), first - DAY);
  assert.equal(resolveAnchor(null, []), null, 'no deliveries, no anchor yet');

  // Once stored it never moves, whatever turns up later.
  assert.equal(resolveAnchor(first, saved), first);
  assert.equal(resolveAnchor(first, [at(0, 'me', first - 10 * DAY)]), first);
  // An unusable stored value is not an anchor.
  assert.equal(resolveAnchor(NaN, saved), first - DAY);

  // It is kept in the app's own settings, not in the data layer.
  assert.equal(DEFAULT_SETTINGS.analysisAnchor, null);
  assert.equal(parseSettings({ analysisAnchor: first }).analysisAnchor, first);
  assert.equal(parseSettings({ analysisAnchor: 'soon' }).analysisAnchor, null);
  // The provider reads the allowance through readAllowance, driven below.
  const provider = read('src/purchases/PurchasesProvider.tsx');
  assert.match(provider, /readAllowance\(\{[\s\S]*?storedAnchor: \(\) => getSettings\(\)\.analysisAnchor,\s*saveAnchor: \(anchor\) => updateSettings\(\{ analysisAnchor: anchor \}\),/);
});

test('reading the allowance writes the anchor once, from the oldest delivery, and never moves it', async () => {
  const first = Date.UTC(2026, 8, 1, 9, 30);
  const saved = [at(0, 'me', first + DAY), at(0, 'me', first)];
  let stored = null;
  const writes = [];
  const read = () =>
    readAllowance({
      deliveries: async () => saved,
      storedAnchor: () => stored,
      saveAnchor: (anchor) => {
        writes.push(anchor);
        stored = anchor;
      },
      now: () => first + 2 * DAY,
    });

  assert.equal((await read()).used, 2);
  assert.deepEqual(writes, [first], 'written once, from the oldest delivery');
  // An older record turning up later does not move it.
  saved.push(at(0, 'me', first - 30 * DAY));
  await read();
  assert.deepEqual(writes, [first]);
  assert.equal(stored, first);

  // Nothing saved yet: no anchor, nothing written, the whole allowance left.
  const none = await readAllowance({
    deliveries: async () => [],
    storedAnchor: () => null,
    saveAnchor: () => assert.fail('no anchor without a delivery'),
    now: () => first,
  });
  assert.equal(none.left, FREE_ANALYSES_PER_PERIOD);
});

test('a second profile does not bring a second allowance', async () => {
  const anchor = Date.UTC(2026, 8, 1, 9, 30);
  // Two deliveries by one player and one by another, in the same period.
  const saved = [at(0, 'me', anchor), at(0, 'me', anchor + MINUTE), at(0, 'them', anchor + 2 * MINUTE)];
  const allowance = await readAllowance({
    deliveries: async () => saved,
    storedAnchor: () => anchor,
    saveAnchor: () => {},
    now: () => anchor + DAY,
  });
  assert.equal(allowance.used, 3);
  assert.equal(canAnalyse({ isPro: false, analysesThisPeriod: allowance.used }), false, 'switching player cannot reset it');

  // And the provider hands it every delivery, with no player filter.
  const provider = read('src/purchases/PurchasesProvider.tsx');
  assert.match(provider, /deliveries: \(\) => listSessions\(\),/);
  assert.doesNotMatch(provider, /listSessions\(\{ playerId/);
});

test('a build with a store never shows the sample offering, loading or not', () => {
  // No key: the sample, which the paywall labels as such and cannot buy from.
  assert.equal(offeringOnScreen(false, null), MOCK_OFFERING);
  // A key: the store's offering, or nothing. Never a price the app wrote.
  const live = { identifier: 'live', availablePackages: [MOCK_OFFERING.availablePackages[0]] };
  assert.equal(offeringOnScreen(true, live), live);
  assert.deepEqual(offeringOnScreen(true, null).availablePackages, [], 'still loading, or the store said nothing');
  assert.notEqual(offeringOnScreen(true, null), MOCK_OFFERING);
  // So the trial headline cannot come from the sample either.
  const plans = plansIn(offeringOnScreen(true, null));
  assert.deepEqual(plans, {});

  const provider = read('src/purchases/PurchasesProvider.tsx');
  assert.match(provider, /offering: offeringOnScreen\(configured, offering\),/);
  assert.doesNotMatch(provider, /offering \?\? MOCK_OFFERING/);
  // With nothing to render, the paywall says so and asks the store again.
  const paywall = read('app/paywall.tsx');
  assert.match(paywall, /reloadOffering\(\)/);
  assert.doesNotMatch(paywall, /stand-in prices/);
});

test('the purchase button always speaks for a plan the offering actually carries', () => {
  const order = ['annual', 'monthly'];
  const both = plansIn(MOCK_OFFERING);
  const monthlyOnly = { monthly: both.monthly };
  // Annual by default, whenever it is offered.
  assert.equal(selectedPlan(both, order, null), 'annual');
  // A pick stands while the offering carries it.
  assert.equal(selectedPlan(both, order, 'monthly'), 'monthly');
  // An offering that arrives without the default still leaves a plan to buy.
  assert.equal(selectedPlan(monthlyOnly, order, null), 'monthly');
  assert.equal(selectedPlan(monthlyOnly, order, 'annual'), 'monthly');
  assert.equal(selectedPlan({}, order, 'annual'), null);
  assert.match(read('app/paywall.tsx'), /const selected = selectedPlan\(plans, PLAN_ORDER, picked\);/);
});

test('a purchase or restore that grants Pro turns it on straight away', () => {
  const provider = read('src/purchases/PurchasesProvider.tsx');
  // Read off the customer info the store returned with the call.
  assert.match(provider, /if \(outcome\.status === 'purchased' && mounted\.current\) \{\s*setPro\(\{ active: true, expiresAt: outcome\.expiresAt, willRenew: outcome\.willRenew \}\);/);
  assert.match(provider, /if \(outcome\.status === 'restored' && mounted\.current\) \{\s*setPro\(\{ active: true, expiresAt: outcome\.expiresAt, willRenew: outcome\.willRenew \}\);/);
  // And a failed read at launch never switches off an entitlement already delivered.
  assert.doesNotMatch(provider, /setPro\(\{ active: false \}\)/);
});

test('the count resets at the period boundary and not before', () => {
  const anchor = Date.UTC(2026, 8, 1, 9, 30);
  const used = (now, deliveries) => allowanceIn(deliveries, anchor, now).used;
  const three = [at(0, 'me', anchor), at(0, 'me', anchor + DAY), at(0, 'me', anchor + 2 * DAY)];

  assert.equal(used(anchor + 3 * DAY, three), 3, 'all three are in the first period');
  assert.equal(used(anchor + PERIOD_MS - 1, three), 3, 'still spent a millisecond before');
  assert.equal(used(anchor + PERIOD_MS, three), 0, 'the new period starts clean');
  assert.equal(used(anchor + 9 * DAY, three), 0);

  // A delivery in the new period counts there, and the old ones do not.
  const later = [...three, at(0, 'me', anchor + PERIOD_MS + DAY)];
  assert.equal(used(anchor + PERIOD_MS + 2 * DAY, later), 1);
  // Every delivery on the phone counts, whoever bowled it: the allowance and
  // its anchor are the phone's, so they count the same deliveries.
  assert.equal(allowanceIn([at(0, 'them', anchor)], anchor, anchor + DAY).used, 1);
  assert.equal(
    allowanceIn([at(0, 'me', anchor), at(0, 'them', anchor + MINUTE)], anchor, anchor + DAY).used,
    2,
    'two players, one allowance',
  );
  // A record with an unusable timestamp is not counted, and does not throw.
  assert.equal(used(anchor + DAY, [{ createdAt: NaN, playerId: 'me' }]), 0);
});

test('the reset lands on the anchor weekday, period after period', () => {
  // A Tuesday.
  const anchor = Date.UTC(2026, 8, 1, 9, 30);
  assert.equal(new Date(anchor).getUTCDay(), 2);

  for (const period of [0, 1, 2, 9]) {
    const now = anchor + period * PERIOD_MS + 3 * DAY;
    const reset = nextReset(anchor, now);
    assert.equal(reset, anchor + (period + 1) * PERIOD_MS);
    assert.equal(new Date(reset).getUTCDay(), 2, 'always the anchor weekday');
    assert.equal(periodIndex(anchor, now), period);
  }
});

test('a backwards clock cannot hand out a fresh period', () => {
  const anchor = Date.UTC(2026, 8, 1, 9, 30);
  const spent = [at(0, 'me', anchor), at(0, 'me', anchor + 1), at(0, 'me', anchor + 2)];

  // Wound back before the anchor: still the first period, still spent.
  assert.equal(periodIndex(anchor, anchor - 5 * PERIOD_MS), 0);
  const back = allowanceIn(spent, anchor, anchor - 5 * PERIOD_MS);
  assert.equal(back.used, 3);
  assert.equal(back.left, 0);
  assert.equal(canAnalyse({ isPro: false, analysesThisPeriod: back.used }), false);
});

test('before the first analysis the allowance is whole, with nothing to reset', () => {
  const none = allowanceIn([], null, Date.now());
  assert.deepEqual(none, {
    used: 0,
    left: FREE_ANALYSES_PER_PERIOD,
    periodStart: null,
    nextReset: null,
  });
});

test('the third delivery is allowed and the fourth is not', () => {
  const anchor = Date.UTC(2026, 8, 1, 9, 30);
  const saved = [];
  for (let i = 1; i <= 4; i += 1) {
    const now = anchor + i * MINUTE;
    const { used, left } = allowanceIn(saved, anchor, now);
    assert.equal(canAnalyse({ isPro: false, analysesThisPeriod: used }), i <= 3, `delivery ${i}`);
    assert.equal(left, Math.max(0, 4 - i));
    saved.push(at(0, 'me', now));
  }
  // Pro is not counted at all.
  assert.equal(canAnalyse({ isPro: true, analysesThisPeriod: 99 }), true);
});

test('the allowance line counts down, then names the day it comes back', () => {
  const anchor = Date.UTC(2026, 8, 1, 9, 30);
  const weekday = (t) => new Date(t).toLocaleDateString('en-GB', { weekday: 'long', timeZone: 'UTC' });
  const lineAfter = (n) => {
    const saved = [];
    for (let i = 0; i < n; i += 1) saved.push(at(0, 'me', anchor + i * MINUTE));
    return allowanceLine(allowanceIn(saved, anchor, anchor + DAY), weekday);
  };
  assert.equal(lineAfter(0), '3 of 3 analyses left this week');
  assert.equal(lineAfter(1), '2 of 3 analyses left this week');
  assert.equal(lineAfter(3), 'All 3 come back on Tuesday', 'the anchor weekday');

  // Pro sees none of this: both screens ask isPro before building the line.
  assert.match(read('app/capture.tsx'), /const allowanceNote = isPro \? null : allowanceLine\(allowance, weekdayOf\);/);
  const settings = read('app/settings.tsx');
  const freeBranch = settings.slice(settings.indexOf('See what Paceball Pro adds'), settings.indexOf('<Section title="READINGS">'));
  assert.match(freeBranch, /allowanceLine\(allowance,/);
  const proBranch = settings.slice(settings.indexOf('Paceball Pro is active'), settings.indexOf('See what Paceball Pro adds'));
  assert.doesNotMatch(proBranch, /allowanceLine/, 'Pro is told nothing about limits');
});

test('each gate answers for a free user and for Pro', () => {
  const free = { isPro: false, analysesThisPeriod: 0 };
  const spent = { isPro: false, analysesThisPeriod: 3 };
  const pro = { isPro: true, analysesThisPeriod: 0 };

  assert.equal(canCompare(free), false);
  assert.equal(canCompare(pro), true);
  assert.equal(canAnalyse(free), true);
  assert.equal(canAnalyse(spent), false);
  assert.equal(canAnalyse({ isPro: true, analysesThisPeriod: 3 }), true);
  assert.equal(canExportWithoutWatermark(free), false);
  assert.equal(canExportWithoutWatermark(pro), true);

  // Bitrate is Pro only, and the capture code asks the gate rather than isPro.
  assert.equal(canRecordHighBitrate(free), false);
  assert.equal(canRecordHighBitrate(spent), false);
  assert.equal(canRecordHighBitrate(pro), true);
  const capture = read('app/capture.tsx');
  assert.match(capture, /canRecordHighBitrate\(entitlements\) \? highBitRate\(lastRecording\) : null/);
  assert.doesNotMatch(capture.slice(capture.indexOf('const bitRate')), /isPro \?\s*highBitRate/);

  // A player gate for the players UI that has not shipped: the phone's first
  // profile is free, a second one is Pro.
  assert.equal(canAddPlayer(free, 0), true);
  assert.equal(canAddPlayer(free, 1), false);
  assert.equal(canAddPlayer(pro, 1), true);
  assert.equal(canAddPlayer(pro, 7), true);
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
  assert.match(capture, /'Tap to see Pro\.'/);
  assert.doesNotMatch(read('src/purchases/freeLimit.ts'), /\u2014/);
  assert.doesNotMatch(read('src/purchases/mockOffering.ts'), /\u2014/);
});

test('with no key the paywall says the prices are samples and cannot buy', () => {
  const paywall = read('app/paywall.tsx');
  // The notice and the disabled button both hang off purchasesConfigured, which
  // the provider reports as `configured`, so they appear together or not at all.
  assert.match(paywall, /const sample = !configured;/);
  assert.match(paywall, /Sample prices\. The store is not connected in this build\./);
  assert.match(paywall, /\{sample \? \(\s*<Text style=\{styles\.sampleNotice\}>/);
  assert.match(paywall, /disabled=\{buying \|\| sample\}/);
  assert.match(paywall, /accessibilityState=\{\{ busy: buying, disabled: buying \|\| sample \}\}/);
  // Restore is untouched by it, and still reports unavailable on its own.
  assert.doesNotMatch(paywall, /disabled=\{restoring \|\| sample\}/);
  assert.match(paywall, /'Purchases are not set up in this build, so there is nothing to restore from\.'/);
  // `configured` is the key check, not a guess about the offering.
  const sdk = read('src/purchases/sdk.ts');
  assert.match(sdk, /export function purchasesConfigured\(\): boolean \{\s*return Boolean\(apiKey\);/);
  assert.match(read('src/purchases/PurchasesProvider.tsx'), /const configured = purchasesConfigured\(\);/);
});

test('the sample prices are plainly samples, and not dollars', () => {
  const mock = read('src/purchases/mockOffering.ts');
  // Non-dollar, so a price the paywall renders is visibly the store's text and
  // never something the screen built.
  // Set where no real store would price a plan, so a sample paywall can never
  // pass for the real one.
  assert.match(mock, /priceString: 'Rs 1\.00'/);
  assert.match(mock, /priceString: 'Rs 2\.00'/);
  assert.doesNotMatch(mock, /1,100|6,900/);
  assert.match(mock, /priceString: 'Rs 0\.00'/);
  // No dollar (or other symbol) price. The bare $ in RevenueCat's own package
  // identifiers, like $rc_monthly, is not a price.
  assert.doesNotMatch(mock, /[$€£₹¥]\s?\d/);
  assert.match(mock, /SAMPLE figures, not the real plan prices/);
});
