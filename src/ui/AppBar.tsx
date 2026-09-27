import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, opacity, size, space, type } from './tokens';

type AppBarProps = {
  title: string;
  /** Where Back goes. Null leaves the slot empty, for a screen there is no going back from. */
  onBack: (() => void) | null;
  /** What Back does, for a screen reader, when "Back" alone would not say. */
  backLabel?: string;
  /** While true Back is shown but takes no presses, as while a save is running. */
  backDisabled?: boolean;
  /** A short line under the title, like "Saved on this phone". */
  caption?: string | null;
  /** Something small at the far end, like a step counter. */
  right?: ReactNode;
};

/** Back on the left, the screen's name in the middle, room on the right. */
export function AppBar({
  title,
  onBack,
  backLabel,
  backDisabled = false,
  caption = null,
  right = null,
}: AppBarProps) {
  return (
    <View style={styles.bar}>
      <View style={styles.side}>
        {onBack ? (
          <Pressable
            style={styles.back}
            onPress={onBack}
            disabled={backDisabled}
            accessibilityRole="button"
            accessibilityLabel={backLabel ?? 'Back'}
            accessibilityState={{ disabled: backDisabled }}
          >
            <Text style={[styles.backText, backDisabled && styles.off]}>Back</Text>
          </Pressable>
        ) : null}
      </View>
      <View style={styles.middle}>
        <Text style={styles.title} accessibilityRole="header" numberOfLines={1}>
          {title}
        </Text>
        {caption ? (
          <Text style={styles.caption} accessibilityLiveRegion="polite">
            {caption}
          </Text>
        ) : null}
      </View>
      <View style={[styles.side, styles.sideEnd]}>{right}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: { flexDirection: 'row', alignItems: 'center', minHeight: size.target },
  // Both sides the same width, so the title sits in the middle of the screen.
  side: { minWidth: size.target * 2, alignItems: 'flex-start' },
  sideEnd: { alignItems: 'flex-end' },
  back: { minHeight: size.target, minWidth: size.target, justifyContent: 'center' },
  backText: { ...type.body, color: colors.text },
  off: { opacity: opacity.disabled },
  middle: { flex: 1, alignItems: 'center' },
  title: { ...type.button, color: colors.text },
  caption: { ...type.caption, color: colors.muted },
});
