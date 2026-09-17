import { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  plansIn,
  trialDays,
  usePurchases,
  type PaywallPackage,
  type PlanPeriod,
  type PurchaseOutcome,
  type RestoreOutcome,
} from '../src/purchases';
import { TERMS_URL } from '../src/purchases/links';
import { colors, opacity, radius, space, stroke, type } from '../src/ui/tokens';

/** What sent the user here. Same layout; the headline speaks to what they just tried. */
type PaywallContext = 'export' | 'limit' | 'compare' | 'pro';

type Copy = {
  /** The value, not the product. */
  headline: string;
  values: string[];
  /** Names what is given up by leaving. */
  dismiss: string;
};

const COPY: Record<PaywallContext, Copy> = {
  export: {
    headline: 'Export without the watermark',
    values: [
      'Share cards carry your reading and nothing else',
      'Unlimited analyses',
      'Cancel any time in Google Play',
    ],
    dismiss: 'Continue with the watermark',
  },
  limit: {
    headline: 'Unlimited analyses',
    values: [
      'Analyse every delivery you record',
      'Export without the watermark',
      'Cancel any time in Google Play',
    ],
    dismiss: 'Continue without unlimited analyses',
  },
  compare: {
    headline: 'Compare any two deliveries',
    values: [
      'Side by side, each with its own error range',
      'Only called faster when the ranges say so',
      'Cancel any time in Google Play',
    ],
    dismiss: 'Continue without comparing',
  },
  // Opened from Settings rather than by being blocked, so it leads with the lot.
  pro: {
    headline: 'Measure as much as you like',
    values: [
      'Unlimited analyses, every week',
      'Export without the watermark',
      'Compare any two deliveries',
    ],
    dismiss: 'Stay on the free plan',
  },
};

const PLAN_ORDER: PlanPeriod[] = ['annual', 'monthly'];

const PLAN_NAME: Record<PlanPeriod, string> = { annual: 'Annual', monthly: 'Monthly' };
const PLAN_PER: Record<PlanPeriod, string> = { annual: 'a year', monthly: 'a month' };

function parseContext(value: string | string[] | undefined): PaywallContext {
  const raw = Array.isArray(value) ? value[0] : value;
  return raw === 'limit' || raw === 'compare' || raw === 'pro' ? raw : 'export';
}

type RestoreState = { status: 'idle' } | { status: 'restoring' } | RestoreOutcome;

function restoreNote(state: RestoreState): string | null {
  switch (state.status) {
    case 'restored':
      return 'Paceball Pro is active on this phone.';
    case 'nothing':
      return 'Google Play found no Paceball purchase on this account.';
    case 'unavailable':
      return 'Purchases are not set up in this build, so there is nothing to restore from.';
    case 'failed':
      return `Could not restore: ${state.message}`;
    default:
      return null;
  }
}

/** What the store said about the purchase. Never a success it did not report. */
function purchaseNote(outcome: PurchaseOutcome): string | null {
  switch (outcome.status) {
    case 'purchased':
      return null;
    case 'not-active':
      return 'Google Play took the purchase but has not granted Pro yet. If payment is still pending, it will arrive once the payment clears.';
    case 'cancelled':
      return 'Purchase cancelled. Nothing has been charged.';
    case 'unavailable':
      return 'Purchases are not set up in this build, so nothing can be bought here. Nothing has been charged.';
    case 'failed':
      return `Could not complete the purchase: ${outcome.message}`;
  }
}

