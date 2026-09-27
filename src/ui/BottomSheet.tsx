import { useEffect, useState, type ReactNode } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
// Reanimated's own peer, pinned by the worklets override in package.json.
import { scheduleOnRN } from 'react-native-worklets';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, motion, opacity, radius, size, space, stroke, type } from './tokens';

const STANDARD = Easing.bezier(...motion.standardCurve);

type BottomSheetProps = {
  visible: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
};

/**
 * A panel that rises over the screen with a scrim behind it. Flat: a strong
 * rule along its top edge sets it apart, not a shadow.
 *
 * The Modal stays mounted until the panel has finished leaving, so closing is
 * seen rather than cut. Reduced motion opens and closes it at once.
 */
export function BottomSheet({ visible, title, onClose, children }: BottomSheetProps) {
  const insets = useSafeAreaInsets();
  const reduced = useReducedMotion();
  const [mounted, setMounted] = useState(visible);
  const shown = useSharedValue(0);

  useEffect(() => {
    if (visible) {
      setMounted(true);
      shown.value = reduced
        ? 1
        : withTiming(1, { duration: motion.sheet.in, easing: STANDARD });
      return;
    }
    if (reduced) {
      shown.value = 0;
      setMounted(false);
      return;
    }
    // Unmounted from the UI thread once the panel is gone. Reopening before
    // then interrupts this, and an interrupted close unmounts nothing.
    shown.value = withTiming(0, { duration: motion.sheet.out, easing: STANDARD }, (finished) => {
      if (finished) scheduleOnRN(setMounted, false);
    });
  }, [visible, reduced, shown]);

  const scrim = useAnimatedStyle(() => ({ opacity: shown.value * opacity.scrim }));
  const panel = useAnimatedStyle(() => ({
    opacity: shown.value,
    transform: [{ translateY: (1 - shown.value) * space.lg }],
  }));

  return (
    <Modal
      visible={mounted}
      transparent
      animationType="none"
      statusBarTranslucent
      onRequestClose={onClose}
    >
      <View style={[styles.frame, { paddingTop: insets.top + space.xxl }]}>
        <Animated.View style={[StyleSheet.absoluteFill, styles.scrim, scrim]} />
        <Pressable
          style={StyleSheet.absoluteFill}
          onPress={onClose}
          accessibilityRole="button"
          accessibilityLabel={`Close ${title}`}
        />
        <Animated.View style={[styles.sheet, { paddingBottom: insets.bottom + space.md }, panel]}>
          <View style={styles.header}>
            <Text style={styles.title} accessibilityRole="header">
              {title}
            </Text>
            <Pressable
              style={styles.close}
              onPress={onClose}
              accessibilityRole="button"
              accessibilityLabel={`Close ${title}`}
            >
              <Text style={styles.closeText}>Close</Text>
            </Pressable>
          </View>
          <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
            {children}
          </ScrollView>
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  frame: { flex: 1, justifyContent: 'flex-end' },
  scrim: { backgroundColor: colors.bg },
  // Shrinks to fit under the top inset, so tall content scrolls inside the
  // sheet instead of pushing it off the screen.
  sheet: {
    flexShrink: 1,
    backgroundColor: colors.surface,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    borderTopWidth: stroke.medium,
    borderColor: colors.control,
    paddingHorizontal: space.lg,
    paddingTop: space.sm,
  },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  title: { ...type.h2, color: colors.text, flex: 1 },
  close: {
    minWidth: size.target,
    minHeight: size.target,
    alignItems: 'flex-end',
    justifyContent: 'center',
  },
  closeText: { ...type.body, color: colors.muted },
  scroll: { flexGrow: 0 },
  content: { paddingBottom: space.md },
});
