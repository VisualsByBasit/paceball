import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Image,
  PanResponder,
  StyleSheet,
  View,
  type AccessibilityActionEvent,
  type GestureResponderEvent,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { colors, radius, space, stroke } from './tokens';

const STRIP_HEIGHT = 56;
const THUMB_WIDTH = 40;

/** A frame to tick on the strip, like release or bounce. */
export type ScrubberMark = { frame: number; color: string };

type FrameScrubberProps = {
  /** Index-aligned `file://` frame paths. `null` where a frame is not there (yet). */
  frames: (string | null)[];
  /** Frames the clip has. Thumbnails are sampled across all of them. */
  total: number;
  /**
   * The furthest frame the playhead may reach. On Mark that is the last frame
   * decoded so far — scrubbing past it would show one frame while recording
   * another's number.
   */
  max: number;
  current: number;
  onSeek: (frame: number) => void;
  marks?: ScrubberMark[];
  style?: StyleProp<ViewStyle>;
};

/**
 * The film strip under a frame: sampled thumbnails, a playhead, and a drag
 * anywhere on it to seek. Shared by Mark and Analysis so there is one of it.
 */
export function FrameScrubber({
  frames,
  total,
  max,
  current,
  onSeek,
  marks,
  style,
}: FrameScrubberProps) {
  const [trackWidth, setTrackWidth] = useState(0);

  // The responder is created once, so it reads everything that changes
  // through refs rather than closing over one render's values.
  const trackWidthRef = useRef(0);
  const maxRef = useRef(max);
  const onSeekRef = useRef(onSeek);
  useEffect(() => {
    trackWidthRef.current = trackWidth;
  }, [trackWidth]);
  useEffect(() => {
    maxRef.current = max;
  }, [max]);
  useEffect(() => {
    onSeekRef.current = onSeek;
  }, [onSeek]);

  const pan = useMemo(() => {
    const seekToX = (x: number) => {
      const width = trackWidthRef.current;
      const limit = maxRef.current;
      if (width <= 0 || limit <= 0) return;
      const ratio = Math.min(1, Math.max(0, x / width));
      onSeekRef.current(Math.round(ratio * limit));
    };

    let originX = 0;
    return PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderTerminationRequest: () => false,
      onPanResponderGrant: (e: GestureResponderEvent) => {
        originX = e.nativeEvent.locationX;
        seekToX(originX);
      },
      // Tracked as an offset from where the finger landed. locationX drifts once
      // the drag leaves the track; the grant point plus dx does not.
      onPanResponderMove: (_e, gesture) => seekToX(originX + gesture.dx),
    });
  }, []);

  const thumbCount = trackWidth > 0 ? Math.max(1, Math.floor(trackWidth / THUMB_WIDTH)) : 0;
  const thumbs = useMemo(() => {
    if (thumbCount === 0 || total <= 0) return [];
    return Array.from({ length: thumbCount }, (_, i) => {
      const index =
        thumbCount === 1 ? 0 : Math.round((i / (thumbCount - 1)) * Math.max(0, total - 1));
      return { index, uri: frames[index] ?? null };
    });
  }, [thumbCount, total, frames]);

  const leftOf = (frame: number) =>
    (max > 0 ? frame / max : 0) * Math.max(0, trackWidth - stroke.hairline);

  const onAccessibilityAction = (e: AccessibilityActionEvent) => {
    const step = e.nativeEvent.actionName === 'increment' ? 1 : -1;
    const next = Math.min(max, Math.max(0, current + step));
    if (next !== current) onSeek(next);
  };

  return (
    <View style={[styles.strip, style]} onLayout={(e) => setTrackWidth(e.nativeEvent.layout.width)}>
      <View style={styles.thumbs} pointerEvents="none">
        {thumbs.map((t, i) => (
          <View key={`${t.index}-${i}`} style={styles.thumb}>
            {t.uri ? (
              <Image
                source={{ uri: t.uri }}
                style={styles.thumbImage}
                resizeMode="cover"
                // Downsamples during decode, so the strip does not hold a
                // dozen full-size bitmaps in memory.
                resizeMethod="resize"
                fadeDuration={0}
              />
            ) : null}
          </View>
        ))}
      </View>

      {marks?.map((m) =>
        m.frame <= max ? (
          <View
            key={`${m.frame}-${m.color}`}
            pointerEvents="none"
            style={[styles.mark, { left: leftOf(m.frame), backgroundColor: m.color }]}
          />
        ) : null
      )}

      {max > 0 ? (
        <View style={[styles.playhead, { left: leftOf(current) }]} pointerEvents="none" />
      ) : null}

      <View
        style={StyleSheet.absoluteFill}
        accessible
        accessibilityRole="adjustable"
        accessibilityLabel="Frame"
        accessibilityValue={{ min: 0, max, now: current }}
        accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
        onAccessibilityAction={onAccessibilityAction}
        {...pan.panHandlers}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  strip: {
    height: STRIP_HEIGHT,
    borderRadius: radius.sm,
    overflow: 'hidden',
    backgroundColor: colors.surface,
    borderWidth: stroke.hairline,
    borderColor: colors.line,
  },
  thumbs: { flexDirection: 'row', height: '100%' },
  thumb: { flex: 1, height: '100%', backgroundColor: colors.line },
  thumbImage: { width: '100%', height: '100%' },
  playhead: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    width: stroke.hairline,
    backgroundColor: colors.accent,
  },
  // A short tick along the bottom edge, so it reads apart from the playhead.
  mark: {
    position: 'absolute',
    bottom: 0,
    height: space.sm,
    width: stroke.medium,
  },
});
