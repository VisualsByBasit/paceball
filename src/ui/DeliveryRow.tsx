import { useState } from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';
import type { ReadingView } from './reading';
import { colors, opacity, radius, size, space, stroke, type } from './tokens';

export type DeliveryRowState = 'normal' | 'selected' | 'blocked' | 'deleting';

type DeliveryRowProps = {
  /** The release frame, or null when it cannot be found. */
  thumb: string | null;
  reading: ReadingView;
  /** When it was saved, as the list writes it. */
  when: string;
  /** A short line after the date, like the scale reference. */
  detail?: string;
  state?: DeliveryRowState;
  /** Why it cannot be picked, in words, when blocked. */
  reason?: string | null;
  /** The personal best, marked in words. */
  best?: boolean;
  /** A tick box at the end, while picking deliveries. Null outside that. */
  pick?: { picked: boolean } | null;
};

/**
 * One saved delivery: its release frame, its speed with its range, or the
 * reason it has none, and when. What it looks like only; the list around it
 * decides what a press does, so opening, picking and deleting stay the list's.
 */
export function DeliveryRow({
  thumb,
  reading,
  when,
  detail,
  state = 'normal',
  reason = null,
  best = false,
  pick = null,
}: DeliveryRowProps) {
  return (
    <View
      style={[
        styles.row,
        state === 'selected' && styles.selected,
        (state === 'blocked' || state === 'deleting') && styles.dim,
      ]}
    >
      <Thumb uri={thumb} />
      <View style={styles.body}>
        <View style={styles.top}>
          {reading.kind === 'measured' ? (
            <Text style={styles.speed} numberOfLines={1}>
              {reading.speed}
              <Text style={styles.range}> {reading.range}</Text>
            </Text>
          ) : (
            // Neutral: a delivery without a speed is not an error.
            <Text style={styles.noSpeed} numberOfLines={1}>
              {reading.cause === 'not-seen'
                ? 'No speed · bounce not seen'
                : "No speed · can't be measured from what was saved"}
            </Text>
          )}
          {best ? <Text style={styles.best}>BEST</Text> : null}
        </View>
        <Text style={styles.meta} numberOfLines={1}>
          {state === 'deleting' ? 'Deleting…' : detail ? `${when} · ${detail}` : when}
        </Text>
        {state === 'blocked' && reason ? <Text style={styles.reason}>{reason}</Text> : null}
      </View>
      {pick ? <View style={[styles.pick, pick.picked && styles.pickOn]} /> : null}
    </View>
  );
}

function Thumb({ uri }: { uri: string | null }) {
  const [failed, setFailed] = useState(false);
  return (
    <View style={styles.thumb}>
      {uri && !failed ? (
        <Image
          source={{ uri }}
          style={styles.thumbImage}
          resizeMode="cover"
          // Downsamples during decode: a list of full-size frames would not fit in memory.
          resizeMethod="resize"
          fadeDuration={0}
          onError={() => setFailed(true)}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: size.row,
    paddingVertical: space.sm,
    borderBottomWidth: stroke.hairline,
    borderColor: colors.line,
  },
  selected: { backgroundColor: colors.surface },
  dim: { opacity: opacity.inactive },
  thumb: {
    width: size.thumb,
    height: size.thumb,
    borderRadius: radius.sm,
    overflow: 'hidden',
    backgroundColor: colors.surface,
  },
  thumbImage: { width: '100%', height: '100%' },
  body: { flex: 1, marginLeft: space.md },
  top: { flexDirection: 'row', alignItems: 'baseline' },
  speed: { ...type.h2, ...type.mono, color: colors.text, flexShrink: 1 },
  range: { ...type.caption, ...type.mono, color: colors.muted },
  noSpeed: { ...type.body, color: colors.muted, flexShrink: 1 },
  best: { ...type.label, color: colors.text, marginLeft: 'auto', paddingLeft: space.sm },
  meta: { ...type.caption, color: colors.muted, marginTop: space.xs },
  reason: { ...type.caption, color: colors.text, marginTop: space.xs },
  pick: {
    width: space.lg,
    height: space.lg,
    borderRadius: radius.pill,
    borderWidth: stroke.medium,
    borderColor: colors.control,
    marginLeft: space.md,
  },
  pickOn: { borderColor: colors.accent, backgroundColor: colors.accent },
});
