import { useEffect, useMemo, useState } from 'react';
import { Platform, Pressable, StyleSheet, useWindowDimensions } from 'react-native';
import {
  Blur,
  BlurMask,
  Canvas,
  Circle,
  DashPathEffect,
  Group,
  Line,
  LinearGradient,
  matchFont,
  Oval,
  Path,
  RadialGradient,
  RoundedRect,
  Skia,
  Text as SkiaText,
  vec,
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
  bailAt,
  ballAt,
  BAIL_HEIGHT,
  INTRO,
  introOpacity,
  letterAt,
  onGround,
  project,
  sceneOpacity,
  seamPhase,
  seamPoints,
  shakeAt,
  STUMP_HEIGHT,
  STUMP_WIDTH,
  STUMP_Z,
  stumpLean,
  viewFor,
  WICKET_WIDTH,
  WORDMARK,
  type View,
} from './introScene';
import { colors, opacity, size, stroke } from './tokens';

/** Once per launch of the app's process: a warm return to the app never plays it again. */
let played = false;

// Shades of the ball's lime and the stumps' white, mixed from the tokens.
const LIME_LIGHT = interpolateColor(0.55, [0, 1], [colors.accent, colors.text]);
const LIME_DARK = interpolateColor(0.62, [0, 1], [colors.accent, colors.bg]);
const STUMP_SHADE = interpolateColor(0.55, [0, 1], [colors.text, colors.bg]);
const SEAM = interpolateColor(0.5, [0, 1], [colors.accent, colors.bg]);

/** Ghost copies behind the ball, milliseconds back, and how strongly each shows: the motion blur. */
const GHOSTS = [
  { back: 8, alpha: 0.35 },
  { back: 16, alpha: 0.2 },
  { back: 24, alpha: 0.1 },
];

/** Tilt of the ball's spin axis on screen: the seam stands nearly upright, as a seamer's does. */
const SEAM_AXIS = (-70 * Math.PI) / 180;

/**
 * A short intro after the native splash, on a cold start only: a lime ball
 * bowled in out of the dark hits the stumps, the bails fly, and the PACEBALL
 * wordmark resolves before the app shows through. At most motion.intro.total.
 *
 * Drawn in Skia and driven by one Reanimated clock on the UI thread, so it
 * stays smooth while the first screen mounts underneath. A tap skips it;
 * reduced motion never plays it. No speed, no path and no number is drawn:
 * it is a picture, never a reading.
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

  const shake = useDerivedValue(() => [{ translateX: shakeAt(t.value) }, { translateY: shakeAt(t.value) * 0.5 }]);
  const scene = useDerivedValue(() => sceneOpacity(t.value));

  return (
    <Canvas style={StyleSheet.absoluteFill}>
      <Group transform={shake}>
        <Group opacity={scene}>
          <Pitch view={view} height={height} />
          <BallShadow t={t} view={view} />
          <Wicket t={t} view={view} height={height} />
        </Group>
        <Ball t={t} view={view} />
      </Group>
      <Wordmark t={t} width={width} height={height} />
    </Canvas>
  );
}

/** The pitch running away into the dark, with the popping crease in front of the stumps. */
function Pitch({ view, height }: { view: View; height: number }) {
  const { path, crease } = useMemo(() => {
    const near = STUMP_Z - 2;
    const far = 60;
    const halfWidth = 1.5;
    const a = project(onGround(-halfWidth, near), view);
    const b = project(onGround(halfWidth, near), view);
    const c = project(onGround(halfWidth, far), view);
    const d = project(onGround(-halfWidth, far), view);
    const p = Skia.Path.Make();
    p.moveTo(a.x, a.y);
    p.lineTo(b.x, b.y);
    p.lineTo(c.x, c.y);
    p.lineTo(d.x, d.y);
    p.close();
    const creaseZ = STUMP_Z - 1.22;
    return {
      path: p,
      crease: {
        from: project(onGround(-1.3, creaseZ), view),
        to: project(onGround(1.3, creaseZ), view),
      },
    };
  }, [view]);
  return (
    <>
      <Path path={path}>
        <LinearGradient start={vec(0, view.cy)} end={vec(0, height)} colors={[colors.bg, colors.surface]} />
      </Path>
      <Line
        p1={vec(crease.from.x, crease.from.y)}
        p2={vec(crease.to.x, crease.to.y)}
        color={colors.control}
        strokeWidth={stroke.medium}
      />
    </>
  );
}

