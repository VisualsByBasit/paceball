import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { useIsFocused, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { getActivePlayer, listSessions } from '../src/data';
import { measurementState } from '../src/physics/measurementState';
import { canSeeStats, useEntitlements, usePurchases } from '../src/purchases';
import { useSettings } from '../src/settings';
import { ActionButton } from '../src/ui/ActionButton';
import { AppBar } from '../src/ui/AppBar';
import { EmptyState } from '../src/ui/EmptyState';
import { GlossCard, IconBadge, StatIcon, type StatIconName } from '../src/ui/GlossCard';
import { ReadingBlock } from '../src/ui/ReadingBlock';
import { DayBars, HalfGauge, MeasuredDonut, SpeedChart } from '../src/ui/StatsCharts';
import { errorMessage, formatWhen } from '../src/ui/format';
import { readingView } from '../src/ui/reading';
import { confidenceOf, statsSummary, tileColumns, type StatsDelivery } from '../src/ui/stats';
import { colors, size, space, stroke, type } from '../src/ui/tokens';
import { useLargeText } from '../src/ui/useLargeText';

type Loaded =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; deliveries: StatsDelivery[] };

/** How many readings the list under Speed over time shows before "Show all". */
const LISTED = 5;

/**
 * Stats, opened from the Home avatar: a dashboard of the player's own saved
 * deliveries. The personal best is free; every other tile is Pro, and a free
 * user sees its title and icon, locked, and one way to Pro. Every figure comes
 * from saved deliveries through measurementState. There is no sample data, no
 * speed without its range, and an implausible reading counts only as a saved
 * delivery.
 */
