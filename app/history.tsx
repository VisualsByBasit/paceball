import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Image,
  Pressable,
  StyleSheet,
  Text,
  View,
  type GestureResponderEvent,
} from 'react-native';
import { useIsFocused, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { frameUri } from '../src/capture/useFrames';
import { getTrend, listPlayers, listSessions } from '../src/data';
import { CALIBRATION_SPECS } from '../src/physics/calibration';
import { colors, opacity, radius, space, stroke, type } from '../src/ui/tokens';
import type { Session, Trend } from '../src/types';

type Range = 'week' | 'month' | 'all';

const RANGES: { key: Range; label: string; empty: string }[] = [
  { key: 'week', label: 'Week', empty: 'Nothing saved in the last 7 days.' },
  { key: 'month', label: 'Month', empty: 'Nothing saved in the last 30 days.' },
  { key: 'all', label: 'All', empty: 'Nothing saved yet.' },
];

const PLOT_HEIGHT = 160;
const Y_AXIS_WIDTH = 40;
const DOT = 8;
/** Clean km/h steps for the y-axis, smallest first. */
const TICK_STEPS = [2, 5, 10, 20, 50];
const MAX_TICKS = 5;
const THUMB_WIDTH = 72;
const THUMB_HEIGHT = 48;

type Loaded =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; playerId: string | null; sessions: Session[] };

/** A trend point paired with the session it came from, so it can carry its error range. */
type TrendPoint = { t: number; speedKmh: number; session: Session };

type TrendState =
  | { status: 'loading' }
  | { status: 'threw'; message: string }
  | { status: 'mismatch'; message: string }
  | { status: 'ready'; trend: Trend; points: TrendPoint[] };

/** The message and every cause under it — the data layer wraps its errors. */
function describe(e: unknown): string {
  const parts: string[] = [];
  let current: unknown = e;
  for (let depth = 0; current !== undefined && current !== null && depth < 4; depth += 1) {
    parts.push(current instanceof Error ? current.message : String(current));
    current = current instanceof Error ? current.cause : undefined;
  }
  return parts.join(' ← ');
}

/**
 * getTrend has had no consumer before this screen, so what it returns is
 * checked against the sessions it was built from rather than trusted. Each
 * point is paired with its session — the chart needs the error range, which
 * Trend does not carry — and anything that does not add up is reported.
 */
function matchTrend(
  trend: Trend,
  sessions: Session[],
  range: Range
): { points: TrendPoint[] } | { problem: string } {
  if (trend.count !== trend.points.length) {
    return { problem: `count is ${trend.count}, but there are ${trend.points.length} points.` };
  }
  if (range === 'all' && trend.count !== sessions.length) {
    return {
      problem: `the all-time trend has ${trend.count} points for ${sessions.length} saved deliveries.`,
    };
  }

  const unclaimed = [...sessions];
  const points: TrendPoint[] = [];
  for (let i = 0; i < trend.points.length; i += 1) {
    const p = trend.points[i];
    if (i > 0 && p.t < trend.points[i - 1].t) {
      return { problem: 'the points are not in time order.' };
    }
    const at = unclaimed.findIndex((s) => s.createdAt === p.t && s.speedKmh === p.speedKmh);
    if (at < 0) {
      return {
        problem: `the point at ${new Date(p.t).toISOString()} (${p.speedKmh} km/h) matches no saved delivery.`,
      };
    }
    const [session] = unclaimed.splice(at, 1);
    points.push({ t: p.t, speedKmh: p.speedKmh, session });
  }

  if (points.length > 0) {
    const fastest = Math.max(...points.map((p) => p.speedKmh));
    if (trend.best !== fastest) {
      return { problem: `best is ${trend.best}, but the fastest point is ${fastest}.` };
    }
  }
  return { points };
}

async function loadTrend(playerId: string, range: Range, sessions: Session[]): Promise<TrendState> {
  let trend: Trend;
  try {
    trend = await getTrend(playerId, range);
  } catch (e) {
    // Surfaced, not swallowed — on screen and in the log.
    console.error(`[History] getTrend('${range}') threw`, e);
    return { status: 'threw', message: describe(e) };
  }
  const matched = matchTrend(trend, sessions, range);
  if ('problem' in matched) {
    console.error(`[History] getTrend('${range}') disagrees with the saved deliveries: ${matched.problem}`);
    return { status: 'mismatch', message: matched.problem };
  }
  return { status: 'ready', trend, points: matched.points };
}

