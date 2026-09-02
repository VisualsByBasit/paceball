import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Image,
  PanResponder,
  Pressable,
  StyleSheet,
  Text,
  View,
  type GestureResponderEvent,
  type LayoutChangeEvent,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFrames } from '../src/capture/useFrames';
import { colors, radius, space, type } from '../src/ui/tokens';
import type { Point } from '../src/types';

type StepKey = 'nearWicket' | 'farWicket' | 'release' | 'bounce';

type Step = {
  key: StepKey;
  label: string;
  short: string;
  hint: string;
  /** Ball points carry the measurement, so they get the accent. */
  ball: boolean;
};

const STEPS: Step[] = [
  {
    key: 'nearWicket',
    label: 'Near wicket',
    short: 'Near',
    hint: 'Tap the base of the stumps nearest the camera. Any frame.',
    ball: false,
  },
  {
    key: 'farWicket',
    label: 'Far wicket',
    short: 'Far',
    hint: 'Tap the base of the stumps at the other end. Any frame.',
    ball: false,
  },
  {
    key: 'release',
    label: 'Ball at release',
    short: 'Release',
    hint: 'Scrub to the frame the ball leaves the hand, then tap the ball.',
    ball: true,
  },
  {
    key: 'bounce',
    label: 'Ball at bounce',
    short: 'Bounce',
    hint: 'Scrub to the frame the ball hits the pitch, then tap the ball.',
    ball: true,
  },
];

type Points = Record<StepKey, Point | null>;

const NO_POINTS: Points = {
  nearWicket: null,
  farWicket: null,
  release: null,
  bounce: null,
};

const STRIP_HEIGHT = 56;
const THUMB_WIDTH = 40;
const MARKER_SIZE = 28;
const CROSSHAIR = 1;

function first(value: string | string[] | undefined): string {
  return Array.isArray(value) ? (value[0] ?? '') : (value ?? '');
}

function positiveNumber(value: string | string[] | undefined): number | null {
  const n = Number(first(value));
  return Number.isFinite(n) && n > 0 ? n : null;
}

