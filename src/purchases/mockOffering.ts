import { NO_OFFERING, type PaywallOffering } from './offering';

/**
 * STAND-IN until the SDK's getOfferings() is wired. Shaped exactly as RevenueCat
 * returns an offering, so the paywall reads it the same way it will read the real
 * one.
 *
 * The price strings are store-formatted text, deliberately not dollars: the
 * paywall renders whatever string the store hands it and never builds a price
 * itself, so a non-dollar mock keeps that honest while the layout is built.
 *
 * These are SAMPLE figures, not the real plan prices, and set low enough that
 * no store would ever show them: an earlier mock matched Play's real prices
 * exactly, so a sample paywall and a real one looked the same. Wherever they are shown,
 * the paywall says the store is not connected, because a sample price the user
 * takes for a real one is worse than no price at all.
 */
export const MOCK_OFFERING: PaywallOffering = {
  identifier: 'default',
  availablePackages: [
    {
      identifier: '$rc_monthly',
      product: {
        identifier: 'paceball_pro_monthly',
        priceString: 'Rs 1.00',
        subscriptionPeriod: 'P1M',
        introPrice: null,
      },
    },
    {
      identifier: '$rc_annual',
      product: {
        identifier: 'paceball_pro_annual',
        priceString: 'Rs 2.00',
        subscriptionPeriod: 'P1Y',
        introPrice: {
          price: 0,
          priceString: 'Rs 0.00',
          cycles: 1,
          period: 'P7D',
          periodUnit: 'DAY',
          periodNumberOfUnits: 7,
        },
      },
    },
  ],
};

/**
 * The offering the paywall renders. The sample one appears only in a build with
 * no RevenueCat key, where the paywall says so and cannot buy. A build with a
 * key shows the store's offering or none at all: while the store is loading, or
 * after it failed to answer, a sample price or trial on screen would read as
 * the store's own.
 */
export function offeringOnScreen(configured: boolean, live: PaywallOffering | null): PaywallOffering {
  if (!configured) return MOCK_OFFERING;
  return live ?? NO_OFFERING;
}
