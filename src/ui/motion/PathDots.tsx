import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  Easing,
  Extrapolation,
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import { colors, motion, opacity, radius, stroke } from '../tokens';

export type PathPoint = { x: number; y: number };

const DOT = 8;
const END = 14;
/** How far the endpoint's ring spreads before it is gone, as a multiple of its size. */
const PING_SPREAD = 2.6;

/**
 * `count` points spaced evenly along the straight line from `from` to `to`,
 * both ends included.
 *
 * Straight on purpose. The ball is marked at release and at bounce and nowhere
 * in between, so a curve would draw a flight path nobody measured.
 */
export function pointsAlong(from: PathPoint, to: PathPoint, count: number): PathPoint[] {
  if (count < 2) return [to];
  return Array.from({ length: count }, (_, i) => {
    const t = i / (count - 1);
    return { x: from.x + (to.x - from.x) * t, y: from.y + (to.y - from.y) * t };
  });
}

/**
 * Dots that appear one after another along `points`, in the parent's own
 * coordinates, then pulse the last one once. Remount with a new `key` to replay.
 *
 * One shared value drives the whole sequence: it runs from 0 to the number of
 * dots, and dot i reads its own slice of it, i to i + 1. A single animation,
 * so there is nothing to keep in step, and its end is the cue for the pulse.
 */
export function PathDots({ points }: { points: PathPoint[] }) {
  const drawn = useSharedValue(0);
  const ping = useSharedValue(0);
  const count = points.length;

  useEffect(() => {
    ping.value = 0;
    drawn.value = 0;
    drawn.value = withTiming(
      count,
      { duration: count * motion.dotStagger, easing: Easing.linear },
      (finished) => {
        if (finished) {
          ping.value = withTiming(1, { duration: motion.pulse, easing: Easing.out(Easing.quad) });
        }
      }
    );
  }, [count, drawn, ping]);

  if (count === 0) return null;

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      {points.slice(0, -1).map((point, i) => (
        <Dot key={i} index={i} point={point} drawn={drawn} />
      ))}
      <Endpoint index={count - 1} point={points[count - 1]} drawn={drawn} ping={ping} />
    </View>
  );
}

/** How far into its own slice of the sequence dot `index` is, 0 to 1. */
function reveal(drawn: number, index: number): number {
  'worklet';
  return interpolate(drawn, [index, index + 1], [0, 1], Extrapolation.CLAMP);
}

function Dot({
  index,
  point,
  drawn,
}: {
  index: number;
  point: PathPoint;
  drawn: SharedValue<number>;
}) {
  const style = useAnimatedStyle(() => {
    const p = reveal(drawn.value, index);
    return {
      opacity: p,
      // Pops slightly past full size as it lands. Fine for a mark on the
      // frame; it is the numbers that must not overshoot.
      transform: [{ scale: interpolate(p, [0, 0.6, 1], [0.2, 1.3, 1]) }],
    };
  });
  return (
    <Animated.View
      style={[styles.dot, { left: point.x - DOT / 2, top: point.y - DOT / 2 }, style]}
    />
  );
}

function Endpoint({
  index,
  point,
  drawn,
  ping,
}: {
  index: number;
  point: PathPoint;
  drawn: SharedValue<number>;
  ping: SharedValue<number>;
}) {
  const dot = useAnimatedStyle(() => {
    const p = reveal(drawn.value, index);
    const swell = interpolate(ping.value, [0, 0.25, 1], [1, 1.35, 1]);
    return { opacity: p, transform: [{ scale: p * swell }] };
  });
  // Invisible until the pulse starts, then spreads and fades out, once.
  const ring = useAnimatedStyle(() => ({
    opacity: interpolate(ping.value, [0, 0.01, 1], [0, opacity.full, 0]),
    transform: [{ scale: interpolate(ping.value, [0, 1], [1, PING_SPREAD]) }],
  }));
  const at = { left: point.x - END / 2, top: point.y - END / 2 };
  return (
    <>
      <Animated.View style={[styles.ring, at, ring]} />
      <Animated.View style={[styles.end, at, dot]} />
    </>
  );
}

const styles = StyleSheet.create({
  dot: {
    position: 'absolute',
    width: DOT,
    height: DOT,
    borderRadius: radius.pill,
    backgroundColor: colors.accent,
  },
  end: {
    position: 'absolute',
    width: END,
    height: END,
    borderRadius: radius.pill,
    backgroundColor: colors.accent,
  },
  ring: {
    position: 'absolute',
    width: END,
    height: END,
    borderRadius: radius.pill,
    borderWidth: stroke.medium,
    borderColor: colors.accent,
  },
});
