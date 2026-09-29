import { useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useIsFocused, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { releaseFrameUri } from '../src/capture/useFrames';
import { getActivePlayer, listSessions } from '../src/data';
import { measurementState } from '../src/physics/measurementState';
import { allowanceLine, usePurchases } from '../src/purchases';
import { useSettings } from '../src/settings';
import { ActionButton } from '../src/ui/ActionButton';
import { AllowanceLine } from '../src/ui/AllowanceLine';
import { DeliveryCard } from '../src/ui/DeliveryCard';
import { EmptyState } from '../src/ui/EmptyState';
import { ReadingBlock } from '../src/ui/ReadingBlock';
import { SpeedGauge } from '../src/ui/SpeedGauge';
import { TabBar } from '../src/ui/TabBar';
import { personalBest } from '../src/ui/deliveries';
import { errorMessage, formatWhen } from '../src/ui/format';
import { readingView } from '../src/ui/reading';
import { colors, radius, size, space, stroke, type } from '../src/ui/tokens';
import type { Session } from '../src/types';
import { useLargeText } from '../src/ui/useLargeText';

/** How many of the latest deliveries Home lists before "See all". */
const RECENT = 3;

type Loaded =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; bowler: string | null; sessions: Session[] };

/** The day of the week a time falls on, as the phone names it. */
function weekdayOf(t: number): string {
  return new Date(t).toLocaleDateString(undefined, { weekday: 'long' });
}

export default function Index() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const isFocused = useIsFocused();
  const { unit } = useSettings();
  const { isPro, allowance, refreshAnalyses } = usePurchases();
  const largeText = useLargeText();

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
        if (alive) setLoaded({ status: 'ready', bowler: player?.name ?? null, sessions });
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
  const best = useMemo(() => personalBest(listed), [listed]);
  const bestView = best ? readingView(best.state, unit) : null;

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
    body = (
      <>
        <Text style={styles.h1}>Ready, {loaded.bowler}?</Text>

        {/* The hero: the personal best on the Result speedometer, with its
            range, or the honest empty state. Never a sample reading. */}
        {sessions.length === 0 ? (
          <View style={styles.hero}>
            <EmptyState
              title="Your first reading starts here."
              body="Film a delivery and mark what you can see."
            />
          </View>
        ) : best && bestView?.kind === 'measured' ? (
          <Pressable
            style={styles.hero}
            onPress={() => open(best.id)}
            accessibilityRole="button"
            accessibilityLabel={`Personal best. ${bestView.spoken} Highest estimate. Open it.`}
          >
            <Text style={styles.heroLabel}>PERSONAL BEST</Text>
            <View style={styles.heroGauge}>
              <SpeedGauge reading={bestView} unit={unit} width={size.gaugeSmall} />
            </View>
            <ReadingBlock reading={bestView} size="heroCompact" />
            <Text style={styles.caption}>Highest estimate · {formatWhen(best.createdAt)}</Text>
          </Pressable>
        ) : (
          <View style={styles.hero}>
            <Text style={styles.heroLabel}>PERSONAL BEST</Text>
            <Text style={styles.muted}>
              Nothing measured yet. The fastest saved delivery shows here.
            </Text>
          </View>
        )}

        <ActionButton
          label="Record a delivery"
          onPress={() => router.push('/capture')}
          large
          style={styles.primary}
        />
        <View style={styles.allowance}>
          <AllowanceLine line={allowanceNote} allowance={allowance} weekday={weekdayOf} />
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
        <Text style={styles.wordmark}>Paceball</Text>
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
  h2: { ...type.h2, color: colors.text },
  sub: { ...type.body, color: colors.muted, marginTop: space.sm },
  muted: { ...type.body, color: colors.muted, marginTop: space.sm },
  caption: { ...type.caption, color: colors.muted, textAlign: 'center', marginTop: space.xs },
  footnote: { ...type.caption, color: colors.muted, textAlign: 'center', marginTop: space.md },

  welcome: { paddingTop: space.xl },
  primary: { marginTop: space.lg },
  allowance: { marginTop: space.sm },

  hero: {
    marginTop: space.lg,
    paddingVertical: space.lg,
    paddingHorizontal: space.md,
    borderRadius: radius.xl,
    borderWidth: stroke.hairline,
    borderColor: colors.line,
    backgroundColor: colors.surface,
    alignItems: 'center',
  },
  heroLabel: { ...type.label, color: colors.muted, alignSelf: 'flex-start' },
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
