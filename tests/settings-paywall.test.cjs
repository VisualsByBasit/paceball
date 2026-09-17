require('./register.cjs');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { test } = require('node:test');
const {
  DEFAULT_SETTINGS,
  EXPOSURE_BIAS_OPTIONS,
  parseSettings,
} = require('../src/settings/settings.ts');
const { errorIn, formatSpeed, speedIn, unitLabel } = require('../src/ui/units.ts');
const { planPeriod, plansIn, trialDays } = require('../src/purchases/offering.ts');
const { MOCK_OFFERING } = require('../src/purchases/mockOffering.ts');
const { PRO_ENTITLEMENT_ID, restoreOutcome } = require('../src/purchases/entitlement.ts');
const { LICENCE_TEXT } = require('../src/ui/licence.ts');
const { captureExposure } = require('../src/capture/exposure.ts');

const read = (file) => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');

test('settings fall back field by field, never all at once', () => {
  assert.deepEqual(parseSettings(undefined), DEFAULT_SETTINGS);
  assert.deepEqual(parseSettings('not an object'), DEFAULT_SETTINGS);
  assert.equal(DEFAULT_SETTINGS.calibrationMethod, 'stumps');
  assert.equal(DEFAULT_SETTINGS.exposureBias, -4);

  const kept = parseSettings({ calibrationMethod: 'markers', unit: 'nonsense', exposureBias: -2 });
  assert.equal(kept.calibrationMethod, 'markers', 'a valid field survives a bad neighbour');
  assert.equal(kept.unit, 'kmh');
  assert.equal(kept.exposureBias, -2);

  assert.equal(parseSettings({ calibrationMethod: 'spin' }).calibrationMethod, 'stumps');
  // Only the offered steps: a stored -2.5 or +3 is not a choice the screen can show.
  assert.equal(parseSettings({ exposureBias: -2.5 }).exposureBias, -4);
  assert.equal(parseSettings({ exposureBias: 3 }).exposureBias, -4);
  assert.ok(EXPOSURE_BIAS_OPTIONS.includes(DEFAULT_SETTINGS.exposureBias));
});

test('mph converts the speed and rounds its error range up, never down', () => {
  assert.equal(speedIn(120, 'kmh'), 120);
  assert.equal(formatSpeed(120, 'mph'), '74.6');
  assert.equal(unitLabel('mph'), 'mph');
  assert.equal(errorIn(7, 'kmh'), 7);
  // 7 km/h is 4.35 mph; showing ± 4 would claim more than was measured.
  assert.equal(errorIn(7, 'mph'), 5);
  for (let e = 1; e <= 40; e += 1) {
    assert.ok(errorIn(e, 'mph') * 1.609344 >= e, `± ${e} km/h narrowed in mph`);
  }
});

test('capture asks for the chosen exposure, still clamped to the camera', () => {
  const wide = { supportsExposureBias: true, minExposureBias: -20, maxExposureBias: 20 };
  assert.equal(captureExposure(wide), -4, 'the old default is unchanged');
  assert.equal(captureExposure(wide, -1), -1);
  assert.equal(captureExposure({ ...wide, minExposureBias: -2 }, -4), -2);
});

test('the mocked offering reads as two plans, annual carrying a 7-day trial', () => {
  const plans = plansIn(MOCK_OFFERING);
  assert.equal(planPeriod(plans.monthly), 'monthly');
  assert.equal(planPeriod(plans.annual), 'annual');
  assert.equal(trialDays(plans.annual), 7);
  assert.equal(trialDays(plans.monthly), null);

  for (const pkg of MOCK_OFFERING.availablePackages) {
    assert.equal(typeof pkg.identifier, 'string');
    assert.equal(typeof pkg.product.priceString, 'string');
    assert.equal(typeof pkg.product.subscriptionPeriod, 'string');
  }
});

test('a trial is read from the store, and only a free one counts', () => {
  const withIntro = (introPrice) => ({
    identifier: 'x',
    product: { identifier: 'x', priceString: 'x', subscriptionPeriod: 'P1Y', introPrice },
  });
  const intro = { price: 0, priceString: '', cycles: 1, period: 'P1W', periodUnit: 'WEEK', periodNumberOfUnits: 2 };
  assert.equal(trialDays(withIntro(intro)), 14);
  assert.equal(trialDays(withIntro({ ...intro, price: 1 })), null, 'a discount is not a trial');
  assert.equal(trialDays(withIntro({ ...intro, periodUnit: 'MONTH' })), null);
  assert.equal(planPeriod(withIntro(null)), 'annual');
  assert.equal(
    planPeriod({ ...withIntro(null), product: { ...withIntro(null).product, subscriptionPeriod: 'P1W' } }),
    null,
  );
});

test('restore reports what the store sent back, not that the call returned', () => {
  const info = (active) => ({ entitlements: { all: active, active } });
  assert.deepEqual(restoreOutcome(info({})), { status: 'nothing' });

  const pro = { isActive: true, expirationDate: '2027-09-16T00:00:00Z', willRenew: true };
  assert.deepEqual(restoreOutcome(info({ [PRO_ENTITLEMENT_ID]: pro })), {
    status: 'restored',
    expiresAt: pro.expirationDate,
    willRenew: true,
  });
  assert.deepEqual(
    restoreOutcome(info({ [PRO_ENTITLEMENT_ID]: { ...pro, isActive: false } })),
    { status: 'nothing' },
  );
  assert.deepEqual(restoreOutcome(info({ other: pro })), { status: 'nothing' });
});

test('the paywall never writes a price of its own', () => {
  const paywall = read('app/paywall.tsx');
  // Every figure comes from priceString. A currency sign or a price-shaped
  // number in the screen itself is a price someone typed in.
  assert.doesNotMatch(paywall, /[$€£₹¥]\s?\d/);
  assert.doesNotMatch(paywall, /\d+\.\d{2}\b/);
  assert.equal(paywall.match(/priceString/g).length, 1, 'rendered from one place only');
  // And no copy the design rules exclude.
  assert.doesNotMatch(paywall, /Upgrade to Pro|>\s*Subscribe|Not now|Continue free/);
});

test('the new screens take every colour and size from tokens', () => {
  for (const file of ['app/settings.tsx', 'app/paywall.tsx', 'app/analysis.tsx']) {
    const source = read(file);
    assert.doesNotMatch(source, /#[0-9a-f]{3,8}\b/i, `${file} hardcodes a colour`);
    const styles = source.slice(source.indexOf('StyleSheet.create'));
    // A bare number as a style value: `padding: 12`. Strings like fontWeight are
    // fine, and so are flex, flexGrow and flexShrink - layout ratios, not sizes
    // the tokens could name.
    assert.doesNotMatch(styles.replace(/\bflex(Grow|Shrink)?:\s*[01]\b/g, ''),/:\s*-?\d+(\.\d+)?\s*[,}\n]/, `${file} hardcodes a size`);
  }
});

test('the licence shown in the app is the licence in the repo', () => {
  assert.equal(LICENCE_TEXT, read('LICENSE').replace(/\r\n/g, '\n').trimEnd());
});