export default function StatsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const isFocused = useIsFocused();
  const { unit } = useSettings();
  const entitlements = useEntitlements();
  const { loading } = usePurchases();
  const largeText = useLargeText();
  const { width, fontScale } = useWindowDimensions();
  // Pro reads as false until the store answers, so the locks wait for it.
  const pro = canSeeStats(entitlements);

  const [loaded, setLoaded] = useState<Loaded>({ status: 'loading' });
  const [showAll, setShowAll] = useState(false);
  useEffect(() => {
    if (!isFocused) return;
    let alive = true;
    (async () => {
      try {
        const player = await getActivePlayer();
        const sessions = player ? await listSessions({ playerId: player.id }) : [];
        const deliveries = sessions.map((s): StatsDelivery => {
          const state = measurementState(s);
          return { id: s.id, createdAt: s.createdAt, state, confidence: confidenceOf(state, s.markConfidence) };
        });
        if (alive) setLoaded({ status: 'ready', deliveries });
      } catch (e) {
        if (alive) setLoaded({ status: 'error', message: errorMessage(e) });
      }
    })();
    return () => {
      alive = false;
    };
  }, [isFocused]);

  const deliveries = loaded.status === 'ready' ? loaded.deliveries : null;
  const summary = useMemo(
    () => (deliveries ? statsSummary(deliveries, unit, Date.now()) : null),
    [deliveries, unit]
  );

  const open = (id: string) => router.push({ pathname: '/analysis', params: { id } });
  const toPaywall = () => router.push({ pathname: '/paywall', params: { context: 'stats' } });
  const contentWidth = width - space.lg * 2;
  const kpiColumns = tileColumns(contentWidth, fontScale, size.kpiMin, space.sm, 3);
  const kpiWidth = (contentWidth - space.sm * (kpiColumns - 1)) / kpiColumns;

  let body: ReactNode;
  if (loaded.status === 'loading' || summary === null) {
    body =
      loaded.status === 'error' ? (
        <EmptyState title="Could not read saved deliveries" body={loaded.message} />
      ) : (
        <Text style={styles.muted}>Loading your stats…</Text>
      );
  } else if (summary.deliveries === 0) {
    body = (
      <EmptyState
        title="No stats yet"
        body="Film a delivery and mark what you can see. Your stats build from every delivery you save."
        action={{ label: 'Record a delivery', onPress: () => router.push('/capture') }}
      />
    );
  } else {
    const best = summary.best;
    const bestView = best ? readingView(best.state, unit) : null;
    const listed = [...summary.points].reverse();
    const shown = showAll ? listed : listed.slice(0, LISTED);
    const leftOut =
      summary.toCheck > 0
        ? `${summary.toCheck} ${summary.toCheck === 1 ? 'reading' : 'readings'} to check ${summary.toCheck === 1 ? 'is' : 'are'} left out.`
        : null;

    body = (
      <>
        {/* KPIs: as many across as fit the text size, never overlapping. */}
        <View style={styles.kpis}>
          {(
            [
              ['deliveries', 'Deliveries', summary.deliveries, 'saved'],
              ['measured', 'Measured', summary.measured, 'with a speed'],
              ['week', 'This week', summary.thisWeek, 'in 7 days'],
            ] as const
          ).map(([icon, title, value, caption]) =>
            pro ? (
              <GlossCard key={title} style={{ width: kpiWidth }} accessibilityLabel={`${title}: ${value} ${caption}.`}>
                <IconBadge name={icon} />
                <Text style={styles.kpiValue}>{value}</Text>
                <Text style={styles.kpiTitle}>{title}</Text>
                <Text style={styles.kpiCaption}>{caption}</Text>
              </GlossCard>
            ) : (
              <LockedTile key={title} icon={icon} title={title} style={{ width: kpiWidth }} />
            )
          )}
        </View>

        {/* Free, and across the width: the one tile every player gets. */}
        <GlossCard
          style={styles.wide}
          onPress={best ? () => open(best.id) : undefined}
          accessibilityLabel={bestView?.kind === 'measured' ? `Personal best. ${bestView.spoken} Highest estimate. Open it.` : undefined}
        >
          <TileHead icon="best" title="Personal best" />
          {bestView?.kind === 'measured' && best ? (
            <>
              <ReadingBlock reading={bestView} size="reading" />
              <Text style={styles.centerCaption}>Highest estimate · {formatWhen(best.createdAt)}</Text>
            </>
          ) : (
            <Text style={styles.muted}>Nothing measured yet. The fastest saved delivery shows here.</Text>
          )}
        </GlossCard>

        {pro ? (
          <>
            <GlossCard style={styles.wide}>
              <TileHead icon="trend" title="Speed over time" />
              {summary.points.length === 0 ? (
                <Text style={styles.muted}>Measured deliveries appear here, oldest to newest, each with its range.</Text>
              ) : (
                <>
                  <SpeedChart points={summary.points} unit={unit} />
                  {/* The chart as a list too: date, speed and range, each opening its delivery. */}
                  {shown.map((p) => (
                    <Pressable
                      key={p.id}
                      style={styles.listRow}
                      onPress={() => open(p.id)}
                      accessibilityRole="button"
                      accessibilityLabel={`${formatWhen(p.t)}. ${p.view.spoken} Open it.`}
                    >
                      <Text style={styles.listDate}>{formatWhen(p.t)}</Text>
                      <Text style={styles.listSpeed}>
                        {p.view.speed} <Text style={styles.listRange}>{p.view.range}</Text>
                      </Text>
                    </Pressable>
                  ))}
                  {listed.length > LISTED ? (
                    <ActionButton
                      variant="text"
                      label={showAll ? 'Show fewer' : `Show all ${listed.length}`}
                      onPress={() => setShowAll((v) => !v)}
                    />
                  ) : null}
                </>
              )}
              {leftOut ? <Text style={styles.note}>{leftOut}</Text> : null}
            </GlossCard>

            <GlossCard style={styles.wide}>
              <TileHead icon="bars" title="Deliveries per day" />
              <DayBars days={summary.perDay} narrowLabels={largeText} />
              <Text style={styles.note}>Every saved delivery, the last seven days.</Text>
            </GlossCard>

            <GlossCard style={styles.wide}>
              <TileHead icon="gauge" title="Bounce confidence" />
              {summary.confidence.total === 0 ? (
                <Text style={styles.muted}>How you marked each bounce shows here.</Text>
              ) : (
                <View style={largeText ? styles.stack : styles.pair}>
                  <HalfGauge part={summary.confidence.seen} whole={summary.confidence.total} label="Seen" tone="accent" />
                  <HalfGauge part={summary.confidence.uncertain} whole={summary.confidence.total} label="Uncertain" tone="warn" />
                </View>
              )}
              {summary.confidence.guessed > 0 ? (
                <Text style={styles.note}>
                  {summary.confidence.guessed} guessed, with no speed.
                </Text>
              ) : null}
            </GlossCard>

            <GlossCard style={styles.wide}>
              <TileHead icon="donut" title="Measured vs no speed" />
              {summary.outcome.measured + summary.outcome.noSpeed === 0 ? (
                <Text style={styles.muted}>Measured and no-speed deliveries show here.</Text>
              ) : (
                <View
                  style={largeText ? styles.stack : styles.donutRow}
                  accessible
                  accessibilityLabel={`${summary.outcome.measured} measured, ${summary.outcome.noSpeed} with no speed.`}
                >
                  <MeasuredDonut measured={summary.outcome.measured} noSpeed={summary.outcome.noSpeed} />
                  <View style={styles.legend} importantForAccessibility="no-hide-descendants">
                    <Legend swatch={colors.accent} label="Measured" value={summary.outcome.measured} />
                    <Legend swatch={colors.control} label="No speed" value={summary.outcome.noSpeed} />
                  </View>
                </View>
              )}
              {leftOut ? <Text style={styles.note}>{leftOut}</Text> : null}
            </GlossCard>
          </>
        ) : (
          <>
            {(
              [
                ['trend', 'Speed over time'],
                ['bars', 'Deliveries per day'],
                ['gauge', 'Bounce confidence'],
                ['donut', 'Measured vs no speed'],
              ] as const
            ).map(([icon, title]) => (
              <LockedTile key={title} icon={icon} title={title} style={styles.wide} />
            ))}
            <ActionButton
              label="See Pro stats"
              onPress={toPaywall}
              disabledReason={loading ? 'Checking your plan…' : null}
              style={styles.cta}
            />
          </>
        )}
      </>
    );
  }

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      <View style={styles.bar}>
        <AppBar title="Stats" onBack={() => router.back()} />
      </View>
      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + space.lg }]}>
        {body}
      </ScrollView>
    </View>
  );
}

