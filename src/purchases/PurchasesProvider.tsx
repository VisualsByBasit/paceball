import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import type { PurchasesPackage } from 'react-native-purchases';
import { listSessions } from '../data';
import { proStatus, type ProStatus, type PurchaseOutcome, type RestoreOutcome } from './entitlement';
import { FREE_ANALYSES_PER_PERIOD, readAllowance, type Allowance } from './freeLimit';
import { offeringOnScreen } from './mockOffering';
import { getSettings, updateSettings } from '../settings';
import type { PaywallOffering, PaywallPackage } from './offering';
import {
  purchase as purchaseWithStore,
  purchasesConfigured,
  readCustomerInfo,
  readOffering,
  restorePurchases,
  watchCustomerInfo,
} from './sdk';

export type Purchases = {
  /** The 'pro' entitlement, as the store last reported it. */
  isPro: boolean;
  /** Renewal detail for a Pro user, for the status line in Settings. */
  pro: ProStatus;
  /**
   * The offering to render. The store's when configured, and empty until the
   * store has answered with one; the sample offering only when not configured.
   */
  offering: PaywallOffering;
  /** True while the first customer info and offering are still being read. */
  loading: boolean;
  /** Whether this build has a RevenueCat key at all. */
  configured: boolean;
  /** Whether the offering on screen is the stand-in rather than the store's. */
  mocked: boolean;
  /** Every saved delivery inside the current period, whoever bowled it, and what is left. */
  allowance: Allowance;
  /** Re-reads the saved deliveries, so the limit reflects a delivery just saved. */
  refreshAnalyses: () => void;
  /** Asks the store for the offering again, after a launch that could not reach it. */
  reloadOffering: () => Promise<void>;
  purchase: (pkg: PaywallPackage) => Promise<PurchaseOutcome>;
  restore: () => Promise<RestoreOutcome>;
  /**
   * Development only: forces Pro on or off, ignoring the store. Null follows the
   * store. Always null outside __DEV__, and the setter does nothing there.
   */
  devOverride: boolean | null;
  setDevOverride: (value: boolean | null) => void;
};

const FREE: Purchases = {
  isPro: false,
  pro: { active: false },
  offering: offeringOnScreen(false, null),
  loading: false,
  configured: false,
  mocked: true,
  allowance: { used: 0, left: FREE_ANALYSES_PER_PERIOD, periodStart: null, nextReset: null },
  refreshAnalyses: () => {},
  reloadOffering: async () => {},
  purchase: async () => ({ status: 'unavailable' }),
  restore: async () => ({ status: 'unavailable' }),
  devOverride: null,
  setDevOverride: () => {},
};

const PurchasesContext = createContext<Purchases>(FREE);

