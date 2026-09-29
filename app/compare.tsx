import { useEffect, useMemo, useState } from 'react';
import {
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Redirect, useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { releaseFrameUri } from '../src/capture/useFrames';
import { getComparison, getPlayer, getSession } from '../src/data';
import { measurementState } from '../src/physics/measurementState';
import { canCompare, useEntitlements, usePurchases } from '../src/purchases';
import { useSettings, type SpeedUnit } from '../src/settings';
import { orderForCompare } from '../src/ui/compareSelection';
import { speedVerdict, type SpeedVerdict } from '../src/ui/speedVerdict';
import { AppBar } from '../src/ui/AppBar';
import { ReadingBlock } from '../src/ui/ReadingBlock';
import { readingView } from '../src/ui/reading';
import { useLargeText } from '../src/ui/useLargeText';
import { colors, opacity, radius, size, space, stroke, type } from '../src/ui/tokens';
import { errorIn, formatSpeed, speedIn, unitLabel } from '../src/ui/units';
import { errorMessage, formatWhen } from '../src/ui/format';
import { first } from '../src/ui/routeParams';
import type { Diff, Session } from '../src/types';

/** One side of the comparison: the record, its reading and who bowled it. */
type Side = {
  session: Session;
  speedKmh: number;
  errorKmh: number;
  player: string;
};

type Loaded =
  | { status: 'loading' }
  | { status: 'error'; title: string; body: string }
  | { status: 'ready'; a: Side; b: Side; diffs: Diff[] };

/** A signed change with a plain hyphen, and no sign on a change that rounds to nothing. */
function signed(delta: number, digits: number): string {
  const size = Math.abs(delta).toFixed(digits);
  if (Number(size) === 0) return size;
  return `${delta > 0 ? '+' : '-'}${size}`;
}

async function playerName(id: string): Promise<string> {
  try {
    return (await getPlayer(id))?.name ?? 'Unknown player';
  } catch {
    return 'Unknown player';
  }
}

/**
 * Reads both deliveries before comparing them, so each way this can fail gets
 * its own honest message instead of one generic one: a record that is gone, a
 * record that is corrupt, and a delivery with no reading to compare. The
 * comparison itself is still getComparison's, and anything it throws past those
 * checks is shown as it is. Nothing here ever stands in a zero.
 */
async function loadComparison(idA: string, idB: string): Promise<Loaded> {
  if (!idA || !idB || idA === idB) {
    return {
      status: 'error',
      title: 'Nothing to compare',
      body: 'Pick two different deliveries in History to compare them.',
    };
  }

  const records: Session[] = [];
  for (const id of [idA, idB]) {
    let session: Session | null;
    try {
      session = await getSession(id);
    } catch {
      return {
        status: 'error',
        title: 'A delivery could not be read',
        body: "One of these saved records is corrupt, so it can't be compared. Your other deliveries are not affected.",
      };
    }
    if (session === null) {
      return {
        status: 'error',
        title: 'A delivery is missing',
        body: 'One of these deliveries is no longer saved. It may have been deleted since you picked it.',
      };
    }
    if (measurementState(session).kind !== 'measured') {
      return {
        status: 'error',
        title: 'Only measured deliveries can be compared',
        body: "One of these has no reading: its bounce wasn't seen, or its marks can't produce a speed with an error range.",
      };
    }
    records.push(session);
  }

  const [older, newer] = orderForCompare(records[0], records[1]);

  let result: Awaited<ReturnType<typeof getComparison>>;
  try {
    result = await getComparison(older.id, newer.id);
  } catch (e) {
    return {
      status: 'error',
      title: 'These deliveries could not be compared',
      body: errorMessage(e),
    };
  }

  // Read again off the records getComparison returned, so the speeds and ranges
  // shown are the ones its diffs were built from.
  const side = async (session: Session): Promise<Side | null> => {
    const reading = measurementState(session);
    if (reading.kind !== 'measured') return null;
    return {
      session,
      speedKmh: reading.speedKmh,
      errorKmh: reading.errorKmh,
      player: await playerName(session.playerId),
    };
  };
  const [a, b] = await Promise.all([side(result.a), side(result.b)]);
  if (a === null || b === null) {
    return {
      status: 'error',
      title: 'Only measured deliveries can be compared',
      body: 'One of these deliveries lost its reading while it was being compared.',
    };
  }
  return { status: 'ready', a, b, diffs: result.diffs };
}

export default function CompareScreen() {
  const entitlements = useEntitlements();
  const { loading } = usePurchases();
  // At launch Pro reads as false until the store answers. Waiting for it keeps
  // a Pro user from being sent to buy what they already have.
  if (loading) {
    return (
      <View style={[styles.screen, styles.center]}>
        <Text style={styles.loading}>Checking your plan…</Text>
      </View>
    );
  }
  // The same gate the History action goes through, so a direct link cannot
  // reach a Pro screen the action would not.
  if (!canCompare(entitlements)) {
    return <Redirect href={{ pathname: '/paywall', params: { context: 'compare' } }} />;
  }
  return <Comparison />;
}

function Comparison() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams();
  const idA = first(params.idA);
  const idB = first(params.idB);
  const { unit } = useSettings();

  const [loaded, setLoaded] = useState<Loaded>({ status: 'loading' });

  useEffect(() => {
    let alive = true;
    setLoaded({ status: 'loading' });
    loadComparison(idA, idB)
      .then((next) => {
        if (alive) setLoaded(next);
      })
      .catch((e) => {
        if (alive) {
          setLoaded({
            status: 'error',
            title: 'These deliveries could not be compared',
            body: errorMessage(e),
          });
        }
      });
    return () => {
      alive = false;
    };
  }, [idA, idB]);

  const header = (
    <View style={styles.appBar}>
      <AppBar title="Compare" onBack={() => router.back()} />
    </View>
  );

  if (loaded.status === 'loading') {
    return (
      <View style={[styles.screen, styles.padded, { paddingTop: insets.top + space.md }]}>
        {header}
        <Text style={styles.loading}>Comparing deliveries…</Text>
      </View>
    );
  }

  if (loaded.status === 'error') {
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
          <Text style={styles.centerTitle}>{loaded.title}</Text>
          <Text style={styles.centerBody} selectable>
            {loaded.body}
          </Text>
        </View>
        <Pressable
          style={styles.primaryButton}
          onPress={() => router.back()}
          accessibilityRole="button"
        >
          <Text style={styles.primaryButtonText}>Back to History</Text>
        </Pressable>
      </View>
    );
  }

  return <Ready a={loaded.a} b={loaded.b} diffs={loaded.diffs} unit={unit} header={header} />;
}

