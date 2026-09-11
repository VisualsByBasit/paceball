import { useEffect, type ReactNode } from 'react';
import {
  StyleSheet,
  Text,
  TextInput,
  View,
  type StyleProp,
  type TextInputProps,
  type TextStyle,
} from 'react-native';
import Animated, {
  Easing,
  useAnimatedProps,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { motion, space } from '../tokens';

/**
 * A Text's content is React children, so changing it means a re-render on the
 * JS thread. A TextInput's content is a native prop, which Reanimated can set
 * straight from the UI thread every frame — so the counter is a TextInput that
 * cannot be edited, and the count keeps running while JS is busy mounting the
 * screen it sits on.
 */
const AnimatedTextInput = Animated.createAnimatedComponent(TextInput);

/** `text` is a real native prop on TextInput that React Native's types leave out. */
type LiveText = TextInputProps & { text: string };

const SETTLE = Easing.bezier(...motion.settleCurve);

type CountUpReadingProps = {
  /** The measured number to land on. */
  value: number;
  /** Decimal places, held for the whole count so the digits do not jump. */
  decimals: number;
  /** Style for the number itself — mono, since it is measured data. */
  style: StyleProp<TextStyle>;
  allowFontScaling?: boolean;
  /** Arrives beneath the number once it has landed. The error range, usually. */
  children?: ReactNode;
};

/**
 * Counts from zero up to a reading, settles on it, then fades in whatever sits
 * beneath it. Remount with a new `key` to replay.
 *
 * The count decelerates onto the value and never passes it: an overshoot would
 * put a faster speed on screen than was measured, if only for a few frames.
 */
export function CountUpReading({
  value,
  decimals,
  style,
  allowFontScaling,
  children,
}: CountUpReadingProps) {
  // Shared values live on the UI thread. Writing one from JS schedules the
  // write there; nothing on the JS side re-renders when they change.
  const shown = useSharedValue(0);
  const landed = useSharedValue(0);

  useEffect(() => {
    landed.value = 0;
    shown.value = 0;
    // Assigning an animation to a shared value runs it on the UI thread. The
    // callback is a worklet too, so the fade is chained there, frame-exact,
    // with no round trip through JS.
    shown.value = withTiming(value, { duration: motion.countUp, easing: SETTLE }, (finished) => {
      if (finished) landed.value = withTiming(1, { duration: motion.fade });
    });
  }, [value, shown, landed]);

  const liveText = useAnimatedProps<LiveText>(() => ({
    text: shown.value.toFixed(decimals),
  }));

  const after = useAnimatedStyle(() => ({
    opacity: landed.value,
    transform: [{ translateY: (1 - landed.value) * space.sm }],
  }));

  const final = value.toFixed(decimals);

  return (
    <View style={styles.root}>
      {/* Sized by the final reading, so the box does not widen as digits arrive
          and the decimal point stays put. Screen readers get the reading at
          once rather than a count. */}
      <View accessible accessibilityLabel={final}>
        <Text
          style={[style, styles.ghost]}
          allowFontScaling={allowFontScaling}
          numberOfLines={1}
          importantForAccessibility="no-hide-descendants"
        >
          {final}
        </Text>
        <AnimatedTextInput
          style={[style, styles.live]}
          allowFontScaling={allowFontScaling}
          defaultValue={(0).toFixed(decimals)}
          animatedProps={liveText}
          editable={false}
          caretHidden
          contextMenuHidden
          pointerEvents="none"
          underlineColorAndroid="transparent"
          importantForAccessibility="no-hide-descendants"
        />
      </View>
      <Animated.View style={[styles.after, after]}>{children}</Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { alignItems: 'center' },
  ghost: { opacity: 0 },
  live: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    // Right-aligned in a box the width of the final reading: digits arrive on
    // the left, the way an odometer rolls over.
    textAlign: 'right',
    padding: 0,
    margin: 0,
  },
  after: { alignItems: 'center' },
});
