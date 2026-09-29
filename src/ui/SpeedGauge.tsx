import { useEffect, useMemo } from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import {
  BlurMask,
  Canvas,
  Circle,
  Group,
  Line,
  LinearGradient,
  matchFont,
  Path,
  RadialGradient,
  Rect,
  Shader,
  Skia,
  Text as SkiaText,
  vec,
  type SkFont,
} from '@shopify/react-native-skia';
import {
  Easing,
  interpolateColor,
  useDerivedValue,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withTiming,
} from 'react-native-reanimated';
import {
  bandDeg,
  GAUGE_START_DEG,
  GAUGE_SWEEP_DEG,
  gaugeFraction,
  gaugeMax,
  gaugeTicks,
  needleDeg,
  OFF_SCALE_LABEL,
  offScale,
} from './gauge';
import type { MeasuredReading } from './reading';
import type { SpeedUnit } from '../settings/settings';
import { effect, MATERIAL } from './cricket3d';
import { colors, motion, opacity, scene, size } from './tokens';

const SETTLE = Easing.bezier(...motion.settleCurve);

/** A point on the dial's circle, `deg` clockwise from three o'clock. */
function onCircle(cx: number, cy: number, r: number, deg: number) {
  'worklet';
  const rad = (deg * Math.PI) / 180;
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
}

// The instrument's proportions, as shares of its radius.
const BEZEL_INNER = 0.86;
const TICK_OUTER = 0.8;
const TICK_MAJOR = 0.1;
const TICK_MINOR = 0.05;
const BAND_R = 0.64;
const BAND_W = 0.06;
const LABEL_R = 0.5;
const NEEDLE_TIP = 0.78;
const NEEDLE_TAIL = 0.16;
const HUB = 0.1;

// Shades mixed from the tokens: the lit and shaded flanks of the needle.
const WHITE_LIT = colors.text;
const WHITE_SHADE = interpolateColor(0.4, [0, 1], [colors.text, colors.bg]);
const LIME_LIT = interpolateColor(0.35, [0, 1], [colors.accent, colors.text]);
const LIME_SHADE = interpolateColor(0.35, [0, 1], [colors.accent, colors.bg]);

type SpeedGaugeProps = {
  /** Only a measured reading: without one there is no gauge at all. */
  reading: MeasuredReading;
  unit: SpeedUnit;
  /** How wide to draw it; never wider than size.gauge. */
  width: number;
};

/**
 * A speedometer for the reading, drawn as an instrument: a brushed metal
 * bezel round a recessed dial, embossed ticks and figures on a fixed scale,
 * the measured range as a glowing band set into the face, and a needle with a
 * lit hub that sweeps from 0 to the reading on the same 700 ms settle curve as
 * the number, never passing it. It all turns lime once the reading lands.
 * Reduced motion shows it landed.
 *
 * The scale is fixed and never stretched. A reading past the end rests on the
 * end stop, and the dial says "Off the scale".
 *
 * Decorative for a screen reader: the reading beneath it says the same thing
 * in words.
 */
