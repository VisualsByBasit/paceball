/**
 * Whether this user may compare two deliveries. Compare is a Pro feature.
 *
 * STAND-IN: returns true until the RevenueCat SDK is wired. The 'pro'
 * entitlement (PRO_ENTITLEMENT_ID) replaces this body; every entry point to
 * Compare - the History action and the screen itself - already asks here, so
 * gating is a change to this one function.
 */
export function canCompare(): boolean {
  return true;
}
