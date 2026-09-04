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
import { framesDirUri, useFrames } from '../src/capture/useFrames';
import { listPlayers } from '../src/data';
import {
  CALIBRATION_SPECS,
  formatMetres,
  resolveCalibrationMetres,
  type CalibrationSpec,
} from '../src/physics/calibration';
import { CalibrationStep } from '../src/ui/CalibrationStep';
import { colors, opacity, radius, space, stroke, type } from '../src/ui/tokens';
import type { CalibrationMethod, Point } from '../src/types';

type StepKey = 'calA' | 'calB' | 'release' | 'bounce';

type Step = {
  key: StepKey;
  label: string;
  short: string;
  hint: string;
  /** Ball points carry the measurement, so they get the accent. */
  ball: boolean;
  /**
   * Whether the point only exists on the frame it was placed on. A fixed
   * landmark stays put and stays visible; anything that moves between frames
   * would be drawn over the wrong pixels anywhere else.
   */
  pinned: boolean;
};

/**
 * The two ball taps never change. What the first two taps mean depends on the
 * scale reference, so they are built from its spec rather than fixed here.
 */
const BALL_STEPS: Step[] = [
  {
    key: 'release',
    label: 'Ball at release',
    short: 'Release',
    hint: 'Scrub to the frame the ball leaves the hand, then tap the ball.',
    ball: true,
    pinned: true,
  },
  {
    key: 'bounce',
    label: 'Ball at bounce',
    short: 'Bounce',
    hint: 'Scrub to the frame the ball hits the pitch, then tap the ball.',
    ball: true,
    pinned: true,
  },
];

function stepsFor(spec: CalibrationSpec): Step[] {
  return [
    {
      key: 'calA',
      label: spec.a.label,
      short: spec.a.short,
      hint: spec.a.hint,
      ball: false,
      pinned: spec.sameFrame,
    },
    {
      key: 'calB',
      label: spec.b.label,
      short: spec.b.short,
      hint: spec.b.hint,
      ball: false,
      pinned: spec.sameFrame,
    },
    ...BALL_STEPS,
  ];
}

type Points = Record<StepKey, Point | null>;

