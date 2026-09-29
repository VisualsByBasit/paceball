import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  BackHandler,
  Pressable,
  StyleSheet,
  Text,
  View,
  type GestureResponderEvent,
} from 'react-native';
import Animated, { FadeOut, LinearTransition } from 'react-native-reanimated';
import { useIsFocused, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { releaseFrameUri } from '../src/capture/useFrames';
import { deleteSession, getActivePlayer, getTrend, listSessions } from '../src/data';
import { CALIBRATION_SPECS } from '../src/physics/calibration';
import { measurementState, type MeasurementState } from '../src/physics/measurementState';
import { canCompare, canSeeStats, useEntitlements, usePurchases } from '../src/purchases';
import { useSettings, type SpeedUnit } from '../src/settings';
import {
  COMPARE_COUNT,
  compareSelectability,
  orderForCompare,
  togglePick,
  type Selectability,
} from '../src/ui/compareSelection';
import { ActionButton } from '../src/ui/ActionButton';
import { createDeliveryDelete } from '../src/ui/deleteDelivery';
import { AppBar } from '../src/ui/AppBar';
import { DeliveryRow } from '../src/ui/DeliveryRow';
import { EmptyState } from '../src/ui/EmptyState';
import { TabBar } from '../src/ui/TabBar';
import { compareFooterLabel, countsAsReading, groupByDay, needsChecking } from '../src/ui/deliveries';
import { CHECK_READING } from '../src/ui/gauge';
import { readingView } from '../src/ui/reading';
import { colors, motion, opacity, radius, size, space, stroke, type } from '../src/ui/tokens';
import { errorIn, formatSpeed, speedIn, unitLabel, unitSpoken } from '../src/ui/units';
import { formatWhen } from '../src/ui/format';
import type { Session, Trend, TrendPoint } from '../src/types';

type Range = 'week' | 'month' | 'all';

const RANGES: { key: Range; label: string; empty: string }[] = [
  { key: 'week', label: 'Week', empty: 'Nothing saved in the last 7 days.' },
  { key: 'month', label: 'Month', empty: 'Nothing saved in the last 30 days.' },
  { key: 'all', label: 'All', empty: 'Nothing saved yet.' },
];

const PLOT_HEIGHT = 160;
const Y_AXIS_WIDTH = 40;
const DOT = 8;
/** Clean steps for the y-axis in the display unit, smallest first. */
const TICK_STEPS = [2, 5, 10, 20, 50];
const MAX_TICKS = 5;

type Loaded =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; playerId: string | null; bowler: string | null; sessions: Session[] };

type TrendState =
  | { status: 'loading' }
  | { status: 'threw'; message: string }
  | { status: 'ready'; trend: Trend };

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
 * Every point carries its own session id and error range, so the chart reads
 * them straight off the trend rather than re-deriving them from the list.
 */
async function loadTrend(playerId: string, range: Range): Promise<TrendState> {
  try {
    return { status: 'ready', trend: await getTrend(playerId, range) };
  } catch (e) {
    // Surfaced, not swallowed — on screen and in the log.
    console.error(`[History] getTrend('${range}') threw`, e);
    return { status: 'threw', message: describe(e) };
  }
}

/**
 * The trend as it can honestly be drawn. Each point is read through its own
 * delivery: only a measured one is kept, and it carries the recomputed error
 * range rather than the one getTrend copied off the record, which on a v1
 * delivery is timing alone. A point whose delivery is not in the list cannot be
 * checked, so it is left off rather than drawn on trust. Best and average follow
 * the points that remain.
 */
function readTrend(state: TrendState, states: Map<string, MeasurementState>): TrendState {
  if (state.status !== 'ready') return state;
  const points: TrendPoint[] = [];
  for (const point of state.trend.points) {
    const reading = states.get(point.id);
    // An implausible reading stays in the list with "Check this reading", but
    // is never the best and never a point on the trend.
    if (!reading || !countsAsReading(reading)) continue;
    points.push({ ...point, speedKmh: reading.speedKmh, errorKmh: reading.errorKmh });
  }
  const count = points.length;
  return {
    status: 'ready',
    trend: {
      points,
      count,
      best: count === 0 ? null : Math.max(...points.map((p) => p.speedKmh)),
      avg: count === 0 ? null : points.reduce((total, p) => total + p.speedKmh, 0) / count,
    },
  };
}