function Ready({
  a,
  b,
  diffs,
  unit,
  header,
}: {
  a: Side;
  b: Side;
  diffs: Diff[];
  unit: SpeedUnit;
  header: React.ReactNode;
}) {
  const insets = useSafeAreaInsets();
  const largeText = useLargeText();

  // Decided on the figures exactly as they are shown - the speed to one decimal
  // and the range rounded up in the chosen unit - so the verdict can never
  // disagree with the numbers beside it.
  const verdict = useMemo(
    () =>
      speedVerdict(
        { speed: Number(formatSpeed(a.speedKmh, unit)), error: errorIn(a.errorKmh, unit) },
        { speed: Number(formatSpeed(b.speedKmh, unit)), error: errorIn(b.errorKmh, unit) }
      ),
    [a, b, unit]
  );

  // Travel and angle come from getComparison. Angle is only there when both
  // deliveries have one, so it is never shown against a missing value.
  const travel = diffs.find((d) => d.label === 'Distance') ?? null;
  const angle = diffs.find((d) => d.label === 'Angle') ?? null;

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={[styles.padded, { paddingBottom: insets.bottom + space.lg }]}
    >
      {header}

      {/* The verdict comes before the numbers, for the eye and for a screen reader. */}
      <Verdict verdict={verdict} unit={unit} />

      <View style={largeText ? styles.sidesStacked : styles.sides}>
        <SideCard tag="Delivery A" side={a} unit={unit} travel={travel?.a ?? null} angle={angle?.a ?? null} />
        <SideCard tag="Delivery B" side={b} unit={unit} travel={travel?.b ?? null} angle={angle?.b ?? null} />
      </View>

      <RangeBars a={a} b={b} unit={unit} />

      <Text style={styles.listLabel}>CHANGE, A TO B</Text>
      {travel ? (
        <ChangeRow
          label="Travel"
          from={`${travel.a.toFixed(2)} m`}
          to={`${travel.b.toFixed(2)} m`}
          delta={`${signed(travel.delta, 2)} m`}
        />
      ) : null}
      {angle ? (
        <ChangeRow
          label="Release angle"
          from={`${angle.a.toFixed(1)}°`}
          to={`${angle.b.toFixed(1)}°`}
          delta={`${signed(angle.delta, 1)}°`}
        />
      ) : null}
      <Text style={styles.footnote}>
        A is the older delivery. Travel and angle describe each delivery; neither is better for
        being bigger.
      </Text>
    </ScrollView>
  );
}

