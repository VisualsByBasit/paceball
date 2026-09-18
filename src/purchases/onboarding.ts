/**
 * What decides whether the paywall is offered at the end of onboarding, between
 * creating the player and the first capture.
 */
export type OnboardingPaywallInput = {
  /** Settings.onboardingPaywallShown: it has been offered once already. */
  shown: boolean;
  isPro: boolean;
  /** purchasesConfigured(): this build has a RevenueCat key at all. */
  configured: boolean;
  /** The store has not answered yet, so isPro cannot be trusted either way. */
  loading: boolean;
};

/**
 * Offered once, ever. Never to Pro, never in a build that cannot sell anything,
 * and never while the entitlement is still unknown: a Pro user whose status has
 * not arrived yet must not be shown an offer for what they already have.
 */
export function shouldShowOnboardingPaywall(input: OnboardingPaywallInput): boolean {
  return !input.shown && input.configured && !input.loading && !input.isPro;
}