export default function MarkScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams();

  const videoPath = first(params.videoPath);
  // fps and frameCount are read from the file per clip. There is no sane default
  // to fall back on — a guessed 60 would silently skew every reading.
  const fps = positiveNumber(params.fps);
  const frameCount = positiveNumber(params.frameCount);

  const extraction = useFrames(videoPath, frameCount ?? 0);
  const { frames, total, decoded, status } = extraction;

  const [current, setCurrent] = useState(0);
  const [points, setPoints] = useState<Points>(NO_POINTS);
  const [history, setHistory] = useState<Points[]>([]);
  const [selected, setSelected] = useState<StepKey | null>(null);
  const [imageSize, setImageSize] = useState<{ w: number; h: number } | null>(null);
  const [stage, setStage] = useState<{ w: number; h: number }>({ w: 0, h: 0 });
  const [trackWidth, setTrackWidth] = useState(0);

  // The first point not yet placed, unless the user has picked one to redo.
  // Null once all four are down and nothing is selected, so a stray tap on the
  // frame cannot quietly drag the last point somewhere else.
  const activeKey: StepKey | null =
    selected ?? STEPS.find((s) => points[s.key] === null)?.key ?? null;
  const activeStep = activeKey ? STEPS.find((s) => s.key === activeKey)! : null;

  // Frames fill left to right, so this is how far the scrubber can safely go.
  // Scrubbing past it would show one frame while recording another's number.
  const lastReady = useMemo(() => {
    let i = 0;
    while (i < frames.length && frames[i]) i += 1;
    return Math.max(0, i - 1);
  }, [frames]);

  const scrubMax = status === 'ready' ? Math.max(0, total - 1) : lastReady;

  const scrubMaxRef = useRef(scrubMax);
  const trackWidthRef = useRef(0);
  useEffect(() => {
    scrubMaxRef.current = scrubMax;
  }, [scrubMax]);
  useEffect(() => {
    trackWidthRef.current = trackWidth;
  }, [trackWidth]);

  useEffect(() => {
    setCurrent((c) => Math.min(c, scrubMax));
  }, [scrubMax]);

  // The extracted JPEG is the coordinate space every point is stored in, so its
  // real pixel size is read off the file rather than assumed from the video
  // metadata — MediaMetadataRetriever reports coded dimensions, which do not
  // account for the rotation the decoder has already applied to the bitmap.
  const firstFrame = frames[0];
  useEffect(() => {
    if (!firstFrame) return;
    let alive = true;
    Image.getSize(
      firstFrame,
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
  }, [firstFrame]);

  const fit = useMemo(() => {
    if (!imageSize || stage.w === 0 || stage.h === 0) return null;
    const scale = Math.min(stage.w / imageSize.w, stage.h / imageSize.h);
    return { scale, w: imageSize.w * scale, h: imageSize.h * scale };
  }, [imageSize, stage]);

  const currentUri = frames[current] ?? null;

  const seekToX = useCallback((x: number) => {
    const width = trackWidthRef.current;
    const max = scrubMaxRef.current;
    if (width <= 0 || max <= 0) return;
    const ratio = Math.min(1, Math.max(0, x / width));
    setCurrent(Math.round(ratio * max));
  }, []);

  const scrubber = useMemo(() => {
    let originX = 0;
    return PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderTerminationRequest: () => false,
      onPanResponderGrant: (e: GestureResponderEvent) => {
        originX = e.nativeEvent.locationX;
        seekToX(originX);
      },
      // Tracked as an offset from where the finger landed. locationX drifts once
      // the drag leaves the track; the grant point plus dx does not.
      onPanResponderMove: (_e, gesture) => seekToX(originX + gesture.dx),
    });
  }, [seekToX]);

  const step = useCallback(
    (delta: number) => {
      setCurrent((c) => Math.min(scrubMaxRef.current, Math.max(0, c + delta)));
    },
    []
  );

  const place = useCallback(
    (event: GestureResponderEvent) => {
      if (!fit || !currentUri || !activeKey) return;
      const { locationX, locationY } = event.nativeEvent;
      const x = locationX / fit.scale;
      const y = locationY / fit.scale;

      setHistory((h) => [...h, points]);
      setPoints((p) => ({ ...p, [activeKey]: { x, y, frame: current } }));
      setSelected(null);
    },
    [fit, currentUri, activeKey, current, points]
  );

  const undo = useCallback(() => {
    if (history.length === 0) return;
    setPoints(history[history.length - 1]);
    setHistory(history.slice(0, -1));
    setSelected(null);
  }, [history]);

  const placedCount = STEPS.filter((s) => points[s.key] !== null).length;

  // The measurement is only meaningful if the ruler has length and the ball
  // moved forward in time. Both are checked before Next will do anything.
  const problem = useMemo(() => {
    const { nearWicket, farWicket, release, bounce } = points;
    if (nearWicket && farWicket) {
      const dx = farWicket.x - nearWicket.x;
      const dy = farWicket.y - nearWicket.y;
      if (Math.hypot(dx, dy) < 1) {
        return 'The two wickets are on the same spot — the pitch has to have length on screen.';
      }
    }
    if (release && bounce && bounce.frame <= release.frame) {
      return `Bounce is on frame ${bounce.frame}, which is not after release on frame ${release.frame}.`;
    }
    return null;
  }, [points]);

  const canContinue = placedCount === STEPS.length && problem === null;

  const onNext = useCallback(() => {
    if (!canContinue || !fps || !imageSize) return;
    router.push({
      pathname: '/result',
      params: {
        videoPath,
        fps: String(fps),
        captureFps: first(params.captureFps),
        frameCount: String(total),
        durationMs: first(params.durationMs),
        width: first(params.width),
        height: first(params.height),
        exposureBias: first(params.exposureBias),
        // Points are in the pixel space of the extracted frames, which is not
        // necessarily the video's coded size. Pass the space along with them.
        imageWidth: String(imageSize.w),
        imageHeight: String(imageSize.h),
        nearWicket: JSON.stringify(points.nearWicket),
        farWicket: JSON.stringify(points.farWicket),
        release: JSON.stringify(points.release),
        bounce: JSON.stringify(points.bounce),
      },
    });
  }, [canContinue, fps, imageSize, router, videoPath, params, total, points]);

  const thumbCount = trackWidth > 0 ? Math.max(1, Math.floor(trackWidth / THUMB_WIDTH)) : 0;
  const thumbs = useMemo(() => {
    if (thumbCount === 0 || total <= 0) return [];
    return Array.from({ length: thumbCount }, (_, i) => {
      const index =
        thumbCount === 1 ? 0 : Math.round((i / (thumbCount - 1)) * Math.max(0, total - 1));
      return { index, uri: frames[index] ?? null };
    });
  }, [thumbCount, total, frames]);

  if (!videoPath || !fps || !frameCount) {
    return (
      <Fallback
        insets={insets.top}
        title="Nothing to mark"
        body={
          !videoPath
            ? 'This screen was opened without a recording.'
            : 'The clip did not report a usable frame rate or frame count, so no reading can be trusted from it.'
        }
        action={{ label: 'Record a delivery', onPress: () => router.replace('/capture') }}
      />
    );
  }

  if (status === 'error') {
    return (
      <Fallback
        insets={insets.top}
        title="Could not read the frames"
        body={extraction.error ?? 'The clip produced no frames.'}
        action={{ label: 'Try again', onPress: extraction.retry }}
        secondary={{ label: 'Record again', onPress: () => router.replace('/capture') }}
      />
    );
  }

  const seconds = fps > 0 ? current / fps : 0;
  const playheadRatio = scrubMax > 0 ? current / scrubMax : 0;

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={space.md}>
          <Text style={styles.headerAction}>Retake</Text>
        </Pressable>
        <Text style={styles.headerCount}>
          {placedCount} of {STEPS.length}
        </Text>
      </View>

      <View style={styles.stage} onLayout={(e: LayoutChangeEvent) => {
        const { width, height } = e.nativeEvent.layout;
        setStage({ w: width, h: height });
      }}>
        {fit && currentUri ? (
          <Pressable
            onPress={place}
            disabled={activeStep === null}
            style={[styles.frameBox, { width: fit.w, height: fit.h }]}
            accessibilityLabel={
              activeStep ? `Tap to place ${activeStep.label}` : 'All points placed'
            }
          >
            <Image
              source={{ uri: currentUri }}
              style={{ width: fit.w, height: fit.h }}
              resizeMode="contain"
              fadeDuration={0}
            />

            {STEPS.map((s) => {
              const point = points[s.key];
              if (!point) return null;
              // A ball point only exists on its own frame. A wicket is a fixed
              // landmark, so it stays visible wherever you scrub.
              if (s.ball && point.frame !== current) return null;
              return (
                <Marker
                  key={s.key}
                  step={s}
                  left={point.x * fit.scale}
                  top={point.y * fit.scale}
                  active={s.key === activeKey}
                />
              );
            })}
          </Pressable>
        ) : (
          <View style={styles.stagePlaceholder}>
            <Text style={styles.muted}>
              {status === 'probing' ? 'Checking the clip…' : 'Decoding frames…'}
            </Text>
          </View>
        )}
      </View>

      <View style={[styles.controls, { paddingBottom: insets.bottom + space.md }]}>
        <Text style={styles.hint}>
          {activeStep
            ? activeStep.hint
            : 'All four placed. Tap a point below to move it, or continue.'}
        </Text>

        <View style={styles.chips}>
          {STEPS.map((s) => {
            const placed = points[s.key] !== null;
            const isActive = s.key === activeKey;
            return (
              <Pressable
                key={s.key}
                onPress={() => setSelected(s.key)}
                style={[
                  styles.chip,
                  isActive && (s.ball ? styles.chipActiveBall : styles.chipActive),
                ]}
                accessibilityLabel={
                  placed ? `Move ${s.label}` : `Place ${s.label}`
                }
              >
                <Text
                  style={[
                    styles.chipText,
                    placed && styles.chipTextPlaced,
                    isActive && (s.ball ? styles.chipTextActiveBall : styles.chipTextActive),
                  ]}
                >
                  {s.short}
                </Text>
                {placed ? (
                  <Text
                    style={[
                      styles.chipFrame,
                      isActive && (s.ball ? styles.chipTextActiveBall : styles.chipTextActive),
                    ]}
                  >
                    {s.ball ? `f${points[s.key]!.frame}` : '✓'}
                  </Text>
                ) : null}
              </Pressable>
            );
          })}
        </View>

        <View style={styles.strip} onLayout={(e) => setTrackWidth(e.nativeEvent.layout.width)}>
          <View style={styles.stripThumbs} pointerEvents="none">
            {thumbs.map((t, i) => (
              <View key={`${t.index}-${i}`} style={styles.thumb}>
                {t.uri ? (
                  <Image
                    source={{ uri: t.uri }}
                    style={styles.thumbImage}
                    resizeMode="cover"
                    // Downsamples during decode, so the strip does not hold a
                    // dozen full-size bitmaps in memory.
                    resizeMethod="resize"
                    fadeDuration={0}
                  />
                ) : null}
              </View>
            ))}
          </View>

          {scrubMax > 0 ? (
            <View
              style={[styles.playhead, { left: playheadRatio * Math.max(0, trackWidth - CROSSHAIR) }]}
              pointerEvents="none"
            />
          ) : null}

          <View style={StyleSheet.absoluteFill} {...scrubber.panHandlers} />
        </View>

        <View style={styles.stepRow}>
          <Pressable
            onPress={() => step(-1)}
            disabled={current === 0}
            hitSlop={space.sm}
            style={[styles.stepButton, current === 0 && styles.stepButtonOff]}
            accessibilityLabel="Previous frame"
          >
            <Text style={styles.stepButtonText}>−</Text>
          </Pressable>

          <View style={styles.readout}>
            <Text style={styles.frameNumber}>
              {current}
              <Text style={styles.frameTotal}> / {Math.max(0, total - 1)}</Text>
            </Text>
            <Text style={styles.frameTime}>{seconds.toFixed(3)}s</Text>
          </View>

          <Pressable
            onPress={() => step(1)}
            disabled={current >= scrubMax}
            hitSlop={space.sm}
            style={[styles.stepButton, current >= scrubMax && styles.stepButtonOff]}
            accessibilityLabel="Next frame"
          >
            <Text style={styles.stepButtonText}>+</Text>
          </Pressable>
        </View>

        {status === 'extracting' ? (
          <Text style={styles.progress}>
            Decoding {decoded} of {total} frames — you can start marking now
          </Text>
        ) : null}

        {extraction.error ? <Text style={styles.warn}>{extraction.error}</Text> : null}
        {problem ? <Text style={styles.problem}>{problem}</Text> : null}

        {__DEV__ && extraction.probe ? (
          <Text style={styles.debug}>extractFrames: {extraction.probe}</Text>
        ) : null}

        <View style={styles.footer}>
          <Pressable
            onPress={undo}
            disabled={history.length === 0}
            style={[styles.secondaryButton, history.length === 0 && styles.buttonOff]}
            accessibilityLabel="Undo last point"
          >
            <Text style={styles.secondaryButtonText}>Undo</Text>
          </Pressable>

          <Pressable
            onPress={onNext}
            disabled={!canContinue}
            style={[styles.primaryButton, !canContinue && styles.buttonOff]}
            accessibilityLabel="Continue to the result"
          >
            <Text style={styles.primaryButtonText}>Next</Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}

