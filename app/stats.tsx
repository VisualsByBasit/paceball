import { useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useIsFocused, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { getActivePlayer, listSessions } from '../src/data';
import { measurementState } from '../src/physics/measurementState';
import { canSeeStats, useEntitlements, usePurchases } from '../src/purchases';
import { useSettings, type SpeedUnit } from '../src/settings';
import { ActionButton } from '../src/ui/ActionButton';
import { AppBar } from '../src/ui/AppBar';
import { ReadingBlock } from '../src/ui/ReadingBlock';
import { countingDeliveries, latestMeasured, measuredCount, personalBest, type ListedDelivery } from '../src/ui/deliveries';
import { errorMessage, formatWhen } from '../src/ui/format';
import { readingView, type MeasuredReading } from '../src/ui/reading';
import { colors, opacity, radius, size, space, stroke, type } from '../src/ui/tokens';
import { useLargeText } from '../src/ui/useLargeText';

type Loaded =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; deliveries: ListedDelivery[] };

const PLOT_HEIGHT = size.gauge / 2;
const DOT = space.sm;

/**
 * Stats, opened from the Home avatar. The personal best is free and spans the
 * top. Measured deliveries, the latest reading and speed over time are Pro:
 * a free user sees their names, locked, and one way to Pro. Every number is
 * read from saved deliveries through measurementState; nothing is sample data.
 */
