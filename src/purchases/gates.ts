import { FREE_ANALYSES_PER_WEEK } from './freeLimit';

/**
 * What every gate is decided from. isPro is the 'pro' entitlement as the store
 * last reported it; analysesLast7Days is this player's saved deliveries inside
 * the rolling week.
 */
export type Entitlements = {
  isPro: boolean;
  analysesLast7Days: number;
};

/** Comparing two deliveries is Pro only. */
export function canCompare(entitlements: Entitlements): boolean {
  return entitlements.isPro;
}

/**
 * Whether another delivery can be measured. Free users get
 * FREE_ANALYSES_PER_WEEK inside the rolling week; Pro is unlimited.
 */
export function canAnalyse(entitlements: Entitlements): boolean {
  return entitlements.isPro || entitlements.analysesLast7Days < FREE_ANALYSES_PER_WEEK;
}

/** Free exports carry the Paceball watermark. Removing it is Pro only. */
export function canExportWithoutWatermark(entitlements: Entitlements): boolean {
  return entitlements.isPro;
}