function formatDay(t: number): string {
  return new Date(t).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
}

function formatWhen(t: number): string {
  const d = new Date(t);
  const day = d.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' });
  const time = d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
  return `${day} · ${time}`;
}

/** The release frame — the one the export card uses, and the one worth recognising. */
function thumbFor(session: Session): string | null {
  try {
    return frameUri(session.framesDir, session.release.frame);
  } catch {
    return null;
  }
}

export default function HistoryScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const isFocused = useIsFocused();

  const [loaded, setLoaded] = useState<Loaded>({ status: 'loading' });
  const [reload, setReload] = useState(0);
  const [range, setRange] = useState<Range>('all');
  const [allTime, setAllTime] = useState<TrendState>({ status: 'loading' });
  const [ranged, setRanged] = useState<{ range: Range; state: TrendState } | null>(null);

  // Re-read on focus, so a delivery saved or deleted elsewhere shows up here.
  // The previous list stays on screen while it does.
  useEffect(() => {
    if (!isFocused) return;
    let alive = true;
    (async () => {
      try {
        const players = await listPlayers();
        const playerId = players[0]?.id ?? null;
        const sessions = playerId === null ? [] : await listSessions({ playerId });
        if (alive) setLoaded({ status: 'ready', playerId, sessions });
      } catch (e) {
        console.error('[History] reading saved deliveries failed', e);
        if (alive) setLoaded({ status: 'error', message: describe(e) });
      }
    })();
    return () => {
      alive = false;
    };
  }, [isFocused, reload]);

  const playerId = loaded.status === 'ready' ? loaded.playerId : null;
  const sessions = loaded.status === 'ready' ? loaded.sessions : null;

  // All-time drives the personal best, and the chart when the range is All.
  useEffect(() => {
    if (!playerId || !sessions || sessions.length === 0) return;
    let alive = true;
    loadTrend(playerId, 'all', sessions).then((state) => {
      if (alive) setAllTime(state);
    });
    return () => {
      alive = false;
    };
  }, [playerId, sessions]);

  useEffect(() => {
    if (range === 'all' || !playerId || !sessions || sessions.length === 0) return;
    let alive = true;
    loadTrend(playerId, range, sessions).then((state) => {
      if (alive) setRanged({ range, state });
    });
    return () => {
      alive = false;
    };
  }, [playerId, sessions, range]);

  const chart: TrendState =
    range === 'all'
      ? allTime
      : ranged && ranged.range === range
        ? ranged.state
        : { status: 'loading' };

  // The fastest delivery, and of equals the most recent.
  const best = useMemo(() => {
    if (allTime.status !== 'ready' || allTime.points.length === 0) return null;
    return allTime.points.reduce((b, p) => (p.speedKmh >= b.speedKmh ? p : b)).session;
  }, [allTime]);

  const open = useCallback(
    (id: string) => router.push({ pathname: '/analysis', params: { id } }),
    [router]
  );

  const header = (
    <View style={styles.header}>
      <Pressable onPress={() => router.back()} hitSlop={space.md}>
        <Text style={styles.headerAction}>Back</Text>
      </Pressable>
      <Text style={styles.headerTitle}>HISTORY</Text>
      <Text style={styles.headerCount}>
        {sessions && sessions.length > 0 ? `${sessions.length} saved` : ''}
      </Text>
    </View>
  );

  if (loaded.status === 'loading') {
    return (
      <View style={[styles.screen, styles.padded, { paddingTop: insets.top + space.md }]}>
        {header}
        <ActivityIndicator color={colors.muted} style={styles.loading} />
      </View>
    );
  }

  if (loaded.status === 'error') {
    return (
      <View style={[styles.screen, styles.padded, { paddingTop: insets.top + space.md }]}>
        {header}
        <View style={styles.center}>
          <Text style={styles.centerTitle}>Could not read saved deliveries</Text>
          <Text style={styles.errorDetail} selectable>
            {loaded.message}
          </Text>
          <Pressable
            style={styles.primaryButton}
            onPress={() => setReload((n) => n + 1)}
            accessibilityRole="button"
          >
            <Text style={styles.primaryButtonText}>Try again</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  if (loaded.sessions.length === 0) {
    return (
      <View
        style={[
          styles.screen,
          styles.padded,
          { paddingTop: insets.top + space.md, paddingBottom: insets.bottom + space.lg },
        ]}
      >
        {header}
        <View style={styles.center}>
          <Text style={styles.centerTitle}>No deliveries yet</Text>
          <Text style={styles.centerBody}>
            Save a reading on the result screen and it lands here — its speed, its error range,
            and the frame the ball left the hand.
          </Text>
        </View>
        <Pressable
          style={styles.primaryButton}
          onPress={() => router.push(playerId ? '/capture' : '/setup/player')}
          accessibilityRole="button"
          accessibilityLabel="Record a delivery"
        >
          <Text style={styles.primaryButtonText}>Record a delivery</Text>
        </Pressable>
      </View>
    );
  }

  const bestId = best?.id ?? null;

  return (
    <FlatList
      style={styles.screen}
      contentContainerStyle={[
        styles.padded,
        { paddingTop: insets.top + space.md, paddingBottom: insets.bottom + space.lg },
      ]}
      data={loaded.sessions}
      keyExtractor={(s) => s.id}
      ListHeaderComponent={
        <>
          {header}
          <BestBlock state={allTime} best={best} onOpen={open} />

          <View style={styles.ranges}>
            {RANGES.map((r) => {
              const on = r.key === range;
              return (
                <Pressable
                  key={r.key}
                  onPress={() => setRange(r.key)}
                  style={[styles.range, on && styles.rangeOn]}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: on }}
                >
                  <Text style={[styles.rangeText, on && styles.rangeTextOn]}>{r.label}</Text>
                </Pressable>
              );
            })}
          </View>

          <TrendCard
            key={range}
            range={range}
            state={chart}
            empty={RANGES.find((r) => r.key === range)!.empty}
            onOpen={open}
          />

          <Text style={styles.listLabel}>EVERY DELIVERY</Text>
        </>
      }
      renderItem={({ item }) => (
        <SessionRow session={item} isBest={item.id === bestId} onOpen={open} />
      )}
    />
  );
}

