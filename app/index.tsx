import { useEffect, useMemo, useState } from 'react';
import { Image, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { useIsFocused, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { releaseFrameUri } from '../src/capture/useFrames';
import { getActivePlayer, listSessions } from '../src/data';
import { measurementState } from '../src/physics/measurementState';
import { allowanceLine, usePurchases } from '../src/purchases';
import { featuring, updateSettings, useSettings } from '../src/settings';
import { ActionButton } from '../src/ui/ActionButton';
import { AllowanceLine } from '../src/ui/AllowanceLine';
import { BottomSheet } from '../src/ui/BottomSheet';
import { DeliveryCard } from '../src/ui/DeliveryCard';
import { DeliveryRow } from '../src/ui/DeliveryRow';
import { EmptyState } from '../src/ui/EmptyState';
import { LitEdge } from '../src/ui/LitEdge';
import { CricketStill, FloodlitPanel } from '../src/ui/cricket3d';
import { ReadingBlock } from '../src/ui/ReadingBlock';
import { SpeedGauge } from '../src/ui/SpeedGauge';
import { useReveal } from '../src/ui/motion/useReveal';
import { TabBar } from '../src/ui/TabBar';
import { countingDeliveries, heroDelivery, measuredThisWeek, needsChecking, personalBest } from '../src/ui/deliveries';
import { errorMessage, formatWhen } from '../src/ui/format';
import { readingView } from '../src/ui/reading';
import { colors, radius, size, space, stroke, type } from '../src/ui/tokens';
import type { Session } from '../src/types';
import { useLargeText } from '../src/ui/useLargeText';

/** How many of the latest deliveries Home lists before "See all". */
const RECENT = 3;

/** The app's logo, the same file as the launcher icon. */
const LOGO = require('../assets/icon.png');

type Loaded =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; playerId: string | null; bowler: string | null; sessions: Session[] };

/** The day of the week a time falls on, as the phone names it. */
function weekdayOf(t: number): string {
  return new Date(t).toLocaleDateString(undefined, { weekday: 'long' });
}

export default function Index() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const isFocused = useIsFocused();
  const { unit, featuredDelivery } = useSettings();
  const { isPro, allowance, refreshAnalyses } = usePurchases();
  const largeText = useLargeText();
  const { width: screenWidth } = useWindowDimensions();
  const stillWidth = screenWidth - space.lg * 2;

  const [loaded, setLoaded] = useState<Loaded>({ status: 'loading' });

  // Re-read on focus so finishing setup, saving a delivery or deleting one is
  // reflected without a restart. An existing player is what "already
  // onboarded" means: there is no separate flag to drift out of sync with the
  // data. The previous content stays on screen while it does.
  useEffect(() => {
    if (!isFocused) return;
    refreshAnalyses();
    let alive = true;
    (async () => {
      try {
        // The active player, so the name shown is the one deliveries are saved to.
        const player = await getActivePlayer();
        const sessions = player ? await listSessions({ playerId: player.id }) : [];
        if (alive) setLoaded({ status: 'ready', playerId: player?.id ?? null, bowler: player?.name ?? null, sessions });
      } catch (e) {
        if (alive) setLoaded({ status: 'error', message: errorMessage(e) });
      }
    })();
    return () => {
      alive = false;
    };
  }, [isFocused, refreshAnalyses]);

  const sessions = loaded.status === 'ready' ? loaded.sessions : [];
  // Every delivery read once, through its own measurementState: the best is
  // measured, with its recomputed range, or there is none.
  const listed = useMemo(
    () => sessions.map((s) => ({ id: s.id, createdAt: s.createdAt, state: measurementState(s), session: s })),
    [sessions]
  );
  const best = useMemo(() => personalBest(listed, unit), [listed, unit]);
  // The hero: the delivery this player chose, or the best when they chose none
  // or their choice is gone or no longer counts. Named the personal best only
  // when it is the highest estimate.
  const playerId = loaded.status === 'ready' ? loaded.playerId : null;
  const chosenId = playerId ? featuredDelivery[playerId] : null;
  const hero = useMemo(() => heroDelivery(listed, unit, chosenId), [listed, unit, chosenId]);
  const heroView = hero ? readingView(hero.delivery.state, unit) : null;
  // The hero's needle sweeps once it is laid out. Home is not pushed, so there
  // is no transition to wait for.
  const heroReveal = useReveal({ ready: heroView?.kind === 'measured', afterTransition: false });
  const [picking, setPicking] = useState(false);
  // Newest first, only readings that count: the ones the hero may show.
  const choices = useMemo(() => countingDeliveries(listed, unit), [listed, unit]);
  const choose = (id: string) => {
    if (!playerId) return;
    // Picking the best follows the best, so a faster delivery later takes over.
    updateSettings(featuring(featuredDelivery, playerId, best && id === best.id ? null : id));
    setPicking(false);
  };

  const open = (id: string) => router.push({ pathname: '/analysis', params: { id } });

  let body: React.ReactNode;
  if (loaded.status === 'loading') {
    body = (
      <View>
        <Text style={styles.muted}>Loading deliveries…</Text>
        <View style={styles.placeholder} />
        <View style={styles.placeholder} />
      </View>
    );
  } else if (loaded.status === 'error') {
    body = (
      <EmptyState title="Could not read saved deliveries" body={loaded.message} />
    );
  } else if (loaded.bowler === null) {
    body = (
      <View style={styles.welcome}>
        <View style={styles.stillCard}>
          <CricketStill width={stillWidth} height={size.still} />
        </View>
        <Text style={styles.h1}>A speed gun in your phone.</Text>
        <Text style={styles.sub}>
          Record a delivery, mark four points, and get the average speed to bounce with its
          error range.
        </Text>
        <ActionButton
          label="Get started"
          onPress={() => router.push('/setup/player')}
          style={styles.primary}
        />
        <Text style={styles.footnote}>Three screens. Nothing to sign up for.</Text>
      </View>
    );
  } else {
    const allowanceNote = isPro ? null : allowanceLine(allowance, weekdayOf);
    const thisWeek = measuredThisWeek(listed, Date.now());
    body = (
      <>
        <Text style={styles.greeting}>Ready, {loaded.bowler}?</Text>

        {/* The hero: the personal best on the Result speedometer, with its
            range, or the honest empty state. Never a sample reading. */}
        {sessions.length === 0 ? (
          <View style={styles.stillCard}>
            <CricketStill width={stillWidth} height={size.still} />
            <View style={styles.stillCopy}>
              <Text style={styles.h2}>Your first reading starts here.</Text>
              <Text style={styles.muted}>Film a delivery and mark what you can see.</Text>
            </View>
          </View>
        ) : hero && heroView?.kind === 'measured' ? (
          <Pressable
            onPress={() => setPicking(true)}
            accessibilityRole="button"
            accessibilityLabel={`${hero.title}. ${heroView.spoken} Choose the delivery shown here.`}
          >
            <FloodlitPanel style={styles.hero}>
              <View style={styles.heroHead}>
                <Text style={styles.heroLabel}>{hero.title.toUpperCase()}</Text>
                <Text style={styles.heroChange}>CHANGE</Text>
              </View>
              <View style={styles.heroGauge} onLayout={heroReveal.onLayout}>
                <SpeedGauge reading={heroView} unit={unit} width={size.gaugeSmall} sweep={heroReveal} />
              </View>
              <ReadingBlock reading={heroView} size="heroCompact" />
              <Text style={styles.caption}>{formatWhen(hero.delivery.createdAt)}</Text>
            </FloodlitPanel>
          </Pressable>
        ) : (
          <FloodlitPanel style={styles.hero}>
            <Text style={styles.heroLabel}>PERSONAL BEST</Text>
            <Text style={styles.muted}>
              Nothing measured yet. The fastest saved delivery shows here.
            </Text>
          </FloodlitPanel>
        )}

        {/* The largest control on the screen, with a lit edge. */}
        <LitEdge style={styles.primary}>
          <ActionButton
            label="Record a delivery"
            onPress={() => router.push('/capture')}
            large
          />
        </LitEdge>
        <View style={styles.allowance}>
          <AllowanceLine line={allowanceNote} allowance={allowance} weekday={weekdayOf} />
        </View>

        {/* This week, from the saved deliveries and the allowance only. */}
        <Text style={styles.sectionLabel}>THIS WEEK</Text>
        <View style={styles.pills}>
          <Pill value={String(thisWeek)} label={thisWeek === 1 ? 'Delivery measured' : 'Deliveries measured'} />
          {isPro ? (
            <Pill value="Pro" label="Unlimited analyses" />
          ) : (
            <Pill value={String(allowance.left)} label={allowance.left === 1 ? 'Analysis left' : 'Analyses left'} />
          )}
        </View>

        {sessions.length === 0 ? null : (
          <>
            <View style={styles.recentHead}>
              <Text style={styles.h2}>Recent deliveries</Text>
              <Pressable
                style={styles.seeAll}
                onPress={() => router.push('/history')}
                accessibilityRole="button"
                accessibilityLabel="See all deliveries"
              >
                <Text style={styles.seeAllText}>See all</Text>
              </Pressable>
            </View>
            <ScrollView
              horizontal={!largeText}
              showsHorizontalScrollIndicator={false}
              // Out to the screen's edges, so a card can scroll off them.
              style={styles.recentStrip}
              contentContainerStyle={largeText ? styles.recentStack : styles.recentRow}
            >
              {listed.slice(0, RECENT).map((d) => {
                const view = readingView(d.state, unit);
                return (
                  <Pressable
                    key={d.id}
                    onPress={() => open(d.id)}
                    accessibilityRole="button"
                    accessibilityLabel={`${formatWhen(d.createdAt)}. ${
                      view.kind === 'measured' ? view.spoken : 'No speed.'
                    } Open it.`}
                  >
                    <DeliveryCard
                      thumb={releaseFrameUri(d.session)}
                      reading={view}
                      when={formatWhen(d.createdAt)}
                      best={best?.id === d.id}
                      wide={largeText}
                      check={needsChecking(d.state, unit)}
                    />
                  </Pressable>
                );
              })}
            </ScrollView>
          </>
        )}
      </>
    );
  }

  const bowler = loaded.status === 'ready' ? loaded.bowler : null;

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      <View style={styles.top}>
        <View style={styles.brand}>
          {/* The logo, not a photo: decorative beside the name. */}
          <Image source={LOGO} style={styles.logo} accessibilityIgnoresInvertColors accessible={false} />
          <Text style={styles.wordmark}>Paceball</Text>
        </View>
        {bowler ? (
          // The first letter of the bowler's name, in place of a photo. It
          // opens Stats, which shows the personal best to everyone.
          <Pressable
            style={styles.avatar}
            onPress={() => router.push('/stats')}
            accessibilityRole="button"
            accessibilityLabel={`Stats for ${bowler}`}
          >
            <Text style={styles.avatarText}>{bowler.trim().charAt(0).toUpperCase()}</Text>
          </Pressable>
        ) : null}
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        {body}

        {bowler ? (
          <ActionButton
            variant="text"
            label="How it works"
            onPress={() => router.push('/setup/how-it-works')}
            style={styles.more}
          />
        ) : null}
        {/* Development only. The route itself redirects home in a release build. */}
        {__DEV__ ? (
          <ActionButton variant="text" label="Debug · saved sessions" onPress={() => router.push('/debug')} />
        ) : null}
      </ScrollView>

      {/* Settings is reachable before setup too: restoring a purchase after a
          reinstall should not wait on setting up a player first. */}
      <TabBar current="home" />

      {/* What the hero shows: any measured reading that counts. */}
      <BottomSheet visible={picking} title="Shown on Home" onClose={() => setPicking(false)}>
        {hero ? (
          <ActionButton
            variant="secondary"
            label="Open this delivery"
            onPress={() => {
              setPicking(false);
              open(hero.delivery.id);
            }}
            style={styles.pickerOpen}
          />
        ) : null}
        <Text style={styles.pickerNote}>
          Choose the delivery Home shows. Only measured readings are listed. Anything slower than your
          best is shown as a featured delivery, never as your personal best.
        </Text>
        {choices.map((d) => {
          const view = readingView(d.state, unit);
          const selected = hero?.delivery.id === d.id;
          return (
            <Pressable
              key={d.id}
              onPress={() => choose(d.id)}
              accessibilityRole="radio"
              accessibilityState={{ selected }}
              accessibilityLabel={`${formatWhen(d.createdAt)}. ${view.kind === 'measured' ? view.spoken : ''}${best?.id === d.id ? ' Personal best.' : ''}`}
            >
              <DeliveryRow
                thumb={releaseFrameUri(d.session)}
                reading={view}
                when={formatWhen(d.createdAt)}
                best={best?.id === d.id}
                state={selected ? 'selected' : 'normal'}
              />
            </Pressable>
          );
        })}
      </BottomSheet>
    </View>
  );
}

