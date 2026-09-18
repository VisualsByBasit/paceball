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

/**
 * Whether another player profile can be added. Free keeps the one profile the
 * phone starts with; Pro may keep several. The gate exists for the players UI
 * that has not shipped yet, so that screen has something to ask when it does.
 */
export function canAddPlayer(entitlements: Entitlements, playerCount: number): boolean {
  return entitlements.isPro || playerCount < 1;
}

/**
 * Whether to ask the camera for a higher bitrate. Pro only, and only ever a
 * cleaner encode of the same frames: the resolution and the frame rate the
 * measurement reads are untouched by it.
 */
export function canRecordHighBitrate(entitlements: Entitlements): boolean {
  return entitlements.isPro;
}

/** Free exports carry the Paceball watermark. Removing it is Pro only. */
export function canExportWithoutWatermark(entitlements: Entitlements): boolean {
  return entitlements.isPro;
}
