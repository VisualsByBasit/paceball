import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type LayoutChangeEvent,
} from 'react-native';
import { useEventListener } from 'expo';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useVideoPlayer, VideoView } from 'expo-video';
import * as Haptics from 'expo-haptics';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { listFrames } from '../src/capture/useFrames';
import { getSession } from '../src/data';
import { CALIBRATION_SPECS, formatMetres, travelWarning } from '../src/physics/calibration';
import { measurementState } from '../src/physics/measurementState';
import { FrameMarker } from '../src/ui/FrameMarker';
import { FrameScrubber } from '../src/ui/FrameScrubber';
import { useHoldRepeat } from '../src/ui/useHoldRepeat';
import { useSettings } from '../src/settings';
import { colors, opacity, radius, size, space, stroke, type } from '../src/ui/tokens';
import { AppBar } from '../src/ui/AppBar';
import { BottomSheet } from '../src/ui/BottomSheet';
import { DeliveryShareSheet } from '../src/ui/DeliveryShareSheet';
import { Notice } from '../src/ui/Notice';
import { ReadingBlock } from '../src/ui/ReadingBlock';
import { CheckTag } from '../src/ui/CheckTag';
import { needsChecking } from '../src/ui/deliveries';
import { readingView } from '../src/ui/reading';
import { errorMessage } from '../src/ui/format';
import { first } from '../src/ui/routeParams';
import type { Point, Session } from '../src/types';

/**
 * Replay speeds, as a fraction of real time. Slow is the default — at full
 * speed the ball crosses the frame in a third of a second.
 */
const RATES = [
  { rate: 0.25, label: '0.25x' },
  { rate: 0.5, label: '0.5x' },
  { rate: 1, label: '1x' },
];