function formatDay(t: number): string {
  return new Date(t).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
}

export default function HistoryScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const isFocused = useIsFocused();
  // Display only: the trend, the personal best and every range are compared in
  // km/h as stored, and converted at the moment they are drawn.
  const { unit } = useSettings();
  const entitlements = useEntitlements();
  const { loading: checkingPlan } = usePurchases();
  // The trend chart is Pro, like Stats; the delivery list and the personal
  // best mark on it stay free. Pro reads as false until the store answers.
  const trendUnlocked = canSeeStats(entitlements);

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
        // The active player's deliveries, not whichever profile is first on file.
        const player = await getActivePlayer();
        const playerId = player?.id ?? null;
        const sessions = playerId === null ? [] : await listSessions({ playerId });
        if (alive) setLoaded({ status: 'ready', playerId, bowler: player?.name ?? null, sessions });
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
    loadTrend(playerId, 'all').then((state) => {
      if (alive) setAllTime(state);
    });
    return () => {
      alive = false;
    };
  }, [playerId, sessions]);

  useEffect(() => {
    if (!trendUnlocked || range === 'all' || !playerId || !sessions || sessions.length === 0) return;
    let alive = true;
    loadTrend(playerId, range).then((state) => {
      if (alive) setRanged({ range, state });
    });
    return () => {
      alive = false;
    };
  }, [trendUnlocked, playerId, sessions, range]);

  // Every delivery read once, and every number below comes from here.
  const states = useMemo(
    () => new Map((sessions ?? []).map((s) => [s.id, measurementState(s)] as const)),
    [sessions]
  );

  const allTimeRead = useMemo(() => readTrend(allTime, states), [allTime, states]);
  const rangedRead = useMemo(
    () => (ranged ? { range: ranged.range, state: readTrend(ranged.state, states) } : null),
    [ranged, states]
  );

  const chart: TrendState =
    range === 'all'
      ? allTimeRead
      : rangedRead && rangedRead.range === range
        ? rangedRead.state
        : { status: 'loading' };

  // The fastest delivery, and of equals the most recent — points are in time
  // order. A trend with no best has nothing to show, which is not a zero.
  const best = useMemo(() => {
    if (allTimeRead.status !== 'ready' || allTimeRead.trend.best === null) return null;
    const { points } = allTimeRead.trend;
    if (points.length === 0) return null;
    return points.reduce((b, p) => (p.speedKmh >= b.speedKmh ? p : b));
  }, [allTimeRead]);

  // The trend carries no travel distance, so the best block reads that one
  // field off the delivery the point already names.
  const bestSession = useMemo(
    () => (best && sessions ? (sessions.find((s) => s.id === best.id) ?? null) : null),
    [best, sessions]
  );

  const open = useCallback(
    (id: string) => router.push({ pathname: '/analysis', params: { id } }),
    [router]
  );

  // Compare select mode. Outside it a row opens Analysis as it always has.
  const [selecting, setSelecting] = useState(false);
  const [picked, setPicked] = useState<string[]>([]);

  // Only readings that could be compared: measured and plausible.
  const measuredCount = useMemo(
    () => [...states.values()].filter((s) => countsAsReading(s)).length,
    [states]
  );

  const cancelCompare = useCallback(() => {
    setSelecting(false);
    setPicked([]);
  }, []);

  // Compare is Pro. The gate decides; while it says no, the action sells it
  // instead of entering select mode.
  const startCompare = useCallback(() => {
    if (!canCompare(entitlements)) {
      router.push({ pathname: '/paywall', params: { context: 'compare' } });
      return;
    }
    setPicked([]);
    setSelecting(true);
  }, [entitlements, router]);

  // Long press a row to delete it, after a confirmation. The row leaves the list
  // at once, and the list is then read again from storage, so the trend and the
  // personal best follow. Never in select mode, where a press is a pick.
  const deleteDelivery = useMemo(
    () =>
      createDeliveryDelete({
        ask: (title, message, buttons) => Alert.alert(title, message, buttons),
        remove: deleteSession,
        onDeleted: (id) => {
          setLoaded((current) =>
            current.status === 'ready'
              ? { ...current, sessions: current.sessions.filter((s) => s.id !== id) }
              : current
          );
          setReload((n) => n + 1);
        },
        onError: (e) => Alert.alert('Could not delete this delivery', describe(e)),
      }),
    []
  );

  const confirmCompare = useCallback(() => {
    if (picked.length !== COMPARE_COUNT || !sessions) return;
    const chosen = picked
      .map((id) => sessions.find((s) => s.id === id))
      .filter((s): s is Session => s !== undefined);
    if (chosen.length !== COMPARE_COUNT) return;
    // The older delivery is A, so the change reads forwards in time.
    const [older, newer] = orderForCompare(chosen[0], chosen[1]);
    cancelCompare();
    router.push({ pathname: '/compare', params: { idA: older.id, idB: newer.id } });
  }, [picked, sessions, cancelCompare, router]);

  // Back leaves select mode before it leaves the screen. Only while this screen
  // has focus, or the handler would swallow Back on whatever is on top of it.
  useEffect(() => {
    if (!selecting || !isFocused) return;
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      cancelCompare();
      return true;
    });
    return () => subscription.remove();
  }, [selecting, isFocused, cancelCompare]);

  // Compare sits at the top while there is anything to compare; the tab bar
  // takes the place of Back, which the hardware button still does.
  const header = (
    <AppBar
      title="History"
      onBack={null}
      right={
        !selecting && measuredCount >= COMPARE_COUNT ? (
          <Pressable
            style={styles.compareButton}
            onPress={startCompare}
            accessibilityRole="button"
            accessibilityLabel="Compare two deliveries"
          >
            <Text style={styles.compareButtonText}>Compare</Text>
          </Pressable>
        ) : null
      }
    />
  );

  const bowler = loaded.status === 'ready' ? loaded.bowler : null;
  const playerRow = bowler ? (
    <View style={styles.player}>
      <View style={styles.avatar}>
        <Text style={styles.avatarText}>{bowler.trim().charAt(0).toUpperCase()}</Text>
      </View>
      <Text style={styles.playerName} numberOfLines={1}>
        {bowler}
      </Text>
      <Text style={styles.playerCount}>
        {sessions && sessions.length > 0 ? `${sessions.length} saved` : ''}
      </Text>
    </View>
  ) : null;

  if (loaded.status === 'loading') {
    return (
      <View style={[styles.screen, { paddingTop: insets.top }]}>
        <View style={styles.bar}>{header}</View>
        <View style={styles.padded}>
          <Text style={styles.loadingText}>Loading deliveries…</Text>
          <View style={styles.placeholder} />
          <View style={styles.placeholder} />
          <View style={styles.placeholder} />
        </View>
        <View style={styles.fill} />
        <TabBar current="history" />
      </View>
    );
  }

  if (loaded.status === 'error') {
    return (
      <View style={[styles.screen, { paddingTop: insets.top }]}>
        <View style={styles.bar}>{header}</View>
        <View style={[styles.padded, styles.center]}>
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
        <TabBar current="history" />
      </View>
    );
  }

  if (loaded.sessions.length === 0) {
    return (
      <View style={[styles.screen, { paddingTop: insets.top }]}>
        <View style={styles.bar}>{header}</View>
        <View style={[styles.padded, styles.center]}>
          <EmptyState
            title="No deliveries yet"
            body="Save a reading on the result screen and it lands here: its speed, its error range, and the frame the ball left the hand."
            action={{
              label: 'Record a delivery',
              onPress: () => router.push(playerId ? '/capture' : '/setup/player'),
            }}
          />
        </View>
        <TabBar current="history" />
      </View>
    );
  }

  const bestId = best?.id ?? null;
  const rows = groupByDay(loaded.sessions, Date.now(), (t) =>
    new Date(t).toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' })
  );

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      <View style={styles.bar}>{header}</View>
      <Animated.FlatList
        style={styles.fill}
        contentContainerStyle={[styles.padded, styles.listContent]}
        data={rows}
        extraData={{ selecting, picked }}
        keyExtractor={(row) => row.key}
        // Rows below a deleted one close the gap rather than jump.
        itemLayoutAnimation={LinearTransition.duration(motion.collapse)}
        ListHeaderComponent={
          <>
            {playerRow}

            {trendUnlocked ? (
              <>
                <View style={styles.ranges}>
                  {RANGES.map((r) => {
                    const on = r.key === range;
                    return (
                      <Pressable
                        key={r.key}
                        onPress={() => setRange(r.key)}
                        // Downwards only: the player row above is not a target.
                        hitSlop={{ top: space.xs, bottom: space.md }}
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
                  unit={unit}
                  onOpen={open}
                />
              </>
            ) : (
              <View style={styles.card}>
                <Text style={styles.cardTitle}>AVG SPEED TO BOUNCE, BY DELIVERY</Text>
                <Text style={styles.lockedTrend}>See your trend with Pro</Text>
                <ActionButton
                  label="See Pro stats"
                  onPress={() => router.push({ pathname: '/paywall', params: { context: 'stats' } })}
                  disabledReason={checkingPlan ? 'Checking your plan…' : null}
                />
              </View>
            )}

            <View style={styles.listTop}>
              <Text style={styles.listTopLabel}>
                {selecting ? 'Choose two measured deliveries' : 'Deliveries'}
              </Text>
              {selecting ? (
                <Pressable style={styles.cancel} onPress={cancelCompare} accessibilityRole="button">
                  <Text style={styles.listAction}>Cancel</Text>
                </Pressable>
              ) : null}
            </View>
            {selecting ? null : (
              <Text style={styles.listHint}>Press and hold a delivery to delete it.</Text>
            )}
          </>
        }
        renderItem={({ item: row }) => {
          if (row.kind === 'day') {
            return <Text style={styles.day}>{row.heading}</Text>;
          }
          const item = row.item;
          const reading = states.get(item.id) ?? measurementState(item);
          return (
            <Animated.View exiting={FadeOut.duration(motion.collapse)}>
              <SessionRow
                session={item}
                reading={reading}
                isBest={item.id === bestId}
                unit={unit}
                onOpen={open}
                onDelete={selecting ? null : (id) => deleteDelivery(id, selecting)}
                select={
                  selecting
                    ? {
                        picked: picked.includes(item.id),
                        selectability: compareSelectability(reading),
                        onToggle: () => setPicked((current) => togglePick(current, item.id)),
                      }
                    : null
                }
              />
            </Animated.View>
          );
        }}
      />
      {selecting ? (
        <View style={[styles.compareBar, { paddingBottom: insets.bottom + space.md }]}>
          <Pressable
            style={[styles.compareConfirm, picked.length !== COMPARE_COUNT && styles.off]}
            disabled={picked.length !== COMPARE_COUNT}
            onPress={confirmCompare}
            accessibilityRole="button"
            accessibilityState={{ disabled: picked.length !== COMPARE_COUNT }}
          >
            <Text style={styles.primaryButtonText}>{compareFooterLabel(picked.length)}</Text>
          </Pressable>
        </View>
      ) : (
        <TabBar current="history" />
      )}
    </View>
  );
}

function TrendFailure({ range, state }: { range: Range; state: TrendState }) {
  if (state.status !== 'threw') return null;
  return (
    <View style={styles.failure}>
      <Text style={styles.failureTitle}>
        {range === 'all' ? 'Could not read your deliveries for the trend' : `Could not read this ${range}'s deliveries`}
      </Text>
      <Text style={styles.failureBody} selectable>
        {state.message}
      </Text>
    </View>
  );
}

function TrendCard({
  range,
  state,
  empty,
  unit,
  onOpen,
}: {
  range: Range;
  state: TrendState;
  empty: string;
  unit: SpeedUnit;
  onOpen: (id: string) => void;
}) {
  const [selected, setSelected] = useState<number | null>(null);

  let body: React.ReactNode;
  if (state.status === 'threw') {
    body = <TrendFailure range={range} state={state} />;
  } else if (state.status === 'loading') {
    body = <Text style={[styles.chartEmpty, styles.chartLoading]}>Loading the trend…</Text>;
  } else if (state.trend.points.length === 0) {
    body = <Text style={styles.chartEmpty}>{empty}</Text>;
  } else {
    const points = state.trend.points;
    // Nothing tapped yet means the newest.
    const sel = selected !== null && selected < points.length ? selected : points.length - 1;
    const p = points[sel];
    body = (
      <>
        <Pressable
          style={styles.readout}
          onPress={() => onOpen(p.id)}
          accessibilityRole="button"
          accessibilityLabel={`Open the delivery from ${formatWhen(p.t)}`}
        >
          <Text style={styles.readoutSpeed}>
            {formatSpeed(p.speedKmh, unit)}
            <Text style={styles.readoutError}>
              {' '}
              ± {errorIn(p.errorKmh, unit)} {unitLabel(unit)}
            </Text>
          </Text>
          <Text style={styles.readoutMeta}>{formatWhen(p.t)} · Open ›</Text>
        </Pressable>
        <TrendPlot points={points} selected={sel} unit={unit} onSelect={setSelected} />
      </>
    );
  }

  return (
    <View style={styles.card}>
      <Text style={styles.cardTitle}>AVG SPEED TO BOUNCE, BY DELIVERY</Text>
      <Text style={styles.cardNote}>
        One dot per delivery, oldest to newest. The line through each is its error range. A
        change smaller than that is not a change.
      </Text>
      {body}
    </View>
  );
}

/** A y-scale on clean steps that holds every point's whole error range. */
function yScale(points: TrendPoint[], unit: SpeedUnit) {
  let lo = Infinity;
  let hi = -Infinity;
  for (const p of points) {
    lo = Math.min(lo, speedIn(p.speedKmh, unit) - errorIn(p.errorKmh, unit));
    hi = Math.max(hi, speedIn(p.speedKmh, unit) + errorIn(p.errorKmh, unit));
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
  unit,
  onSelect,
}: {
  points: TrendPoint[];
  selected: number;
  unit: SpeedUnit;
  onSelect: (index: number) => void;
}) {
  const [width, setWidth] = useState(0);
  const scale = useMemo(() => yScale(points, unit), [points, unit]);

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
            const speed = speedIn(p.speedKmh, unit);
            const error = errorIn(p.errorKmh, unit);
            const top = yOf(speed + error);
            const bottom = yOf(Math.max(scale.lo, speed - error));
            const on = i === selected;
            return (
              <View key={p.id} pointerEvents="none">
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
                      top: yOf(speed) - DOT / 2 - stroke.medium,
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

/** How a row behaves while picking deliveries to compare. Null outside select mode. */
type RowSelect = {
  picked: boolean;
  selectability: Selectability;
  onToggle: () => void;
} | null;

function SessionRow({
  session,
  reading,
  isBest,
  unit,
  onOpen,
  onDelete,
  select,
}: {
  session: Session;
  reading: MeasurementState;
  isBest: boolean;
  unit: SpeedUnit;
  onOpen: (id: string) => void;
  /** Null in select mode: a press there is a pick, never a delete. */
  onDelete: ((id: string) => void) | null;
  select: RowSelect;
}) {
  const uri = useMemo(() => releaseFrameUri(session), [session]);
  const view = readingView(reading, unit);
  // Travel comes off the same marks as the speed, so it is read out only when
  // the speed is. It stays on the record either way.
  const measured = reading.kind === 'measured';
  const check = needsChecking(reading);
  // Not-seen and unusable rows have no speed to compare, so in select mode they
  // are dimmed, cannot be tapped, and say why.
  const blocked = select !== null && !select.selectability.selectable;
  return (
    <Pressable
      style={[styles.rowPress, blocked && styles.off]}
      onPress={select ? select.onToggle : () => onOpen(session.id)}
      onLongPress={onDelete ? () => onDelete(session.id) : undefined}
      disabled={blocked}
      accessibilityHint={onDelete ? 'Press and hold to delete' : undefined}
      accessibilityActions={onDelete ? [{ name: 'delete', label: 'Delete delivery' }] : undefined}
      onAccessibilityAction={(event) => {
        if (onDelete && event.nativeEvent.actionName === 'delete') onDelete(session.id);
      }}
      accessibilityRole={select ? 'checkbox' : 'button'}
      accessibilityState={select ? { checked: select.picked, disabled: blocked } : undefined}
      accessibilityLabel={
        view.kind === 'measured'
          ? `${formatWhen(session.createdAt)}. ${view.spoken}${isBest ? ' Personal best.' : ''}${check ? ` ${CHECK_READING}.` : ''}`
          : reading.kind === 'not-seen'
            ? `${formatWhen(session.createdAt)}, no speed, the bounce was not seen`
            : `${formatWhen(session.createdAt)}, no speed, it can't be measured from what was saved`
      }
    >
      <DeliveryRow
        thumb={uri}
        reading={view}
        when={formatWhen(session.createdAt)}
        detail={`${measured ? `${session.travelMetres.toFixed(2)} m · ` : ''}${CALIBRATION_SPECS[session.calibrationMethod].short}`}
        best={isBest}
        state={select?.picked ? 'selected' : blocked ? 'blocked' : 'normal'}
        reason={select && !select.selectability.selectable ? select.selectability.reason : null}
        pick={select && select.selectability.selectable ? { picked: select.picked } : null}
        check={check}
      />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  fill: { flex: 1 },
  bar: { paddingHorizontal: space.md },
  padded: { paddingHorizontal: space.lg },
  listContent: { paddingBottom: space.lg },

  loadingText: { ...type.body, color: colors.muted, marginTop: space.md },
  placeholder: {
    minHeight: size.row,
    borderRadius: radius.md,
    borderWidth: stroke.hairline,
    borderColor: colors.line,
    marginTop: space.sm,
  },

  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  centerTitle: { ...type.h2, color: colors.text, marginBottom: space.sm, textAlign: 'center' },
  errorDetail: {
    ...type.caption,
    ...type.mono,
    color: colors.danger,
    textAlign: 'center',
    marginBottom: space.lg,
  },

  player: { flexDirection: 'row', alignItems: 'center', gap: space.sm, marginBottom: space.md },
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
  playerName: { ...type.body, color: colors.text, fontWeight: '700', flex: 1 },
  playerCount: { ...type.caption, ...type.tabular, color: colors.muted },

  ranges: { flexDirection: 'row', marginBottom: space.sm },
  range: {
    borderRadius: radius.pill,
    borderWidth: stroke.hairline,
    borderColor: colors.control,
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
  lockedTrend: { ...type.body, color: colors.text, marginTop: space.xs, marginBottom: space.md },
  chartLoading: { minHeight: PLOT_HEIGHT },
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
    right: stroke.hairline - stroke.hairline,
    height: stroke.hairline,
    backgroundColor: colors.control,
  },
  yTick: {
    ...type.caption,
    ...type.tabular,
    position: 'absolute',
    left: stroke.hairline - stroke.hairline,
    width: Y_AXIS_WIDTH - space.sm,
    textAlign: 'right',
    color: colors.muted,
  },
  crosshair: {
    position: 'absolute',
    top: stroke.hairline - stroke.hairline,
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
  hit: { position: 'absolute', top: stroke.hairline - stroke.hairline, height: PLOT_HEIGHT },
  xAxis: {
    position: 'absolute',
    right: stroke.hairline - stroke.hairline,
    top: PLOT_HEIGHT + space.xs,
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  xTick: { ...type.caption, color: colors.muted },

  listTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: size.target,
    marginTop: space.lg,
  },
  listTopLabel: { ...type.h2, color: colors.text },
  cancel: { minHeight: size.target, justifyContent: 'center', paddingLeft: space.md },
  listAction: { ...type.body, color: colors.text },
  listHint: { ...type.caption, color: colors.muted, marginBottom: space.sm },
  day: { ...type.label, color: colors.muted, marginTop: space.md, marginBottom: space.xs },

  compareButton: {
    minHeight: size.target,
    justifyContent: 'center',
    paddingHorizontal: space.sm,
  },
  compareButtonText: { ...type.body, color: colors.text, textDecorationLine: 'underline' },
  compareBar: {
    paddingHorizontal: space.lg,
    paddingTop: space.md,
    backgroundColor: colors.bg,
    borderTopWidth: stroke.hairline,
    borderColor: colors.line,
  },
  compareConfirm: {
    minHeight: size.button,
    borderRadius: radius.md,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  off: { opacity: opacity.disabled },

  rowPress: {},

  primaryButton: {
    alignSelf: 'stretch',
    minHeight: size.button,
    backgroundColor: colors.accent,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryButtonText: { ...type.button, color: colors.bg },
});
