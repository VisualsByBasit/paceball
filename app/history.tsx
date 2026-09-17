import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  BackHandler,
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
import { getActivePlayer, getTrend, listSessions } from '../src/data';
import { CALIBRATION_SPECS } from '../src/physics/calibration';
import { measurementState, type MeasurementState } from '../src/physics/measurementState';
import { canCompare } from '../src/purchases';
import { useSettings, type SpeedUnit } from '../src/settings';
import {
  COMPARE_COUNT,
  compareSelectability,
  orderForCompare,
  togglePick,
  type Selectability,
} from '../src/ui/compareSelection';
import { colors, opacity, radius, space, stroke, type } from '../src/ui/tokens';
import { errorIn, formatSpeed, speedIn, unitLabel, unitSpoken } from '../src/ui/units';
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
const THUMB_WIDTH = 72;
const THUMB_HEIGHT = 48;

type Loaded =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; playerId: string | null; sessions: Session[] };

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
    if (reading?.kind !== 'measured') continue;
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
  // Display only: the trend, the personal best and every range are compared in
  // km/h as stored, and converted at the moment they are drawn.
  const { unit } = useSettings();

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
        const playerId = (await getActivePlayer())?.id ?? null;
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
    loadTrend(playerId, 'all').then((state) => {
      if (alive) setAllTime(state);
    });
    return () => {
      alive = false;
    };
  }, [playerId, sessions]);

  useEffect(() => {
    if (range === 'all' || !playerId || !sessions || sessions.length === 0) return;
    let alive = true;
    loadTrend(playerId, range).then((state) => {
      if (alive) setRanged({ range, state });
    });
    return () => {
      alive = false;
    };
  }, [playerId, sessions, range]);

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

  const measuredCount = useMemo(
    () => [...states.values()].filter((s) => s.kind === 'measured').length,
    [states]
  );

  const cancelCompare = useCallback(() => {
    setSelecting(false);
    setPicked([]);
  }, []);

  // Compare is Pro. The gate decides; while it says no, the action sells it
  // instead of entering select mode.
  const startCompare = useCallback(() => {
    if (!canCompare()) {
      router.push({ pathname: '/paywall', params: { context: 'compare' } });
      return;
    }
    setPicked([]);
    setSelecting(true);
  }, [router]);

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

  // Back leaves select mode before it leaves the screen.
  useEffect(() => {
    if (!selecting) return;
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      cancelCompare();
      return true;
    });
    return () => subscription.remove();
  }, [selecting, cancelCompare]);

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
    <View style={styles.screen}>
    <FlatList
      style={styles.screen}
      contentContainerStyle={[
        styles.padded,
        {
          paddingTop: insets.top + space.md,
          // Room for the confirm bar, so the last row can scroll clear of it.
          paddingBottom: insets.bottom + (selecting ? space.xxl + space.xxl : space.lg),
        },
      ]}
      data={loaded.sessions}
      extraData={{ selecting, picked }}
      keyExtractor={(s) => s.id}
      ListHeaderComponent={
        <>
          {header}
          <BestBlock state={allTimeRead} best={best} session={bestSession} unit={unit} onOpen={open} />

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
            unit={unit}
            onOpen={open}
          />

          <View style={styles.listTop}>
            <Text style={styles.listTopLabel}>
              {selecting ? 'PICK TWO TO COMPARE' : 'EVERY DELIVERY'}
            </Text>
            {selecting ? (
              <Pressable onPress={cancelCompare} hitSlop={space.sm} accessibilityRole="button">
                <Text style={styles.listAction}>Cancel</Text>
              </Pressable>
            ) : measuredCount >= COMPARE_COUNT ? (
              <Pressable
                style={styles.compareButton}
                onPress={startCompare}
                hitSlop={space.sm}
                accessibilityRole="button"
                accessibilityLabel="Compare two deliveries"
              >
                <Text style={styles.compareButtonText}>Compare</Text>
              </Pressable>
            ) : null}
          </View>
        </>
      }
      renderItem={({ item }) => {
        const reading = states.get(item.id) ?? measurementState(item);
        return (
          <SessionRow
            session={item}
            reading={reading}
            isBest={item.id === bestId}
            unit={unit}
            onOpen={open}
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
        );
      }}
    />
    {selecting ? (
      <View style={[styles.compareBar, { paddingBottom: insets.bottom + space.md }]}>
        <Text style={styles.compareBarCount}>
          {picked.length} of {COMPARE_COUNT} picked
        </Text>
        <Pressable
          style={[styles.compareConfirm, picked.length !== COMPARE_COUNT && styles.off]}
          disabled={picked.length !== COMPARE_COUNT}
          onPress={confirmCompare}
          accessibilityRole="button"
          accessibilityState={{ disabled: picked.length !== COMPARE_COUNT }}
        >
          <Text style={styles.primaryButtonText}>Compare</Text>
        </Pressable>
      </View>
    ) : null}
    </View>
  );
}

