import { useCallback, useEffect, useRef } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withTiming,
} from 'react-native-reanimated';
// Reanimated's own peer, pinned by the worklets override in package.json.
import { scheduleOnRN } from 'react-native-worklets';
import * as Haptics from 'expo-haptics';
import { colors, motion, opacity, radius, size, space, stroke } from './tokens';

const SETTLE = Easing.bezier(...motion.settleCurve);
const { stumps: STUMPS_END, ball: BALL_END, bail: BAIL_END } = motion.celebrate;

/** The ball's diameter, and where it comes to rest: just short of the stumps. */
const BALL = space.md;
const BALL_TRAVEL = size.emblem - size.wicket.width - space.sm - BALL;

/**
 * Three white stumps fade in, a lime ball rolls along one straight line and
 * stops beside them, and the bail settles with a single success haptic. Timed,
 * never sprung, and silent. Reduced motion shows it finished, with the haptic.
 */
export function PurchaseEmblem() {
  const reduced = useReducedMotion();
  const stumps = useSharedValue(reduced ? 1 : 0);
  const ball = useSharedValue(reduced ? 1 : 0);
  const bail = useSharedValue(reduced ? 1 : 0);
  const tapped = useRef(false);

  const tap = useCallback(() => {
    if (tapped.current) return;
    tapped.current = true;
    // Haptics are garnish. A phone without a motor is not an error.
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => undefined);
  }, []);

  useEffect(() => {
    if (reduced) {
      stumps.value = 1;
      ball.value = 1;
      bail.value = 1;
      tap();
      return;
    }
    stumps.value = withTiming(1, { duration: STUMPS_END, easing: Easing.linear });
    ball.value = withDelay(
      STUMPS_END,
      withTiming(1, { duration: BALL_END - STUMPS_END, easing: SETTLE })
    );
    bail.value = withDelay(
      BALL_END,
      withTiming(1, { duration: BAIL_END - BALL_END, easing: SETTLE }, (finished) => {
        if (finished) scheduleOnRN(tap);
      })
    );
  }, [reduced, stumps, ball, bail, tap]);

  const stumpStyle = useAnimatedStyle(() => ({ opacity: stumps.value }));
  const ballStyle = useAnimatedStyle(() => ({
    opacity: ball.value > 0 ? opacity.full : 0,
    transform: [{ translateX: ball.value * BALL_TRAVEL }],
  }));
  const bailStyle = useAnimatedStyle(() => ({
    opacity: bail.value > 0 ? opacity.full : 0,
    transform: [{ translateY: (bail.value - 1) * size.wicket.drop }],
  }));

  return (
    <View
      style={styles.emblem}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      <Animated.View style={[styles.wicket, stumpStyle]}>
        <Animated.View style={[styles.bail, bailStyle]} />
        <View style={styles.stumps}>
          <View style={styles.stump} />
          <View style={styles.stump} />
          <View style={styles.stump} />
        </View>
      </Animated.View>
      <Animated.View style={[styles.ball, ballStyle]} />
      <View style={styles.baseline} />
    </View>
  );
}

const styles = StyleSheet.create({
  emblem: { width: size.emblem, height: size.emblem, justifyContent: 'flex-end' },
  // The stumps stand on the baseline at the right; room above for the bail to settle from.
  wicket: {
    position: 'absolute',
    right: space.xs,
    bottom: stroke.medium,
    width: size.wicket.width,
    height: size.wicket.height,
    paddingTop: size.wicket.drop,
  },
  bail: { height: size.wicket.bail, backgroundColor: colors.text },
  stumps: { flex: 1, flexDirection: 'row', justifyContent: 'space-between' },
  stump: { width: size.wicket.stump, backgroundColor: colors.text },
  // Rolls in along the baseline from the left edge.
  ball: {
    position: 'absolute',
    left: stroke.hairline,
    bottom: stroke.medium,
    width: BALL,
    height: BALL,
    borderRadius: radius.pill,
    backgroundColor: colors.accent,
  },
  baseline: { height: stroke.medium, backgroundColor: colors.control },
});
