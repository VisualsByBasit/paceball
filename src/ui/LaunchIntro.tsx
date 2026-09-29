import { useEffect, useMemo, useState } from 'react';
import { Platform, Pressable, StyleSheet, useWindowDimensions } from 'react-native';
import {
  Blur,
  Canvas,
  Circle,
  Group,
  matchFont,
  Text as SkiaText,
  type SkFont,
} from '@shopify/react-native-skia';
import Animated, {
  Easing,
  interpolateColor,
  useAnimatedStyle,
  useDerivedValue,
  useReducedMotion,
  useSharedValue,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';
import {
  Ball3D,
  GroundShadow,
  Pitch3D,
  Stadium3D,
  Wicket3D,
  type BailMotion,
  type Camera,
} from './cricket3d';
import {
  bailAt,
  ballAt,
  CAMERA_HEIGHT,
  INTRO,
  introOpacity,
  letterAt,
  onGround,
  project,
  sceneOpacity,
  seamPhase,
  shakeAt,
  STUMP_HEIGHT,
  STUMP_Z,
  stumpLean,
  sweepAt,
  viewFor,
  WORDMARK,
  type View,
} from './introScene';
import { colors, opacity, size } from './tokens';

/** Once per launch of the app's process: a warm return to the app never plays it again. */
let played = false;

/** Ghost copies behind the ball, milliseconds back, and how strongly each shows: the motion blur. */
const GHOSTS = [
  { back: 8, alpha: 0.35 },
  { back: 16, alpha: 0.2 },
  { back: 24, alpha: 0.1 },
];

/** The wordmark's resting colour, and the light the sweep carries across it. */
const WORD_REST = interpolateColor(0.12, [0, 1], [colors.text, colors.bg]);

/**
 * A short intro after the native splash, on a cold start only, drawn with the
 * 3D cricket kit: under the floodlights, a lit lime ball comes out of the dark
 * down the pitch, hits the stumps, the bails fly off turning and fall with
 * their shadows, and the PACEBALL wordmark resolves with a light sweeping
 * across it before the app shows through. At most motion.intro.total.
 *
 * The stadium and pitch never move, so they sit in a canvas of their own and
 * are drawn once; only the ball, the wicket and the wordmark redraw. A tap
 * skips it; reduced motion never plays it. No speed, no path and no number is
 * drawn: it is a picture, never a reading.
 */
export function LaunchIntro() {
  const reduced = useReducedMotion();
  const [done, setDone] = useState(() => played || reduced);
  const { width, height } = useWindowDimensions();
  const t = useSharedValue(0);

  useEffect(() => {
    played = true;
    if (done) return;
    t.value = withTiming(INTRO.total, { duration: INTRO.total, easing: Easing.linear }, (finished) => {
      if (finished) scheduleOnRN(setDone, true);
    });
    // Once, on the first mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const fade = useAnimatedStyle(() => ({ opacity: introOpacity(t.value) }));

  if (done || width === 0 || height === 0) return null;

  return (
    <Animated.View style={[StyleSheet.absoluteFill, styles.overlay, fade]}>
      <Pressable
        style={StyleSheet.absoluteFill}
        onPress={() => setDone(true)}
        accessibilityRole="button"
        accessibilityLabel="Paceball. Skip the intro"
      >
        <Scene t={t} width={width} height={height} />
      </Pressable>
    </Animated.View>
  );
}

function Scene({ t, width, height }: { t: SharedValue<number>; width: number; height: number }) {
  const view = useMemo(() => viewFor(width, height), [width, height]);
  const cam = useMemo<Camera>(
    () => ({ cx: view.cx, horizon: view.cy, focal: view.focal, camH: CAMERA_HEIGHT }),
    [view]
  );

  const shake = useDerivedValue(() => [{ translateX: shakeAt(t.value) }, { translateY: shakeAt(t.value) * 0.5 }]);
  const backdrop = useAnimatedStyle(() => ({
    opacity: sceneOpacity(t.value),
    transform: [{ translateX: shakeAt(t.value) }, { translateY: shakeAt(t.value) * 0.5 }],
  }));
  const scene = useDerivedValue(() => sceneOpacity(t.value));

  return (
    <>
      {/* Static: drawn once, faded and shaken as a whole. */}
      <Animated.View style={[StyleSheet.absoluteFill, backdrop]}>
        <Canvas style={StyleSheet.absoluteFill}>
          <Stadium3D width={width} height={height} horizon={view.cy} />
          <Pitch3D width={width} height={height} cam={cam} stumpZ={STUMP_Z} />
        </Canvas>
      </Animated.View>
      <Canvas style={StyleSheet.absoluteFill}>
        <Group transform={shake}>
          <Group opacity={scene}>
            <BallShadow t={t} view={view} />
            <Wicket t={t} view={view} height={height} />
          </Group>
          <Ball t={t} view={view} />
        </Group>
        <Wordmark t={t} width={width} height={height} />
      </Canvas>
    </>
  );
}

/** The ball's shadow on the pitch, straight below it. It sharpens as the ball comes close. */
function BallShadow({ t, view }: { t: SharedValue<number>; view: View }) {
  const g = useDerivedValue(() => {
    const b = ballAt(t.value);
    const p = project(onGround(b.p.x, b.p.z), view);
    return { x: p.x, y: p.y, r: b.radius * p.scale, o: b.opacity };
  });
  const cx = useDerivedValue(() => g.value.x);
  const cy = useDerivedValue(() => g.value.y);
  const rx = useDerivedValue(() => g.value.r * 1.3);
  const ry = useDerivedValue(() => g.value.r * 0.3);
  const blur = useDerivedValue(() => Math.max(g.value.r * 0.5, 1));
  const o = useDerivedValue(() => g.value.o * opacity.secondary);
  return <GroundShadow cx={cx} cy={cy} rx={rx} ry={ry} blur={blur} opacity={o} />;
}

/** The kit's wicket at the far end, its stumps kicked back and its bails thrown by the hit. */
function Wicket({ t, view, height }: { t: SharedValue<number>; view: View; height: number }) {
  const base = useMemo(() => project(onGround(0, STUMP_Z), view), [view]);
  const stumpH = STUMP_HEIGHT * base.scale;
  const lean = useDerivedValue(() => [0, 1, 2].map((i) => stumpLean(t.value, i)));
  const bails = useDerivedValue<BailMotion[]>(() =>
    [0, 1].map((i) => {
      const b = bailAt(t.value, i);
      return { dx: b.dx * height, dy: b.dy * height, turn: (b.turn * Math.PI) / 180, opacity: b.opacity };
    })
  );
  return (
    <>
      {[0, 1].map((i) => (
        <BailShadow key={i} index={i} bails={bails} x={base.x} y={base.y} stumpH={stumpH} />
      ))}
      <Wicket3D x={base.x} y={base.y} height={stumpH} lean={lean} bails={bails} />
    </>
  );
}

/**
 * A flying bail's shadow on the ground under it: it slides with the bail and
 * grows sharper and darker as the bail falls back towards the pitch.
 */
function BailShadow({
  index,
  bails,
  x,
  y,
  stumpH,
}: {
  index: number;
  bails: SharedValue<BailMotion[]>;
  x: number;
  y: number;
  stumpH: number;
}) {
  const cx = useDerivedValue(() => x + (index === 0 ? -1 : 1) * stumpH * 0.08 + bails.value[index].dx);
  // How high the bail is above the pitch: dy grows as it falls.
  const lift = useDerivedValue(() => Math.max(stumpH - bails.value[index].dy, 0));
  const blur = useDerivedValue(() => Math.max(stumpH * 0.03 + lift.value * 0.05, 1));
  const o = useDerivedValue(() => {
    const flying = bails.value[index].dx !== 0 ? 1 : 0;
    const near = Math.min(Math.max(1 - lift.value / (stumpH * 1.5), 0.2), 1);
    return flying * near * bails.value[index].opacity * opacity.inactive;
  });
  return <GroundShadow cx={cx} cy={y} rx={stumpH * 0.09} ry={stumpH * 0.025} blur={blur} opacity={o} />;
}

/** The kit's lit ball, spinning, with short ghost copies behind it as motion blur, never a trail. */
function Ball({ t, view }: { t: SharedValue<number>; view: View }) {
  const at = useDerivedValue(() => {
    const b = ballAt(t.value);
    const s = project(b.p, view);
    return { x: s.x, y: s.y, r: b.radius * s.scale, o: b.opacity };
  });
  const cx = useDerivedValue(() => at.value.x);
  const cy = useDerivedValue(() => at.value.y);
  const r = useDerivedValue(() => at.value.r);
  const o = useDerivedValue(() => at.value.o);
  const spin = useDerivedValue(() => seamPhase(t.value));
  // Hidden once the ball is gone, so nothing is drawn at a zero radius.
  const shown = useDerivedValue(() => (at.value.o > 0.01 ? 1 : 0));
  return (
    <Group opacity={shown}>
      {GHOSTS.map((g) => (
        <Ghost key={g.back} t={t} back={g.back} alpha={g.alpha} view={view} />
      ))}
      <Ball3D cx={cx} cy={cy} r={r} spin={spin} opacity={o} />
    </Group>
  );
}

function Ghost({ t, back, alpha, view }: { t: SharedValue<number>; back: number; alpha: number; view: View }) {
  const at = useDerivedValue(() => {
    const b = ballAt(Math.max(t.value - back, 0));
    const s = project(b.p, view);
    return { x: s.x, y: s.y, r: b.radius * s.scale, o: b.opacity };
  });
  const cx = useDerivedValue(() => at.value.x);
  const cy = useDerivedValue(() => at.value.y);
  const r = useDerivedValue(() => at.value.r);
  // Only while the ball is in flight: nothing lingers once it has hit.
  const o = useDerivedValue(() => (t.value < INTRO.impact ? alpha * at.value.o : 0));
  return <Circle cx={cx} cy={cy} r={r} color={colors.accent} opacity={o} />;
}

/** PACEBALL, resolving out of a blur letter by letter, then a light sweeping across it. */
function Wordmark({ t, width, height }: { t: SharedValue<number>; width: number; height: number }) {
  const font = useMemo<SkFont | null>(() => {
    try {
      return matchFont({
        fontFamily: Platform.select({ ios: 'Helvetica Neue', default: 'sans-serif' }),
        fontSize: size.introWordmark,
        fontWeight: 'bold',
      });
    } catch {
      return null;
    }
  }, []);

  const letters = useMemo(() => {
    if (!font) return [];
    const advances = font.getGlyphWidths(font.getGlyphIDs(WORDMARK));
    // Tracked out a little, like a wordmark, and centred as a whole.
    const tracking = size.introWordmark * 0.08;
    const total = advances.reduce((sum, a) => sum + a, 0) + tracking * (WORDMARK.length - 1);
    let x = (width - total) / 2;
    return WORDMARK.split('').map((ch, i) => {
      const at = x;
      x += advances[i] + tracking;
      return { ch, x: at };
    });
  }, [font, width]);

  if (!font) return null;
  const baseline = height * 0.3;
  return (
    <>
      {letters.map((l, i) => (
        <Letter key={i} t={t} index={i} ch={l.ch} x={l.x} y={baseline} font={font} />
      ))}
    </>
  );
}

function Letter({
  t,
  index,
  ch,
  x,
  y,
  font,
}: {
  t: SharedValue<number>;
  index: number;
  ch: string;
  x: number;
  y: number;
  font: SkFont;
}) {
  const alpha = useDerivedValue(() => letterAt(t.value, index).opacity);
  const blur = useDerivedValue(() => letterAt(t.value, index).blur);
  const transform = useDerivedValue(() => [{ translateY: letterAt(t.value, index).rise }]);
  // At rest a soft silver; the sweep lights it white hot with a touch of lime.
  const color = useDerivedValue(() => {
    const s = sweepAt(t.value, index);
    return interpolateColor(s, [0, 0.7, 1], [WORD_REST, colors.text, colors.accent]);
  });
  return (
    <Group opacity={alpha} transform={transform}>
      <SkiaText x={x} y={y} text={ch} font={font} color={color}>
        <Blur blur={blur} />
      </SkiaText>
    </Group>
  );
}

const styles = StyleSheet.create({
  overlay: { backgroundColor: colors.bg },
});