/** The ball's shadow on the pitch, straight below it. It sharpens as the ball comes close. */
function BallShadow({ t, view }: { t: SharedValue<number>; view: View }) {
  const rect = useDerivedValue(() => {
    const b = ballAt(t.value);
    const g = project(onGround(b.p.x, b.p.z), view);
    const r = b.radius * g.scale;
    return Skia.XYWHRect(g.x - r * 1.3, g.y - r * 0.3, r * 2.6, r * 0.6);
  });
  const blur = useDerivedValue(() => {
    const b = ballAt(t.value);
    return Math.max(b.radius * project(b.p, view).scale * 0.5, 1);
  });
  const alpha = useDerivedValue(() => ballAt(t.value).opacity * opacity.secondary);
  return (
    <Oval rect={rect} color={colors.bg} opacity={alpha}>
      <BlurMask blur={blur} style="normal" />
    </Oval>
  );
}

/** Three stumps, lit from the left like cylinders, and two bails on top. */
function Wicket({ t, view, height }: { t: SharedValue<number>; view: View; height: number }) {
  const geometry = useMemo(() => {
    const base = project(onGround(0, STUMP_Z), view);
    const px = base.scale;
    const stumpW = STUMP_WIDTH * px;
    const stumpH = STUMP_HEIGHT * px;
    const gap = (WICKET_WIDTH * px - stumpW * 3) / 2;
    const left = base.x - (WICKET_WIDTH * px) / 2;
    const stumps = [0, 1, 2].map((i) => ({ x: left + i * (stumpW + gap), y: base.y - stumpH }));
    const bailH = BAIL_HEIGHT * px;
    const bailW = stumpW + gap;
    const bails = [0, 1].map((i) => ({
      x: stumps[i].x + stumpW / 2,
      y: stumps[i].y - bailH,
      w: bailW,
      h: bailH,
    }));
    return { stumps, bails, stumpW, stumpH, baseY: base.y };
  }, [view]);

  return (
    <>
      {geometry.stumps.map((s, i) => (
        <Stump key={i} t={t} index={i} x={s.x} y={s.y} w={geometry.stumpW} h={geometry.stumpH} />
      ))}
      {geometry.bails.map((b, i) => (
        <Bail key={i} t={t} index={i} {...b} height={height} />
      ))}
    </>
  );
}

function Stump({
  t,
  index,
  x,
  y,
  w,
  h,
}: {
  t: SharedValue<number>;
  index: number;
  x: number;
  y: number;
  w: number;
  h: number;
}) {
  // Leans about its foot, where it goes into the ground.
  const transform = useDerivedValue(() => [{ rotate: (stumpLean(t.value, index) * Math.PI) / 180 }]);
  return (
    <Group transform={transform} origin={vec(x + w / 2, y + h)}>
      <RoundedRect x={x} y={y} width={w} height={h} r={w / 2}>
        <LinearGradient
          start={vec(x, 0)}
          end={vec(x + w, 0)}
          colors={[colors.text, colors.text, STUMP_SHADE]}
          positions={[0, 0.35, 1]}
        />
      </RoundedRect>
    </Group>
  );
}

function Bail({
  t,
  index,
  x,
  y,
  w,
  h,
  height,
}: {
  t: SharedValue<number>;
  index: number;
  x: number;
  y: number;
  w: number;
  h: number;
  height: number;
}) {
  const transform = useDerivedValue(() => {
    const b = bailAt(t.value, index);
    return [
      { translateX: b.dx * height },
      { translateY: b.dy * height },
      { rotate: (b.turn * Math.PI) / 180 },
    ];
  });
  const alpha = useDerivedValue(() => bailAt(t.value, index).opacity);
  return (
    <Group transform={transform} origin={vec(x + w / 2, y + h / 2)} opacity={alpha}>
      <RoundedRect x={x} y={y} width={w} height={h} r={h / 2} color={colors.text} />
    </Group>
  );
}

/**
 * The ball: lime, lit from the upper left so it reads as a sphere, a soft
 * highlight, and a stitched seam turning with the spin. Short ghost copies
 * behind it are its motion blur, never a trail: they sit within its own width.
 */
