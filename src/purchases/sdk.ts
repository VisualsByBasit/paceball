import Purchases, {
  LOG_LEVEL,
  PURCHASES_ERROR_CODE,
  type CustomerInfo,
  type PurchasesPackage,
} from 'react-native-purchases';
import {
  purchaseOutcome,
  restoreOutcome,
  type PurchaseOutcome,
  type RestoreOutcome,
} from './entitlement';
import type { PaywallOffering } from './offering';

/**
 * Public SDK key for this build. Absent while no key has been issued, in which
 * case nothing is configured: the paywall falls back to the mock offering, the
 * user is treated as free, and every store call reports itself unavailable
 * rather than pretending to have reached Google Play.
 */
const apiKey = process.env.EXPO_PUBLIC_REVENUECAT_ANDROID_KEY?.trim();

/** The offering configured in RevenueCat. Its packages carry the real prices. */
export const OFFERING_ID = 'default';

let configured = false;

export function purchasesConfigured(): boolean {
  return Boolean(apiKey);
}

/**
 * Configures the SDK once, on first use. Anonymous: RevenueCat keys the
 * purchase to the Google account, so there is still no Paceball account.
 */
export function configurePurchases(): boolean {
  if (!apiKey) return false;
  if (!configured) {
    if (__DEV__) void Purchases.setLogLevel(LOG_LEVEL.WARN);
    Purchases.configure({ apiKey });
    configured = true;
  }
  return true;
}

/** Fires whenever the store changes what this user is entitled to. */
export function watchCustomerInfo(listener: (info: CustomerInfo) => void): () => void {
  if (!configurePurchases()) return () => {};
  Purchases.addCustomerInfoUpdateListener(listener);
  return () => {
    Purchases.removeCustomerInfoUpdateListener(listener);
  };
}

/** The customer info as the store has it, or null when there is no store to ask. */
export async function readCustomerInfo(): Promise<CustomerInfo | null> {
  if (!configurePurchases()) return null;
  return Purchases.getCustomerInfo();
}

/**
 * The live offering, with the store's own localised prices. Returns null when
 * purchases are not configured, so the caller can fall back to the mock rather
 * than showing a price this app invented.
 */
export async function readOffering(): Promise<{
  offering: PaywallOffering;
  packages: PurchasesPackage[];
} | null> {
  if (!configurePurchases()) return null;
  const offerings = await Purchases.getOfferings();
  const offering = offerings.all[OFFERING_ID] ?? offerings.current;
  if (!offering) return null;
  return {
    // A PurchasesPackage already satisfies PaywallPackage, so the paywall reads
    // the live offering exactly as it reads the mock.
    offering: { identifier: offering.identifier, availablePackages: offering.availablePackages },
    packages: offering.availablePackages,
  };
}

function message(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

/** Whether the store error is the user having backed out of the purchase sheet. */
function cancelled(e: unknown): boolean {
  if (typeof e !== 'object' || e === null) return false;
  const error = e as { code?: string; userCancelled?: boolean | null };
  return error.userCancelled === true || error.code === PURCHASES_ERROR_CODE.PURCHASE_CANCELLED_ERROR;
}

/**
 * Buys a package and reports what the store actually returned. A resolved call
 * is not success: the customer info that came back has to carry the 'pro'
 * entitlement before this says purchased.
 */
export async function purchase(pkg: PurchasesPackage): Promise<PurchaseOutcome> {
  try {
    if (!configurePurchases()) return { status: 'unavailable' };
    const result = await Purchases.purchasePackage(pkg);
    return purchaseOutcome(result.customerInfo);
  } catch (e) {
    if (cancelled(e)) return { status: 'cancelled' };
    return { status: 'failed', message: message(e) };
  }
}

/**
 * Asks Google Play for every purchase on the signed-in account and attaches
 * them to this install. "restored" only ever means Pro is active now.
 */
export async function restorePurchases(): Promise<RestoreOutcome> {
  try {
    if (!configurePurchases()) return { status: 'unavailable' };
    return restoreOutcome(await Purchases.restorePurchases());
  } catch (e) {
    return { status: 'failed', message: message(e) };
  }
}

/** Google Play's own subscription settings, where a subscription is managed. */
export const MANAGE_SUBSCRIPTION_URL = 'https://play.google.com/store/account/subscriptions';