const NO_POINTS: Points = {
  calA: null,
  calB: null,
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

  // The scale reference. Every reading is scaled by it, so it is chosen up
  // front rather than assumed to be a full pitch.
  const [method, setMethod] = useState<CalibrationMethod>('stumps');
  const [customMetres, setCustomMetres] = useState('');
  const [calibrating, setCalibrating] = useState(true);
  const [heightCm, setHeightCm] = useState<number | null>(null);

  // Height calibration is only offered if there is a height on file to use.
  useEffect(() => {
    let alive = true;
    listPlayers()
      .then((players) => {
        if (alive) setHeightCm(players[0]?.heightCm ?? null);
      })
      .catch(() => {
        if (alive) setHeightCm(null);
      });
    return () => {
      alive = false;
    };
  }, []);

  const spec = CALIBRATION_SPECS[method];
  const calibration = resolveCalibrationMetres(method, customMetres, heightCm);
  const calRealMetres = calibration.metres;
  const steps = useMemo(() => stepsFor(spec), [spec]);

  const selectMethod = useCallback(
    (next: CalibrationMethod) => {
      if (next === method) return;
      setMethod(next);
      // Two taps placed against a different reference no longer mean anything,
      // and the history behind them would undo back to the old reading.
      setPoints((p) => ({ ...p, calA: null, calB: null }));
      setHistory([]);
      setSelected(null);
    },
    [method]
  );

  // The first point not yet placed, unless the user has picked one to redo.
  // Null once all four are down and nothing is selected, so a stray tap on the
  // frame cannot quietly drag the last point somewhere else.
  const activeKey: StepKey | null =
    selected ?? steps.find((s) => points[s.key] === null)?.key ?? null;
  const activeStep = activeKey ? steps.find((s) => s.key === activeKey)! : null;

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
      if (!fit || !currentUri || !activeKey || !imageSize) return;
      const { locationX, locationY } = event.nativeEvent;
      // A tap on the last pixel column lands exactly on the width, which the
      // session validator rejects — it wants points strictly inside the frame.
      const x = Math.min(imageSize.w - 1, Math.max(0, locationX / fit.scale));
      const y = Math.min(imageSize.h - 1, Math.max(0, locationY / fit.scale));

      setHistory((h) => [...h, points]);
      setPoints((p) => ({ ...p, [activeKey]: { x, y, frame: current } }));
      setSelected(null);
    },
    [fit, currentUri, activeKey, current, points, imageSize]
  );

  const undo = useCallback(() => {
    if (history.length === 0) return;
    setPoints(history[history.length - 1]);
    setHistory(history.slice(0, -1));
    setSelected(null);
  }, [history]);

  const placedCount = steps.filter((s) => points[s.key] !== null).length;

  // The measurement is only meaningful if the ruler has length and the ball
  // moved forward in time. Both are checked before Next will do anything.
  const problem = useMemo(() => {
    const { calA, calB, release, bounce } = points;
    if (calA && calB) {
      const dx = calB.x - calA.x;
      const dy = calB.y - calA.y;
      if (Math.hypot(dx, dy) < 1) {
        return `${spec.a.label} and ${spec.b.label} are on the same spot — the scale reference has to have length on screen.`;
      }
      // Stumps and markers stay put between frames. A ball in the hand and a
      // standing bowler do not, so measuring across two frames of those would
      // measure the wrong thing.
      if (spec.sameFrame && calA.frame !== calB.frame) {
        return `${spec.a.label} and ${spec.b.label} have to be marked on the same frame — they are on ${calA.frame} and ${calB.frame}.`;
      }
    }
    if (release && bounce && bounce.frame <= release.frame) {
      return `Bounce is on frame ${bounce.frame}, which is not after release on frame ${release.frame}.`;
    }
    return null;
  }, [points, spec]);

  const canContinue =
    placedCount === steps.length && problem === null && calRealMetres !== null;

  const onNext = useCallback(() => {
    if (!canContinue || !fps || !imageSize || calRealMetres === null) return;
    router.push({
      pathname: '/result',
      params: {
        videoPath,
        framesDir: framesDirUri(videoPath),
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
        // The scale reference travels with the points. Without it the far end
        // has no way to know what the two calibration taps span.
        calibrationMethod: method,
        calRealMetres: String(calRealMetres),
        calA: JSON.stringify(points.calA),
        calB: JSON.stringify(points.calB),
        release: JSON.stringify(points.release),
        bounce: JSON.stringify(points.bounce),
      },
    });
  }, [
    canContinue,
    fps,
    imageSize,
    router,
    videoPath,
    params,
    total,
    points,
    method,
    calRealMetres,
  ]);

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

  // Frames keep decoding behind this, so picking a reference costs no time.
  if (calibrating) {
    return (
      <CalibrationStep
        topInset={insets.top}
        bottomInset={insets.bottom}
        method={method}
        onSelectMethod={selectMethod}
        customMetres={customMetres}
        onChangeCustomMetres={setCustomMetres}
        heightCm={heightCm}
        metres={calRealMetres}
        problem={calibration.problem}
        onConfirm={() => {
          if (calRealMetres !== null) setCalibrating(false);
        }}
        onBack={() => router.back()}
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
        <Pressable
          onPress={() => setCalibrating(true)}
          hitSlop={space.sm}
          accessibilityRole="button"
          accessibilityLabel="Change the scale reference"
        >
          <Text style={styles.headerScale}>
            {spec.short} · {calRealMetres === null ? '—' : formatMetres(calRealMetres)}
          </Text>
        </Pressable>
        <Text style={styles.headerCount}>
          {placedCount} of {steps.length}
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

            {steps.map((s) => {
              const point = points[s.key];
              if (!point) return null;
              // A pinned point only exists on its own frame. A wicket is a fixed
              // landmark, so it stays visible wherever you scrub.
              if (s.pinned && point.frame !== current) return null;
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
          {steps.map((s) => {
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
                    {s.pinned ? `f${points[s.key]!.frame}` : '✓'}
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
  headerScale: { ...type.caption, color: colors.text },
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
    borderWidth: stroke.hairline,
    opacity: opacity.inactive,
  },
  markerRingActive: { borderWidth: stroke.medium, opacity: opacity.full },
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
    borderWidth: stroke.hairline,
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
    ...type.tabular,
    color: colors.muted,
    marginLeft: space.xs,
  },

  strip: {
    height: STRIP_HEIGHT,
    marginTop: space.md,
    borderRadius: radius.sm,
    overflow: 'hidden',
    backgroundColor: colors.surface,
    borderWidth: stroke.hairline,
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
    borderWidth: stroke.hairline,
    borderColor: colors.line,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepButtonOff: { opacity: opacity.disabled },
  stepButtonText: { ...type.h2, color: colors.text },
  readout: { alignItems: 'center' },
  frameNumber: { ...type.h2, ...type.tabular, color: colors.text },
  frameTotal: { ...type.caption, color: colors.muted },
  frameTime: { ...type.caption, ...type.tabular, color: colors.muted },

  progress: { ...type.caption, color: colors.muted, marginTop: space.sm },
  warn: { ...type.caption, color: colors.warn, marginTop: space.sm },
  problem: { ...type.caption, color: colors.danger, marginTop: space.sm },
  debug: { ...type.caption, color: colors.muted, marginTop: space.xs, opacity: opacity.secondary },

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
    borderWidth: stroke.hairline,
    borderColor: colors.line,
    paddingVertical: space.md,
    paddingHorizontal: space.lg,
    marginRight: space.sm,
    alignItems: 'center',
  },
  secondaryButtonText: { ...type.body, color: colors.text },
  buttonOff: { opacity: opacity.disabled },

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
