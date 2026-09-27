import { Image, StyleSheet, View } from 'react-native';
import Animated, { useAnimatedStyle, type SharedValue } from 'react-native-reanimated';
import { colors, opacity, radius, size, space, stroke } from './tokens';

/** How much larger the loupe draws the frame than the frame is drawn. */
const ZOOM = 2;

type LoupeProps = {
  /** The frame under the finger: the same file the marks are placed on. */
  uri: string;
  /** The frame's size as drawn on screen. */
  frame: { width: number; height: number };
  /** Where the drawn frame's top-left corner sits in the layer the loupe is drawn in. */
  origin: { x: number; y: number };
  /** The finger, in the drawn frame's own coordinates. Written from touches, read on the UI thread. */
  x: SharedValue<number>;
  y: SharedValue<number>;
  /** 1 while a finger is down on the frame, 0 otherwise. */
  shown: SharedValue<number>;
};

/**
 * A magnifier held above the finger while it is down on the frame, so the
 * point under a fingertip can be seen before it is let go. It samples the real
 * frame, at twice the size, with a crosshair on the exact pixel. It appears and
 * goes at once: nothing about it moves on its own.
 */
export function Loupe({ uri, frame, origin, x, y, shown }: LoupeProps) {
  const lens = useAnimatedStyle(() => {
    const half = size.loupe / 2;
    // Above the finger, with a gap, so the finger never covers what it shows.
    // Kept inside the layer at the top, where there is no room above.
    const top = Math.max(0, origin.y + y.value - size.loupe - space.lg);
    return {
      opacity: shown.value,
      transform: [{ translateX: origin.x + x.value - half }, { translateY: top }],
    };
  });
  const picture = useAnimatedStyle(() => {
    // The middle of the lens inside its border, where the crosshair sits.
    const half = size.loupe / 2 - stroke.medium;
    return {
      transform: [
        { translateX: half - x.value * ZOOM },
        { translateY: half - y.value * ZOOM },
      ],
    };
  });

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      <Animated.View style={[styles.lens, lens]}>
        <Animated.View style={picture}>
          <Image
            source={{ uri }}
            style={{ width: frame.width * ZOOM, height: frame.height * ZOOM }}
            resizeMode="contain"
            fadeDuration={0}
          />
        </Animated.View>
        <View style={styles.crossV} />
        <View style={styles.crossH} />
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  lens: {
    position: 'absolute',
    width: size.loupe,
    height: size.loupe,
    borderRadius: radius.pill,
    borderWidth: stroke.medium,
    borderColor: colors.accent,
    backgroundColor: colors.bg,
    overflow: 'hidden',
  },
  crossV: {
    position: 'absolute',
    top: space.lg,
    bottom: space.lg,
    left: size.loupe / 2 - stroke.medium,
    width: stroke.hairline,
    backgroundColor: colors.accent,
    opacity: opacity.secondary,
  },
  crossH: {
    position: 'absolute',
    left: space.lg,
    right: space.lg,
    top: size.loupe / 2 - stroke.medium,
    height: stroke.hairline,
    backgroundColor: colors.accent,
    opacity: opacity.secondary,
  },
});
