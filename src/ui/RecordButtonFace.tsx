import { useEffect } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, {
  Easing,
  interpolate,
  interpolateColor,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { colors, motion, opacity, radius, size, stroke, type } from './tokens';

/** How much of the circle the square keeps while recording. */
const SQUARE_SHARE = 0.6;

type RecordButtonFaceProps = {
  /** The recorder's own state, never the tap: it changes shape only once recording has. */
  recording: boolean;
  /** Recording, but not yet long enough to stop. The seconds until it can. */
  lockedSeconds: number | null;
  /** Nothing can be pressed: the session is not ready, a lens is changing, a clip is being read. */
  dimmed: boolean;
};

/**
 * What the record button looks like: a lime circle, turning into a rounded
 * red square while recording, over 160 ms. It follows the recorder, so it
 * never shows recording before the camera is. Reduced motion changes shape at
 * once. Pressing is the parent's; this only draws.
 */
export function RecordButtonFace({ recording, lockedSeconds, dimmed }: RecordButtonFaceProps) {
  const reduced = useReducedMotion();
  const on = useSharedValue(recording ? 1 : 0);

  useEffect(() => {
    const to = recording ? 1 : 0;
    on.value = reduced ? to : withTiming(to, { duration: motion.record, easing: Easing.linear });
  }, [recording, reduced, on]);

  const inner = useAnimatedStyle(() => {
    const side = interpolate(on.value, [0, 1], [size.recordInner, size.recordInner * SQUARE_SHARE]);
    return {
      width: side,
      height: side,
      borderRadius: interpolate(on.value, [0, 1], [size.recordInner / 2, radius.sm]),
      backgroundColor: interpolateColor(on.value, [0, 1], [colors.accent, colors.danger]),
    };
  });

  return (
    <View style={styles.ring}>
      <Animated.View style={[styles.inner, inner, dimmed && styles.dimmed]}>
        {lockedSeconds !== null ? <Text style={styles.countdown}>{lockedSeconds}</Text> : null}
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  ring: {
    width: size.record,
    height: size.record,
    borderRadius: radius.pill,
    borderWidth: stroke.heavy,
    borderColor: colors.control,
    alignItems: 'center',
    justifyContent: 'center',
  },
  inner: { alignItems: 'center', justifyContent: 'center' },
  dimmed: { opacity: opacity.disabled },
  countdown: { ...type.h2, ...type.tabular, color: colors.text },
});
