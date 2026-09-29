import { useState } from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';
import type { ReadingView } from './reading';
import { colors, radius, size, space, stroke, type } from './tokens';

type DeliveryCardProps = {
  /** The release frame, or null when it cannot be found. */
  thumb: string | null;
  reading: ReadingView;
  /** When it was saved, as the list writes it. */
  when: string;
  /** The personal best, marked in words. */
  best?: boolean;
  /** Full width, for large text, where a row of narrow cards would clip. */
  wide?: boolean;
};

/**
 * A recent delivery on Home: the release frame across the top, then its speed
 * with its range, or the reason it has none, and when. Like DeliveryRow it is
 * only a look; Home decides what a press does.
 */
export function DeliveryCard({ thumb, reading, when, best = false, wide = false }: DeliveryCardProps) {
  const [failed, setFailed] = useState(false);
  return (
    <View style={[styles.card, wide && styles.wide]}>
      <View style={styles.thumb}>
        {thumb && !failed ? (
          <Image
            source={{ uri: thumb }}
            style={styles.thumbImage}
            resizeMode="cover"
            // Downsamples during decode: full-size frames would not fit in memory.
            resizeMethod="resize"
            fadeDuration={0}
            onError={() => setFailed(true)}
          />
        ) : null}
        {best ? (
          <View style={styles.bestPlate}>
            <Text style={styles.best}>BEST</Text>
          </View>
        ) : null}
      </View>
      <View style={styles.body}>
        {reading.kind === 'measured' ? (
          <>
            <Text style={styles.speed} numberOfLines={1}>
              {reading.speed}
              <Text style={styles.unit}> {reading.unit}</Text>
            </Text>
            <Text style={styles.range} numberOfLines={1}>
              {reading.range}
            </Text>
          </>
        ) : (
          // Neutral: a delivery without a speed is not an error.
          <Text style={styles.noSpeed} numberOfLines={2}>
            {reading.cause === 'not-seen' ? 'No speed · bounce not seen' : "No speed · can't be measured"}
          </Text>
        )}
        <Text style={styles.when} numberOfLines={1}>
          {when}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    width: size.card.width,
    borderRadius: radius.lg,
    borderWidth: stroke.hairline,
    borderColor: colors.line,
    backgroundColor: colors.surface,
    overflow: 'hidden',
  },
  wide: { width: 'auto', alignSelf: 'stretch' },
  thumb: { height: size.card.thumb, backgroundColor: colors.line },
  thumbImage: { width: '100%', height: '100%' },
  // Opaque, so it reads over any frame.
  bestPlate: {
    position: 'absolute',
    top: space.sm,
    left: space.sm,
    backgroundColor: colors.bg,
    borderRadius: radius.sm,
    paddingHorizontal: space.sm,
    paddingVertical: space.xs,
  },
  best: { ...type.label, color: colors.text },
  body: { padding: space.md },
  speed: { ...type.h2, ...type.mono, color: colors.text },
  unit: { ...type.caption, color: colors.muted },
  range: { ...type.caption, ...type.mono, color: colors.text },
  noSpeed: { ...type.body, color: colors.muted },
  when: { ...type.caption, color: colors.muted, marginTop: space.xs },
});