type Loaded =
  | { status: 'loading' }
  | { status: 'error'; title: string; body: string }
  | { status: 'ready'; session: Session; frames: (string | null)[]; framesProblem: string | null };

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
            body: `Its saved record is corrupt: ${errorMessage(e)}`,
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
        framesProblem = `Could not read the frames for this delivery: ${errorMessage(e)}`;
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
        <Pressable style={styles.primaryButton} onPress={() => router.back()} accessibilityRole="button">
          <Text style={styles.primaryButtonText}>Back</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <Replay
      // A fresh player per delivery, so every clip starts muted.
      key={loaded.session.id}
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
  // Read by a held step button, which repeats faster than a render can be
  // relied on to hand it a fresh `current`.
  const currentRef = useRef(current);
  useEffect(() => {
    currentRef.current = current;
  }, [current]);
  const [playing, setPlaying] = useState(false);
  const [rate, setRate] = useState(RATES[0].rate);
  // Every clip starts muted, and the choice is never saved: turning sound on
  // for one delivery does not turn it on for the next.
  const [muted, setMuted] = useState(true);
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
    // Muted until asked: a clip recorded with sound carries field noise too.
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
      currentRef.current = next;
      setCurrent(next);
      player.currentTime = next / fps;
    },
    [player, clamp, fps]
  );

  // The same hold as Mark: one frame per tap, repeating while held, with one
  // tick for the press itself and none while it repeats.
  const tick = useCallback((first: boolean) => {
    if (first) Haptics.selectionAsync().catch(() => undefined);
  }, []);
  const stepBack = useHoldRepeat(
    useCallback((first: boolean) => { tick(first); seek(currentRef.current - 1); }, [seek, tick])
  );
  const stepForward = useHoldRepeat(
    useCallback((first: boolean) => { tick(first); seek(currentRef.current + 1); }, [seek, tick])
  );

  // A button disabled under a held finger may never report the release, so
  // reaching either end stops the repeat that was heading for it.
  useEffect(() => {
    if (current === 0) stepBack.stop();
    if (current >= max) stepForward.stop();
  }, [current, max, stepBack.stop, stepForward.stop]);

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

  const toggleSound = useCallback(() => {
    const next = !muted;
    setMuted(next);
    player.muted = next;
  }, [muted, player]);

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
  // The error range is recomputed from the marks, never read off the record — a
  // v1 record's stored range is timing alone. Travel, frame delta and flight time
  // come off the same marks, so they are withheld whenever the speed is.
  const state = useMemo(() => measurementState(session), [session]);
  const measured = state.kind === 'measured';

  // Export and delete live in a sheet over the screen rather than in the layout,
  // so the video stage keeps its full height whether or not they are open.
  const [sharing, setSharing] = useState(false);
  const [working, setWorking] = useState(false);
  // What the reading block shows: the speed with its range, or nothing at all.
  const view = readingView(state, unit);

  // The same guard as Result, against the ruler this delivery actually used.
  const warning = travelWarning(
    session.travelMetres,
    session.calRealMetres,
    session.calibrationMethod
  );

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      {/* Same rule as Result: nothing to put on a share card without a
          measured speed, so not-seen and unusable deliveries get no button. */}
      <View style={styles.bar}>
        <AppBar
          title="Delivery"
          onBack={onBack}
          right={measured ? (
            <Pressable
              style={[styles.shareButton, sharing && styles.shareButtonOn]}
              onPress={() => setSharing((open) => !open)}
              accessibilityRole="button"
              accessibilityState={{ expanded: sharing }}
              accessibilityLabel="Share this delivery"
            >
              <Text style={[styles.shareButtonText, sharing && styles.shareButtonTextOn]}>
                Share
              </Text>
            </Pressable>
          ) : null}
        />
      </View>

      <View style={styles.stats}>
        {view.kind === 'measured' ? (
          <>
            <ReadingBlock reading={view} size="reading" />
            {/* Off the scale or a very wide range: shown as computed, never
                counted toward a best, Stats or Compare. */}
            {needsChecking(state) ? (
              <CheckTag center />
            ) : null}
          </>
        ) : (
          <Text style={styles.noSpeed}>No speed measured</Text>
        )}
        {state.kind === 'unusable' ? (
          <View style={styles.note}>
            <Notice tone="info">
              This delivery can't be measured from what was saved. Its marks don't hold enough to put an error range on a speed, and a speed without its range is not a reading, so no speed, flight time, frame delta or distance travelled is shown. The clip and the marks are kept, and the delivery is left out of your trend.
            </Notice>
          </View>
        ) : null}
        {state.kind === 'not-seen' ? (
          <View style={styles.note}>
            <Notice tone="info">
              The bounce was marked without the ball being visible in that frame, so this delivery carries no speed, and no flight time, frame delta or distance travelled either, since all of them are measured from that mark. The clip and the marks are kept, and everything stays saved; none of it is invented, and the delivery stays out of your trend.
            </Notice>
          </View>
        ) : null}
        {/* The warning quotes the travel figure, so it would leak a number this
            screen is deliberately withholding. */}
        {warning && measured ? (
          <View style={styles.note}>
            <Notice tone="caution">{warning.message}</Notice>
          </View>
        ) : null}
        <Pressable
          style={styles.workingLink}
          onPress={() => setWorking(true)}
          accessibilityRole="button"
        >
          <Text style={styles.workingLinkText}>How this was measured</Text>
        </Pressable>
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
                  left={at.left}
                  top={at.top}
                  active={m.ball}
                  // Absent on records saved before it was asked, which read as seen.
                  confidence={m.key === 'bounce' ? session.markConfidence : undefined}
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
            onPressIn={stepBack.onPressIn}
            onPressOut={stepBack.onPressOut}
            onPress={stepBack.onPress}
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
            onPressIn={stepForward.onPressIn}
            onPressOut={stepForward.onPressOut}
            onPress={stepForward.onPress}
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
          <Pressable
            onPress={toggleSound}
            style={[styles.rate, styles.sound, !muted && styles.rateOn]}
            accessibilityRole="switch"
            accessibilityState={{ checked: !muted }}
            accessibilityLabel="Sound"
          >
            <Text style={[styles.rateText, styles.soundText, !muted && styles.rateTextOn]}>
              {muted ? 'Sound off' : 'Sound on'}
            </Text>
          </Pressable>
        </View>
      </View>

      {/* The working, in a sheet so the replay keeps its height. Everything
          read off the bounce mark is withheld with the speed; the fps, the
          marked frames and the scale reference still show. */}
      <BottomSheet visible={working} title="How this was measured" onClose={() => setWorking(false)}>
        <WorkingRow label="Marked frames" value={`${release.frame} → ${bounce.frame}`} />
        {measured ? <WorkingRow label="Frame delta" value={`${frameDelta} frames`} /> : null}
        <WorkingRow label="fps used" value={fps.toFixed(2)} />
        {measured ? (
          <WorkingRow label="Flight time" value={`${(frameDelta / fps).toFixed(4)} s`} />
        ) : null}
        <WorkingRow
          label="Scale reference"
          value={`${spec.short} · ${formatMetres(session.calRealMetres)}`}
        />
        <WorkingRow label="Pixels per metre" value={session.pixelsPerMetre.toFixed(2)} />
        {measured ? (
          <WorkingRow label="Ball travelled" value={`${session.travelMetres.toFixed(2)} m`} />
        ) : (
          <Text style={styles.footnote}>
            Frame delta, flight time and distance travelled are not shown. They are measured from the bounce mark, so they are withheld with the speed. All of them are still saved with the delivery.
          </Text>
        )}
      </BottomSheet>

      {/* The same sheet as Result, with deleting the delivery below it. */}
      {measured ? (
        <DeliveryShareSheet
          visible={sharing}
          onClose={() => setSharing(false)}
          sessionId={session.id}
          onDeleted={() => {
            // The record is gone, so there is nothing left to replay.
            setSharing(false);
            onBack();
          }}
        />
      ) : null}
    </View>
  );
}

