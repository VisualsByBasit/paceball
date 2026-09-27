import type { PlanPeriod } from '../purchases/offering';

/**
 * The words around a price. The price itself is the store's own string, passed
 * in as it came; nothing here writes a figure.
 *
 * Only the annual plan is ever worded with a trial, and only when the store
 * reports one. Monthly never is, whatever it is handed.
 */
export function planTerms(period: PlanPeriod, price: string, trial: number | null): string {
  if (period === 'monthly') return `${price}/month`;
  return trial === null ? `${price}/year` : `${trial} days free, then ${price}/year`;
}

/** What the purchase button says, for the plan actually selected. Null with none to buy. */
export function ctaFor(selected: PlanPeriod | null, annualTrial: number | null): string | null {
  if (selected === null) return null;
  if (selected === 'monthly') return 'Start Pro monthly';
  return annualTrial === null ? 'Start Pro yearly' : `Start my ${annualTrial} days free`;
}

/** The line under the button: when the first charge comes, and how to stop it. */
export function renewalLine(trial: number | null): string {
  return trial === null
    ? 'Renews automatically. Cancel anytime in Google Play.'
    : 'No charge today. Renews automatically after the trial unless you cancel in Google Play.';
}
