/**
 * The one hand-off between the paywall and the purchase celebration.
 *
 * The paywall arms it only in the branch where the store has confirmed the
 * purchase with the pro entitlement active, then opens the route. The route
 * reads it and clears it, so it shows once per confirmed purchase. Opened any
 * other way (a link, Back into it, a restore, a tap that did not end in a
 * purchase) there is nothing armed and it shows nothing.
 *
 * Module state rather than a route param, so the route cannot be summoned by
 * naming it.
 */

/** What sent the user to the paywall, and so where the celebration returns them. */
export type CelebrationFrom = 'export' | 'limit' | 'compare' | 'pro' | 'onboarding';

let armed: CelebrationFrom | null = null;

/** Called by the paywall once the store has confirmed Pro, and nowhere else. */
export function armCelebration(from: CelebrationFrom): void {
  armed = from;
}

/** What is armed, without clearing it: safe to read more than once while mounting. */
export function armedCelebration(): CelebrationFrom | null {
  return armed;
}

/** Spends it, so it cannot be shown again. */
export function clearCelebration(): void {
  armed = null;
}

/**
 * The button back to what started the purchase. The camera for the limit and
 * for onboarding, which never had a screen of its own to go back to.
 */
export function celebrationExit(from: CelebrationFrom): {
  label: string;
  to: 'capture' | 'back';
} {
  switch (from) {
    case 'onboarding':
      return { label: "Let's bowl", to: 'capture' };
    case 'limit':
      return { label: "Let's bowl", to: 'back' };
    case 'export':
      return { label: 'Continue export', to: 'back' };
    case 'compare':
      return { label: 'Compare deliveries', to: 'back' };
    case 'pro':
      return { label: 'Done', to: 'back' };
  }
}