export default function PaywallScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const context = parseContext(useLocalSearchParams().context);
  const copy = COPY[context];
  const { isPro, offering, loading, mocked, purchase, restore: restoreWithStore } = usePurchases();

  // The store's offering when there is one, otherwise the stand-in. Either way
  // every figure on screen is the store's own price text, never written here.
  const plans = useMemo(() => plansIn(offering), [offering]);
  const available = PLAN_ORDER.filter((period) => plans[period] !== undefined);

  // Annual is the default, whenever the store offers it.
  const [selected, setSelected] = useState<PlanPeriod | null>(available[0] ?? null);
  const [restore, setRestore] = useState<RestoreState>({ status: 'idle' });
  const [notice, setNotice] = useState<string | null>(null);
  const [buying, setBuying] = useState(false);

  const chosen = selected ? (plans[selected] ?? null) : null;
  const chosenTrial = chosen ? trialDays(chosen) : null;
  // The headline trial is the offering's, wherever it sits, so it stays put as the
  // selection moves. The CTA speaks only for the plan actually selected.
  const offeredTrial =
    available.map((period) => trialDays(plans[period]!)).find((days) => days !== null) ?? null;

  const cta =
    chosenTrial !== null
      ? `Start my ${chosenTrial} days free`
      : selected
        ? `Start my ${PLAN_NAME[selected].toLowerCase()} plan`
        : null;

  const onPurchase = useCallback(async () => {
    if (!chosen || buying) return;
    setBuying(true);
    setNotice(null);
    // The outcome is read off the customer info the store returned, so Pro only
    // ever turns on because the entitlement came back with it.
    const outcome = await purchase(chosen);
    setBuying(false);
    setNotice(purchaseNote(outcome));
  }, [buying, chosen, purchase]);

  const onRestore = useCallback(async () => {
    setRestore({ status: 'restoring' });
    setRestore(await restoreWithStore());
  }, [restoreWithStore]);

  const restored = restore.status === 'restored' || isPro;
  const restoring = restore.status === 'restoring';
  const note = restoreNote(restore);

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={[
        styles.content,
        { paddingTop: insets.top + space.xl, paddingBottom: insets.bottom + space.lg },
      ]}
    >
      <Text style={styles.headline} accessibilityRole="header">
        {copy.headline}
      </Text>
      {offeredTrial !== null ? (
        <Text style={styles.headlineTrial}>Free for {offeredTrial} days.</Text>
      ) : null}

      <View style={styles.values}>
        {copy.values.map((value) => (
          <View key={value} style={styles.value}>
            <View style={styles.valueMark} />
            <Text style={styles.valueText}>{value}</Text>
          </View>
        ))}
      </View>

      {loading ? (
        <ActivityIndicator color={colors.muted} style={styles.plansLoading} />
      ) : available.length === 0 ? (
        <Text style={styles.problem}>
          The plans could not be loaded. Check the connection and try again.
        </Text>
      ) : (
        <View accessibilityRole="radiogroup">
          {available.map((period) => (
            <Plan
              key={period}
              period={period}
              pkg={plans[period]!}
              selected={selected === period}
              onSelect={() => {
                setSelected(period);
                setNotice(null);
              }}
            />
          ))}
        </View>
      )}

      {cta && !restored ? (
        <Pressable
          style={[styles.cta, buying && styles.ctaBusy]}
          onPress={onPurchase}
          disabled={buying}
          accessibilityRole="button"
          accessibilityState={{ busy: buying, disabled: buying }}
          accessibilityLabel={cta}
        >
          {buying ? (
            <ActivityIndicator color={colors.bg} />
          ) : (
            <Text style={styles.ctaText}>{cta}</Text>
          )}
        </Pressable>
      ) : null}
      {mocked && !restored ? (
        <Text style={styles.ctaNote}>
          These are stand-in prices: this build has no store connection yet.
        </Text>
      ) : null}
      {chosenTrial !== null && !restored ? (
        <Text style={styles.ctaNote}>
          Nothing is charged today. Cancel in Google Play before the {chosenTrial} days are up and
          you pay nothing.
        </Text>
      ) : null}
      {notice ? (
        <Text style={styles.notice} accessibilityLiveRegion="polite">
          {notice}
        </Text>
      ) : null}

      <Pressable
        style={styles.dismiss}
        onPress={() => router.back()}
        accessibilityRole="button"
        hitSlop={space.sm}
      >
        <Text style={styles.dismissText}>{restored ? 'Done' : copy.dismiss}</Text>
      </Pressable>

      <View style={styles.links}>
        <Pressable
          onPress={onRestore}
          disabled={restoring}
          accessibilityRole="button"
          accessibilityState={{ busy: restoring, disabled: restoring }}
          hitSlop={space.sm}
        >
          {restoring ? (
            <ActivityIndicator color={colors.muted} />
          ) : (
            <Text style={styles.linkText}>Restore purchases</Text>
          )}
        </Pressable>
        {TERMS_URL ? (
          <Pressable
            onPress={() => Linking.openURL(TERMS_URL!)}
            accessibilityRole="link"
            hitSlop={space.sm}
          >
            <Text style={styles.linkText}>Terms</Text>
          </Pressable>
        ) : null}
      </View>
      {note ? (
        <Text
          style={[
            styles.restoreNote,
            restore.status === 'restored'
              ? styles.restoreOk
              : restore.status === 'nothing'
                ? styles.restoreNothing
                : styles.restoreFailed,
          ]}
          accessibilityLiveRegion="polite"
        >
          {note}
        </Text>
      ) : null}

      <Text style={styles.terms}>
        Subscriptions renew automatically until cancelled in Google Play.
      </Text>
    </ScrollView>
  );
}