function TrendFailure({ range, state }: { range: Range; state: TrendState }) {
  if (state.status !== 'threw' && state.status !== 'mismatch') return null;
  return (
    <View style={styles.failure}>
      <Text style={styles.failureTitle}>
        {state.status === 'threw'
          ? `getTrend('${range}') threw`
          : `getTrend('${range}') disagrees with the saved deliveries`}
      </Text>
      <Text style={styles.failureBody} selectable>
        {state.message}
      </Text>
    </View>
  );
}

function BestBlock({
  state,
  best,
  onOpen,
}: {
  state: TrendState;
  best: Session | null;
  onOpen: (id: string) => void;
}) {
  if (state.status === 'threw' || state.status === 'mismatch') {
    return (
      <View style={styles.best}>
        <Text style={styles.bestLabel}>PERSONAL BEST</Text>
        <TrendFailure range="all" state={state} />
      </View>
    );
  }
  if (state.status === 'loading' || !best) {
    return (
      <View style={styles.best}>
        <ActivityIndicator color={colors.muted} />
      </View>
    );
  }
  return (
    <Pressable
      style={styles.best}
      onPress={() => onOpen(best.id)}
      accessibilityRole="button"
      accessibilityLabel={`Personal best, average speed to bounce ${best.speedKmh.toFixed(1)} kilometres per hour, plus or minus ${best.errorKmh}. Open it.`}
    >
      <Text style={styles.bestLabel}>PERSONAL BEST · AVG SPEED TO BOUNCE</Text>
      <Text
        style={styles.bestNumber}
        numberOfLines={1}
        adjustsFontSizeToFit
        allowFontScaling={false}
      >
        {best.speedKmh.toFixed(1)}
      </Text>
      <Text style={styles.bestError}>± {best.errorKmh} km/h</Text>
      <Text style={styles.bestMeta}>
        {formatWhen(best.createdAt)} · {best.travelMetres.toFixed(2)} m travelled
      </Text>
    </Pressable>
  );
}

