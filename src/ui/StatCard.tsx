import { useEffect, type ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withTiming,
} from 'react-native-reanimated';
import { StatIcon, type StatIconName } from './GlossCard';
import { colors, motion, radius, size, space, stroke, type } from './tokens';

const STANDARD = Easing.bezier(...motion.standardCurve);

/**
 * Arrives once: a short fade and rise, one after another by `index`. With
 * reduced motion it is simply there.
 */
export function Rise({ index, style, children }: { index: number; style?: StyleProp<ViewStyle>; children: ReactNode }) {
  const reduced = useReducedMotion();
  const shown = useSharedValue(reduced ? 1 : 0);
  useEffect(() => {
    if (reduced) {
      shown.value = 1;
      return;
    }
    shown.value = withDelay(
      index * motion.enter.stagger,
      withTiming(1, { duration: motion.enter.duration, easing: STANDARD })
    );
    // Once, on arrival.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const rise = useAnimatedStyle(() => ({
    opacity: shown.value,
    transform: [{ translateY: (1 - shown.value) * space.sm }],
  }));
  return <Animated.View style={[style, rise]}>{children}</Animated.View>;
}

/**
 * A Stats card, flat like the rest of the app: the surface, a hairline edge,
 * the standard radius. Tappable when it opens something.
 */
export function StatCard({
  children,
  style,
  onPress,
  accessibilityLabel,
}: {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  onPress?: () => void;
  accessibilityLabel?: string;
}) {
  if (onPress) {
    return (
      <Pressable
        style={({ pressed }) => [styles.card, pressed && styles.pressed, style]}
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel}
      >
        {children}
      </Pressable>
    );
  }
  return (
    <View
      style={[styles.card, style]}
      accessible={accessibilityLabel !== undefined}
      accessibilityLabel={accessibilityLabel}
    >
      {children}
    </View>
  );
}

/**
 * A card's title as the instrument labels it: small, uppercase and letter
 * spaced, like FRAMING on Capture, with a small quiet icon before it. The
 * title wraps at a space, never inside a word.
 */
export function CardTitle({ icon, title, right }: { icon?: StatIconName; title: string; right?: ReactNode }) {
  return (
    <View style={styles.head}>
      {icon ? <StatIcon name={icon} color={colors.muted} dim={size.iconSmall} /> : null}
      <Text style={styles.title} accessibilityRole="header">
        {title.toUpperCase()}
      </Text>
      {right}
    </View>
  );
}

/** Pro, small, where a locked figure would be. */
export function ProPill() {
  return (
    <View style={styles.pill} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <Text style={styles.pillText}>PRO</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: stroke.hairline,
    borderColor: colors.line,
    padding: space.md,
  },
  pressed: { borderColor: colors.control },
  head: { flexDirection: 'row', alignItems: 'center', gap: space.sm, marginBottom: space.md },
  title: { ...type.label, color: colors.muted, flex: 1, flexShrink: 1 },
  pill: {
    borderRadius: radius.pill,
    borderWidth: stroke.hairline,
    borderColor: colors.accent,
    paddingHorizontal: space.sm,
    paddingVertical: stroke.medium,
  },
  pillText: { ...type.label, color: colors.accent },
});
