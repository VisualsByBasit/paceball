import { useEffect, type ReactNode } from 'react';
import type { StyleProp, ViewStyle } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { motion } from './tokens';

const STANDARD = Easing.bezier(...motion.standardCurve);

/**
 * Turns its content about its own centre, leaving its place in the layout
 * alone: the way a camera app keeps its buttons where they are and turns their
 * labels to face the phone's new "up". Reduced motion turns it at once.
 */
export function RotateInPlace({
  deg,
  style,
  children,
}: {
  deg: number;
  style?: StyleProp<ViewStyle>;
  children: ReactNode;
}) {
  const reduced = useReducedMotion();
  const turn = useSharedValue(deg);
  useEffect(() => {
    turn.value = reduced ? deg : withTiming(deg, { duration: motion.nav, easing: STANDARD });
  }, [deg, reduced, turn]);
  const turned = useAnimatedStyle(() => ({ transform: [{ rotate: `${turn.value}deg` }] }));
  return <Animated.View style={[style, turned]}>{children}</Animated.View>;
}