function Ball({ t, view }: { t: SharedValue<number>; view: View }) {
  const at = (back: number) => {
    'worklet';
    const b = ballAt(Math.max(t.value - back, 0));
    const s = project(b.p, view);
    return { x: s.x, y: s.y, r: b.radius * s.scale, opacity: b.opacity };
  };

  const cx = useDerivedValue(() => at(0).x);
  const cy = useDerivedValue(() => at(0).y);
  const r = useDerivedValue(() => at(0).r);
  const alpha = useDerivedValue(() => at(0).opacity);
  const light = useDerivedValue(() => {
    const b = at(0);
    return vec(b.x - b.r * 0.35, b.y - b.r * 0.4);
  });
  const shadeR = useDerivedValue(() => at(0).r * 1.35);

  const highlightX = useDerivedValue(() => at(0).x - at(0).r * 0.38);
  const highlightY = useDerivedValue(() => at(0).y - at(0).r * 0.42);
  const highlightR = useDerivedValue(() => at(0).r * 0.26);
  const highlightBlur = useDerivedValue(() => Math.max(at(0).r * 0.18, 0.5));

  const seam = useDerivedValue(() => {
    const b = at(0);
    const points = seamPoints(b.x, b.y, b.r * 0.97, seamPhase(t.value), SEAM_AXIS, 24);
    const p = Skia.Path.Make();
    p.moveTo(points[0].x, points[0].y);
    for (let i = 1; i < points.length; i++) p.lineTo(points[i].x, points[i].y);
    return p;
  });
  const seamWidth = useDerivedValue(() => Math.max(at(0).r * 0.14, stroke.hairline));
  const stitchWidth = useDerivedValue(() => Math.max(at(0).r * 0.26, stroke.hairline));
  const stitchDash = useDerivedValue(() => {
    const d = Math.max(at(0).r * 0.06, 0.5);
    return [d, d * 2.2];
  });

  // Hidden once the ball is gone, so nothing is drawn at a zero radius.
  const shown = useDerivedValue(() => (at(0).opacity > 0.01 ? 1 : 0));

  return (
    <Group opacity={shown}>
      {GHOSTS.map((g) => (
        <Ghost key={g.back} t={t} back={g.back} alpha={g.alpha} at={at} />
      ))}
      <Group opacity={alpha}>
        <Circle cx={cx} cy={cy} r={r}>
          <RadialGradient
            c={light}
            r={shadeR}
            colors={[LIME_LIGHT, colors.accent, LIME_DARK]}
            positions={[0, 0.4, 1]}
          />
        </Circle>
        <Path path={seam} style="stroke" strokeWidth={seamWidth} strokeCap="round" color={SEAM} />
        <Path
          path={seam}
          style="stroke"
          strokeWidth={stitchWidth}
          color={LIME_LIGHT}
          opacity={opacity.secondary}
        >
          <DashPathEffect intervals={stitchDash} />
        </Path>
        <Circle cx={highlightX} cy={highlightY} r={highlightR} color={colors.text} opacity={opacity.inactive}>
          <BlurMask blur={highlightBlur} style="normal" />
        </Circle>
      </Group>
    </Group>
  );
}

function Ghost({
  t,
  back,
  alpha,
  at,
}: {
  t: SharedValue<number>;
  back: number;
  alpha: number;
  at: (back: number) => { x: number; y: number; r: number; opacity: number };
}) {
  const cx = useDerivedValue(() => at(back).x);
  const cy = useDerivedValue(() => at(back).y);
  const r = useDerivedValue(() => at(back).r);
  // Only while the ball is in flight: nothing lingers once it has hit.
  const o = useDerivedValue(() => (t.value < INTRO.impact ? alpha * at(back).opacity : 0));
  return <Circle cx={cx} cy={cy} r={r} color={colors.accent} opacity={o} />;
}

/** PACEBALL, resolving out of a blur letter by letter, above the wicket. */
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
  return (
    <Group opacity={alpha} transform={transform}>
      <SkiaText x={x} y={y} text={ch} font={font} color={colors.text}>
        <Blur blur={blur} />
      </SkiaText>
    </Group>
  );
}

const styles = StyleSheet.create({
  overlay: { backgroundColor: colors.bg },
});
