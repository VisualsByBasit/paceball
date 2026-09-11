import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Pressable,
  StyleSheet,
  Text,
  View,
  type LayoutChangeEvent,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { listFrames } from '../src/capture/useFrames';
import { listSessions } from '../src/data';
import { CALIBRATION_SPECS, formatMetres } from '../src/physics/calibration';
import { PITCH_LENGTH_M } from '../src/physics/computeSpeed';
import { FrameMarker } from '../src/ui/FrameMarker';
import { FrameScrubber } from '../src/ui/FrameScrubber';
import { colors, opacity, radius, space, stroke, type } from '../src/ui/tokens';
import type { Point, Session } from '../src/types';

/**
 * Replay speeds, as a fraction of real time. Slow is the default — at full
 * speed the ball crosses the frame in a third of a second.
 */
const RATES = [
  { rate: 0.25, label: '¼×' },
  { rate: 0.5, label: '½×' },
  { rate: 1, label: '1×' },
];

type Loaded =
  | { status: 'loading' }
  | { status: 'error'; title: string; body: string }
  | { status: 'ready'; session: Session; frames: (string | null)[]; framesProblem: string | null };

function first(value: string | string[] | undefined): string {
  return Array.isArray(value) ? (value[0] ?? '') : (value ?? '');
}

