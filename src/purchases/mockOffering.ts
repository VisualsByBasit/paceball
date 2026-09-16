import type { PaywallOffering } from './offering';

/**
 * STAND-IN until the SDK's getOfferings() is wired. Shaped exactly as RevenueCat
 * returns an offering, so the paywall reads it the same way it will read the real
 * one.
 *
 * The price strings are store-formatted text, deliberately not dollars: the
 * paywall renders whatever string the store hands it and never builds a price
 * itself, so a non-dollar mock keeps that honest while the layout is built.
 */
export const MOCK_OFFERING: PaywallOffering = {
  identifier: 'default',
  availablePackages: [
    {
      identifier: '$rc_monthly',
      product: {
        identifier: 'paceball_pro_monthly',
        priceString: '₹199.00',
        subscriptionPeriod: 'P1M',
        introPrice: null,
      },
    },
    {
      identifier: '$rc_annual',
      product: {
        identifier: 'paceball_pro_annual',
        priceString: '₹1,499.00',
        subscriptionPeriod: 'P1Y',
        introPrice: {
          price: 0,
          priceString: '₹0.00',
          cycles: 1,
          period: 'P7D',
          periodUnit: 'DAY',
          periodNumberOfUnits: 7,
        },
      },
    },
  ],
};
