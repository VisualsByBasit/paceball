import { useCallback } from 'react';
import { Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import Animated, {
  Easing,
  interpolateColor,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { colors, motion, opacity, radius, size, space, stroke, type } from './tokens';

export type ActionButtonVariant = 'primary' | 'secondary' | 'destructive' | 'text';

type Look = { fill: string; border: string; label: string };

/**
 * Lime is for the one action that moves the delivery on, and a lime button
 * carries bg text, never white. The rest are outlines, and a text action has
 * no outline until it is pressed.
 */
const LOOK: Record<ActionButtonVariant, Look> = {
  primary: { fill: colors.accent, border: colors.accent, label: colors.bg },
  secondary: { fill: 'transparent', border: colors.control, label: colors.text },
  destructive: { fill: 'transparent', border: colors.danger, label: colors.danger },
  text: { fill: 'transparent', border: 'transparent', label: colors.text },
};

const PRESS_IN = { duration: motion.press.in, easing: Easing.linear };
const PRESS_OUT = { duration: motion.press.out, easing: Easing.linear };

type ActionButtonProps = {
  label: string;
  onPress: () => void;
  variant?: ActionButtonVariant;
  /** While set, the button says what it is doing, in these words, and takes no presses. */
  busy?: string | null;
  /**
   * Why it cannot be pressed. Setting it disables the button and shows the
   * reason beneath it, so a dimmed button never has to be puzzled out.
   */
  disabledReason?: string | null;
  /**
   * The action has happened and the label says so, like "Saved". It takes no
   * more presses and is drawn as a plain outline rather than dimmed, because
   * nothing is wrong.
   */
  complete?: boolean;
  accessibilityLabel?: string;
  /** Taller, for the one action a screen is built around, like Home's record. */
  large?: boolean;
  style?: StyleProp<ViewStyle>;
};

/**
 * Pressing it strengthens the outline. Nothing scales: a button that shrinks
 * under the thumb moves the target the thumb is on.
 */
export function ActionButton({
  label,
  onPress,
  variant = 'primary',
  busy = null,
  disabledReason = null,
  complete = false,
  accessibilityLabel,
  large = false,
  style,
}: ActionButtonProps) {
  const look = LOOK[complete ? 'secondary' : variant];
  const disabled = busy !== null || disabledReason !== null || complete;

  const pressed = useSharedValue(0);
  const pressIn = useCallback(() => {
    pressed.value = withTiming(1, PRESS_IN);
  }, [pressed]);
  const pressOut = useCallback(() => {
    pressed.value = withTiming(0, PRESS_OUT);
  }, [pressed]);

  const outline = useAnimatedStyle(() => ({
    borderColor: interpolateColor(pressed.value, [0, 1], [look.border, colors.text]),
  }));

  return (
    <View style={[variant === 'text' ? styles.wrapText : styles.wrap, style]}>
      <Pressable
        onPress={onPress}
        onPressIn={pressIn}
        onPressOut={pressOut}
        disabled={disabled}
        accessibilityRole="button"
        accessibilityLabel={busy ?? accessibilityLabel ?? label}
        accessibilityState={{ disabled, busy: busy !== null }}
        accessibilityHint={disabledReason ?? undefined}
      >
        <Animated.View
          style={[
            variant === 'text' ? styles.text : styles.button,
            large && styles.large,
            { backgroundColor: look.fill },
            outline,
            disabledReason !== null && styles.off,
          ]}
        >
          <Text style={[styles.label, large && styles.labelLarge, { color: look.label }]}>
            {busy ?? label}
          </Text>
        </Animated.View>
      </Pressable>
      {disabledReason !== null ? (
        <Text style={styles.reason} importantForAccessibility="no">
          {disabledReason}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignSelf: 'stretch' },
  wrapText: { alignSelf: 'center' },
  button: {
    minHeight: size.button,
    borderRadius: radius.md,
    borderWidth: stroke.medium,
    paddingHorizontal: space.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  text: {
    minHeight: size.target,
    borderRadius: radius.md,
    borderWidth: stroke.medium,
    paddingHorizontal: space.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  large: { minHeight: size.record, borderRadius: radius.lg },
  label: { ...type.button, textAlign: 'center' },
  labelLarge: { ...type.h2 },
  off: { opacity: opacity.disabled },
  reason: { ...type.caption, color: colors.muted, textAlign: 'center', marginTop: space.xs },
});