export default function StatsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const isFocused = useIsFocused();
  const { unit } = useSettings();
  const entitlements = useEntitlements();
  const { loading } = usePurchases();
  const largeText = useLargeText();
  // Pro reads as false until the store answers, so the locks wait for it.
  const pro = canSeeStats(entitlements);

  const [loaded, setLoaded] = useState<Loaded>({ status: 'loading' });
  useEffect(() => {
    if (!isFocused) return;
    let alive = true;
    (async () => {
      try {
        const player = await getActivePlayer();
        const sessions = player ? await listSessions({ playerId: player.id }) : [];
        const deliveries = sessions.map((s) => ({
          id: s.id,
          createdAt: s.createdAt,
          state: measurementState(s),
        }));
        if (alive) setLoaded({ status: 'ready', deliveries });
      } catch (e) {
        if (alive) setLoaded({ status: 'error', message: errorMessage(e) });
      }
    })();
    return () => {
      alive = false;
    };
  }, [isFocused]);

  const deliveries = loaded.status === 'ready' ? loaded.deliveries : [];
  const best = useMemo(() => personalBest(deliveries, unit), [deliveries, unit]);
  const latest = useMemo(() => latestMeasured(deliveries, unit), [deliveries, unit]);
  const count = useMemo(() => measuredCount(deliveries, unit), [deliveries, unit]);
  // Oldest to newest, measured and plausible only, each with its own recomputed range.
  const points = useMemo(
    () =>
      countingDeliveries(deliveries, unit)
        .reverse()
        .flatMap((d) => {
          const view = readingView(d.state, unit);
          return view.kind === 'measured' ? [{ id: d.id, t: d.createdAt, view }] : [];
        }),
    [deliveries, unit]
  );

  const open = (id: string) => router.push({ pathname: '/analysis', params: { id } });
  const bestView = best ? readingView(best.state, unit) : null;
  const latestView = latest ? readingView(latest.state, unit) : null;

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      <View style={styles.bar}>
        <AppBar title="Stats" onBack={() => router.back()} />
      </View>
      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + space.lg }]}>
        {loaded.status === 'loading' ? (
          <Text style={styles.muted}>Loading deliveries…</Text>
        ) : loaded.status === 'error' ? (
          <Text style={styles.muted}>Could not read saved deliveries: {loaded.message}</Text>
        ) : (
          <View style={styles.grid}>
            {/* Free, and across both columns. */}
            <Tile title="Personal best" wide onPress={best ? () => open(best.id) : undefined}>
              {bestView?.kind === 'measured' ? (
                <>
                  <ReadingBlock reading={bestView} size="reading" />
                  <Text style={styles.caption}>Highest estimate</Text>
                </>
              ) : (
                <Text style={styles.muted}>Nothing measured yet. The fastest saved delivery shows here.</Text>
              )}
            </Tile>

            {pro ? (
              <>
                <Tile title="Measured deliveries" wide={largeText}>
                  <Text style={styles.count}>{count}</Text>
                </Tile>
                <Tile
                  title="Latest reading"
                  wide={largeText}
                  onPress={latest ? () => open(latest.id) : undefined}
                >
                  {latestView?.kind === 'measured' ? (
                    <>
                      <ReadingBlock reading={latestView} size="reading" />
                      <Text style={styles.caption}>{formatWhen(latest!.createdAt)}</Text>
                    </>
                  ) : (
                    <Text style={styles.muted}>Nothing measured yet.</Text>
                  )}
                </Tile>
                <Tile title="Speed over time" wide>
                  {points.length === 0 ? (
                    <Text style={styles.muted}>Measured deliveries appear here, oldest to newest.</Text>
                  ) : (
                    <>
                      <SpeedOverTime points={points} unit={unit} />
                      {/* The chart as a list too: date, speed and range, each opening its delivery. */}
                      {[...points].reverse().map((p) => (
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
                    </>
                  )}
                </Tile>
              </>
            ) : (
              <>
                {['Measured deliveries', 'Latest reading', 'Speed over time'].map((name) => (
                  <Tile key={name} title={name} wide={largeText || name === 'Speed over time'} locked>
                    <Text style={styles.muted}>Pro</Text>
                  </Tile>
                ))}
                <ActionButton
                  label="See Pro stats"
                  onPress={() => router.push({ pathname: '/paywall', params: { context: 'stats' } })}
                  disabledReason={loading ? 'Checking your plan…' : null}
                  style={styles.cta}
                />
              </>
            )}
          </View>
        )}
      </ScrollView>
    </View>
  );
}

function Tile({
  title,
  wide = false,
  locked = false,
  onPress,
  children,
}: {
  title: string;
  wide?: boolean;
  locked?: boolean;
  onPress?: () => void;
  children: React.ReactNode;
}) {
  const body = (
    <>
      <View style={styles.tileHead}>
        <Text style={styles.tileTitle}>{title}</Text>
        {locked ? (
          <Text style={styles.lock} accessibilityLabel="Locked">
            LOCKED
          </Text>
        ) : null}
      </View>
      {children}
    </>
  );
  const style = [styles.tile, wide ? styles.tileWide : styles.tileHalf, locked && styles.tileLocked];
  return onPress ? (
    <Pressable style={style} onPress={onPress} accessibilityRole="button" accessibilityLabel={`${title}. Open it.`}>
      {body}
    </Pressable>
  ) : (
    <View style={style}>{body}</View>
  );
}

/**
 * Each measured delivery as a point with its range as a vertical bar, oldest
 * to newest, on a scale that holds every range. Points only: a smoothed line
 * would draw speeds nobody measured.
 */
function SpeedOverTime({
  points,
  unit,
}: {
  points: { id: string; t: number; view: MeasuredReading }[];
  unit: SpeedUnit;
}) {
  const [width, setWidth] = useState(0);
  const lo = Math.max(0, Math.min(...points.map((p) => p.view.value - p.view.error)));
  const hi = Math.max(...points.map((p) => p.view.value + p.view.error));
  const span = Math.max(hi - lo, 1);
  const y = (v: number) => PLOT_HEIGHT - ((v - lo) / span) * PLOT_HEIGHT;
  const slot = points.length > 0 ? width / points.length : 0;

  return (
    <View
      style={styles.plot}
      onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
      accessible
      accessibilityLabel={`${points.length} measured ${points.length === 1 ? 'delivery' : 'deliveries'}, from ${lo.toFixed(1)} to ${hi.toFixed(1)} ${unit === 'mph' ? 'miles per hour' : 'kilometres per hour'}. Each is listed below.`}
    >
      {width > 0
        ? points.map((p, i) => {
            const x = (i + 0.5) * slot;
            const top = y(p.view.value + p.view.error);
            const bottom = y(Math.max(lo, p.view.value - p.view.error));
            return (
              <View key={p.id} pointerEvents="none">
                <View style={[styles.whisker, { left: x - stroke.medium / 2, top, height: bottom - top }]} />
                <View style={[styles.dot, { left: x - DOT / 2, top: y(p.view.value) - DOT / 2 }]} />
              </View>
            );
          })
        : null}
      <View style={styles.axis}>
        <Text style={styles.axisText}>{lo.toFixed(0)}</Text>
        <Text style={styles.axisText}>{hi.toFixed(0)}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  bar: { paddingHorizontal: space.md },
  content: { paddingHorizontal: space.lg, paddingTop: space.md },
  muted: { ...type.body, color: colors.muted },
  caption: { ...type.caption, color: colors.muted, textAlign: 'center', marginTop: space.xs },

  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  tile: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: stroke.hairline,
    borderColor: colors.line,
    padding: space.md,
  },
  tileWide: { width: '100%' },
  // Two to a row, with the gap between them.
  tileHalf: { flexGrow: 1, flexBasis: '40%' },
  tileLocked: { borderColor: colors.control },
  tileHead: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: space.sm },
  tileTitle: { ...type.label, color: colors.muted },
  lock: { ...type.label, color: colors.text },
  count: { ...type.reading, ...type.mono, color: colors.text },
  cta: { marginTop: space.md },

  plot: { height: PLOT_HEIGHT + space.lg, marginBottom: space.md },
  whisker: { position: 'absolute', width: stroke.medium, backgroundColor: colors.text, opacity: opacity.secondary },
  dot: {
    position: 'absolute',
    width: DOT,
    height: DOT,
    borderRadius: radius.pill,
    backgroundColor: colors.accent,
  },
  axis: {
    position: 'absolute',
    left: space.xs - space.xs,
    right: space.xs - space.xs,
    top: PLOT_HEIGHT + space.xs,
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  axisText: { ...type.caption, ...type.tabular, color: colors.muted },

  listRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    minHeight: size.target,
    borderTopWidth: stroke.hairline,
    borderColor: colors.line,
  },
  listDate: { ...type.caption, color: colors.muted },
  listSpeed: { ...type.body, ...type.mono, color: colors.text },
  listRange: { ...type.caption, ...type.mono, color: colors.muted },
});
