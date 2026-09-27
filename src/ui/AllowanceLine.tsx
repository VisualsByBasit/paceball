import { StyleSheet, Text, View } from 'react-native';
import type { Allowance } from '../purchases/freeLimit';
import { colors, space, type } from './tokens';

type AllowanceLineProps = {
  /**
   * The allowance in words, from allowanceLine. Null for Pro, which is told
   * nothing about limits, so nothing is drawn.
   */
  line: string | null;
  allowance: Allowance;
  /** The day of the week a time falls on, as the phone names it. */
  weekday: (t: number) => string;
};

/**
 * The free week in one line, and when it starts again beneath. Plain words,
 * no ring or bar: the count is small and exact. The last analysis reads at
 * full strength, and a week that has run out carries a warning mark as well
 * as its colour.
 */
export function AllowanceLine({ line, allowance, weekday }: AllowanceLineProps) {
  if (line === null) return null;
  const usedUp = allowance.left === 0;
  const last = allowance.left === 1;
  // A week that has run out already names its day in the line itself.
  const reset =
    !usedUp && allowance.nextReset !== null ? `Resets ${weekday(allowance.nextReset)}.` : null;

  return (
    <View
      style={styles.wrap}
      accessible
      accessibilityLabel={`${usedUp ? 'Limit reached. ' : ''}${line}.${reset ? ` ${reset}` : ''}`}
    >
      <View style={styles.row}>
        {usedUp ? <Text style={styles.mark}>!</Text> : null}
        <Text style={[styles.line, last && styles.lineLast, usedUp && styles.lineUsedUp]}>
          {line}
        </Text>
      </View>
      {reset ? <Text style={styles.reset}>{reset}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center' },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.xs },
  mark: { ...type.caption, color: colors.warn, fontWeight: '900' },
  line: { ...type.caption, color: colors.muted },
  lineLast: { color: colors.text },
  lineUsedUp: { color: colors.warn },
  reset: { ...type.caption, color: colors.muted },
});
