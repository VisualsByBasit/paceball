import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Redirect, useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { frameUri } from '../src/capture/useFrames';
import { getComparison, getPlayer, getSession } from '../src/data';
import { measurementState } from '../src/physics/measurementState';
import { canCompare, useEntitlements } from '../src/purchases';
import { useSettings, type SpeedUnit } from '../src/settings';
import { orderForCompare } from '../src/ui/compareSelection';
import { speedVerdict, type SpeedVerdict } from '../src/ui/speedVerdict';
import { colors, radius, space, stroke, type } from '../src/ui/tokens';
import { errorIn, formatSpeed, unitLabel } from '../src/ui/units';
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

function first(value: string | string[] | undefined): string {
  return Array.isArray(value) ? (value[0] ?? '') : (value ?? '');
}

function message(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

function formatWhen(t: number): string {
  const d = new Date(t);
  const day = d.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' });
  const time = d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
  return `${day} · ${time}`;
}

/** A signed change with a plain hyphen, and no sign on a change that rounds to nothing. */
function signed(delta: number, digits: number): string {
  const size = Math.abs(delta).toFixed(digits);
  if (Number(size) === 0) return size;
  return `${delta > 0 ? '+' : '-'}${size}`;
}

/** The release frame, as History's rows show it. */
function thumbFor(session: Session): string | null {
  try {
    return frameUri(session.framesDir, session.release.frame);
  } catch {
    return null;
  }
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
      body: message(e),
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
            body: message(e),
          });
        }
      });
    return () => {
      alive = false;
    };
  }, [idA, idB]);

  const header = (
    <View style={styles.header}>
      <Pressable onPress={() => router.back()} hitSlop={space.md} accessibilityRole="button">
        <Text style={styles.headerAction}>Back</Text>
      </Pressable>
      <Text style={styles.headerTitle}>COMPARE</Text>
      <View style={styles.headerSpacer} />
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
      contentContainerStyle={[
        styles.padded,
        { paddingTop: insets.top + space.md, paddingBottom: insets.bottom + space.lg },
      ]}
    >
      {header}

      <Verdict verdict={verdict} a={a} b={b} unit={unit} />

      <View style={styles.sides}>
        <SideCard tag="A · OLDER" side={a} unit={unit} travel={travel?.a ?? null} angle={angle?.a ?? null} />
        <SideCard tag="B · NEWER" side={b} unit={unit} travel={travel?.b ?? null} angle={angle?.b ?? null} />
      </View>

      <Text style={styles.listLabel}>CHANGE, OLDER TO NEWER</Text>
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
        Travel and angle describe each delivery. Neither is better for being bigger.
      </Text>
    </ScrollView>
  );
}

function Verdict({
  verdict,
  a,
  b,
  unit,
}: {
  verdict: SpeedVerdict;
  a: Side;
  b: Side;
  unit: SpeedUnit;
}) {
  const label = unitLabel(unit);
  const ranges = `± ${errorIn(a.errorKmh, unit)} and ± ${errorIn(b.errorKmh, unit)} ${label}`;
  const delta = `${signed(verdict.delta, 1)} ${label}`;

  const title =
    verdict.kind === 'too-close'
      ? 'Too close to call'
      : verdict.faster === 'b'
        ? 'The newer delivery was faster'
        : 'The older delivery was faster';
  const body =
    verdict.kind === 'too-close'
      ? `The difference is inside the two error ranges (${ranges}), so neither delivery was measurably faster.`
      : `By ${Math.abs(verdict.delta).toFixed(1)} ${label}, clear of both error ranges (${ranges}).`;

  return (
    <View style={styles.verdict} accessible accessibilityLabel={`${title}. Change in speed ${delta}. ${body}`}>
      <Text style={styles.verdictLabel}>AVG SPEED TO BOUNCE, CHANGE</Text>
      <Text style={styles.verdictDelta} numberOfLines={1} adjustsFontSizeToFit>
        {delta}
      </Text>
      <Text style={styles.verdictTitle}>{title}</Text>
      <Text style={styles.verdictBody}>{body}</Text>
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
  const uri = useMemo(() => thumbFor(session), [session]);
  const [failed, setFailed] = useState(false);
  // The frame's own shape, read off the record rather than assumed.
  const aspectRatio = session.width / session.height;

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
      <Text style={styles.sideSpeed} numberOfLines={1} adjustsFontSizeToFit>
        {formatSpeed(side.speedKmh, unit)}
      </Text>
      <Text style={styles.sideError}>
        ± {errorIn(side.errorKmh, unit)} {unitLabel(unit)}
      </Text>
      <Text style={styles.sideMeta}>{formatWhen(session.createdAt)}</Text>
      <Text style={styles.sideMeta} numberOfLines={1}>
        {side.player}
      </Text>
      {travel !== null ? <Text style={styles.sideMeta}>{travel.toFixed(2)} m travelled</Text> : null}
      {angle !== null ? <Text style={styles.sideMeta}>{angle.toFixed(1)}° release angle</Text> : null}
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

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: space.md,
  },
  headerAction: { ...type.caption, color: colors.muted },
  headerTitle: { ...type.label, color: colors.muted },
  // Balances Back, so the title sits in the middle.
  headerSpacer: { width: space.xl },

  loading: { marginTop: space.xl },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  centerTitle: { ...type.h2, color: colors.text, marginBottom: space.sm, textAlign: 'center' },
  centerBody: { ...type.body, color: colors.muted, textAlign: 'center' },

  verdict: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: stroke.hairline,
    borderColor: colors.line,
    padding: space.md,
  },
  verdictLabel: { ...type.label, color: colors.muted },
  verdictDelta: { ...type.h1, ...type.mono, color: colors.text, marginTop: space.sm },
  verdictTitle: { ...type.h2, color: colors.text, marginTop: space.sm },
  verdictBody: { ...type.body, color: colors.muted, marginTop: space.xs },

  sides: { flexDirection: 'row', columnGap: space.md, marginTop: space.lg },
  side: { flex: 1 },
  sideTag: { ...type.label, color: colors.muted, marginBottom: space.sm },
  thumb: {
    alignSelf: 'stretch',
    borderRadius: radius.sm,
    overflow: 'hidden',
    backgroundColor: colors.surface,
  },
  thumbImage: { alignSelf: 'stretch' },
  sideSpeed: { ...type.h1, ...type.mono, color: colors.text, marginTop: space.md },
  sideError: { ...type.caption, ...type.mono, color: colors.muted },
  sideMeta: { ...type.caption, color: colors.muted, marginTop: space.xs },

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
    backgroundColor: colors.accent,
    borderRadius: radius.pill,
    paddingVertical: space.md,
    alignItems: 'center',
  },
  primaryButtonText: { ...type.body, color: colors.bg, fontWeight: '800' },
});
