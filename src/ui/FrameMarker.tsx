import { StyleSheet, Text, View } from 'react-native';
import { colors, opacity, radius, stroke, type } from './tokens';

const MARKER_SIZE = 28;

type FrameMarkerProps = {
  /** Centre of the marker, in the displayed frame's own pixels. */
  left: number;
  top: number;
  label: string;
  /** Ball points carry the measurement, so they get the accent. */
  ball: boolean;
  /** Drawn heavier — the point being placed, or the one being looked at. */
  active: boolean;
};

/** A crosshair and caption over a marked point on a frame. Shared by Mark and Analysis. */
export function FrameMarker({ left, top, label, ball, active }: FrameMarkerProps) {
  const tint = ball ? colors.accent : colors.text;
  return (
    <View
      pointerEvents="none"
      style={[styles.marker, { left: left - MARKER_SIZE / 2, top: top - MARKER_SIZE / 2 }]}
    >
      <View style={[styles.ring, { borderColor: tint }, active && styles.ringActive]} />
      <View style={[styles.tickV, { backgroundColor: tint }]} />
      <View style={[styles.tickH, { backgroundColor: tint }]} />
      <Text style={[styles.label, { color: tint }]}>{label}</Text>
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
    borderWidth: stroke.hairline,
    opacity: opacity.inactive,
  },
  ringActive: { borderWidth: stroke.medium, opacity: opacity.full },
  tickV: { position: 'absolute', width: stroke.hairline, height: MARKER_SIZE },
  tickH: { position: 'absolute', height: stroke.hairline, width: MARKER_SIZE },
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
