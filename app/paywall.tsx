import { useCallback, useEffect, useMemo, useState } from 'react';
import { Linking, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  allowanceLine,
  FREE_ANALYSES_PER_PERIOD,
  plansIn,
  selectedPlan,
  trialDays,
  usePurchases,
  type PaywallPackage,
  type PlanPeriod,
  type PurchaseOutcome,
  type RestoreOutcome,
} from '../src/purchases';
import { PRIVACY_URL, TERMS_URL } from '../src/purchases/links';
import { AppBar } from '../src/ui/AppBar';
import { armCelebration } from '../src/ui/celebration';
import { Notice, type NoticeTone } from '../src/ui/Notice';
import { ctaFor, planTerms, renewalLine } from '../src/ui/paywallCopy';
import { colors, opacity, radius, size, space, stroke, type } from '../src/ui/tokens';
import { Wordmark } from '../src/ui/Wordmark';

/** What sent the user here. Same layout; the headline speaks to what they just tried. */
type PaywallContext = 'export' | 'limit' | 'compare' | 'stats' | 'pro' | 'onboarding';

type Copy = {
  /**
   * The value, not the product. Given the annual plan's free days when the
   * store reports a trial, and null otherwise, when it never mentions one.
   */
  headline: (trial: number | null) => string;
  /** Names what is given up by leaving. */
  dismiss: string;
};

const COPY: Record<PaywallContext, Copy> = {
  export: {
    headline: (trial) =>
      trial === null ? 'Share without the watermark.' : `Share without the watermark. ${trial} days free.`,
    dismiss: 'Continue with the watermark',
  },
  limit: {
    headline: (trial) =>
      trial === null ? 'Keep bowling with Pro' : `Keep bowling with ${trial} days free`,
    dismiss: `Wait for my next ${FREE_ANALYSES_PER_PERIOD} analyses`,
  },
  compare: {
    headline: (trial) =>
      trial === null ? 'Compare your deliveries.' : `Compare your deliveries. ${trial} days free.`,
    dismiss: 'Continue without comparison',
  },
  stats: {
    headline: (trial) =>
      trial === null ? 'See your stats.' : `See your stats. ${trial} days free.`,
    dismiss: 'Continue with personal best only',
  },
  // Opened from Settings rather than by being blocked, so it leads with the lot.
  pro: {
    headline: (trial) =>
      trial === null ? 'Measure as much as you like.' : `Measure as much as you like. ${trial} days free.`,
    dismiss: 'Stay on the free plan',
  },
  // Offered once, at the end of setup, before anything has been refused. It
  // leads with what Pro adds.
  onboarding: {
    headline: (trial) =>
      trial === null
        ? 'Every delivery, without limits.'
        : `${trial} days free. Every delivery, without limits.`,
    dismiss: `Continue with ${FREE_ANALYSES_PER_PERIOD} analyses a week`,
  },
};

/** What Pro adds, and only what this build ships. */
const VALUES = [
  'Unlimited analyses',
  'Watermark-free exports',
  'Higher recording quality',
  'Compare deliveries',
  'Your stats',
];

const PLAN_ORDER: PlanPeriod[] = ['annual', 'monthly'];

const PLAN_NAME: Record<PlanPeriod, string> = { annual: 'Annual', monthly: 'Monthly' };

function parseContext(value: string | string[] | undefined): PaywallContext {
  const raw = Array.isArray(value) ? value[0] : value;
  return raw === 'limit' ||
    raw === 'compare' ||
    raw === 'stats' ||
    raw === 'pro' ||
    raw === 'onboarding'
    ? raw
    : 'export';
}

type Said = { tone: NoticeTone; title?: string; text: string };

type RestoreState = { status: 'idle' } | { status: 'restoring' } | RestoreOutcome;

function restoreNote(state: RestoreState): Said | null {
  switch (state.status) {
    case 'restored':
      return { tone: 'success', title: 'Pro restored', text: 'Paceball Pro is active on this phone.' };
    case 'nothing':
      return { tone: 'info', text: 'Google Play found no Paceball purchase on this account.' };
    case 'unavailable':
      return {
        tone: 'error',
        text: 'Purchases are not set up in this build, so there is nothing to restore from.',
      };
    case 'failed':
      return { tone: 'error', text: `Could not restore: ${state.message}` };
    default:
      return null;
  }
}

/**
 * What the store said about the purchase. Never a success it did not report,
 * and nothing at all for a purchase the user backed out of: that is a choice,
 * not something to apologise for.
 */
