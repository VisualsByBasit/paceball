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
import { StatIcon, type StatIconName } from '../src/ui/GlossCard';
import { ReadingBlock } from '../src/ui/ReadingBlock';
import { CardTitle, ProPill, Rise, StatCard } from '../src/ui/StatCard';
import { DayBars, LockedPreview, SpeedChart, SplitBar } from '../src/ui/StatsCharts';
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

/** The KPI tiles: short labels, so three fit across a small phone at large text (stats-labels.test). */
const KPIS = [
  ['deliveries', 'Deliveries', 'saved'],
  ['measured', 'Measured', 'with a speed'],
  ['week', 'This week', 'in the last 7 days'],
] as const;

/** The Pro cards a free player sees locked, and one line on what each shows. */
const LOCKED = [
  ['trend', 'Speed over time', 'trend', 'Every measured delivery, with its range.'],
  ['bars', 'Deliveries per day', 'bars', 'How many you saved each day this week.'],
  ['gauge', 'Bounce confidence', 'split', 'How clearly you saw each bounce.'],
  ['donut', 'Measured vs no speed', 'split', 'How many deliveries gave a speed.'],
] as const;

/**
 * Stats, opened from the Home avatar: a calm instrument panel of the player's
 * own saved deliveries. Flat cards, small letter-spaced titles, figures in the
 * app's face with tabular digits, thin charts. The personal best is free;
 * every other card is Pro, and a free user sees each as a dimmed outline of
 * its shape, a Pro pill and one line on what it shows, and one way to Pro.
 * Every figure comes from saved deliveries through measurementState. There is
 * no sample data, no speed without its range, and an implausible reading
 * counts only as a saved delivery.
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
  const contentWidth = width - space.md * 2;
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

    const kpiValues = [summary.deliveries, summary.measured, summary.thisWeek];
    let order = 0;
    body = (
      <>
        {/* KPIs: as many across as fit the text size, never overlapping. */}
        <View style={styles.kpis}>
          {KPIS.map(([icon, title, caption], i) => (
            <Rise key={title} index={order++} style={{ width: kpiWidth }}>
              {pro ? (
                <StatCard style={styles.kpi} accessibilityLabel={`${title}: ${kpiValues[i]} ${caption}.`}>
                  <StatIcon name={icon} color={colors.muted} dim={size.iconSmall} />
                  <Text style={styles.kpiTitle}>{title}</Text>
                  <Text style={styles.kpiValue}>{kpiValues[i]}</Text>
                </StatCard>
              ) : (
                <LockedTile icon={icon} title={title} />
              )}
            </Rise>
          ))}
        </View>

        {/* Free, and across the width: the one card every player gets. */}
        <Rise index={order++}>
          <StatCard
            onPress={best ? () => open(best.id) : undefined}
            accessibilityLabel={bestView?.kind === 'measured' ? `Personal best. ${bestView.spoken} Highest estimate. Open it.` : undefined}
          >
            <TileHead icon="best" title="Personal best" />
            {bestView?.kind === 'measured' && best ? (
              <>
                <ReadingBlock reading={bestView} size="reading" face="tabular" />
                <Text style={styles.centerCaption}>Highest estimate · {formatWhen(best.createdAt)}</Text>
              </>
            ) : (
              <Text style={styles.muted}>Nothing measured yet. The fastest saved delivery shows here.</Text>
            )}
          </StatCard>
        </Rise>

        {pro ? (
          <>
            <Rise index={order++}>
              <StatCard>
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
              </StatCard>
            </Rise>

            <Rise index={order++}>
              <StatCard>
                <TileHead icon="bars" title="Deliveries per day" />
                <DayBars days={summary.perDay} narrowLabels={largeText} />
                <Text style={styles.note}>Every saved delivery, the last seven days. Today in full lime.</Text>
              </StatCard>
            </Rise>

            <Rise index={order++}>
              <StatCard>
                <TileHead icon="gauge" title="Bounce confidence" />
                {summary.confidence.total === 0 ? (
                  <Text style={styles.muted}>How you marked each bounce shows here.</Text>
                ) : (
                  <SplitBar
                    spoken={`Bounce confidence: ${summary.confidence.seen} seen, ${summary.confidence.uncertain} uncertain, ${summary.confidence.guessed} guessed, of ${summary.confidence.total}.`}
                    parts={[
                      { label: 'Seen', value: summary.confidence.seen, color: colors.accent },
                      { label: 'Uncertain', value: summary.confidence.uncertain, color: colors.warn },
                      { label: 'Guessed', value: summary.confidence.guessed, color: colors.control },
                    ]}
                  />
                )}
                {summary.confidence.guessed > 0 ? (
                  <Text style={styles.note}>A guessed bounce gives no speed.</Text>
                ) : null}
              </StatCard>
            </Rise>

            <Rise index={order++}>
              <StatCard>
                <TileHead icon="donut" title="Measured vs no speed" />
                {summary.outcome.measured + summary.outcome.noSpeed === 0 ? (
                  <Text style={styles.muted}>Measured and no-speed deliveries show here.</Text>
                ) : (
                  <SplitBar
                    spoken={`${summary.outcome.measured} measured, ${summary.outcome.noSpeed} with no speed.`}
                    parts={[
                      { label: 'Measured', value: summary.outcome.measured, color: colors.accent },
                      { label: 'No speed', value: summary.outcome.noSpeed, color: colors.control },
                    ]}
                  />
                )}
                {leftOut ? <Text style={styles.note}>{leftOut}</Text> : null}
              </StatCard>
            </Rise>
          </>
        ) : (
          <>
            {LOCKED.map(([icon, title, preview, line]) => (
              <Rise key={title} index={order++}>
                <LockedTile icon={icon} title={title} preview={preview} line={line} />
              </Rise>
            ))}
            <Rise index={order++}>
              <ActionButton
                label="See Pro stats"
                onPress={toPaywall}
                disabledReason={loading ? 'Checking your plan…' : null}
                style={styles.cta}
              />
            </Rise>
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

/** A card's heading: a small quiet icon, then its title in the instrument's label face. */
function TileHead({ icon, title }: { icon: StatIconName; title: string }) {
  return <CardTitle icon={icon} title={title} />;
}

/**
 * A Pro card for a free player: its name, a dimmed outline of its shape (never
 * a figure, never the player's data), a small Pro pill and one line on what it
 * shows. A KPI tile locks the same way, with the pill where its figure would be.
 */
function LockedTile({
  icon,
  title,
  preview,
  line,
}: {
  icon: StatIconName;
  title: string;
  preview?: 'trend' | 'bars' | 'split';
  line?: string;
}) {
  if (!preview) {
    return (
      <StatCard style={styles.kpi} accessibilityLabel={`${title}. Part of Pro.`}>
        <StatIcon name={icon} color={colors.muted} dim={size.iconSmall} />
        <Text style={styles.kpiTitle}>{title}</Text>
        <View style={styles.kpiLocked}>
          <ProPill />
        </View>
      </StatCard>
    );
  }
  return (
    <StatCard accessibilityLabel={`${title}. Part of Pro. ${line ?? ''}`}>
      <CardTitle icon={icon} title={title} right={<ProPill />} />
      <LockedPreview kind={preview} />
      {line ? <Text style={styles.lockedText}>{line}</Text> : null}
    </StatCard>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  bar: { paddingHorizontal: space.md },
  content: { paddingHorizontal: space.md, paddingTop: space.md, gap: space.md },
  muted: { ...type.body, color: colors.muted },
  note: { ...type.caption, color: colors.muted, marginTop: space.md },
  centerCaption: { ...type.caption, color: colors.muted, textAlign: 'center', marginTop: space.xs },

  kpis: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  // Icon on top, then a one-word label on one line, then the figure.
  kpi: { paddingHorizontal: space.sm, paddingVertical: space.md, gap: space.xs, flexGrow: 1 },
  kpiTitle: { ...type.caption, color: colors.muted, marginTop: space.xs, flexShrink: 1 },
  kpiValue: { ...type.h1, ...type.tabular, color: colors.text },
  kpiLocked: { minHeight: type.h1.lineHeight, justifyContent: 'center', alignItems: 'flex-start' },

  lockedText: { ...type.caption, color: colors.muted, marginTop: space.md, flexShrink: 1 },
  cta: { marginTop: space.sm },

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
  listSpeed: { ...type.body, ...type.tabular, color: colors.text },
  listRange: { ...type.caption, ...type.tabular, color: colors.muted },
});