function TrendCard({
  range,
  state,
  empty,
  onOpen,
}: {
  range: Range;
  state: TrendState;
  empty: string;
  onOpen: (id: string) => void;
}) {
  const [selected, setSelected] = useState<number | null>(null);

  let body: React.ReactNode;
  if (state.status === 'threw' || state.status === 'mismatch') {
    body = <TrendFailure range={range} state={state} />;
  } else if (state.status === 'loading') {
    body = <ActivityIndicator color={colors.muted} style={styles.chartLoading} />;
  } else if (state.points.length === 0) {
    body = <Text style={styles.chartEmpty}>{empty}</Text>;
  } else {
    const points = state.points;
    // Nothing tapped yet means the newest.
    const sel = selected !== null && selected < points.length ? selected : points.length - 1;
    const p = points[sel];
    body = (
      <>
        <Pressable
          style={styles.readout}
          onPress={() => onOpen(p.session.id)}
          accessibilityRole="button"
          accessibilityLabel={`Open the delivery from ${formatWhen(p.t)}`}
        >
          <Text style={styles.readoutSpeed}>
            {p.speedKmh.toFixed(1)}
            <Text style={styles.readoutError}> ± {p.session.errorKmh} km/h</Text>
          </Text>
          <Text style={styles.readoutMeta}>{formatWhen(p.t)} · Open ›</Text>
        </Pressable>
        <TrendPlot points={points} selected={sel} onSelect={setSelected} />
      </>
    );
  }

  return (
    <View style={styles.card}>
      <Text style={styles.cardTitle}>AVG SPEED TO BOUNCE, BY DELIVERY</Text>
      <Text style={styles.cardNote}>
        One dot per delivery, oldest to newest. The line through each is its error range — a
        change smaller than that is not a change.
      </Text>
      {body}
    </View>
  );
}

/** A y-scale on clean steps that holds every point's whole error range. */
function yScale(points: TrendPoint[]) {
  let lo = Infinity;
  let hi = -Infinity;
  for (const p of points) {
    lo = Math.min(lo, p.speedKmh - p.session.errorKmh);
    hi = Math.max(hi, p.speedKmh + p.session.errorKmh);
  }
  lo = Math.max(0, lo);
  const span = Math.max(hi - lo, 1);
  const step =
    TICK_STEPS.find((s) => span / s <= MAX_TICKS - 1) ?? TICK_STEPS[TICK_STEPS.length - 1];
  const floor = Math.floor(lo / step) * step;
  let ceil = Math.ceil(hi / step) * step;
  if (ceil === floor) ceil = floor + step;
  const ticks: number[] = [];
  for (let v = floor; v <= ceil; v += step) ticks.push(v);
  return { lo: floor, hi: ceil, ticks };
}

function TrendPlot({
  points,
  selected,
  onSelect,
}: {
  points: TrendPoint[];
  selected: number;
  onSelect: (index: number) => void;
}) {
  const [width, setWidth] = useState(0);
  const scale = useMemo(() => yScale(points), [points]);

  const plotWidth = Math.max(0, width - Y_AXIS_WIDTH);
  const slot = points.length > 0 ? plotWidth / points.length : 0;
  const xOf = (i: number) => Y_AXIS_WIDTH + (i + 0.5) * slot;
  const yOf = (v: number) => PLOT_HEIGHT - ((v - scale.lo) / (scale.hi - scale.lo)) * PLOT_HEIGHT;

  // Dots can be far smaller than a finger, so a tap picks the nearest
  // delivery by position rather than needing to land on one.
  const pick = (e: GestureResponderEvent) => {
    if (slot <= 0) return;
    const i = Math.floor(e.nativeEvent.locationX / slot);
    onSelect(Math.min(points.length - 1, Math.max(0, i)));
  };

  const first = points[0];
  const last = points[points.length - 1];

  return (
    <View
      style={styles.plot}
      onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
      accessible
      accessibilityLabel={`${points.length} ${points.length === 1 ? 'delivery' : 'deliveries'}, from ${formatDay(first.t)} to ${formatDay(last.t)}. Every one is listed below.`}
    >
      {width > 0 ? (
        <>
          {scale.ticks.map((v) => (
            <View key={v} pointerEvents="none">
              <View style={[styles.grid, { top: yOf(v), left: Y_AXIS_WIDTH }]} />
              <Text style={[styles.yTick, { top: yOf(v) - space.sm }]}>{v}</Text>
            </View>
          ))}

          <View
            pointerEvents="none"
            style={[styles.crosshair, { left: xOf(selected) - stroke.hairline / 2 }]}
          />

          {points.map((p, i) => {
            const top = yOf(p.speedKmh + p.session.errorKmh);
            const bottom = yOf(Math.max(scale.lo, p.speedKmh - p.session.errorKmh));
            const on = i === selected;
            return (
              <View key={p.session.id} pointerEvents="none">
                <View
                  style={[
                    styles.whisker,
                    { left: xOf(i) - stroke.medium / 2, top, height: bottom - top },
                  ]}
                />
                <View
                  style={[
                    styles.dot,
                    on && styles.dotOn,
                    {
                      left: xOf(i) - DOT / 2 - stroke.medium,
                      top: yOf(p.speedKmh) - DOT / 2 - stroke.medium,
                    },
                  ]}
                />
              </View>
            );
          })}

          <Pressable
            style={[styles.hit, { left: Y_AXIS_WIDTH, width: plotWidth }]}
            onPress={pick}
            accessibilityElementsHidden
            importantForAccessibility="no-hide-descendants"
          />

          <View style={[styles.xAxis, { left: Y_AXIS_WIDTH }]} pointerEvents="none">
            <Text style={styles.xTick}>{formatDay(first.t)}</Text>
            {points.length > 1 ? <Text style={styles.xTick}>{formatDay(last.t)}</Text> : null}
          </View>
        </>
      ) : null}
    </View>
  );
}

