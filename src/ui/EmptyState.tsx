import { StyleSheet, Text, View } from 'react-native';
import { ActionButton } from './ActionButton';
import { colors, space, type } from './tokens';

type EmptyStateProps = {
  title: string;
  body: string;
  action?: { label: string; onPress: () => void };
};

/**
 * What a list says before it has anything in it. Words and at most one way
 * on; never sample data, and never a speed of 0.
 */
export function EmptyState({ title, body, action }: EmptyStateProps) {
  return (
    <View style={styles.empty}>
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.body}>{body}</Text>
      {action ? (
        <ActionButton label={action.label} onPress={action.onPress} style={styles.action} />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  empty: { alignItems: 'center', paddingVertical: space.xl },
  title: { ...type.h2, color: colors.text, textAlign: 'center' },
  body: { ...type.body, color: colors.muted, textAlign: 'center', marginTop: space.sm },
  action: { marginTop: space.lg },
});
