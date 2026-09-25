import type { PurchasesIntroPrice, PurchasesPackage, PurchasesStoreProduct } from 'react-native-purchases';

/**
 * The slice of a RevenueCat package the paywall reads. Built from the SDK's own
 * types, so a real `PurchasesPackage` drops straight in when the offering is
 * fetched instead of mocked.
 */
export type PaywallPackage = Pick<PurchasesPackage, 'identifier'> & {
  product: Pick<PurchasesStoreProduct, 'identifier' | 'priceString' | 'subscriptionPeriod'> & {
    introPrice: PurchasesIntroPrice | null;
  };
};

export type PaywallOffering = {
  identifier: string;
  availablePackages: PaywallPackage[];
};

export type PlanPeriod = 'monthly' | 'annual';

/** Reads the store's ISO 8601 billing period. Anything else is not a plan this paywall offers. */
export function planPeriod(pkg: PaywallPackage): PlanPeriod | null {
  switch (pkg.product.subscriptionPeriod) {
    case 'P1M':
      return 'monthly';
    case 'P1Y':
    case 'P12M':
      return 'annual';
    default:
      return null;
  }
}

const DAYS_PER_UNIT: Record<string, number> = { DAY: 1, WEEK: 7 };

/**
 * Length of the free trial in days, or null when the package has none. Read
 * from the store, never assumed: only an intro phase that costs nothing counts,
 * and a trial measured in months is not something this screen words as days.
 */
export function trialDays(pkg: PaywallPackage): number | null {
  const intro = pkg.product.introPrice;
  if (!intro || intro.price !== 0) return null;
  const perUnit = DAYS_PER_UNIT[intro.periodUnit];
  if (perUnit === undefined || !(intro.periodNumberOfUnits > 0)) return null;
  return intro.periodNumberOfUnits * perUnit;
}

/** The monthly and annual packages, if the offering carries them. */
export function plansIn(offering: PaywallOffering): Partial<Record<PlanPeriod, PaywallPackage>> {
  const plans: Partial<Record<PlanPeriod, PaywallPackage>> = {};
  for (const pkg of offering.availablePackages) {
    const period = planPeriod(pkg);
    if (period && !plans[period]) plans[period] = pkg;
  }
  return plans;
}

/**
 * What a build with a store shows until the store has answered, or when it
 * answered with nothing: no plans, so no price the app wrote itself.
 */
export const NO_OFFERING: PaywallOffering = { identifier: 'none', availablePackages: [] };

/**
 * The plan the purchase button speaks for. The one the user picked while the
 * offering still carries it, otherwise the first in `order`, so an offering
 * that arrives without the default plan still leaves something to buy.
 */
export function selectedPlan(
  plans: Partial<Record<PlanPeriod, PaywallPackage>>,
  order: readonly PlanPeriod[],
  picked: PlanPeriod | null
): PlanPeriod | null {
  if (picked !== null && plans[picked] !== undefined) return picked;
  return order.find((period) => plans[period] !== undefined) ?? null;
}
