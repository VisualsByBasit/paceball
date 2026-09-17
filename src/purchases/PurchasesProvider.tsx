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
import { getActivePlayer, listSessions } from '../data';
import { proStatus, type ProStatus, type PurchaseOutcome, type RestoreOutcome } from './entitlement';
import { analysesInWindow } from './freeLimit';
import { MOCK_OFFERING } from './mockOffering';
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
  /** The offering to render. The store's when configured, the mock when not. */
  offering: PaywallOffering;
  /** True while the first customer info and offering are still being read. */
  loading: boolean;
  /** Whether this build has a RevenueCat key at all. */
  configured: boolean;
  /** Whether the offering on screen is the stand-in rather than the store's. */
  mocked: boolean;
  /** This player's saved deliveries inside the rolling week. */
  analysesLast7Days: number;
  /** Re-reads the saved deliveries, so the limit reflects a delivery just saved. */
  refreshAnalyses: () => void;
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
  offering: MOCK_OFFERING,
  loading: false,
  configured: false,
  mocked: true,
  analysesLast7Days: 0,
  refreshAnalyses: () => {},
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
  const [analyses, setAnalyses] = useState(0);
  const [devOverride, setDevOverrideState] = useState<boolean | null>(null);

  // The live packages, kept so a purchase is made against the store's own
  // object rather than the slice the paywall renders.
  const packages = useRef<Map<string, PurchasesPackage>>(new Map());

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
        // No entitlement until the store says otherwise. Free is the safe read.
        if (alive) setPro({ active: false });
      }
      try {
        const live = await readOffering();
        if (alive && live) {
          packages.current = new Map(live.packages.map((p) => [p.identifier, p]));
          setOffering(live.offering);
        }
      } catch {
        if (alive) setOffering(null);
      }
      if (alive) setLoading(false);
    })();

    return () => {
      alive = false;
      unwatch();
    };
  }, [configured]);

  const refreshAnalyses = useCallback(() => {
    let alive = true;
    (async () => {
      try {
        const player = await getActivePlayer();
        if (!player) {
          if (alive) setAnalyses(0);
          return;
        }
        const sessions = await listSessions({ playerId: player.id });
        if (alive) setAnalyses(analysesInWindow(sessions, Date.now(), player.id));
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
    return purchaseWithStore(live);
  }, []);

  const restore = useCallback(() => restorePurchases(), []);

  const value = useMemo((): Purchases => {
    const override = __DEV__ ? devOverride : null;
    return {
      // The override wins in development; otherwise the store decides. `pro`
      // stays exactly what the store said, so Settings can tell an override
      // apart from a real subscription.
      isPro: override ?? pro.active,
      pro,
      offering: offering ?? MOCK_OFFERING,
      loading,
      configured,
      mocked: offering === null,
      analysesLast7Days: analyses,
      refreshAnalyses,
      purchase,
      restore,
      devOverride: __DEV__ ? devOverride : null,
      setDevOverride,
    };
  }, [
    analyses,
    configured,
    devOverride,
    loading,
    offering,
    pro,
    purchase,
    refreshAnalyses,
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
export function useEntitlements(): { isPro: boolean; analysesLast7Days: number } {
  const { isPro, analysesLast7Days } = usePurchases();
  return { isPro, analysesLast7Days };
}
