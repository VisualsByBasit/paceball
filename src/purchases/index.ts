import Purchases from 'react-native-purchases';
import { restoreOutcome, type RestoreOutcome } from './entitlement';

export * from './entitlement';
export * from './offering';

/**
 * Public SDK key, per platform build. Absent in a build made without one, in
 * which case nothing is configured and every call reports itself unavailable
 * rather than pretending to have reached the store.
 */
const apiKey = process.env.EXPO_PUBLIC_REVENUECAT_ANDROID_KEY?.trim();
let configured = false;

function ensureConfigured(): boolean {
  if (!apiKey) return false;
  if (!configured) {
    // Anonymous: RevenueCat keys the purchase to the store account, so there is
    // still no Paceball account to sign in to.
    Purchases.configure({ apiKey });
    configured = true;
  }
  return true;
}

export function purchasesAvailable(): boolean {
  return Boolean(apiKey);
}

/**
 * Asks Google Play for every purchase on the signed-in account and attaches
 * them to this install. The outcome is what the store sent back, so "restored"
 * only ever means Pro is active now.
 */
export async function restorePurchases(): Promise<RestoreOutcome> {
  try {
    if (!ensureConfigured()) return { status: 'unavailable' };
    return restoreOutcome(await Purchases.restorePurchases());
  } catch (e) {
    return { status: 'failed', message: e instanceof Error ? e.message : String(e) };
  }
}
