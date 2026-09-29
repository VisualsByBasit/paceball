import { StyleSheet, Text, View } from 'react-native';
import { CHECK_READING } from './gauge';
import { colors, radius, space, stroke, type } from './tokens';

/**
 * The small caution beside a reading that is off the scale or has a very wide
 * range: "Check this reading", in words and in the warning colour, never by
 * colour alone. The reading beside it is shown exactly as computed.
 */
export function CheckTag({ center = false }: { center?: boolean }) {
  return (
    <View style={[styles.tag, center && styles.center]} accessibilityRole="text" accessibilityLabel={`Caution. ${CHECK_READING}.`}>
      <Text style={styles.mark} importantForAccessibility="no">
        !
      </Text>
      <Text style={styles.text}>{CHECK_READING}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  tag: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    flexShrink: 1,
    borderWidth: stroke.hairline,
    borderColor: colors.warn,
    borderRadius: radius.pill,
    paddingHorizontal: space.sm,
    marginTop: space.xs,
  },
  center: { alignSelf: 'center' },
  mark: { ...type.label, color: colors.warn, marginRight: space.xs },
  text: { ...type.caption, color: colors.warn, flexShrink: 1 },
});