/** A label and its value in the working, side by side. */
function WorkingRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={styles.rowValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  center: { alignItems: 'center', justifyContent: 'center', paddingHorizontal: space.lg },

  bar: { paddingHorizontal: space.md },

  stats: { paddingHorizontal: space.lg, paddingBottom: space.sm, alignItems: 'center' },
  noSpeed: { ...type.h2, color: colors.text, paddingVertical: space.sm },
  note: { alignSelf: 'stretch', marginTop: space.sm },
  workingLink: { minHeight: size.target, justifyContent: 'center' },
  workingLinkText: { ...type.body, color: colors.text, textDecorationLine: 'underline' },
  shareButton: {
    minHeight: size.target,
    justifyContent: 'center',
    borderRadius: radius.md,
    borderWidth: stroke.medium,
    borderColor: colors.control,
    paddingHorizontal: space.md,
  },
  shareButtonOn: { backgroundColor: colors.text, borderColor: colors.text },
  shareButtonText: { ...type.caption, color: colors.text },
  shareButtonTextOn: { color: colors.bg, fontWeight: '800' },

  row: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    paddingVertical: space.sm,
    borderBottomWidth: stroke.hairline,
    borderColor: colors.line,
    gap: space.md,
  },
  rowLabel: { ...type.body, color: colors.muted, flexShrink: 1 },
  rowValue: { ...type.body, ...type.mono, color: colors.text },
  footnote: { ...type.caption, color: colors.muted, marginTop: space.md },

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
    minHeight: size.target,
    justifyContent: 'center',
    borderRadius: radius.md,
    borderWidth: stroke.medium,
    borderColor: colors.control,
    paddingHorizontal: space.md,
    marginHorizontal: space.xs,
  },
  rateOn: { backgroundColor: colors.text, borderColor: colors.text },
  sound: { marginLeft: space.md },
  // Readable at a glance while off, so the switch is found without hunting.
  soundText: { color: colors.text },
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