/** One figure from this week's real data, and what it counts. */
function Pill({ value, label }: { value: string; label: string }) {
  return (
    <View style={styles.pill} accessible accessibilityLabel={`${label}: ${value}`}>
      <Text style={styles.pillValue}>{value}</Text>
      <Text style={styles.pillLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  top: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: size.target,
    paddingHorizontal: space.lg,
    marginTop: space.sm,
  },
  brand: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  logo: { width: size.logo, height: size.logo, borderRadius: radius.sm },
  wordmark: { ...type.h2, color: colors.text },
  avatar: {
    width: size.target,
    height: size.target,
    borderRadius: radius.pill,
    borderWidth: stroke.medium,
    borderColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { ...type.button, color: colors.text },

  content: { paddingHorizontal: space.lg, paddingTop: space.lg, paddingBottom: space.xl },
  h1: { ...type.h1, color: colors.text },
  greeting: { ...type.h2, color: colors.muted },
  h2: { ...type.h2, color: colors.text },
  sub: { ...type.body, color: colors.muted, marginTop: space.sm },
  muted: { ...type.body, color: colors.muted, marginTop: space.sm },
  caption: { ...type.caption, color: colors.muted, textAlign: 'center', marginTop: space.xs },
  footnote: { ...type.caption, color: colors.muted, textAlign: 'center', marginTop: space.md },

  welcome: { paddingTop: space.xl },
  primary: { marginTop: space.lg },
  allowance: { marginTop: space.sm },

  // Floodlit, with depth: the stadium behind, a ruled edge, the reading on top.
  hero: {
    marginTop: space.md,
    paddingVertical: space.lg,
    paddingHorizontal: space.md,
    borderWidth: stroke.hairline,
    borderColor: colors.line,
    alignItems: 'center',
  },
  stillCard: {
    marginTop: space.md,
    borderRadius: radius.xl,
    borderWidth: stroke.hairline,
    borderColor: colors.line,
    backgroundColor: colors.surface,
    overflow: 'hidden',
  },
  stillCopy: { padding: space.md },
  sectionLabel: { ...type.label, color: colors.muted, marginTop: space.xl },
  pills: { flexDirection: 'row', gap: space.sm, marginTop: space.sm },
  pill: {
    flex: 1,
    minHeight: size.target,
    paddingVertical: space.sm,
    paddingHorizontal: space.md,
    borderRadius: radius.lg,
    borderWidth: stroke.hairline,
    borderColor: colors.line,
    backgroundColor: colors.surface,
  },
  pillValue: { ...type.h2, ...type.tabular, color: colors.text },
  pillLabel: { ...type.caption, color: colors.muted },
  heroHead: { flexDirection: 'row', alignSelf: 'stretch', alignItems: 'flex-start', gap: space.sm },
  heroLabel: { ...type.label, color: colors.muted, flex: 1, flexShrink: 1 },
  heroChange: { ...type.label, color: colors.text },
  pickerOpen: { marginTop: space.md },
  pickerNote: { ...type.caption, color: colors.muted, marginVertical: space.md },
  heroGauge: { marginTop: space.sm, marginBottom: space.xs },

  placeholder: {
    minHeight: size.row,
    borderRadius: radius.md,
    borderWidth: stroke.hairline,
    borderColor: colors.line,
    marginTop: space.sm,
  },

  recentStrip: { marginHorizontal: -space.lg, marginTop: space.sm },
  recentRow: { paddingHorizontal: space.lg, gap: space.sm },
  recentStack: { paddingHorizontal: space.lg, gap: space.sm },

  recentHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: space.xl,
  },
  seeAll: { minHeight: size.target, justifyContent: 'center', paddingLeft: space.md },
  seeAllText: { ...type.body, color: colors.text, textDecorationLine: 'underline' },
  more: { marginTop: space.lg },
});
