import { useCallback, useEffect, useRef } from 'react';
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
  interpolateColor,
  useAnimatedProps,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withTiming,
} from 'react-native-reanimated';
// Reanimated's own peer, pinned by the worklets override in package.json.
import { scheduleOnRN } from 'react-native-worklets';
import { countUpText, revealStart } from '../reading';
import { motion } from '../tokens';

/**
 * A Text's content is React children, so changing it means a re-render on the
 * JS thread. A TextInput's content is a native prop, which Reanimated can set
 * straight from the UI thread every frame, so the counter is a TextInput that
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
  /** Style for the number itself: mono, since it is measured data. Colour comes from below. */
  style: StyleProp<TextStyle>;
  /** The number's colour while it counts. */
  countingColor: string;
  /**
   * Its colour once it has landed. It changes after the wicket's bail has had
   * time to fall, so the two turn together.
   */
  landedColor: string;
  /** Show the final number at once, with nothing counting. For reduced motion. */
  still: boolean;
  /** Once, when the count lands, or straight away when still. */
  onLanded?: () => void;
  allowFontScaling?: boolean;
};

/**
 * Counts from zero up to a reading and settles on it. Remount with a new `key`
 * to replay.
 *
 * The count decelerates onto the value and never passes it: an overshoot would
 * put a faster speed on screen than was measured, if only for a few frames.
 *
 * It is not a stop for a screen reader of its own. Whatever holds it reads the
 * whole reading out, range included, rather than a number counting.
 */
export function CountUpReading({
  value,
  decimals,
  style,
  countingColor,
  landedColor,
  still,
  onLanded,
  allowFontScaling,
}: CountUpReadingProps) {
  const start = revealStart(value, still);
  // Shared values live on the UI thread. Writing one from JS schedules the
  // write there; nothing on the JS side re-renders when they change.
  const shown = useSharedValue(start.shown);
  const landed = useSharedValue(start.landed);

  const onLandedRef = useRef(onLanded);
  useEffect(() => {
    onLandedRef.current = onLanded;
  }, [onLanded]);
  const land = useCallback(() => onLandedRef.current?.(), []);

  useEffect(() => {
    const from = revealStart(value, still);
    shown.value = from.shown;
    landed.value = from.landed;
    if (still) {
      land();
      return;
    }
    // Assigning an animation to a shared value runs it on the UI thread. The
    // callback is a worklet too, so the colour is chained there, frame-exact.
    shown.value = withTiming(value, { duration: motion.countUp, easing: SETTLE }, (finished) => {
      if (!finished) return;
      landed.value = withDelay(
        motion.lock.bail,
        withTiming(1, { duration: motion.lock.colour, easing: Easing.linear })
      );
      scheduleOnRN(land);
    });
  }, [value, still, shown, landed, land]);

  const liveText = useAnimatedProps<LiveText>(() => ({
    text: countUpText(shown.value, value, decimals),
  }));

  const colour = useAnimatedStyle(() => ({
    color: interpolateColor(landed.value, [0, 1], [countingColor, landedColor]),
  }));

  const final = value.toFixed(decimals);

  return (
    <View importantForAccessibility="no-hide-descendants">
      {/* Sized by the final reading, so the box does not widen as digits arrive
          and the decimal point stays put. */}
      <Text
        style={[style, styles.ghost]}
        allowFontScaling={allowFontScaling}
        numberOfLines={1}
      >
        {final}
      </Text>
      <AnimatedTextInput
        style={[style, styles.live, colour]}
        allowFontScaling={allowFontScaling}
        defaultValue={countUpText(start.shown, value, decimals)}
        animatedProps={liveText}
        editable={false}
        caretHidden
        contextMenuHidden
        pointerEvents="none"
        underlineColorAndroid="transparent"
      />
    </View>
  );
}

const styles = StyleSheet.create({
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
});
