import { StyleSheet, Text, View } from 'react-native';
import { colors, opacity, radius, stroke, type } from './tokens';
import type { MarkConfidence } from '../types';

const MARKER_SIZE = 28;
/** A square turned 45 degrees whose corners reach the marker's edge. */
const DIAMOND_SIDE = MARKER_SIZE / Math.SQRT2;

type FrameMarkerProps = {
  /** Centre of the marker, in the displayed frame's own pixels. */
  left: number;
  top: number;
  label: string;
  /**
   * The point being placed, or the one being looked at: lime and drawn heavier.
   * Everything else is white. Lime is for what is happening now.
   */
  active: boolean;
  /**
   * How well the ball could be seen on a bounce mark. Seen is the plain
   * crosshair. Uncertain is a hollow diamond, and a guess is a crossed ring
   * that names itself, so neither can pass for a clean mark at a glance.
   */
  confidence?: MarkConfidence;
};

/** A crosshair and caption over a marked point on a frame. Shared by Mark, Result and Analysis. */
export function FrameMarker({ left, top, label, active, confidence = 'seen' }: FrameMarkerProps) {
  const tint = active ? colors.accent : colors.text;
  const shape = active ? styles.heavy : styles.light;
  return (
    <View
      pointerEvents="none"
      style={[styles.marker, { left: left - MARKER_SIZE / 2, top: top - MARKER_SIZE / 2 }]}
    >
      {confidence === 'uncertain' ? (
        <View style={[styles.diamond, shape, { borderColor: tint }]} />
      ) : (
        <View style={[styles.ring, shape, { borderColor: tint }]} />
      )}
      {confidence === 'guessed' ? (
        <>
          <View style={[styles.tickH, styles.crossA, { backgroundColor: tint }]} />
          <View style={[styles.tickH, styles.crossB, { backgroundColor: tint }]} />
        </>
      ) : (
        <>
          <View style={[styles.tickV, { backgroundColor: tint }]} />
          <View style={[styles.tickH, { backgroundColor: tint }]} />
        </>
      )}
      <Text style={[styles.label, { color: tint }]}>
        {confidence === 'guessed' ? 'Guessed' : label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  marker: {
    position: 'absolute',
    width: MARKER_SIZE,
    height: MARKER_SIZE,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ring: {
    position: 'absolute',
    width: MARKER_SIZE,
    height: MARKER_SIZE,
    borderRadius: radius.pill,
  },
  diamond: {
    position: 'absolute',
    width: DIAMOND_SIDE,
    height: DIAMOND_SIDE,
    transform: [{ rotate: '45deg' }],
  },
  light: { borderWidth: stroke.hairline, opacity: opacity.secondary },
  heavy: { borderWidth: stroke.medium, opacity: opacity.full },
  tickV: { position: 'absolute', width: stroke.hairline, height: MARKER_SIZE },
  tickH: { position: 'absolute', height: stroke.hairline, width: MARKER_SIZE },
  // The crosshair turned into an X, so a guessed point reads as struck out.
  crossA: { transform: [{ rotate: '45deg' }] },
  crossB: { transform: [{ rotate: '-45deg' }] },
  label: {
    ...type.label,
    position: 'absolute',
    top: MARKER_SIZE,
    // Wider than the marker and centred on it, so the caption is not clipped
    // by the marker's own bounds.
    left: -MARKER_SIZE,
    width: MARKER_SIZE * 3,
    textAlign: 'center',
  },
});