function message(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

export default function AnalysisScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const id = first(useLocalSearchParams().id);

  const [loaded, setLoaded] = useState<Loaded>({ status: 'loading' });

  useEffect(() => {
    if (!id) {
      setLoaded({
        status: 'error',
        title: 'Nothing to replay',
        body: 'This screen was opened without a saved delivery.',
      });
      return;
    }
    let alive = true;
    (async () => {
      let session: Session | undefined;
      try {
        // The data layer has no single-session read, so it is found in the list.
        session = (await listSessions()).find((s) => s.id === id);
      } catch (e) {
        if (alive) {
          setLoaded({ status: 'error', title: 'Could not read saved deliveries', body: message(e) });
        }
        return;
      }
      if (!alive) return;
      if (!session) {
        setLoaded({
          status: 'error',
          title: 'Delivery not found',
          body: 'It may have been deleted since the list was opened.',
        });
        return;
      }

      // The frames are read off the disk rather than assumed from the count,
      // so a gap shows as a gap. Missing frames do not hide the numbers.
      const frames = new Array<string | null>(session.frameCount).fill(null);
      let framesProblem: string | null = null;
      try {
        for (const [index, uri] of listFrames(session.framesDir)) {
          if (index >= 0 && index < frames.length) frames[index] = uri;
        }
        if (!frames.some(Boolean)) {
          framesProblem = 'None of the frames for this delivery are on the phone.';
        }
      } catch (e) {
        framesProblem = `Could not read the frames for this delivery: ${message(e)}`;
      }
      setLoaded({ status: 'ready', session, frames, framesProblem });
    })();
    return () => {
      alive = false;
    };
  }, [id]);

  if (loaded.status === 'loading') {
    return (
      <View style={[styles.screen, styles.center, { paddingTop: insets.top }]}>
        <ActivityIndicator color={colors.muted} />
      </View>
    );
  }

  if (loaded.status === 'error') {
    return (
      <View style={[styles.screen, styles.center, { paddingTop: insets.top }]}>
        <Text style={styles.fallbackTitle}>{loaded.title}</Text>
        <Text style={styles.fallbackBody}>{loaded.body}</Text>
        <Pressable style={styles.primaryButton} onPress={() => router.back()}>
          <Text style={styles.primaryButtonText}>Back</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <Replay
      session={loaded.session}
      frames={loaded.frames}
      framesProblem={loaded.framesProblem}
      onBack={() => router.back()}
    />
  );
}

function Replay({
  session,
  frames,
  framesProblem,
  onBack,
}: {
  session: Session;
  frames: (string | null)[];
  framesProblem: string | null;
  onBack: () => void;
}) {
  const insets = useSafeAreaInsets();
  const { fps, release, bounce } = session;
  const max = Math.max(0, frames.length - 1);

  const [current, setCurrent] = useState(release.frame);
  const [playing, setPlaying] = useState(false);
  const [rate, setRate] = useState(RATES[0].rate);
  const [imageSize, setImageSize] = useState<{ w: number; h: number } | null>(null);
  const [stage, setStage] = useState({ w: 0, h: 0 });

  const currentRef = useRef(current);
  useEffect(() => {
    currentRef.current = current;
  }, [current]);

  // Sized off a real frame, as on Mark — the JPEGs are capped on the long
  // edge, so they are not the video's own resolution.
  const sample = useMemo(() => frames.find((f) => f !== null) ?? null, [frames]);
  useEffect(() => {
    if (!sample) return;
    let alive = true;
    Image.getSize(
      sample,
      (w, h) => {
        if (alive) setImageSize({ w, h });
      },
      () => {
        if (alive) setImageSize(null);
      }
    );
    return () => {
      alive = false;
    };
  }, [sample]);

  const fit = useMemo(() => {
    if (!imageSize || stage.w === 0 || stage.h === 0) return null;
    const scale = Math.min(stage.w / imageSize.w, stage.h / imageSize.h);
    return { w: imageSize.w * scale, h: imageSize.h * scale };
  }, [imageSize, stage]);

  // Playback reads the frame off elapsed time rather than counting ticks, so
  // a dropped frame on screen does not slow the clip down. Timed against the
  // clip's own fps, never an assumed 60.
  useEffect(() => {
    if (!playing) return;
    const from = currentRef.current >= max ? 0 : currentRef.current;
    let start: number | null = null;
    let raf = 0;
    const tick = (now: number) => {
      if (start === null) start = now;
      const frame = Math.min(max, from + Math.floor(((now - start) / 1000) * fps * rate));
      setCurrent(frame);
      if (frame >= max) {
        setPlaying(false);
        return;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playing, rate, max, fps]);

  const seek = useCallback(
    (frame: number) => {
      setPlaying(false);
      setCurrent(Math.min(max, Math.max(0, frame)));
    },
    [max]
  );

  const spec = CALIBRATION_SPECS[session.calibrationMethod];
  const marks = useMemo(
    () => [
      { key: 'calA', label: spec.a.short, point: session.calA, ball: false, pinned: spec.sameFrame },
      { key: 'calB', label: spec.b.short, point: session.calB, ball: false, pinned: spec.sameFrame },
      { key: 'release', label: 'Release', point: release, ball: true, pinned: true },
      { key: 'bounce', label: 'Bounce', point: bounce, ball: true, pinned: true },
    ],
    [spec, session.calA, session.calB, release, bounce]
  );

  // Saved points live in the video's own resolution; scale each axis down to
  // the frame as it is drawn.
  const place = (p: Point) =>
    fit ? { left: (p.x / session.width) * fit.w, top: (p.y / session.height) * fit.h } : null;

  const frameDelta = bounce.frame - release.frame;
  const currentUri = frames[current] ?? null;
  const sinceRelease = (current - release.frame) / fps;
  // Same check as Result: a ball that travelled the whole pitch was not marked
  // at release and bounce.
  const implausible = session.travelMetres >= PITCH_LENGTH_M;

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Pressable onPress={onBack} hitSlop={space.md}>
          <Text style={styles.headerAction}>Back</Text>
        </Pressable>
        <Text style={styles.headerMeta}>
          {spec.short} · {formatMetres(session.calRealMetres)}
        </Text>
      </View>

      <View style={styles.stats}>
        <Text style={styles.statsLabel}>AVG SPEED TO BOUNCE</Text>
        <View style={styles.statRow}>
          <Stat label="SPEED" value={session.speedKmh.toFixed(1)} unit="km/h" hero />
          <Stat label="ERROR" value={`± ${session.errorKmh}`} unit="km/h" />
          <Stat label="TRAVEL" value={session.travelMetres.toFixed(2)} unit="m" />
          <Stat label="FPS" value={fps.toFixed(2)} unit="read from file" />
          <Stat label="FRAME Δ" value={String(frameDelta)} unit="frames" />
        </View>
        {implausible ? (
          <Text style={styles.note}>
            The ball reads as travelling {session.travelMetres.toFixed(1)} m before bouncing,
            which is the length of the whole pitch. {spec.checkHint}, and that the ball marks
            are on the ball.
          </Text>
        ) : null}
      </View>

      <View
        style={styles.stage}
        onLayout={(e: LayoutChangeEvent) => {
          const { width, height } = e.nativeEvent.layout;
          setStage({ w: width, h: height });
        }}
      >
        {fit && currentUri ? (
          <View style={{ width: fit.w, height: fit.h }}>
            <Image
              source={{ uri: currentUri }}
              style={{ width: fit.w, height: fit.h }}
              resizeMode="contain"
              fadeDuration={0}
            />
            {marks.map((m) => {
              // As on Mark: a point only exists on its own frame unless it is
              // a landmark that stays put.
              if (m.pinned && m.point.frame !== current) return null;
              const at = place(m.point);
              if (!at) return null;
              return (
                <FrameMarker
                  key={m.key}
                  label={m.label}
                  ball={m.ball}
                  left={at.left}
                  top={at.top}
                  active={m.ball}
                />
              );
            })}
          </View>
        ) : (
          <Text style={styles.stageNote}>
            {framesProblem ?? (sample ? `Frame ${current} was not saved.` : 'Loading frames…')}
          </Text>
        )}
      </View>

      <View style={[styles.controls, { paddingBottom: insets.bottom + space.md }]}>
        <FrameScrubber
          frames={frames}
          total={frames.length}
          max={max}
          current={current}
          onSeek={seek}
          marks={[
            { frame: release.frame, color: colors.accent },
            { frame: bounce.frame, color: colors.accent },
          ]}
        />

        <View style={styles.readout}>
          <Text style={styles.frameNumber}>
            {current}
            <Text style={styles.frameTotal}> / {max}</Text>
          </Text>
          <Text style={styles.frameTime}>
            {sinceRelease >= 0 ? '+' : '−'}
            {Math.abs(sinceRelease).toFixed(3)} s from release
          </Text>
        </View>

        <View style={styles.transport}>
          <Pressable
            style={styles.jump}
            onPress={() => seek(release.frame)}
            accessibilityRole="button"
            accessibilityLabel={`Go to release, frame ${release.frame}`}
          >
            <Text style={styles.jumpText}>Release</Text>
          </Pressable>
          <Pressable
            style={[styles.stepButton, current === 0 && styles.off]}
            disabled={current === 0}
            onPress={() => seek(current - 1)}
            hitSlop={space.sm}
            accessibilityRole="button"
            accessibilityLabel="Previous frame"
          >
            <Text style={styles.stepButtonText}>−</Text>
          </Pressable>
          <Pressable
            style={[styles.play, !sample && styles.off]}
            disabled={!sample}
            onPress={() => setPlaying((p) => !p)}
            accessibilityRole="button"
            accessibilityLabel={playing ? 'Pause' : 'Play'}
          >
            <Text style={styles.playText}>{playing ? 'Pause' : 'Play'}</Text>
          </Pressable>
          <Pressable
            style={[styles.stepButton, current >= max && styles.off]}
            disabled={current >= max}
            onPress={() => seek(current + 1)}
            hitSlop={space.sm}
            accessibilityRole="button"
            accessibilityLabel="Next frame"
          >
            <Text style={styles.stepButtonText}>+</Text>
          </Pressable>
          <Pressable
            style={styles.jump}
            onPress={() => seek(bounce.frame)}
            accessibilityRole="button"
            accessibilityLabel={`Go to bounce, frame ${bounce.frame}`}
          >
            <Text style={styles.jumpText}>Bounce</Text>
          </Pressable>
        </View>

        <View style={styles.rates}>
          {RATES.map((r) => {
            const on = r.rate === rate;
            return (
              <Pressable
                key={r.rate}
                onPress={() => setRate(r.rate)}
                style={[styles.rate, on && styles.rateOn]}
                accessibilityRole="radio"
                accessibilityState={{ selected: on }}
                accessibilityLabel={`Play at ${r.rate} times real speed`}
              >
                <Text style={[styles.rateText, on && styles.rateTextOn]}>{r.label}</Text>
              </Pressable>
            );
          })}
        </View>
      </View>
    </View>
  );
}

function Stat({
  label,
  value,
  unit,
  hero,
}: {
  label: string;
  value: string;
  unit: string;
  hero?: boolean;
}) {
  return (
    <View style={styles.stat}>
      <Text style={styles.statLabel} numberOfLines={1}>
        {label}
      </Text>
      <Text
        style={[styles.statValue, hero && styles.statValueHero]}
        numberOfLines={1}
        adjustsFontSizeToFit
      >
        {value}
      </Text>
      <Text style={styles.statUnit} numberOfLines={1} adjustsFontSizeToFit>
        {unit}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  center: { alignItems: 'center', justifyContent: 'center', paddingHorizontal: space.lg },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: space.lg,
    paddingVertical: space.md,
  },
  headerAction: { ...type.caption, color: colors.muted },
  headerMeta: { ...type.caption, color: colors.text },

  stats: { paddingHorizontal: space.lg, paddingBottom: space.md },
  statsLabel: { ...type.label, color: colors.muted, marginBottom: space.sm },
  statRow: { flexDirection: 'row' },
  stat: { flex: 1, marginRight: space.xs },
  statLabel: { ...type.label, color: colors.muted },
  statValue: { ...type.body, ...type.mono, color: colors.text, marginTop: space.xs },
  statValueHero: { color: colors.accent, fontWeight: '800' },
  statUnit: { ...type.caption, color: colors.muted },
  note: {
    ...type.caption,
    color: colors.warn,
    borderWidth: stroke.hairline,
    borderColor: colors.warn,
    borderRadius: radius.md,
    padding: space.md,
    marginTop: space.md,
  },

  stage: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
  },
  stageNote: { ...type.caption, color: colors.muted, textAlign: 'center', padding: space.lg },

  controls: { paddingHorizontal: space.lg, paddingTop: space.md },

  readout: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    marginTop: space.sm,
  },
  frameNumber: { ...type.h2, ...type.tabular, color: colors.text },
  frameTotal: { ...type.caption, color: colors.muted },
  frameTime: { ...type.caption, ...type.tabular, color: colors.muted },

  transport: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: space.md,
  },
  jump: {
    borderRadius: radius.pill,
    borderWidth: stroke.hairline,
    borderColor: colors.line,
    paddingVertical: space.sm,
    paddingHorizontal: space.md,
  },
  jumpText: { ...type.caption, color: colors.text },
  stepButton: {
    width: space.xl,
    height: space.xl,
    borderRadius: radius.pill,
    borderWidth: stroke.hairline,
    borderColor: colors.line,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepButtonText: { ...type.h2, color: colors.text },
  play: {
    backgroundColor: colors.accent,
    borderRadius: radius.pill,
    paddingVertical: space.sm,
    paddingHorizontal: space.lg,
  },
  playText: { ...type.body, color: colors.bg, fontWeight: '800' },
  off: { opacity: opacity.disabled },

  rates: { flexDirection: 'row', justifyContent: 'center', marginTop: space.md },
  rate: {
    borderRadius: radius.pill,
    borderWidth: stroke.hairline,
    borderColor: colors.line,
    paddingHorizontal: space.md,
    paddingVertical: space.xs,
    marginHorizontal: space.xs,
  },
  rateOn: { backgroundColor: colors.text, borderColor: colors.text },
  rateText: { ...type.caption, color: colors.muted },
  rateTextOn: { color: colors.bg, fontWeight: '800' },

  fallbackTitle: { ...type.h2, color: colors.text, marginBottom: space.sm },
  fallbackBody: {
    ...type.body,
    color: colors.muted,
    textAlign: 'center',
    marginBottom: space.lg,
  },
  primaryButton: {
    alignSelf: 'stretch',
    backgroundColor: colors.accent,
    borderRadius: radius.pill,
    paddingVertical: space.md,
    alignItems: 'center',
  },
  primaryButtonText: { ...type.body, color: colors.bg, fontWeight: '800' },
});