/**
 * Which delivery was faster, only when the measurement can say so: a clear gap
 * between the two ranges. Otherwise it is too close to call. Never "clearly
 * faster": a gap in the ranges is the claim, and all of it.
 */
function Verdict({ verdict, unit }: { verdict: SpeedVerdict; unit: SpeedUnit }) {
  const label = unitLabel(unit);
  const delta = `${signed(verdict.delta, 1)} ${label}`;
  const title =
    verdict.kind === 'too-close'
      ? 'Too close to call'
      : `Delivery ${verdict.faster === 'a' ? 'A' : 'B'} has the higher estimated speed`;
  const body =
    verdict.kind === 'too-close'
      ? 'The estimated ranges overlap or touch.'
      : 'These ranges do not overlap.';

  return (
    <View style={styles.verdict} accessible accessibilityLabel={`${title}. ${body} Change from A to B, ${delta}.`}>
      <Text style={styles.verdictTitle} accessibilityRole="header">
        {title}
      </Text>
      <Text style={styles.verdictBody}>{body}</Text>
      <Text style={styles.verdictDelta}>A to B: {delta}</Text>
    </View>
  );
}

function SideCard({
  tag,
  side,
  unit,
  travel,
  angle,
}: {
  tag: string;
  side: Side;
  unit: SpeedUnit;
  travel: number | null;
  angle: number | null;
}) {
  const { session } = side;
  const uri = useMemo(() => releaseFrameUri(session), [session]);
  const [failed, setFailed] = useState(false);
  // The frame's own shape, read off the record rather than assumed.
  const aspectRatio = session.width / session.height;
  // The same reading the rest of the app shows, range and all.
  const view = readingView({ kind: 'measured', speedKmh: side.speedKmh, errorKmh: side.errorKmh }, unit);

  return (
    <View style={styles.side}>
      <Text style={styles.sideTag}>{tag}</Text>
      <View style={[styles.thumb, { aspectRatio }]}>
        {uri && !failed ? (
          <Image
            source={{ uri }}
            style={[styles.thumbImage, { aspectRatio }]}
            resizeMode="cover"
            resizeMethod="resize"
            fadeDuration={0}
            onError={() => setFailed(true)}
            accessibilityLabel="Release frame"
          />
        ) : null}
      </View>
      {view.kind === 'measured' ? (
        <View style={styles.sideReading}>
          <ReadingBlock reading={view} size="reading" />
        </View>
      ) : null}
      <Text style={styles.sideMeta}>{formatWhen(session.createdAt)}</Text>
      <Text style={styles.sideMeta} numberOfLines={1}>
        {side.player}
      </Text>
      {travel !== null ? <Text style={styles.sideMeta}>{travel.toFixed(2)} m travelled</Text> : null}
      {angle !== null ? <Text style={styles.sideMeta}>{angle.toFixed(1)}° release angle</Text> : null}
    </View>
  );
}

/**
 * Both ranges as bars on one shared scale, so an overlap, or a gap, can be seen
 * rather than worked out. The scale runs from the lower of the two lower bounds
 * to the higher of the two upper bounds, never below zero.
 */
