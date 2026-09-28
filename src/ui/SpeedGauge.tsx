import { useEffect, useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Canvas, Line, Path, Skia, vec } from '@shopify/react-native-skia';
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
  GAUGE_STEP,
  GAUGE_SWEEP_DEG,
  gaugeFraction,
  gaugeMax,
  needleDeg,
} from './gauge';
import type { MeasuredReading } from './reading';
import type { SpeedUnit } from '../settings/settings';
import { colors, motion, opacity, size, space, stroke, type } from './tokens';

const SETTLE = Easing.bezier(...motion.settleCurve);

/** A point on the dial's circle, `deg` clockwise from three o'clock. */
function onCircle(cx: number, cy: number, r: number, deg: number) {
  'worklet';
  const rad = (deg * Math.PI) / 180;
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
}

type SpeedGaugeProps = {
  /** Only a measured reading: without one there is no gauge at all. */
  reading: MeasuredReading;
  unit: SpeedUnit;
  /** How wide to draw it; never wider than size.gauge. */
  width: number;
};

/**
 * A speedometer for the reading: a dial from 0 to the top of the scale, the
 * measured range drawn on it as a band from its lower to its upper bound, and
 * a needle that sweeps from 0 to the reading on the same 700 ms settle curve as
 * the number, never passing it. The needle turns lime with the number and the
 * wicket once it lands. Reduced motion shows it landed.
 *
 * Decorative for a screen reader: the reading beneath it says the same thing
 * in words.
 */
export function SpeedGauge({ reading, unit, width }: SpeedGaugeProps) {
  const reduced = useReducedMotion();
  const w = Math.min(width, size.gauge);
  const r = (w - size.gaugeStroke) / 2;
  const cx = w / 2;
  const cy = r + size.gaugeStroke / 2;
  // The dial's lowest points sit half a radius below its centre.
  const h = cy + r / 2 + size.gaugeStroke;

  const max = gaugeMax(reading.value + reading.error, unit);
  const value = reading.value;

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

  const { track, band, ticks } = useMemo(() => {
    const oval = Skia.XYWHRect(cx - r, cy - r, r * 2, r * 2);
    const trackPath = Skia.Path.Make();
    trackPath.addArc(oval, GAUGE_START_DEG, GAUGE_SWEEP_DEG);
    const b = bandDeg(value, reading.error, max);
    const bandPath = Skia.Path.Make();
    bandPath.addArc(oval, b.from, b.sweep);
    const tickList: { from: { x: number; y: number }; to: { x: number; y: number } }[] = [];
    for (let v = 0; v <= max; v += GAUGE_STEP) {
      const deg = GAUGE_START_DEG + GAUGE_SWEEP_DEG * gaugeFraction(v, max);
      tickList.push({
        from: onCircle(cx, cy, r - size.gaugeStroke, deg),
        to: onCircle(cx, cy, r - size.gaugeStroke - space.sm, deg),
      });
    }
    return { track: trackPath, band: bandPath, ticks: tickList };
  }, [cx, cy, r, value, reading.error, max]);

  const tip = useDerivedValue(() => {
    const p = onCircle(cx, cy, r - size.gaugeStroke - space.xs, needleDeg(shown.value, value, max));
    return vec(p.x, p.y);
  });
  const needleColour = useDerivedValue(() =>
    interpolateColor(landed.value, [0, 1], [colors.text, colors.accent])
  );

  return (
    <View
      style={[styles.gauge, { width: w }]}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      <Canvas style={{ width: w, height: h }}>
        <Path
          path={track}
          style="stroke"
          strokeWidth={size.gaugeStroke}
          strokeCap="round"
          color={colors.line}
        />
        {/* The measured range, lower to upper bound, on the dial itself. */}
        <Path
          path={band}
          style="stroke"
          strokeWidth={size.gaugeStroke}
          strokeCap="butt"
          color={colors.text}
          opacity={opacity.secondary}
        />
        {ticks.map((t, i) => (
          <Line
            key={i}
            p1={vec(t.from.x, t.from.y)}
            p2={vec(t.to.x, t.to.y)}
            color={colors.control}
            strokeWidth={stroke.medium}
          />
        ))}
        <Line
          p1={vec(cx, cy)}
          p2={tip}
          color={needleColour}
          strokeWidth={stroke.heavy}
          strokeCap="round"
        />
      </Canvas>
      <View style={styles.ends}>
        <Text style={styles.end}>0</Text>
        <Text style={styles.end}>{max}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  gauge: { alignSelf: 'center' },
  ends: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: space.md },
  end: { ...type.caption, ...type.tabular, color: colors.muted },
});
