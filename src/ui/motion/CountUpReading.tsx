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
  interpolateColor,
  useAnimatedProps,
  useAnimatedStyle,
} from 'react-native-reanimated';
import { countUpText, heldText } from '../reading';
import { sweptValue } from '../reveal';
import type { Reveal } from './useReveal';

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
  /**
   * The reveal that drives it, shared with the dial above, so the number and
   * the needle count off the same value on the same frame.
   */
  reveal: Pick<Reveal, 'progress' | 'landed' | 'done'>;
  allowFontScaling?: boolean;
};

/**
 * Counts from zero up to a reading and settles on it, driven by the reveal's
 * progress on the UI thread.
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
  reveal,
  allowFontScaling,
}: CountUpReadingProps) {
  const { progress, landed, done } = reveal;

  const liveText = useAnimatedProps<LiveText>(() => ({
    text: countUpText(sweptValue(progress.value, value), value, decimals),
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
        // Controlled, so every React commit carries the right text: zero while
        // counting, the final reading once landed, and never a reset.
        value={heldText(done, value, decimals, 0)}
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
