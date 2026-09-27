import { useCallback, useEffect, useRef } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  Easing,
  interpolateColor,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
// Reanimated's own peer, pinned by the worklets override in package.json.
import { scheduleOnRN } from 'react-native-worklets';
import * as Haptics from 'expo-haptics';
import { colors, motion, size } from './tokens';

const SETTLE = Easing.bezier(...motion.settleCurve);

/**
 * Three stumps and a bail, drawn under a reading. Unlocked, the bail hovers a
 * few dp above the stumps and the whole wicket is muted. Locking drops the
 * bail into place, then turns the wicket lime with one light tap: the reading
 * is complete. It locks once and stays locked.
 *
 * Reduced motion shows it locked, with the tap and without the fall.
 */
export function WicketLock({ locked }: { locked: boolean }) {
  const reduced = useReducedMotion();
  // 0 hovering, 1 seated on the stumps.
  const seated = useSharedValue(locked ? 1 : 0);
  // 0 muted, 1 lime.
  const lime = useSharedValue(locked ? 1 : 0);
  const didLock = useRef(locked);

  const tap = useCallback(() => {
    // Haptics are garnish. A phone without a motor is not an error.
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => undefined);
  }, []);

  useEffect(() => {
    if (!locked || didLock.current) return;
    didLock.current = true;
    if (reduced) {
      seated.value = 1;
      lime.value = 1;
      tap();
      return;
    }
    seated.value = withTiming(1, { duration: motion.lock.bail, easing: SETTLE }, (finished) => {
      if (!finished) return;
      lime.value = withTiming(1, { duration: motion.lock.colour, easing: Easing.linear });
      scheduleOnRN(tap);
    });
  }, [locked, reduced, seated, lime, tap]);

  const bail = useAnimatedStyle(() => ({
    backgroundColor: interpolateColor(lime.value, [0, 1], [colors.muted, colors.accent]),
    transform: [{ translateY: (seated.value - 1) * size.wicket.drop }],
  }));
  const stump = useAnimatedStyle(() => ({
    backgroundColor: interpolateColor(lime.value, [0, 1], [colors.muted, colors.accent]),
  }));

  return (
    <View
      style={styles.wicket}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      <Animated.View style={[styles.bail, bail]} />
      <View style={styles.stumps}>
        <Animated.View style={[styles.stump, stump]} />
        <Animated.View style={[styles.stump, stump]} />
        <Animated.View style={[styles.stump, stump]} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  // Room above the bail for it to hover in, so it never leaves the box.
  wicket: {
    width: size.wicket.width,
    height: size.wicket.height,
    paddingTop: size.wicket.drop,
    alignSelf: 'center',
  },
  // Seated directly on the stumps; hovering, one drop higher.
  bail: { height: size.wicket.bail },
  stumps: { flex: 1, flexDirection: 'row', justifyContent: 'space-between' },
  stump: { width: size.wicket.stump },
});