function Plan({
  period,
  pkg,
  selected,
  onSelect,
}: {
  period: PlanPeriod;
  pkg: PaywallPackage;
  selected: boolean;
  onSelect: () => void;
}) {
  const trial = trialDays(pkg);
  // The store's own string, as given. The price appears here and nowhere else.
  const price = `${pkg.product.priceString} ${PLAN_PER[period]}`;
  return (
    <Pressable
      style={[styles.plan, selected && styles.planOn]}
      onPress={onSelect}
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      accessibilityLabel={`${PLAN_NAME[period]}${trial !== null ? `, ${trial} days free, then` : ','} ${price}`}
    >
      <View style={[styles.radio, selected && styles.radioOn]} />
      <View style={styles.planBody}>
        <View style={styles.planTop}>
          <Text style={styles.planName}>{PLAN_NAME[period]}</Text>
          {trial !== null ? (
            <View style={styles.trialBadge}>
              <Text style={styles.trialBadgeText}>{trial} DAYS FREE</Text>
            </View>
          ) : null}
        </View>
        <Text style={styles.planPrice}>{trial !== null ? `Then ${price}` : price}</Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { paddingHorizontal: space.lg },

  headline: { ...type.h1, color: colors.text },
  // As loud as the headline itself: the trial is the offer, not its small print.
  headlineTrial: { ...type.h1, color: colors.text, marginTop: space.xs },

  values: { marginTop: space.lg, marginBottom: space.lg },
  value: { flexDirection: 'row', alignItems: 'center', marginBottom: space.sm },
  valueMark: {
    width: space.sm,
    height: space.sm,
    borderRadius: radius.pill,
    backgroundColor: colors.text,
    marginRight: space.md,
  },
  valueText: { ...type.body, color: colors.text, flex: 1 },

  problem: { ...type.body, color: colors.danger, marginBottom: space.md },

  plan: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: space.md,
    borderRadius: radius.lg,
    borderWidth: stroke.medium,
    borderColor: colors.line,
    backgroundColor: colors.surface,
    marginBottom: space.sm,
  },
  planOn: { borderColor: colors.text },
  radio: {
    width: space.md,
    height: space.md,
    borderRadius: radius.pill,
    borderWidth: stroke.medium,
    borderColor: colors.muted,
    marginRight: space.md,
  },
  radioOn: { borderColor: colors.text, backgroundColor: colors.text },
  planBody: { flex: 1 },
  planTop: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap' },
  planName: { ...type.h2, color: colors.text, marginRight: space.sm },
  trialBadge: {
    backgroundColor: colors.text,
    borderRadius: radius.pill,
    paddingHorizontal: space.sm,
    paddingVertical: space.xs,
  },
  trialBadgeText: { ...type.body, color: colors.bg, fontWeight: '900' },
  // Readable and plain, never the hero: body is the 15 pt floor for any price.
  planPrice: { ...type.body, color: colors.text, marginTop: space.xs },

  cta: {
    backgroundColor: colors.accent,
    borderRadius: radius.pill,
    paddingVertical: space.md,
    alignItems: 'center',
    marginTop: space.md,
  },
  ctaText: { ...type.h2, color: colors.bg, fontWeight: '800' },
  ctaBusy: { opacity: opacity.inactive },
  plansLoading: { marginVertical: space.lg },
  ctaNote: { ...type.body, color: colors.text, textAlign: 'center', marginTop: space.sm },
  notice: { ...type.body, color: colors.warn, textAlign: 'center', marginTop: space.md },

  dismiss: { alignItems: 'center', paddingVertical: space.md, marginTop: space.sm },
  dismissText: { ...type.body, color: colors.muted },

  links: {
    flexDirection: 'row',
    justifyContent: 'center',
    columnGap: space.lg,
    borderTopWidth: stroke.hairline,
    borderColor: colors.line,
    paddingTop: space.md,
  },
  linkText: { ...type.body, color: colors.muted, textDecorationLine: 'underline' },
  restoreNote: { ...type.body, textAlign: 'center', marginTop: space.sm },
  restoreOk: { color: colors.text },
  restoreNothing: { color: colors.muted },
  restoreFailed: { color: colors.danger },
  terms: { ...type.caption, color: colors.muted, textAlign: 'center', marginTop: space.md },
});