function purchaseNote(outcome: PurchaseOutcome): Said | null {
  switch (outcome.status) {
    case 'purchased':
    case 'cancelled':
      return null;
    case 'not-active':
      return {
        tone: 'info',
        text: 'Google Play took the purchase but has not granted Pro yet. If payment is still pending, it will arrive once the payment clears.',
      };
    case 'unavailable':
      return {
        tone: 'error',
        text: 'Purchases are not set up in this build, so nothing can be bought here. Nothing has been charged.',
      };
    case 'failed':
      return { tone: 'error', text: `Could not complete the purchase: ${outcome.message}` };
  }
}

export default function PaywallScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const context = parseContext(useLocalSearchParams().context);
  const copy = COPY[context];
  const {
    isPro,
    offering,
    loading,
    configured,
    allowance,
    purchase,
    reloadOffering,
    restore: restoreWithStore,
  } = usePurchases();
  // No key in this build means the prices on screen are the stand-in's. Nothing
  // can be bought, and the screen has to say so rather than look like a working
  // paywall with odd prices.
  const sample = !configured;

  // The store's offering when there is one, the stand-in only in a build with
  // no store, and nothing at all while a store has not answered. Every figure on
  // screen is the store's own price text, never written here.
  const plans = useMemo(() => plansIn(offering), [offering]);
  const available = PLAN_ORDER.filter((period) => plans[period] !== undefined);

  // Annual is the default, whenever the store offers it. Worked out on every
  // render, so plans arriving after the first render still leave one selected.
  const [picked, setPicked] = useState<PlanPeriod | null>(null);
  const selected = selectedPlan(plans, PLAN_ORDER, picked);
  const [restore, setRestore] = useState<RestoreState>({ status: 'idle' });
  const [notice, setNotice] = useState<Said | null>(null);
  const [buying, setBuying] = useState(false);

  // A launch that could not reach the store left no plans. Opening the paywall
  // asks again, so coming back online and returning here is enough to buy.
  const [reloading, setReloading] = useState(false);
  const missingPlans = configured && !loading && available.length === 0;
  useEffect(() => {
    if (!missingPlans) return;
    let alive = true;
    setReloading(true);
    reloadOffering().finally(() => {
      if (alive) setReloading(false);
    });
    return () => {
      alive = false;
    };
    // Once per visit. A reload that fails leaves missingPlans as it was.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [missingPlans]);

  const chosen = selected ? (plans[selected] ?? null) : null;
  // A trial is the annual plan's, and only when the store reports one. Monthly
  // never carries one here, whatever it might be sold with. The headline reads
  // the annual trial, so it stays put as the selection moves.
  const annualTrial = plans.annual ? trialDays(plans.annual) : null;
  const chosenTrial = selected === 'annual' ? annualTrial : null;

  // The button speaks for the plan actually selected.
  const cta = ctaFor(selected, annualTrial);

  const onPurchase = useCallback(async () => {
    if (!chosen || buying) return;
    setBuying(true);
    setNotice(null);
    // The outcome is read off the customer info the store returned, so Pro only
    // ever turns on because the entitlement came back with it.
    const outcome = await purchase(chosen);
    setBuying(false);
    // Only a purchase the store confirmed with the pro entitlement active is
    // celebrated, once, in place of this screen. A restore never gets here.
    if (outcome.status === 'purchased') {
      armCelebration(context);
      router.replace('/celebration');
      return;
    }
    setNotice(purchaseNote(outcome));
  }, [buying, chosen, purchase, context, router]);

  const onRestore = useCallback(async () => {
    setRestore({ status: 'restoring' });
    setRestore(await restoreWithStore());
  }, [restoreWithStore]);

  // Onboarding came here instead of the camera, so leaving goes on to the
  // camera rather than back into setup. Everywhere else, back to where it was.
  const leave = useCallback(() => {
    if (context === 'onboarding') router.replace('/capture');
    else router.back();
  }, [context, router]);

  const restored = restore.status === 'restored' || isPro;
  const restoring = restore.status === 'restoring';
  const note = restoreNote(restore);
  const waitingForPlans = loading || reloading;

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      {/* Leaving is reachable from the top as well as below the offer. */}
      <View style={styles.bar}>
        <AppBar
          title="Pro"
          onBack={leave}
          backLabel={restored ? 'Done' : copy.dismiss}
        />
      </View>

      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + space.lg }]}
      >
        {/* The brand: the logo's own wordmark and Pro's lime mark. */}
        <View style={styles.lockup} accessible accessibilityRole="image" accessibilityLabel="Paceball Pro">
          <Wordmark height={size.wordmark.lockup} />
          <View style={styles.proMark}>
            <Text style={styles.proMarkText}>PRO</Text>
          </View>
        </View>
        <Text style={styles.headline} accessibilityRole="header">
          {copy.headline(annualTrial)}
        </Text>
        {/* Sent here by the weekly limit: when it comes back, in its own words. */}
        {context === 'limit' ? (
          <Text style={styles.reset}>
            {allowanceLine(allowance, (t) =>
              new Date(t).toLocaleDateString(undefined, { weekday: 'long' })
            )}
          </Text>
        ) : null}

        <View style={styles.values}>
          {VALUES.map((value) => (
            <View key={value} style={styles.value}>
              <Text style={styles.valueMark} accessibilityElementsHidden importantForAccessibility="no">
                ✓
              </Text>
              <Text style={styles.valueText}>{value}</Text>
            </View>
          ))}
        </View>

        {waitingForPlans ? (
          // Static outlines where the plans will be, and what is happening in words.
          <View accessible accessibilityLabel="Loading plans">
            <View style={styles.planPlaceholder} />
            <View style={styles.planPlaceholder} />
          </View>
        ) : available.length === 0 ? (
          <Notice tone="error">
            The plans could not be loaded. Check the connection, then open this page again.
          </Notice>
        ) : (
          <View style={styles.plans} accessibilityRole="radiogroup">
            {available.map((period) => (
              <Plan
                key={period}
                period={period}
                pkg={plans[period]!}
                trial={period === 'annual' ? annualTrial : null}
                selected={selected === period}
                onSelect={() => {
                  setPicked(period);
                  setNotice(null);
                }}
              />
            ))}
          </View>
        )}

        {sample ? (
          <Text style={styles.sampleNotice}>
            Sample prices. The store is not connected in this build.
          </Text>
        ) : null}

        {(cta || waitingForPlans) && !restored ? (
          <>
            <Pressable
              style={({ pressed }) => [
                styles.cta,
                pressed && styles.ctaPressed,
                (buying || sample || cta === null) && styles.ctaOff,
              ]}
              onPress={onPurchase}
              disabled={buying || sample}
              accessibilityRole="button"
              accessibilityState={{ busy: buying, disabled: buying || sample }}
              accessibilityLabel={
                cta === null
                  ? 'Loading plans'
                  : sample
                    ? `${cta}. Not available in this build.`
                    : buying
                      ? 'Opening Google Play'
                      : cta
              }
            >
              <Text style={styles.ctaText}>
                {buying ? 'Opening Google Play…' : (cta ?? 'Loading plans…')}
              </Text>
            </Pressable>
            {cta !== null && !sample ? (
              <Text style={styles.renewal}>{renewalLine(chosenTrial)}</Text>
            ) : null}
          </>
        ) : null}

        {notice ? (
          <View style={styles.notice}>
            <Notice tone={notice.tone} title={notice.title} live>
              {notice.text}
            </Notice>
          </View>
        ) : null}

        <Pressable
          style={[styles.dismiss, context === 'onboarding' && styles.dismissOutlined]}
          onPress={leave}
          accessibilityRole="button"
        >
          <Text style={[styles.dismissText, context === 'onboarding' && styles.dismissTextOn]}>
            {restored ? 'Done' : copy.dismiss}
          </Text>
        </Pressable>

        <View style={styles.links}>
          <Pressable
            style={styles.link}
            onPress={onRestore}
            disabled={restoring}
            accessibilityRole="button"
            accessibilityState={{ busy: restoring, disabled: restoring }}
          >
            <Text style={styles.linkText}>{restoring ? 'Restoring…' : 'Restore purchases'}</Text>
          </Pressable>
          <Pressable
            style={styles.link}
            onPress={() => void Linking.openURL(TERMS_URL).catch(() => undefined)}
            accessibilityRole="link"
          >
            <Text style={styles.linkText}>Terms</Text>
          </Pressable>
          <Pressable
            style={styles.link}
            onPress={() => void Linking.openURL(PRIVACY_URL).catch(() => undefined)}
            accessibilityRole="link"
          >
            <Text style={styles.linkText}>Privacy</Text>
          </Pressable>
        </View>
        {note ? (
          <View style={styles.notice}>
            <Notice tone={note.tone} title={note.title} live>
              {note.text}
            </Notice>
          </View>
        ) : null}
      </ScrollView>
    </View>
  );
}