export function SpeedGauge({ reading, unit, width }: SpeedGaugeProps) {
  const reduced = useReducedMotion();
  const w = Math.min(width, size.gauge);
  const R = w / 2;
  const cx = R;
  const cy = R;

  const max = gaugeMax(unit);
  const value = reading.value;
  const beyond = offScale(value, reading.error, unit);

  const shown = useSharedValue(reduced ? value : 0);
  const landed = useSharedValue(reduced ? 1 : 0);

  useEffect(() => {
    if (reduced) {
      shown.value = value;
      landed.value = 1;
      return;
    }
    shown.value = 0;
    landed.value = 0;
    shown.value = withTiming(value, { duration: motion.countUp, easing: SETTLE }, (finished) => {
      if (!finished) return;
      // After the bail has fallen, over the same time the wicket turns.
      landed.value = withDelay(
        motion.lock.bail,
        withTiming(1, { duration: motion.lock.colour, easing: Easing.linear })
      );
    });
  }, [value, reduced, shown, landed]);

  const band = useMemo(() => {
    const oval = Skia.XYWHRect(cx - R * BAND_R, cy - R * BAND_R, R * BAND_R * 2, R * BAND_R * 2);
    const track = Skia.Path.Make();
    track.addArc(oval, GAUGE_START_DEG, GAUGE_SWEEP_DEG);
    const b = bandDeg(value, reading.error, max);
    const range = Skia.Path.Make();
    range.addArc(oval, b.from, Math.max(b.sweep, 0.5));
    return { track, range };
  }, [cx, cy, R, value, reading.error, max]);

  // The needle, pointing along +x from the hub, as its two flanks.
  const needle = useMemo(() => {
    const tail = -R * NEEDLE_TAIL;
    const tip = R * NEEDLE_TIP;
    const root = R * 0.045;
    const end = R * 0.012;
    const upper = Skia.Path.Make();
    upper.moveTo(cx + tail, cy);
    upper.lineTo(cx + tail, cy - root);
    upper.lineTo(cx + tip, cy - end);
    upper.lineTo(cx + tip + end, cy);
    upper.close();
    const lower = Skia.Path.Make();
    lower.moveTo(cx + tail, cy);
    lower.lineTo(cx + tail, cy + root);
    lower.lineTo(cx + tip, cy + end);
    lower.lineTo(cx + tip + end, cy);
    lower.close();
    const whole = Skia.Path.Make();
    whole.addPath(upper);
    whole.addPath(lower);
    return { upper, lower, whole };
  }, [cx, cy, R]);

  const turn = useDerivedValue(() => [
    { rotate: (needleDeg(shown.value, value, max) * Math.PI) / 180 },
  ]);
  const shadowTurn = useDerivedValue(() => [
    { translateX: R * 0.035 },
    { translateY: R * 0.05 },
    { rotate: (needleDeg(shown.value, value, max) * Math.PI) / 180 },
  ]);
  const lit = useDerivedValue(() => interpolateColor(landed.value, [0, 1], [WHITE_LIT, LIME_LIT]));
  const shade = useDerivedValue(() => interpolateColor(landed.value, [0, 1], [WHITE_SHADE, LIME_SHADE]));
  const bandColour = useDerivedValue(() => interpolateColor(landed.value, [0, 1], [colors.text, colors.accent]));
  const glow = useDerivedValue(() => landed.value * opacity.secondary);

  return (
    <View
      style={[styles.gauge, { width: w, height: w }]}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      {/* Everything that never moves, in a canvas of its own so it is drawn once. */}
      <Canvas style={StyleSheet.absoluteFill}>
        <Face R={R} unit={unit} max={max} beyond={beyond} />
      </Canvas>
      <Canvas style={StyleSheet.absoluteFill}>
        {/* The range, lower to upper bound, set into the face. */}
        <Path path={band.range} style="stroke" strokeWidth={R * BAND_W} strokeCap="butt" color={bandColour} opacity={glow}>
          <BlurMask blur={R * 0.05} style="normal" />
        </Path>
        <Path path={band.range} style="stroke" strokeWidth={R * BAND_W * 0.62} strokeCap="butt" color={bandColour} />
        <Group transform={shadowTurn} origin={vec(cx, cy)}>
          <Path path={needle.whole} color={colors.bg} opacity={opacity.scrim}>
            <BlurMask blur={R * 0.03} style="normal" />
          </Path>
        </Group>
        <Group transform={turn} origin={vec(cx, cy)}>
          <Path path={needle.upper} color={lit} />
          <Path path={needle.lower} color={shade} />
        </Group>
        <Hub cx={cx} cy={cy} r={R * HUB} />
        <Glass cx={cx} cy={cy} r={R * BEZEL_INNER} />
      </Canvas>
    </View>
  );
}

