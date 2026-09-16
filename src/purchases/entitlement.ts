import type { CustomerInfo } from 'react-native-purchases';

/**
 * The RevenueCat entitlement that removes the watermark and the analysis limit.
 * Has to match the identifier configured in the RevenueCat dashboard.
 */
export const PRO_ENTITLEMENT_ID = 'pro';

export type RestoreOutcome =
  /** The store had a purchase, and it grants Pro now. */
  | { status: 'restored'; expiresAt: string | null; willRenew: boolean }
  /** The store answered, and nothing on this account grants Pro. */
  | { status: 'nothing' }
  /** This build has no RevenueCat key, so there is no store to ask. */
  | { status: 'unavailable' }
  | { status: 'failed'; message: string };

/**
 * What a restore actually found, read off the customer info the store sent back
 * rather than assumed from the call having returned.
 */
export function restoreOutcome(info: Pick<CustomerInfo, 'entitlements'>): RestoreOutcome {
  const pro = info.entitlements.active[PRO_ENTITLEMENT_ID];
  if (!pro || !pro.isActive) return { status: 'nothing' };
  return { status: 'restored', expiresAt: pro.expirationDate, willRenew: pro.willRenew };
}