export function PurchasesProvider({ children }: { children: ReactNode }) {
  const configured = purchasesConfigured();

  const [pro, setPro] = useState<ProStatus>({ active: false });
  const [offering, setOffering] = useState<PaywallOffering | null>(null);
  const [loading, setLoading] = useState(configured);
  const [allowance, setAllowance] = useState<Allowance>({
    used: 0,
    left: FREE_ANALYSES_PER_PERIOD,
    periodStart: null,
    nextReset: null,
  });
  const [devOverride, setDevOverrideState] = useState<boolean | null>(null);

  // The live packages, kept so a purchase is made against the store's own
  // object rather than the slice the paywall renders.
  const packages = useRef<Map<string, PurchasesPackage>>(new Map());

  // Cleared on unmount, so nothing the store answers after the provider has
  // gone is applied.
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const loadOffering = useCallback(async () => {
    try {
      const live = await readOffering();
      if (!mounted.current || !live) return;
      packages.current = new Map(live.packages.map((p) => [p.identifier, p]));
      setOffering(live.offering);
    } catch {
      // Left as it was: no plans on screen, or the ones already loaded.
    }
  }, []);

  useEffect(() => {
    if (!configured) return;
    let alive = true;

    // Not only at startup: the store pushes new customer info when a purchase
    // completes elsewhere, a trial converts, or a subscription lapses.
    const unwatch = watchCustomerInfo((info) => {
      if (alive) setPro(proStatus(info));
    });

    (async () => {
      try {
        const info = await readCustomerInfo();
        if (alive && info) setPro(proStatus(info));
      } catch {
        // No entitlement until the store says otherwise, which is what state
        // already holds. Left alone rather than set, so a failed read cannot
        // undo an entitlement the listener delivered in the meantime.
      }
      await loadOffering();
      if (alive) setLoading(false);
    })();

    return () => {
      alive = false;
      unwatch();
    };
  }, [configured, loadOffering]);

  const reloadOffering = useCallback(async () => {
    if (!configured) return;
    await loadOffering();
  }, [configured, loadOffering]);

  const refreshAnalyses = useCallback(() => {
    let alive = true;
    (async () => {
      try {
        // Every delivery on the phone, whoever bowled it: the allowance and its
        // anchor both belong to the phone, so they count the same deliveries.
        const next = await readAllowance({
          deliveries: () => listSessions(),
          storedAnchor: () => getSettings().analysisAnchor,
          saveAnchor: (anchor) => updateSettings({ analysisAnchor: anchor }),
          now: Date.now,
        });
        if (alive) setAllowance(next);
      } catch {
        // An unreadable list must not hand out free analyses, so the count
        // stands where it was rather than falling back to zero.
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => refreshAnalyses(), [refreshAnalyses]);

  const setDevOverride = useCallback((value: boolean | null) => {
    // Cannot exist in a production build: the override is only honoured, and
    // only settable, while __DEV__ is true.
    if (!__DEV__) return;
    setDevOverrideState(value);
  }, []);

  const purchase = useCallback(async (pkg: PaywallPackage): Promise<PurchaseOutcome> => {
    const live = packages.current.get(pkg.identifier);
    // No live package means the mock offering is on screen, so there is nothing
    // to buy. Said plainly rather than failing somewhere deeper.
    if (!live) return { status: 'unavailable' };
    const outcome = await purchaseWithStore(live);
    // Read off the customer info that came back with the purchase, so Pro is on
    // the moment the store grants it rather than whenever the listener fires.
    if (outcome.status === 'purchased' && mounted.current) {
      setPro({ active: true, expiresAt: outcome.expiresAt, willRenew: outcome.willRenew });
    }
    return outcome;
  }, []);

  const restore = useCallback(async (): Promise<RestoreOutcome> => {
    const outcome = await restorePurchases();
    // The same for a restore. One that found nothing changes nothing here: an
    // entitlement ending is the listener's to report.
    if (outcome.status === 'restored' && mounted.current) {
      setPro({ active: true, expiresAt: outcome.expiresAt, willRenew: outcome.willRenew });
    }
    return outcome;
  }, []);

  const value = useMemo((): Purchases => {
    const override = __DEV__ ? devOverride : null;
    return {
      // The override wins in development; otherwise the store decides. `pro`
      // stays exactly what the store said, so Settings can tell an override
      // apart from a real subscription.
      isPro: override ?? pro.active,
      pro,
      offering: offeringOnScreen(configured, offering),
      loading,
      configured,
      mocked: !configured,
      allowance,
      refreshAnalyses,
      reloadOffering,
      purchase,
      restore,
      devOverride: __DEV__ ? devOverride : null,
      setDevOverride,
    };
  }, [
    allowance,
    configured,
    devOverride,
    loading,
    offering,
    pro,
    purchase,
    refreshAnalyses,
    reloadOffering,
    restore,
    setDevOverride,
  ]);

  return <PurchasesContext.Provider value={value}>{children}</PurchasesContext.Provider>;
}

/** Everything the Pro features need: the entitlement, the offering and the store calls. */
export function usePurchases(): Purchases {
  return useContext(PurchasesContext);
}

/** Just what the gates in gates.ts read, for a screen that only asks permission. */
export function useEntitlements(): { isPro: boolean; analysesThisPeriod: number } {
  const { isPro, allowance } = usePurchases();
  return { isPro, analysesThisPeriod: allowance.used };
}