/** The bezel, the recessed face, the groove the band sits in, ticks and figures. */
function Face({ R, unit, max, beyond }: { R: number; unit: SpeedUnit; max: number; beyond: boolean }) {
  const bezel = effect('bezel');
  const dial = effect('dial');
  const cx = R;
  const cy = R;
  const font = useMemo<SkFont | null>(() => {
    try {
      return matchFont({
        fontFamily: Platform.select({ ios: 'Helvetica Neue', default: 'sans-serif' }),
        fontSize: R * (unit === 'mph' ? 0.1 : 0.115),
        fontWeight: '700',
      });
    } catch {
      return null;
    }
  }, [R, unit]);
  const small = useMemo<SkFont | null>(() => {
    try {
      return matchFont({
        fontFamily: Platform.select({ ios: 'Helvetica Neue', default: 'sans-serif' }),
        fontSize: R * 0.1,
        fontWeight: '600',
      });
    } catch {
      return null;
    }
  }, [R]);

  const { ticks, labels, groove } = useMemo(() => {
    const list = gaugeTicks(unit).map((t) => {
      const deg = GAUGE_START_DEG + GAUGE_SWEEP_DEG * gaugeFraction(t.value, max);
      const inner = TICK_OUTER - (t.major ? TICK_MAJOR : TICK_MINOR);
      return {
        major: t.major,
        from: onCircle(cx, cy, R * TICK_OUTER, deg),
        to: onCircle(cx, cy, R * inner, deg),
        value: t.value,
        at: onCircle(cx, cy, R * LABEL_R, deg),
      };
    });
    const figures = font
      ? list
          .filter((t) => t.major)
          .map((t) => {
            const text = String(t.value);
            const width = font.getGlyphWidths(font.getGlyphIDs(text)).reduce((s, v) => s + v, 0);
            return { text, x: t.at.x - width / 2, y: t.at.y + font.getSize() * 0.36 };
          })
      : [];
    const oval = Skia.XYWHRect(cx - R * BAND_R, cy - R * BAND_R, R * BAND_R * 2, R * BAND_R * 2);
    const track = Skia.Path.Make();
    track.addArc(oval, GAUGE_START_DEG, GAUGE_SWEEP_DEG);
    return { ticks: list, labels: figures, groove: track };
  }, [unit, max, cx, cy, R, font]);

  const caption = beyond ? OFF_SCALE_LABEL : unit === 'mph' ? 'mph' : 'km/h';
  const captionWidth = small
    ? small.getGlyphWidths(small.getGlyphIDs(caption)).reduce((s, v) => s + v, 0)
    : 0;
  const nudge = Math.max(R * 0.012, 0.5);

  return (
    <Group>
      {dial ? (
        <Rect x={0} y={0} width={R * 2} height={R * 2}>
          <Shader
            source={dial}
            uniforms={{ center: [cx, cy], radius: R * BEZEL_INNER, face: MATERIAL.bg, lift: MATERIAL.surface }}
          />
        </Rect>
      ) : (
        <Circle cx={cx} cy={cy} r={R * BEZEL_INNER} color={colors.bg} />
      )}

      {/* The groove the range sits in: a dark channel with a lit lower lip. */}
      <Path path={groove} style="stroke" strokeWidth={R * BAND_W * 1.25} strokeCap="round" color={scene.night} />
      <Group transform={[{ translateX: nudge }, { translateY: nudge }]}>
        <Path path={groove} style="stroke" strokeWidth={R * BAND_W * 0.2} strokeCap="round" color={colors.line} />
      </Group>

      {/* Embossed: a shadow below and right, a highlight above and left, then the tick. */}
      {ticks.map((t, i) => (
        <Group key={i}>
          <Line p1={vec(t.from.x + nudge, t.from.y + nudge)} p2={vec(t.to.x + nudge, t.to.y + nudge)} color={colors.bg} strokeWidth={t.major ? R * 0.028 : R * 0.016} strokeCap="round" />
          <Line p1={vec(t.from.x - nudge, t.from.y - nudge)} p2={vec(t.to.x - nudge, t.to.y - nudge)} color={colors.line} strokeWidth={t.major ? R * 0.028 : R * 0.016} strokeCap="round" />
          <Line p1={vec(t.from.x, t.from.y)} p2={vec(t.to.x, t.to.y)} color={t.major ? colors.text : colors.control} strokeWidth={t.major ? R * 0.022 : R * 0.012} strokeCap="round" opacity={t.major ? opacity.full : opacity.secondary} />
        </Group>
      ))}
      {font
        ? labels.map((l) => (
            <Group key={l.text}>
              <SkiaText x={l.x + nudge} y={l.y + nudge} text={l.text} font={font} color={colors.bg} />
              <SkiaText x={l.x} y={l.y} text={l.text} font={font} color={colors.muted} />
            </Group>
          ))
        : null}
      {small ? (
        <SkiaText
          x={cx - captionWidth / 2}
          y={cy + R * 0.58}
          text={caption}
          font={small}
          color={beyond ? colors.warn : colors.muted}
        />
      ) : null}

      {bezel ? (
        <Rect x={0} y={0} width={R * 2} height={R * 2}>
          <Shader
            source={bezel}
            uniforms={{
              center: [cx, cy],
              inner: R * BEZEL_INNER,
              outer: R - 0.5,
              light: MATERIAL.light,
              metal: MATERIAL.metal,
              metalDark: MATERIAL.metalDark,
            }}
          />
        </Rect>
      ) : (
        <Circle cx={cx} cy={cy} r={R * (1 + BEZEL_INNER) / 2} style="stroke" strokeWidth={R * (1 - BEZEL_INNER)} color={colors.control} />
      )}
    </Group>
  );
}

/** The hub cap: domed metal, lit from the upper left. */
function Hub({ cx, cy, r }: { cx: number; cy: number; r: number }) {
  return (
    <Group>
      <Circle cx={cx + r * 0.25} cy={cy + r * 0.35} r={r * 1.05} color={colors.bg} opacity={opacity.scrim}>
        <BlurMask blur={r * 0.4} style="normal" />
      </Circle>
      <Circle cx={cx} cy={cy} r={r}>
        <RadialGradient
          c={vec(cx - r * 0.35, cy - r * 0.4)}
          r={r * 1.5}
          colors={[scene.specular, scene.metal, scene.metalDark]}
          positions={[0, 0.35, 1]}
        />
      </Circle>
    </Group>
  );
}

/** A faint reflection across the glass over the upper left of the dial. */
function Glass({ cx, cy, r }: { cx: number; cy: number; r: number }) {
  const clip = useMemo(() => {
    const p = Skia.Path.Make();
    p.addCircle(cx, cy, r);
    return p;
  }, [cx, cy, r]);
  return (
    <Group clip={clip}>
      <Circle cx={cx - r * 0.35} cy={cy - r * 0.55} r={r * 0.95} opacity={opacity.inactive}>
        <LinearGradient
          start={vec(cx - r, cy - r)}
          end={vec(cx, cy)}
          colors={[interpolateColor(0.88, [0, 1], [colors.text, colors.bg]), 'transparent']}
        />
      </Circle>
    </Group>
  );
}

const styles = StyleSheet.create({
  gauge: { alignSelf: 'center' },
});