function Plan({
  period,
  pkg,
  trial,
  selected,
  onSelect,
}: {
  period: PlanPeriod;
  pkg: PaywallPackage;
  /** The store's free days on this plan. Always null for monthly. */
  trial: number | null;
  selected: boolean;
  onSelect: () => void;
}) {
  // The store's own string, as given. The price appears here and nowhere else,
  // once per plan.
  const terms = planTerms(period, pkg.product.priceString, trial);
  return (
    <Pressable
      style={[styles.plan, selected && styles.planOn]}
      onPress={onSelect}
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      accessibilityLabel={`${PLAN_NAME[period]}, ${terms}`}
    >
      <View style={[styles.radio, selected && styles.radioOn]} />
      <View style={styles.planBody}>
        <Text style={styles.planName}>{PLAN_NAME[period]}</Text>
        <Text style={styles.planPrice}>{terms}</Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  bar: { paddingHorizontal: space.md },
  content: { paddingHorizontal: space.lg, paddingTop: space.md },

  lockup: { flexDirection: 'row', alignItems: 'center', gap: space.sm, marginBottom: space.md },
  proMark: {
    borderRadius: radius.pill,
    borderWidth: stroke.medium,
    borderColor: colors.accent,
    paddingHorizontal: space.sm,
    paddingVertical: space.xs / 2,
  },
  proMarkText: { ...type.label, color: colors.accent },
  headline: { ...type.h1, color: colors.text },
  reset: { ...type.body, color: colors.muted, marginTop: space.sm },

  values: { marginTop: space.lg, marginBottom: space.lg, gap: space.sm },
  value: { flexDirection: 'row', alignItems: 'center' },
  valueMark: { ...type.body, color: colors.text, fontWeight: '900', width: space.lg },
  valueText: { ...type.body, color: colors.text, flex: 1 },

  plans: { gap: space.sm },
  plan: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: size.row,
    padding: space.md,
    borderRadius: radius.md,
    borderWidth: stroke.medium,
    borderColor: colors.control,
    backgroundColor: colors.surface,
  },
  // The chosen plan is the action about to happen, so it is the one in lime.
  planOn: { borderColor: colors.accent },
  planPlaceholder: {
    minHeight: size.row,
    borderRadius: radius.md,
    borderWidth: stroke.medium,
    borderColor: colors.line,
    marginBottom: space.sm,
  },
  radio: {
    width: space.md,
    height: space.md,
    borderRadius: radius.pill,
    borderWidth: stroke.medium,
    borderColor: colors.control,
    marginRight: space.md,
  },
  radioOn: { borderColor: colors.accent, backgroundColor: colors.accent },
  planBody: { flex: 1 },
  planName: { ...type.h2, color: colors.text },
  // Readable and plain, never the hero: body is the 16 pt floor for any price.
  planPrice: { ...type.body, color: colors.text, marginTop: space.xs },

  sampleNotice: {
    ...type.body,
    color: colors.warn,
    borderWidth: stroke.hairline,
    borderColor: colors.warn,
    borderRadius: radius.md,
    padding: space.md,
    marginTop: space.md,
  },

  // Drawn to the same measure as ActionButton's primary.
  cta: {
    minHeight: size.button,
    borderRadius: radius.md,
    borderWidth: stroke.medium,
    borderColor: colors.accent,
    backgroundColor: colors.accent,
    paddingHorizontal: space.lg,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: space.lg,
  },
  ctaPressed: { borderColor: colors.text },
  ctaOff: { opacity: opacity.inactive },
  ctaText: { ...type.button, color: colors.bg, textAlign: 'center' },
  renewal: { ...type.caption, color: colors.muted, textAlign: 'center', marginTop: space.sm },
  notice: { marginTop: space.md },

  dismiss: {
    minHeight: size.target,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: space.md,
  },
  dismissText: { ...type.body, color: colors.muted },
  // Nothing has been refused yet during onboarding, so skipping is a plain,
  // full-weight choice beside the offer, not small print under it.
  dismissOutlined: {
    minHeight: size.button,
    borderWidth: stroke.medium,
    borderColor: colors.control,
    borderRadius: radius.md,
  },
  dismissTextOn: { ...type.button, color: colors.text },

  links: {
    flexDirection: 'row',
    justifyContent: 'center',
    flexWrap: 'wrap',
    columnGap: space.md,
    borderTopWidth: stroke.hairline,
    borderColor: colors.line,
    marginTop: space.md,
  },
  link: { minHeight: size.target, justifyContent: 'center', paddingHorizontal: space.xs },
  linkText: { ...type.body, color: colors.muted, textDecorationLine: 'underline' },
});