/**
 * A tile's heading: its badge, then its title, which takes the rest of the row
 * and wraps. The old heading set the title and a "LOCKED" word side by side,
 * neither able to shrink, which ran them into each other in a half-width tile.
 */
function TileHead({ icon, title, live = true }: { icon: StatIconName; title: string; live?: boolean }) {
  return (
    <View style={styles.head}>
      <IconBadge name={icon} live={live} />
      <Text style={styles.headTitle} accessibilityRole="header">
        {title}
      </Text>
    </View>
  );
}

/** A Pro tile for a free user: its name and icon, a lock, and nothing pretending to be data. */
function LockedTile({ icon, title, style }: { icon: StatIconName; title: string; style?: object }) {
  return (
    <GlossCard style={style} accessibilityLabel={`${title}. Locked, part of Pro.`}>
      <TileHead icon={icon} title={title} live={false} />
      <View style={styles.locked}>
        <StatIcon name="lock" color={colors.muted} />
        <Text style={styles.lockedText}>Pro</Text>
      </View>
    </GlossCard>
  );
}

function Legend({ swatch, label, value }: { swatch: string; label: string; value: number }) {
  return (
    <View style={styles.legendRow}>
      <View style={[styles.swatch, { backgroundColor: swatch }]} />
      <Text style={styles.legendLabel}>{label}</Text>
      <Text style={styles.legendValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  bar: { paddingHorizontal: space.md },
  content: { paddingHorizontal: space.lg, paddingTop: space.md, gap: space.md },
  muted: { ...type.body, color: colors.muted },
  note: { ...type.caption, color: colors.muted, marginTop: space.sm },
  centerCaption: { ...type.caption, color: colors.muted, textAlign: 'center', marginTop: space.xs },

  kpis: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  kpiValue: { ...type.h1, ...type.tabular, color: colors.text, marginTop: space.sm },
  kpiTitle: { ...type.body, color: colors.text, fontWeight: '700', flexShrink: 1 },
  kpiCaption: { ...type.caption, color: colors.muted, flexShrink: 1 },
  wide: { alignSelf: 'stretch' },

  head: { flexDirection: 'row', alignItems: 'center', gap: space.sm, marginBottom: space.md },
  headTitle: { ...type.body, color: colors.text, fontWeight: '700', flex: 1, flexShrink: 1 },
  locked: { flexDirection: 'row', alignItems: 'center', gap: space.xs },
  lockedText: { ...type.caption, color: colors.muted, flexShrink: 1 },
  cta: { marginTop: space.sm },

  pair: { flexDirection: 'row', justifyContent: 'space-around', gap: space.md },
  stack: { alignItems: 'center', gap: space.lg },
  donutRow: { flexDirection: 'row', alignItems: 'center', gap: space.lg },
  legend: { flex: 1, gap: space.sm },
  legendRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm, minHeight: size.target },
  swatch: { width: space.md, height: space.md, borderRadius: space.xs },
  legendLabel: { ...type.body, color: colors.text, flex: 1, flexShrink: 1 },
  legendValue: { ...type.h2, ...type.tabular, color: colors.text },

  listRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: space.sm,
    minHeight: size.target,
    borderTopWidth: stroke.hairline,
    borderColor: colors.line,
  },
  listDate: { ...type.caption, color: colors.muted, flexShrink: 1 },
  listSpeed: { ...type.body, ...type.mono, color: colors.text },
  listRange: { ...type.caption, ...type.mono, color: colors.muted },
});
