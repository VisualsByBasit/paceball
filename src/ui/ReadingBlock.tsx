import { useCallback, useEffect, useRef } from 'react';
import { AccessibilityInfo, StyleSheet, Text, View } from 'react-native';
import Animated, {
  interpolateColor,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { CountUpReading } from './motion/CountUpReading';
import type { MeasuredReading } from './reading';
import { colors, motion, space, type } from './tokens';

export type ReadingSize = 'hero' | 'heroCompact' | 'reading';

type ReadingBlockProps = {
  /**
   * Only ever a measured reading, which carries its range. There is no prop
   * for a bare number, so there is no way to draw a speed without its range.
   */
  reading: MeasuredReading;
  size: ReadingSize;
  /**
   * Count up from zero and land, for the moment a reading arrives. Without it,
   * or with motion reduced, the reading shows final and complete at once.
   */
  reveal?: boolean;
  /** Once the reading has landed, or straight away when it is not revealed. */
  onLanded?: () => void;
};

/**
 * The speed, its unit, its range and how it was measured, as one thing: one
 * stop for a screen reader, which hears the whole sentence, range included.
 *
 * On a reveal the range is on screen, muted, from the very first frame, so the
 * number is never shown alone. When the count lands the range comes up to full
 * strength and the number turns lime: the reading is complete.
 */
export function ReadingBlock({ reading, size, reveal = false, onLanded }: ReadingBlockProps) {
  const reduced = useReducedMotion();
  const still = !reveal || reduced;
  // 0 muted, 1 full strength. Only the range reads it.
  const emphasis = useSharedValue(still ? 1 : 0);
  const announced = useRef(false);

  const onLandedRef = useRef(onLanded);
  useEffect(() => {
    onLandedRef.current = onLanded;
  }, [onLanded]);

  const land = useCallback(() => {
    emphasis.value = still ? 1 : withTiming(1, { duration: motion.fade });
    // Said once, after the count, never the numbers on the way up. Only for a
    // reading that is arriving: one already on screen is read in its turn.
    if (reveal && !announced.current) {
      announced.current = true;
      AccessibilityInfo.announceForAccessibility(reading.spoken);
    }
    onLandedRef.current?.();
  }, [emphasis, still, reveal, reading.spoken]);

  const range = useAnimatedStyle(() => ({
    color: interpolateColor(emphasis.value, [0, 1], [colors.muted, colors.text]),
  }));

  const number = NUMBER[size];

  return (
    <View
      style={styles.block}
      accessible
      accessibilityRole="text"
      accessibilityLabel={reading.spoken}
    >
      <View style={styles.speed}>
        {reveal ? (
          <CountUpReading
            value={reading.value}
            decimals={reading.decimals}
            style={number}
            countingColor={colors.text}
            landedColor={colors.accent}
            still={still}
            onLanded={land}
            allowFontScaling={false}
          />
        ) : (
          <StaticNumber text={reading.speed} style={number} onShown={land} />
        )}
        <Text style={size === 'reading' ? styles.unitSmall : styles.unit}>{reading.unit}</Text>
      </View>
      <Animated.Text style={[size === 'reading' ? styles.rangeSmall : styles.range, range]}>
        {reading.range}
      </Animated.Text>
      <Text style={styles.method}>{reading.method}</Text>
    </View>
  );
}

/** A reading that is not arriving: final, lime, and landed from the start. */
function StaticNumber({
  text,
  style,
  onShown,
}: {
  text: string;
  style: (typeof NUMBER)[ReadingSize];
  onShown: () => void;
}) {
  useEffect(() => {
    onShown();
    // Once, on mount: a reading already on screen lands exactly once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return (
    <Text style={[style, styles.landed]} allowFontScaling={false} numberOfLines={1}>
      {text}
    </Text>
  );
}

const styles = StyleSheet.create({
  block: { alignItems: 'center' },
  // The unit beside the number, on its baseline. At large text it wraps under
  // rather than pushing the number off the screen.
  speed: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'center',
    flexWrap: 'wrap',
  },
  numberHero: { ...type.hero, ...type.mono },
  numberHeroCompact: { ...type.heroCompact, ...type.mono },
  numberReading: { ...type.reading, ...type.mono },
  landed: { color: colors.accent },
  unit: { ...type.h2, color: colors.muted, marginLeft: space.sm },
  unitSmall: { ...type.body, color: colors.muted, marginLeft: space.xs },
  range: { ...type.h2, ...type.mono, marginTop: space.xs },
  rangeSmall: { ...type.body, ...type.mono },
  method: { ...type.caption, color: colors.muted, marginTop: space.xs },
});

const NUMBER = {
  hero: styles.numberHero,
  heroCompact: styles.numberHeroCompact,
  reading: styles.numberReading,
};