function RangeBars({ a, b, unit }: { a: Side; b: Side; unit: SpeedUnit }) {
  const [width, setWidth] = useState(0);
  const bounds = [a, b].map((s) => {
    const speed = speedIn(s.speedKmh, unit);
    const error = errorIn(s.errorKmh, unit);
    return { lower: Math.max(0, speed - error), speed, upper: speed + error };
  });
  const lo = Math.min(bounds[0].lower, bounds[1].lower);
  const hi = Math.max(bounds[0].upper, bounds[1].upper);
  const span = Math.max(hi - lo, Number.EPSILON);
  const x = (v: number) => ((v - lo) / span) * width;

  return (
    <View
      style={styles.bars}
      onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
      accessible
      accessibilityLabel={`Ranges on one scale. A from ${bounds[0].lower.toFixed(1)} to ${bounds[0].upper.toFixed(1)}, B from ${bounds[1].lower.toFixed(1)} to ${bounds[1].upper.toFixed(1)} ${unitLabel(unit)}.`}
    >
      {bounds.map((r, i) => (
        <View key={i} style={styles.barRow}>
          <Text style={styles.barTag}>{i === 0 ? 'A' : 'B'}</Text>
          <View style={styles.barTrack}>
            {width > 0 ? (
              <>
                <View style={[styles.bar, { left: x(r.lower), width: Math.max(x(r.upper) - x(r.lower), stroke.medium) }]} />
                <View style={[styles.barSpeed, { left: x(r.speed) - stroke.medium / 2 }]} />
              </>
            ) : null}
          </View>
        </View>
      ))}
      <View style={styles.barScale}>
        <Text style={styles.barEnd}>{lo.toFixed(1)}</Text>
        <Text style={styles.barEnd}>
          {hi.toFixed(1)} {unitLabel(unit)}
        </Text>
      </View>
    </View>
  );
}

function ChangeRow({
  label,
  from,
  to,
  delta,
}: {
  label: string;
  from: string;
  to: string;
  delta: string;
}) {
  return (
    <View style={styles.change}>
      <Text style={styles.changeLabel}>{label}</Text>
      <Text style={styles.changeValues}>
        {from} to {to}
      </Text>
      <Text style={styles.changeDelta}>{delta}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  padded: { paddingHorizontal: space.lg },
  appBar: { marginHorizontal: -space.sm, marginBottom: space.sm },
  bar: {
    position: 'absolute',
    top: space.xs,
    bottom: space.xs,
    borderRadius: radius.pill,
    backgroundColor: colors.text,
    opacity: opacity.secondary,
  },

  loading: { ...type.body, color: colors.muted, marginTop: space.xl },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  centerTitle: { ...type.h2, color: colors.text, marginBottom: space.sm, textAlign: 'center' },
  centerBody: { ...type.body, color: colors.muted, textAlign: 'center' },

  verdict: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: stroke.hairline,
    borderColor: colors.line,
    padding: space.md,
    marginTop: space.md,
  },
  verdictTitle: { ...type.h2, color: colors.text },
  verdictBody: { ...type.body, color: colors.muted, marginTop: space.xs },
  verdictDelta: { ...type.caption, ...type.mono, color: colors.muted, marginTop: space.sm },

  sides: { flexDirection: 'row', columnGap: space.md, marginTop: space.lg },
  sidesStacked: { rowGap: space.lg, marginTop: space.lg },
  side: { flex: 1 },
  sideTag: { ...type.label, color: colors.muted, marginBottom: space.sm },
  thumb: {
    alignSelf: 'stretch',
    borderRadius: radius.sm,
    overflow: 'hidden',
    backgroundColor: colors.surface,
  },
  thumbImage: { alignSelf: 'stretch' },
  sideReading: { marginTop: space.md },
  sideMeta: { ...type.caption, color: colors.muted, marginTop: space.xs },

  bars: { marginTop: space.xl },
  barRow: { flexDirection: 'row', alignItems: 'center', minHeight: size.target / 2 + space.sm },
  barTag: { ...type.label, color: colors.muted, width: space.lg },
  barTrack: { flex: 1, height: space.lg, borderBottomWidth: stroke.hairline, borderColor: colors.control },
  barSpeed: {
    position: 'absolute',
    top: space.xs - stroke.medium,
    bottom: space.xs - stroke.medium,
    width: stroke.medium,
    backgroundColor: colors.text,
  },
  barScale: { flexDirection: 'row', justifyContent: 'space-between', marginLeft: space.lg },
  barEnd: { ...type.caption, ...type.tabular, color: colors.muted },

  listLabel: { ...type.label, color: colors.muted, marginTop: space.xl, marginBottom: space.sm },
  change: {
    flexDirection: 'row',
    alignItems: 'baseline',
    paddingVertical: space.sm,
    borderBottomWidth: stroke.hairline,
    borderColor: colors.line,
  },
  changeLabel: { ...type.body, color: colors.text, flex: 1 },
  changeValues: { ...type.caption, ...type.mono, color: colors.muted, marginRight: space.md },
  changeDelta: { ...type.body, ...type.mono, color: colors.text },
  footnote: { ...type.caption, color: colors.muted, marginTop: space.md },

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
