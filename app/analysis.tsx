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
import { useEventListener } from 'expo';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useVideoPlayer, VideoView } from 'expo-video';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { listFrames } from '../src/capture/useFrames';
import { getSession } from '../src/data';
import { CALIBRATION_SPECS, formatMetres, travelWarning } from '../src/physics/calibration';
import { FrameMarker } from '../src/ui/FrameMarker';
import { FrameScrubber } from '../src/ui/FrameScrubber';
import { useSettings } from '../src/settings';
import { colors, opacity, radius, space, stroke, type } from '../src/ui/tokens';
import { errorIn, formatSpeed, unitLabel } from '../src/ui/units';
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
      let session: Session | null;
      try {
        session = await getSession(id);
      } catch (e) {
        // getSession throws only for a record it found and could not read. That
        // is corrupt storage, not a deleted delivery, so it is reported as the
        // fault it is rather than as a missing one.
        if (alive) {
          setLoaded({
            status: 'error',
            title: 'This delivery could not be read',
            body: `Its saved record is corrupt: ${message(e)}`,
          });
        }
        return;
      }
      if (!alive) return;
      if (session === null) {
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
  const { unit } = useSettings();
  const { fps, release, bounce } = session;
  const max = Math.max(0, frames.length - 1);

  const [current, setCurrent] = useState(release.frame);
  const [playing, setPlaying] = useState(false);
  const [rate, setRate] = useState(RATES[0].rate);
  const [playbackProblem, setPlaybackProblem] = useState<string | null>(null);
  const [imageSize, setImageSize] = useState<{ w: number; h: number } | null>(null);
  const [stage, setStage] = useState({ w: 0, h: 0 });

  /**
   * The clip plays itself. Swapping an <Image> uri per frame decoded a 1280 px
   * JPEG on every tick, which is what made playback flicker and drop to black.
   * The extracted frames stay for stepping, jumping and the marker overlays,
   * where a decode is paid once per action rather than sixty times a second.
   */
  const player = useVideoPlayer(session.videoPath, (p) => {
    // A delivery is watched, not listened to, and the clip carries field noise.
    p.muted = true;
    p.playbackRate = RATES[0].rate;
    // Enough to carry the playhead without churning state through playback.
    p.timeUpdateEventInterval = 0.25;
  });

  const clamp = useCallback(
    (frame: number) => Math.min(max, Math.max(0, frame)),
    [max]
  );

  /**
   * Which side owns `current`. While the clip runs the video owns it and the
   * frame view follows its playhead; the moment anything lands on a frame, the
   * frame state owns it and the player's time updates are ignored.
   *
   * Without this a step seeked the video, and the time update the seek itself
   * provoked arrived a moment later carrying the old time and put the frame
   * straight back — which is why +1 advanced and then reverted.
   */
  const videoOwnsFrame = useRef(false);

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

  useEventListener(player, 'playingChange', ({ isPlaying }) => {
    setPlaying(isPlaying);
    // The one write on the way out: stopping hands the frame view back the
    // frame nearest where the video actually reached, so playing and then
    // stepping carries on from what was on screen. Converted with the clip's
    // own fps, never an assumed 60. A pause that a step or a jump asked for has
    // already taken ownership, so it takes no handoff and keeps its own frame.
    if (isPlaying || !videoOwnsFrame.current) return;
    videoOwnsFrame.current = false;
    setCurrent(clamp(Math.round(player.currentTime * fps)));
  });

  // Carries the scrubber playhead during playback. The frame <Image> is not
  // mounted while the video is, so this costs no decode. Silent while paused —
  // the frame state is the truth then, and a seek's own echo must not undo it.
  useEventListener(player, 'timeUpdate', ({ currentTime }) => {
    if (!videoOwnsFrame.current) return;
    setCurrent(clamp(Math.round(currentTime * fps)));
  });

  useEventListener(player, 'statusChange', ({ status, error }) => {
    setPlaybackProblem(
      status === 'error'
        ? `This delivery's video could not be played: ${error?.message ?? 'unknown error'}.`
        : null
    );
  });

  /**
   * Land on a frame — stepping, scrubbing, and both jumps all come through
   * here. Pause, take ownership, set the frame, then put the player's playhead
   * on the same frame so Play picks up from what is on screen. The time update
   * that seek provokes arrives after all of it and is ignored.
   */
  const seek = useCallback(
    (frame: number) => {
      videoOwnsFrame.current = false;
      player.pause();
      const next = clamp(frame);
      setCurrent(next);
      player.currentTime = next / fps;
    },
    [player, clamp, fps]
  );

  const togglePlay = useCallback(() => {
    if (playing) {
      player.pause();
      return;
    }
    // Picks up from the frame on screen, and starts over if it is already at
    // the end. Setting currentTime seeks the player. Ownership passes back to
    // the video only once it is about to run.
    player.currentTime = (current >= max ? 0 : current) / fps;
    videoOwnsFrame.current = true;
    player.play();
  }, [playing, player, current, max, fps]);

  const changeRate = useCallback(
    (next: number) => {
      setRate(next);
      // Set on the player, so the clip itself slows down natively rather than
      // the screen trying to pace it.
      player.playbackRate = next;
    },
    [player]
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
  // Travel, frame delta and flight time are all read off the bounce mark, so a
  // guessed bounce leaves them worth exactly what the speed is worth.
  const measured = session.speedKmh !== null;

  // The same guard as Result, against the ruler this delivery actually used.
  const warning = travelWarning(
    session.travelMetres,
    session.calRealMetres,
    session.calibrationMethod
  );

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
          <Stat
            label="SPEED"
            value={measured ? formatSpeed(session.speedKmh!, unit) : '—'}
            unit={measured ? unitLabel(unit) : 'not measured'}
            hero
          />
          <Stat
            label="ERROR"
            value={measured ? `± ${errorIn(session.errorKmh!, unit)}` : '—'}
            unit={measured ? unitLabel(unit) : ''}
          />
          <Stat
            label="TRAVEL"
            value={measured ? session.travelMetres.toFixed(2) : '—'}
            unit={measured ? 'm' : 'not measured'}
          />
          {/* The clip's own frame rate is a property of the recording, not of
              the marks, so it stands whatever the bounce was worth. */}
          <Stat label="FPS" value={fps.toFixed(2)} unit="read from file" />
          <Stat
            label="FRAME Δ"
            value={measured ? String(frameDelta) : '—'}
            unit={measured ? 'frames' : ''}
          />
        </View>
        {measured ? null : (
          <Text style={styles.note}>
            The bounce was marked without the ball being visible in that frame, so
            this delivery carries no speed — and no flight time, frame delta or
            distance travelled either, since all of them are measured from that
            mark. The clip and the marks are kept, and everything stays saved;
            none of it is invented, and the delivery stays out of your trend.
          </Text>
        )}
        {/* The warning quotes the travel figure, so it would leak a number this
            screen is deliberately withholding. */}
        {warning && measured ? <Text style={styles.note}>{warning.message}</Text> : null}
      </View>

      <View
        style={styles.stage}
        onLayout={(e: LayoutChangeEvent) => {
          const { width, height } = e.nativeEvent.layout;
          setStage({ w: width, h: height });
        }}
      >
        {playing ? (
          <VideoView
            player={player}
            style={fit ? { width: fit.w, height: fit.h } : styles.videoFill}
            nativeControls={false}
            contentFit="contain"
            accessibilityLabel="Delivery playback"
          />
        ) : fit && currentUri ? (
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
        {/* The frames are decoded separately, so stepping survives a clip that
            will not play. */}
        {playbackProblem ? (
          <Text style={styles.playbackProblem}>
            {playbackProblem} Stepping through the frames still works.
          </Text>
        ) : null}

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
            style={[styles.play, playbackProblem !== null && styles.off]}
            disabled={playbackProblem !== null}
            onPress={togglePlay}
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
                onPress={() => changeRate(r.rate)}
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
  // Only used before a frame has been measured, so the video still has a box.
  videoFill: { width: '100%', height: '100%' },
  playbackProblem: { ...type.caption, color: colors.warn, marginBottom: space.sm },

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