function Marker({
  step,
  left,
  top,
  active,
}: {
  step: Step;
  left: number;
  top: number;
  active: boolean;
}) {
  const tint = step.ball ? colors.accent : colors.text;
  return (
    <View
      pointerEvents="none"
      style={[styles.marker, { left: left - MARKER_SIZE / 2, top: top - MARKER_SIZE / 2 }]}
    >
      <View style={[styles.markerRing, { borderColor: tint }, active && styles.markerRingActive]} />
      <View style={[styles.markerTickV, { backgroundColor: tint }]} />
      <View style={[styles.markerTickH, { backgroundColor: tint }]} />
      <Text style={[styles.markerLabel, { color: tint }]}>{step.short}</Text>
    </View>
  );
}

function Fallback({
  insets,
  title,
  body,
  action,
  secondary,
}: {
  insets: number;
  title: string;
  body: string;
  action: { label: string; onPress: () => void };
  secondary?: { label: string; onPress: () => void };
}) {
  return (
    <View style={[styles.screen, styles.fallback, { paddingTop: insets }]}>
      <Text style={styles.fallbackTitle}>{title}</Text>
      <Text style={styles.fallbackBody}>{body}</Text>
      <Pressable style={styles.primaryButton} onPress={action.onPress}>
        <Text style={styles.primaryButtonText}>{action.label}</Text>
      </Pressable>
      {secondary ? (
        <Pressable style={styles.fallbackSecondary} onPress={secondary.onPress}>
          <Text style={styles.secondaryButtonText}>{secondary.label}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: space.lg,
    paddingVertical: space.md,
  },
  headerAction: { ...type.caption, color: colors.muted },
  headerCount: { ...type.label, color: colors.muted },

  stage: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
  },
  stagePlaceholder: { alignItems: 'center', justifyContent: 'center' },
  frameBox: { position: 'relative', overflow: 'hidden' },
  muted: { ...type.caption, color: colors.muted },

  marker: {
    position: 'absolute',
    width: MARKER_SIZE,
    height: MARKER_SIZE,
    alignItems: 'center',
    justifyContent: 'center',
  },
  markerRing: {
    position: 'absolute',
    width: MARKER_SIZE,
    height: MARKER_SIZE,
    borderRadius: radius.pill,
    borderWidth: CROSSHAIR,
    opacity: 0.5,
  },
  markerRingActive: { borderWidth: 2, opacity: 1 },
  markerTickV: { position: 'absolute', width: CROSSHAIR, height: MARKER_SIZE },
  markerTickH: { position: 'absolute', height: CROSSHAIR, width: MARKER_SIZE },
  markerLabel: {
    ...type.label,
    position: 'absolute',
    top: MARKER_SIZE,
    // Wider than the marker and centred on it, so the caption is not clipped
    // by the marker's own bounds.
    left: -MARKER_SIZE,
    width: MARKER_SIZE * 3,
    textAlign: 'center',
  },

  controls: { paddingHorizontal: space.lg, paddingTop: space.md },
  hint: { ...type.caption, color: colors.text, minHeight: space.xl },

  chips: { flexDirection: 'row', marginTop: space.sm },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.surface,
    paddingHorizontal: space.sm,
    paddingVertical: space.xs,
    marginRight: space.sm,
  },
  chipActive: { borderColor: colors.text, backgroundColor: colors.text },
  chipActiveBall: { borderColor: colors.accent, backgroundColor: colors.accent },
  chipText: { ...type.caption, color: colors.muted },
  chipTextPlaced: { color: colors.text },
  chipTextActive: { color: colors.bg, fontWeight: '800' },
  chipTextActiveBall: { color: colors.bg, fontWeight: '800' },
  chipFrame: {
    ...type.caption,
    color: colors.muted,
    marginLeft: space.xs,
    fontVariant: ['tabular-nums'],
  },

  strip: {
    height: STRIP_HEIGHT,
    marginTop: space.md,
    borderRadius: radius.sm,
    overflow: 'hidden',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
  },
  stripThumbs: { flexDirection: 'row', height: '100%' },
  thumb: { flex: 1, height: '100%', backgroundColor: colors.line },
  thumbImage: { width: '100%', height: '100%' },
  playhead: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    width: CROSSHAIR,
    backgroundColor: colors.accent,
  },

  stepRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: space.sm,
  },
  stepButton: {
    width: space.xl,
    height: space.xl,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.line,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepButtonOff: { opacity: 0.3 },
  stepButtonText: { ...type.h2, color: colors.text },
  readout: { alignItems: 'center' },
  frameNumber: { ...type.h2, color: colors.text, fontVariant: ['tabular-nums'] },
  frameTotal: { ...type.caption, color: colors.muted },
  frameTime: { ...type.caption, color: colors.muted, fontVariant: ['tabular-nums'] },

  progress: { ...type.caption, color: colors.muted, marginTop: space.sm },
  warn: { ...type.caption, color: colors.warn, marginTop: space.sm },
  problem: { ...type.caption, color: colors.danger, marginTop: space.sm },
  debug: { ...type.caption, color: colors.muted, marginTop: space.xs, opacity: 0.6 },

  footer: { flexDirection: 'row', alignItems: 'center', marginTop: space.md },
  primaryButton: {
    flex: 1,
    backgroundColor: colors.accent,
    borderRadius: radius.pill,
    paddingVertical: space.md,
    alignItems: 'center',
  },
  primaryButtonText: { ...type.body, color: colors.bg, fontWeight: '800' },
  secondaryButton: {
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.line,
    paddingVertical: space.md,
    paddingHorizontal: space.lg,
    marginRight: space.sm,
    alignItems: 'center',
  },
  secondaryButtonText: { ...type.body, color: colors.text },
  buttonOff: { opacity: 0.3 },

  fallback: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: space.lg,
  },
  fallbackTitle: { ...type.h2, color: colors.text, marginBottom: space.sm },
  fallbackBody: {
    ...type.body,
    color: colors.muted,
    textAlign: 'center',
    marginBottom: space.lg,
  },
  fallbackSecondary: { paddingVertical: space.md },
});
