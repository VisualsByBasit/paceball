import { useCallback, useEffect, useRef, useState } from 'react';
import { BackHandler, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { Redirect, useFocusEffect, useRouter } from 'expo-router';
import { Canvas, Circle, Path, RadialGradient, Skia, vec } from '@shopify/react-native-skia';
import Animated, {
  Easing,
  useAnimatedReaction,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';
// Reanimated's own peer, pinned by the worklets override in package.json.
import { scheduleOnRN } from 'react-native-worklets';
import * as Haptics from 'expo-haptics';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ActionButton } from '../src/ui/ActionButton';
import { CelebrationBackdrop, CelebrationScene } from '../src/ui/CelebrationStage';
import {
  armedCelebration,
  celebrationExit,
  clearCelebration,
  type CelebrationFrom,
} from '../src/ui/celebration';
import { CELEBRATE, copyAt, itemAt, pushAt, UNLOCKED } from '../src/ui/celebrationScene';
import { colors, opacity, scene, size, space, type } from '../src/ui/tokens';

/**
 * Shown once, straight after the store confirms a purchase with the pro
 * entitlement. Never on a tap that did not end in a purchase, never on a
 * restore, and never by opening the route: without a confirmed purchase armed
 * by the paywall there is nothing to show, and it goes home.
 */
export default function CelebrationRoute() {
  // Read once, while mounting; spent straight after, so it cannot show twice.
  const [from] = useState<CelebrationFrom | null>(armedCelebration);
  useEffect(() => {
    clearCelebration();
  }, []);
  if (from === null) return <Redirect href="/" />;
  return <Celebration from={from} />;
}

function Celebration({ from }: { from: CelebrationFrom }) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const reduced = useReducedMotion();
  const { width, height } = useWindowDimensions();
  const exit = celebrationExit(from);

  // Back to what started the purchase. The button works from the first frame:
  // nothing here has to be watched to the end, and leaving skips the rest.
  const go = useCallback(() => {
    if (exit.to === 'capture') router.replace('/capture');
    else if (router.canGoBack()) router.back();
    else router.replace('/');
  }, [exit.to, router]);

  // The hardware Back goes the same way as the button.
  useFocusEffect(
    useCallback(() => {
      const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
        go();
        return true;
      });
      return () => subscription.remove();
    }, [go])
  );

  // One clock for the whole scene. Reduced motion starts it at the end: the
  // finished scene, with no travel and no particles.
  const t = useSharedValue(reduced ? CELEBRATE.total : 0);
  useEffect(() => {
    if (reduced) {
      t.value = CELEBRATE.total;
      return;
    }
    t.value = withTiming(CELEBRATE.total, { duration: CELEBRATE.total, easing: Easing.linear });
  }, [reduced, t]);

  // Two haptics, each once: a heavy hit as the ball meets the stumps, and a
  // success as the badge lands. Silent otherwise.
  const hit = useRef(false);
  const landed = useRef(false);
  const onHit = useCallback(() => {
    if (hit.current) return;
    hit.current = true;
    // Haptics are garnish. A phone without a motor is not an error.
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy).catch(() => undefined);
  }, []);
  const onLand = useCallback(() => {
    if (landed.current) return;
    landed.current = true;
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => undefined);
  }, []);
  useAnimatedReaction(
    () => t.value,
    (now, before) => {
      const was = before ?? -1;
      if (!reduced && was < CELEBRATE.impact && now >= CELEBRATE.impact) scheduleOnRN(onHit);
      if (was < CELEBRATE.land && now >= CELEBRATE.land) scheduleOnRN(onLand);
    },
    [reduced, onHit, onLand]
  );

  const backdrop = useAnimatedStyle(() => ({ transform: [{ scale: pushAt(t.value) }] }));
  const copy = useAnimatedStyle(() => ({
    opacity: copyAt(t.value),
    transform: [{ translateY: (1 - copyAt(t.value)) * space.md }],
  }));

  return (
    <View style={styles.screen}>
      <Animated.View style={[StyleSheet.absoluteFill, backdrop]}>
        <CelebrationBackdrop width={width} height={height} />
      </Animated.View>
      <View style={[styles.stage, { paddingTop: insets.top }]}>
        <CelebrationScene t={t} width={width} height={height} />
      </View>
      <View style={[styles.bottom, { paddingBottom: insets.bottom + space.lg }]}>
        <Animated.View style={copy}>
          <Text style={styles.title} accessibilityRole="header">
            You're on Pro
          </Text>
          <Text style={styles.body}>More deliveries. The same honest readings.</Text>
        </Animated.View>
        <View style={styles.list}>
          {UNLOCKED.map((item, i) => (
            <Unlocked key={item} t={t} index={i} label={item} />
          ))}
        </View>
        <ActionButton label={exit.label} onPress={go} />
      </View>
    </View>
  );
}

/** One thing Pro unlocks, ticking in with a small lit checkmark. */
function Unlocked({ t, index, label }: { t: SharedValue<number>; index: number; label: string }) {
  const style = useAnimatedStyle(() => ({
    opacity: itemAt(t.value, index),
    transform: [{ translateX: (1 - itemAt(t.value, index)) * -space.md }],
  }));
  return (
    <Animated.View style={[styles.item, style]}>
      <Check />
      <Text style={styles.itemText}>{label}</Text>
    </Animated.View>
  );
}

const CHECK = size.target / 2;
const tick = (() => {
  const p = Skia.Path.Make();
  p.moveTo(CHECK * 0.28, CHECK * 0.52);
  p.lineTo(CHECK * 0.44, CHECK * 0.68);
  p.lineTo(CHECK * 0.74, CHECK * 0.34);
  return p;
})();

/** A lit lime bead with a dark tick cut into it. */
function Check() {
  const c = CHECK / 2;
  return (
    <Canvas style={styles.check}>
      <Circle cx={c} cy={c} r={c * 0.92}>
        <RadialGradient
          c={vec(c * 0.7, c * 0.6)}
          r={c * 1.3}
          colors={[scene.specular, colors.accent, colors.bg]}
          positions={[0, 0.3, 1]}
        />
      </Circle>
      <Path path={tick} style="stroke" strokeWidth={CHECK * 0.12} strokeCap="round" strokeJoin="round" color={colors.bg} />
    </Canvas>
  );
}

const styles = StyleSheet.create({
  // Full screen, no chrome: the floodlit scene, the copy, what unlocked and the way on.
  screen: { flex: 1, backgroundColor: colors.bg, overflow: 'hidden' },
  stage: { alignItems: 'center' },
  bottom: { flex: 1, justifyContent: 'flex-end', paddingHorizontal: space.lg },
  title: { ...type.h1, color: colors.text, textAlign: 'center' },
  body: { ...type.body, color: colors.muted, textAlign: 'center', marginTop: space.sm },
  list: { marginTop: space.lg, marginBottom: space.lg, gap: space.sm, alignSelf: 'center' },
  item: { flexDirection: 'row', alignItems: 'center', gap: space.sm, opacity: opacity.full },
  itemText: { ...type.body, color: colors.text },
  check: { width: CHECK, height: CHECK },
});
