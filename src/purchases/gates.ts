import { FREE_ANALYSES_PER_PERIOD } from './freeLimit';

/**
 * What every gate is decided from. isPro is the 'pro' entitlement as the store
 * last reported it; analysesThisPeriod is this player's saved deliveries inside
 * the current seven-day period, counted from the anchor.
 */
export type Entitlements = {
  isPro: boolean;
  analysesThisPeriod: number;
};

/** Comparing two deliveries is Pro only. */
export function canCompare(entitlements: Entitlements): boolean {
  return entitlements.isPro;
}

/**
 * Whether another delivery can be measured. Free users get
 * FREE_ANALYSES_PER_PERIOD inside the current period; Pro is unlimited.
 */
export function canAnalyse(entitlements: Entitlements): boolean {
  return entitlements.isPro || entitlements.analysesThisPeriod < FREE_ANALYSES_PER_PERIOD;
}

/** Free exports carry the Paceball watermark. Removing it is Pro only. */
export function canExportWithoutWatermark(entitlements: Entitlements): boolean {
  return entitlements.isPro;
}