function TrendFailure({ range, state }: { range: Range; state: TrendState }) {
  if (state.status !== 'threw') return null;
  return (
    <View style={styles.failure}>
      <Text style={styles.failureTitle}>{`getTrend('${range}') threw`}</Text>
      <Text style={styles.failureBody} selectable>
        {state.message}
      </Text>
    </View>
  );
}

function BestBlock({
  state,
  best,
  session,
  unit,
  onOpen,
}: {
  state: TrendState;
  best: TrendPoint | null;
  session: Session | null;
  unit: SpeedUnit;
  onOpen: (id: string) => void;
}) {
  if (state.status === 'threw') {
    return (
      <View style={styles.best}>
        <Text style={styles.bestLabel}>PERSONAL BEST</Text>
        <TrendFailure range="all" state={state} />
      </View>
    );
  }
  if (state.status === 'loading') {
    return (
      <View style={styles.best}>
        <ActivityIndicator color={colors.muted} />
      </View>
    );
  }
  // The trend is in and holds no best. Saying so is the honest reading; a
  // personal best of 0.0 km/h would not be.
  if (best === null) {
    return (
      <View style={styles.best}>
        <Text style={styles.bestLabel}>PERSONAL BEST</Text>
        <Text style={styles.bestEmpty}>
          Nothing measured yet. The fastest saved delivery shows here.
        </Text>
      </View>
    );
  }
  return (
    <Pressable
      style={styles.best}
      onPress={() => onOpen(best.id)}
      accessibilityRole="button"
      accessibilityLabel={`Personal best, average speed to bounce ${formatSpeed(best.speedKmh, unit)} ${unitSpoken(unit)}, plus or minus ${errorIn(best.errorKmh, unit)}. Open it.`}
    >
      <Text style={styles.bestLabel}>PERSONAL BEST · AVG SPEED TO BOUNCE</Text>
      <Text
        style={styles.bestNumber}
        numberOfLines={1}
        adjustsFontSizeToFit
        allowFontScaling={false}
      >
        {formatSpeed(best.speedKmh, unit)}
      </Text>
      <Text style={styles.bestError}>
        ± {errorIn(best.errorKmh, unit)} {unitLabel(unit)}
      </Text>
      <Text style={styles.bestMeta}>
        {formatWhen(best.t)}
        {session === null ? '' : ` · ${session.travelMetres.toFixed(2)} m travelled`}
      </Text>
    </Pressable>
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
    body = <ActivityIndicator color={colors.muted} style={styles.chartLoading} />;
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
        One dot per delivery, oldest to newest. The line through each is its error range — a
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
  select,
}: {
  session: Session;
  reading: MeasurementState;
  isBest: boolean;
  unit: SpeedUnit;
  onOpen: (id: string) => void;
  select: RowSelect;
}) {
  const uri = useMemo(() => thumbFor(session), [session]);
  // Travel comes off the same marks as the speed, so it is read out only when
  // the speed is. It stays on the record either way.
  const measured = reading.kind === 'measured';
  // Not-seen and unusable rows have no speed to compare, so in select mode they
  // are dimmed, cannot be tapped, and say why.
  const blocked = select !== null && !select.selectability.selectable;
  return (
    <Pressable
      style={[styles.row, select?.picked && styles.rowPicked, blocked && styles.off]}
      onPress={select ? select.onToggle : () => onOpen(session.id)}
      disabled={blocked}
      accessibilityRole={select ? 'checkbox' : 'button'}
      accessibilityState={select ? { checked: select.picked, disabled: blocked } : undefined}
      accessibilityLabel={
        reading.kind === 'measured'
          ? `${formatWhen(session.createdAt)}, ${formatSpeed(reading.speedKmh, unit)} ${unitSpoken(unit)}, plus or minus ${errorIn(reading.errorKmh, unit)}${isBest ? ', personal best' : ''}`
          : reading.kind === 'not-seen'
            ? `${formatWhen(session.createdAt)}, no speed — the bounce was not seen`
            : `${formatWhen(session.createdAt)}, no speed — it can't be measured from what was saved`
      }
    >
      <Thumb uri={uri} />
      <View style={styles.rowBody}>
        <View style={styles.rowTop}>
          {reading.kind === 'measured' ? (
            <>
              <Text style={styles.rowSpeed}>{formatSpeed(reading.speedKmh, unit)}</Text>
              <Text style={styles.rowError}>
                {' '}
                ± {errorIn(reading.errorKmh, unit)} {unitLabel(unit)}
              </Text>
            </>
          ) : reading.kind === 'not-seen' ? (
            <Text style={styles.rowNoSpeed}>No speed · bounce not seen</Text>
          ) : (
            <Text style={styles.rowNoSpeed} numberOfLines={1}>
              No speed · can't be measured from what was saved
            </Text>
          )}
          {isBest ? <Text style={styles.rowBest}>PB</Text> : null}
        </View>
        <Text style={styles.rowMeta} numberOfLines={1}>
          {formatWhen(session.createdAt)}
          {measured ? ` · ${session.travelMetres.toFixed(2)} m` : ''} ·{' '}
          {CALIBRATION_SPECS[session.calibrationMethod].short}
        </Text>
        {select && !select.selectability.selectable ? (
          <Text style={styles.rowReason}>{select.selectability.reason}</Text>
        ) : null}
      </View>
      {select && select.selectability.selectable ? (
        <View style={[styles.pick, select.picked && styles.pickOn]} />
      ) : null}
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
  bestEmpty: { ...type.body, color: colors.muted, textAlign: 'center' },

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

  listTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: space.xl,
    marginBottom: space.sm,
  },
  listTopLabel: { ...type.label, color: colors.muted },
  listAction: { ...type.caption, color: colors.muted },
  compareButton: {
    borderRadius: radius.pill,
    borderWidth: stroke.hairline,
    borderColor: colors.line,
    paddingHorizontal: space.md,
  },
  compareButtonText: { ...type.caption, color: colors.text },
  compareBar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: space.lg,
    paddingTop: space.md,
    backgroundColor: colors.surface,
    borderTopWidth: stroke.hairline,
    borderColor: colors.line,
  },
  compareBarCount: { ...type.body, ...type.tabular, color: colors.text },
  compareConfirm: {
    backgroundColor: colors.accent,
    borderRadius: radius.pill,
    paddingVertical: space.sm,
    paddingHorizontal: space.lg,
  },
  off: { opacity: opacity.disabled },
  rowPicked: { backgroundColor: colors.surface },
  rowReason: { ...type.caption, color: colors.warn, marginTop: space.xs },
  pick: {
    width: space.md,
    height: space.md,
    borderRadius: radius.pill,
    borderWidth: stroke.medium,
    borderColor: colors.muted,
    marginLeft: space.md,
  },
  pickOn: { borderColor: colors.text, backgroundColor: colors.text },

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
  rowNoSpeed: { ...type.body, color: colors.warn },
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
