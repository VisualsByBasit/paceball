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

export type ProStatus = { active: false } | { active: true; expiresAt: string | null; willRenew: boolean };

/**
 * The 'pro' entitlement as the store reports it. The single place the SDK's
 * customer info is turned into "this user has Pro"; nothing else reads the
 * entitlement map.
 */
export function proStatus(info: Pick<CustomerInfo, 'entitlements'> | null): ProStatus {
  const pro = info?.entitlements.active[PRO_ENTITLEMENT_ID];
  if (!pro || !pro.isActive) return { active: false };
  return { active: true, expiresAt: pro.expirationDate, willRenew: pro.willRenew };
}

/** Whether Pro is active right now, per the last customer info received. */
export function isProActive(info: Pick<CustomerInfo, 'entitlements'> | null): boolean {
  return proStatus(info).active;
}

/**
 * What a restore actually found, read off the customer info the store sent back
 * rather than assumed from the call having returned.
 */
export function restoreOutcome(info: Pick<CustomerInfo, 'entitlements'>): RestoreOutcome {
  const pro = proStatus(info);
  if (!pro.active) return { status: 'nothing' };
  return { status: 'restored', expiresAt: pro.expiresAt, willRenew: pro.willRenew };
}

export type PurchaseOutcome =
  /** The store took the purchase AND the entitlement it grants is active. */
  | { status: 'purchased'; expiresAt: string | null; willRenew: boolean }
  /**
   * The call came back without the entitlement. A purchase can be pending
   * payment, or grant something else, so this is never reported as success.
   */
  | { status: 'not-active' }
  /** The user backed out of the store sheet. Not an error to apologise for. */
  | { status: 'cancelled' }
  /** No RevenueCat key in this build, so there is no store to buy from. */
  | { status: 'unavailable' }
  | { status: 'failed'; message: string };

/**
 * Whether a purchase actually granted Pro, read off the customer info that came
 * back with it rather than inferred from the call having resolved.
 */
export function purchaseOutcome(info: Pick<CustomerInfo, 'entitlements'>): PurchaseOutcome {
  const pro = proStatus(info);
  if (!pro.active) return { status: 'not-active' };
  return { status: 'purchased', expiresAt: pro.expiresAt, willRenew: pro.willRenew };
}
