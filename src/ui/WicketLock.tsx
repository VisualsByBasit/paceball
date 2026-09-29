import { useCallback, useEffect, useRef } from 'react';
import { StyleSheet, View } from 'react-native';
import { Canvas } from '@shopify/react-native-skia';
import {
  Easing,
  useDerivedValue,
  useReducedMotion,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
// Reanimated's own peer, pinned by the worklets override in package.json.
import { scheduleOnRN } from 'react-native-worklets';
import * as Haptics from 'expo-haptics';
import { GroundShadow, wicketLayout, Wicket3D, type BailMotion } from './cricket3d';
import { motion, opacity, size, space } from './tokens';

const SETTLE = Easing.bezier(...motion.settleCurve);

/** Room under the stumps for their shadow on the ground. */
const FOOT = space.sm;

/**
 * Three lit stumps and two bails under a reading, from the 3D kit. Unlocked,
 * the bails hover a few dp above their grooves in plain painted wood. Locking
 * drops the bails into place, each with a small shadow that sharpens as it
 * settles, then the whole set lights lime with one light tap: the reading is
 * complete. It locks once and stays locked.
 *
 * Reduced motion shows it locked, with the tap and without the fall.
 */
export function WicketLock({ locked }: { locked: boolean }) {
  const reduced = useReducedMotion();
  // 0 hovering, 1 seated on the stumps.
  const seated = useSharedValue(locked ? 1 : 0);
  // 0 painted wood, 1 lime.
  const lime = useSharedValue(locked ? 1 : 0);
  const didLock = useRef(locked);

  const tap = useCallback(() => {
    // Haptics are garnish. A phone without a motor is not an error.
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => undefined);
  }, []);

  useEffect(() => {
    if (!locked || didLock.current) return;
    didLock.current = true;
    if (reduced) {
      seated.value = 1;
      lime.value = 1;
      tap();
      return;
    }
    seated.value = withTiming(1, { duration: motion.lock.bail, easing: SETTLE }, (finished) => {
      if (!finished) return;
      lime.value = withTiming(1, { duration: motion.lock.colour, easing: Easing.linear });
      scheduleOnRN(tap);
    });
  }, [locked, reduced, seated, lime, tap]);

  const { width, height, drop } = size.wicket;
  const foot = height - FOOT;
  const stumpHeight = height - FOOT - drop - space.sm;
  const layout = wicketLayout(width / 2, foot, stumpHeight);

  const bails = useDerivedValue<BailMotion[]>(() => {
    const dy = (seated.value - 1) * drop;
    return [0, 1].map(() => ({ dx: 0, dy, turn: 0, opacity: opacity.full }));
  });
  // Each bail's shadow on the stump tops: soft while it hovers, crisp once seated.
  const shadowOpacity = useDerivedValue(() => opacity.inactive * seated.value);
  const shadowBlur = useDerivedValue(() => layout.bailH * (0.4 + (1 - seated.value) * 1.6));

  return (
    <View
      style={styles.wicket}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      <Canvas style={styles.canvas}>
        <Wicket3D x={width / 2} y={foot} height={stumpHeight} glow={lime} bails={bails} />
        {layout.bails.map((b, i) => (
          <GroundShadow
            key={i}
            cx={b.x + b.w / 2 + layout.bailH * 0.3}
            cy={layout.stumps[0].y + layout.bailH * 0.55}
            rx={b.w / 2}
            ry={layout.bailH * 0.35}
            blur={shadowBlur}
            opacity={shadowOpacity}
          />
        ))}
      </Canvas>
    </View>
  );
}

const styles = StyleSheet.create({
  wicket: {
    width: size.wicket.width,
    height: size.wicket.height,
    alignSelf: 'center',
  },
  canvas: { flex: 1 },
});