function SessionRow({
  session,
  isBest,
  onOpen,
}: {
  session: Session;
  isBest: boolean;
  onOpen: (id: string) => void;
}) {
  const uri = useMemo(() => thumbFor(session), [session]);
  return (
    <Pressable
      style={styles.row}
      onPress={() => onOpen(session.id)}
      accessibilityRole="button"
      accessibilityLabel={`${formatWhen(session.createdAt)}, ${session.speedKmh.toFixed(1)} kilometres per hour, plus or minus ${session.errorKmh}${isBest ? ', personal best' : ''}`}
    >
      <Thumb uri={uri} />
      <View style={styles.rowBody}>
        <View style={styles.rowTop}>
          <Text style={styles.rowSpeed}>{session.speedKmh.toFixed(1)}</Text>
          <Text style={styles.rowError}> ± {session.errorKmh} km/h</Text>
          {isBest ? <Text style={styles.rowBest}>PB</Text> : null}
        </View>
        <Text style={styles.rowMeta} numberOfLines={1}>
          {formatWhen(session.createdAt)} · {session.travelMetres.toFixed(2)} m ·{' '}
          {CALIBRATION_SPECS[session.calibrationMethod].short}
        </Text>
      </View>
    </Pressable>
  );
}

function Thumb({ uri }: { uri: string | null }) {
  const [failed, setFailed] = useState(false);
  return (
    <View style={styles.thumb}>
      {uri && !failed ? (
        <Image
          source={{ uri }}
          style={styles.thumbImage}
          resizeMode="cover"
          // Downsamples during decode — a list of full-size frames would not fit in memory.
          resizeMethod="resize"
          fadeDuration={0}
          onError={() => setFailed(true)}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  padded: { paddingHorizontal: space.lg },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: space.md,
  },
  headerAction: { ...type.caption, color: colors.muted },
  headerTitle: { ...type.label, color: colors.muted },
  headerCount: { ...type.caption, ...type.tabular, color: colors.muted },

  loading: { marginTop: space.xl },

  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  centerTitle: { ...type.h2, color: colors.text, marginBottom: space.sm, textAlign: 'center' },
  centerBody: { ...type.body, color: colors.muted, textAlign: 'center' },
  errorDetail: {
    ...type.caption,
    ...type.mono,
    color: colors.danger,
    textAlign: 'center',
    marginBottom: space.lg,
  },

  best: { alignItems: 'center', paddingVertical: space.lg },
  bestLabel: { ...type.label, color: colors.muted, marginBottom: space.sm },
  bestNumber: { ...type.hero, ...type.mono, color: colors.accent },
  bestError: { ...type.h2, ...type.mono, color: colors.text, marginTop: space.xs },
  bestMeta: { ...type.caption, color: colors.muted, marginTop: space.sm },

  ranges: { flexDirection: 'row', marginBottom: space.sm },
  range: {
    borderRadius: radius.pill,
    borderWidth: stroke.hairline,
    borderColor: colors.line,
    paddingHorizontal: space.md,
    paddingVertical: space.xs,
    marginRight: space.sm,
  },
  rangeOn: { backgroundColor: colors.text, borderColor: colors.text },
  rangeText: { ...type.caption, color: colors.muted },
  rangeTextOn: { color: colors.bg, fontWeight: '800' },

  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: stroke.hairline,
    borderColor: colors.line,
    padding: space.md,
  },
  cardTitle: { ...type.label, color: colors.text },
  cardNote: { ...type.caption, color: colors.muted, marginTop: space.xs, marginBottom: space.md },
  chartLoading: { height: PLOT_HEIGHT },
  chartEmpty: { ...type.body, color: colors.muted, paddingVertical: space.xl, textAlign: 'center' },

  failure: {
    borderWidth: stroke.hairline,
    borderColor: colors.danger,
    borderRadius: radius.sm,
    padding: space.md,
    alignSelf: 'stretch',
  },
  failureTitle: { ...type.caption, ...type.mono, color: colors.danger, fontWeight: '700' },
  failureBody: { ...type.caption, ...type.mono, color: colors.text, marginTop: space.xs },

  readout: { marginBottom: space.md },
  readoutSpeed: { ...type.h2, ...type.mono, color: colors.text },
  readoutError: { ...type.caption, ...type.mono, color: colors.muted },
  readoutMeta: { ...type.caption, color: colors.muted, marginTop: space.xs },

  // Plot plus the x-axis band beneath it, so the date labels are never clipped.
  plot: { height: PLOT_HEIGHT + space.lg },
  grid: {
    position: 'absolute',
    right: 0,
    height: stroke.hairline,
    backgroundColor: colors.line,
  },
  yTick: {
    ...type.caption,
    ...type.tabular,
    position: 'absolute',
    left: 0,
    width: Y_AXIS_WIDTH - space.sm,
    textAlign: 'right',
    color: colors.muted,
  },
  crosshair: {
    position: 'absolute',
    top: 0,
    height: PLOT_HEIGHT,
    width: stroke.hairline,
    backgroundColor: colors.muted,
    opacity: opacity.inactive,
  },
  whisker: {
    position: 'absolute',
    width: stroke.medium,
    backgroundColor: colors.accent,
    opacity: opacity.inactive,
  },
  // A surface-coloured ring, so overlapping dots stay legible.
  dot: {
    position: 'absolute',
    width: DOT + stroke.medium * 2,
    height: DOT + stroke.medium * 2,
    borderRadius: radius.pill,
    borderWidth: stroke.medium,
    borderColor: colors.surface,
    backgroundColor: colors.accent,
  },
  dotOn: { borderColor: colors.text },
  hit: { position: 'absolute', top: 0, height: PLOT_HEIGHT },
  xAxis: {
    position: 'absolute',
    right: 0,
    top: PLOT_HEIGHT + space.xs,
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  xTick: { ...type.caption, color: colors.muted },

  listLabel: { ...type.label, color: colors.muted, marginTop: space.xl, marginBottom: space.sm },

  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: space.sm,
    borderBottomWidth: stroke.hairline,
    borderColor: colors.line,
  },
  thumb: {
    width: THUMB_WIDTH,
    height: THUMB_HEIGHT,
    borderRadius: radius.sm,
    overflow: 'hidden',
    backgroundColor: colors.surface,
  },
  thumbImage: { width: '100%', height: '100%' },
  rowBody: { flex: 1, marginLeft: space.md },
  rowTop: { flexDirection: 'row', alignItems: 'baseline' },
  rowSpeed: { ...type.h2, ...type.mono, color: colors.text },
  rowError: { ...type.caption, ...type.mono, color: colors.muted },
  rowBest: { ...type.label, color: colors.accent, marginLeft: 'auto' },
  rowMeta: { ...type.caption, color: colors.muted, marginTop: space.xs },

  primaryButton: {
    alignSelf: 'stretch',
    backgroundColor: colors.accent,
    borderRadius: radius.pill,
    paddingVertical: space.md,
    alignItems: 'center',
  },
  primaryButtonText: { ...type.body, color: colors.bg, fontWeight: '800' },
});
