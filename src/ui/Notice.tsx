import { StyleSheet, Text, View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
import { ActionButton } from './ActionButton';
import { colors, motion, radius, space, stroke, type } from './tokens';

export type NoticeTone = 'info' | 'caution' | 'error' | 'success';

type Tone = {
  /** Drawn in the badge, so a caution or an error is never told by colour alone. */
  glyph: string;
  /** Said first by a screen reader, for the same reason. */
  word: string;
  color: string;
  border: string;
};

const TONES: Record<NoticeTone, Tone> = {
  info: { glyph: 'i', word: 'Note', color: colors.text, border: colors.control },
  caution: { glyph: '!', word: 'Caution', color: colors.warn, border: colors.warn },
  error: { glyph: '×', word: 'Error', color: colors.danger, border: colors.danger },
  success: { glyph: '✓', word: 'Done', color: colors.text, border: colors.control },
};

type NoticeProps = {
  tone: NoticeTone;
  /** The body. Written out in full: a notice is read, not glanced at. */
  children: string;
  title?: string;
  action?: { label: string; onPress: () => void };
  /**
   * Read out as it appears. For notices that arrive after the screen has, like
   * a save that failed; one there from the start is read in its turn.
   */
  live?: boolean;
};

/**
 * Something the screen needs to say beside its content. It fades in and stays:
 * nothing important is taken away on a timer.
 */
export function Notice({ tone, children, title, action, live = false }: NoticeProps) {
  const t = TONES[tone];
  return (
    <Animated.View entering={FadeIn.duration(motion.notice)} style={[styles.notice, { borderColor: t.border }]}>
      <View style={styles.row}>
        <View
          style={[styles.badge, { borderColor: t.color }]}
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
        >
          <Text style={[styles.glyph, { color: t.color }]}>{t.glyph}</Text>
        </View>
        <View
          style={styles.body}
          accessible
          accessibilityLabel={`${t.word}: ${title ? `${title}. ` : ''}${children}`}
          accessibilityLiveRegion={live ? 'polite' : 'none'}
        >
          {title ? <Text style={styles.title}>{title}</Text> : null}
          <Text style={styles.text}>{children}</Text>
        </View>
      </View>
      {action ? (
        <ActionButton
          variant="text"
          label={action.label}
          onPress={action.onPress}
          style={styles.action}
        />
      ) : null}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  notice: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: stroke.hairline,
    padding: space.md,
  },
  row: { flexDirection: 'row', alignItems: 'flex-start' },
  badge: {
    width: space.lg,
    height: space.lg,
    borderRadius: radius.pill,
    borderWidth: stroke.medium,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: space.md,
  },
  glyph: { ...type.caption, fontWeight: '900' },
  body: { flex: 1 },
  title: { ...type.body, color: colors.text, fontWeight: '700' },
  text: { ...type.body, color: colors.text },
  action: { alignSelf: 'flex-start', marginTop: space.sm },
});
