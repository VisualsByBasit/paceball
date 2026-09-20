require('./register.cjs');
const assert = require('node:assert/strict');
const { test } = require('node:test');

// The store layer is driven for real here rather than read as text: the native
// module is stubbed, so `sdk.ts` runs the same branches it runs on a phone.
global.__DEV__ = false;
process.env.EXPO_PUBLIC_REVENUECAT_ANDROID_KEY = 'goog_test_key';

/**
 * Stands in for the linked native module. Null is a build where
 * react-native-purchases was never linked, which is what the SDK sees there:
 * the module's default export is null and the first call on it throws.
 */
let native = null;
const reach = (name) => {
  if (!native) throw new TypeError(`Cannot read property '${name}' of null`);
  return native[name];
};
const Purchases = {};
for (const name of [
  'setLogLevel',
  'configure',
  'getOfferings',
  'getCustomerInfo',
  'purchasePackage',
  'restorePurchases',
  'addCustomerInfoUpdateListener',
  'removeCustomerInfoUpdateListener',
]) {
  Purchases[name] = (...args) => reach(name)(...args);
}

const moduleId = require.resolve('react-native-purchases');
require.cache[moduleId] = {
  id: moduleId,
  filename: moduleId,
  loaded: true,
  exports: {
    __esModule: true,
    default: Purchases,
    LOG_LEVEL: { WARN: 'WARN' },
    PURCHASES_ERROR_CODE: { PURCHASE_CANCELLED_ERROR: 'PURCHASE_CANCELLED_ERROR' },
  },
};

const sdk = require('../src/purchases/sdk.ts');

const pkg = (identifier) => ({
  identifier,
  product: { identifier, priceString: 'Rs 1,100.00', subscriptionPeriod: 'P1M', introPrice: null },
});
// What the Test Store adds on its own, named exactly what OFFERING_ID looks for.
const sandbox = { identifier: 'default', availablePackages: [pkg('sandbox_monthly')] };
// Ours, and the one the dashboard serves as current.
const ours = { identifier: 'paceball_default', availablePackages: [pkg('$rc_monthly')] };

// These run in order: the unconfigured cases first, while nothing has been
// configured yet, then the ones that need a working store.

test('a build without the native module stays unconfigured rather than throwing', async () => {
  native = null;

  // The configure call itself throws on an unlinked module, and that is caught.
  assert.equal(sdk.configurePurchases(), false);

  // Nothing downstream throws either, and none of it claims a store.
  assert.equal(await sdk.readOffering(), null, 'no offering, so the paywall mocks one');
  assert.equal(await sdk.readCustomerInfo(), null, 'no customer info, so the user is free');
  assert.deepEqual(await sdk.purchase(pkg('$rc_monthly')), { status: 'unavailable' });
  assert.deepEqual(await sdk.restorePurchases(), { status: 'unavailable' });

  // The listener is a no-op that still hands back a working unsubscribe.
  const unwatch = sdk.watchCustomerInfo(() => {
    throw new Error('nothing to listen to');
  });
  assert.equal(typeof unwatch, 'function');
  unwatch();
});

test('the current offering wins over one that merely matches the name', async () => {
  // The name the Test Store's own offering happens to use.
  assert.equal(sdk.OFFERING_ID, 'default');
  native = {
    setLogLevel: () => {},
    configure: () => {},
    getOfferings: async () => ({ all: { default: sandbox, paceball_default: ours }, current: ours }),
  };

  assert.equal(sdk.configurePurchases(), true);
  const live = await sdk.readOffering();
  assert.equal(live.offering.identifier, 'paceball_default', 'the current offering, not "default"');
  assert.deepEqual(
    live.packages.map((p) => p.identifier),
    ['$rc_monthly'],
    'and its packages, not the sandbox products',
  );
});

test('with no current offering the named one is still used', async () => {
  native.getOfferings = async () => ({ all: { default: sandbox }, current: null });
  const live = await sdk.readOffering();
  assert.equal(live.offering.identifier, 'default');

  // And with neither there is nothing to render, so the paywall mocks one.
  native.getOfferings = async () => ({ all: {}, current: null });
  assert.equal(await sdk.readOffering(), null);
});
