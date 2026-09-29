import { useCallback, useEffect, useRef, useState } from 'react';
import { BackHandler, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { Redirect, useFocusEffect, useRouter } from 'expo-router';
import { BlurMask, Canvas, LinearGradient, Path, Rect, Skia, vec } from '@shopify/react-native-skia';
import Animated, {
  Easing,
  useAnimatedReaction,
  useAnimatedStyle,
  useDerivedValue,
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
import { CELEBRATE, checkAt, copyAt, glowAt, itemAt, pushAt, UNLOCKED } from '../src/ui/celebrationScene';
import { GlossCard, IconBadge, type StatIconName } from '../src/ui/GlossCard';
import { colors, opacity, radius, size, space, type } from '../src/ui/tokens';

/** The lit icon on each unlocked card, in UNLOCKED's order. */
const UNLOCKED_ICON: Record<(typeof UNLOCKED)[number], StatIconName> = {
  'Unlimited analyses': 'measured',
  'Watermark-free exports': 'export',
  'Higher recording quality': 'quality',
  'Compare deliveries': 'compare',
  'Your stats': 'trend',
};

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
      {/* Scrolls only if large text needs more room than half the screen, so
          the button is always reachable. */}
      <ScrollView
        style={styles.bottomScroll}
        contentContainerStyle={[styles.bottom, { paddingBottom: insets.bottom + space.lg }]}
        showsVerticalScrollIndicator={false}
      >
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
          <GlowSweep t={t} />
        </View>
        <ActionButton label={exit.label} onPress={go} />
      </ScrollView>
    </View>
  );
}

/**
 * One thing Pro unlocks, as a lit card: it slides in and fades up, then its
 * lime check draws itself, one card after another.
 */
function Unlocked({ t, index, label }: { t: SharedValue<number>; index: number; label: (typeof UNLOCKED)[number] }) {
  const style = useAnimatedStyle(() => ({
    opacity: itemAt(t.value, index),
    transform: [{ translateX: (1 - itemAt(t.value, index)) * -space.lg }],
  }));
  const drawn = useDerivedValue(() => checkAt(t.value, index));
  return (
    <Animated.View style={style}>
      <GlossCard style={styles.card} accessibilityLabel={`${label}, unlocked.`}>
        <IconBadge name={UNLOCKED_ICON[label]} small />
        <Text style={styles.itemText}>{label}</Text>
        <Canvas style={styles.check} pointerEvents="none">
          <Path path={TICK} style="stroke" strokeWidth={stroke} strokeCap="round" strokeJoin="round" color={colors.accent} opacity={opacity.inactive} end={drawn}>
            <BlurMask blur={stroke} style="normal" />
          </Path>
          <Path path={TICK} style="stroke" strokeWidth={stroke} strokeCap="round" strokeJoin="round" color={colors.accent} end={drawn} />
        </Canvas>
      </GlossCard>
    </Animated.View>
  );
}

const CHECK = size.iconBadgeSmall;
const stroke = CHECK * 0.1;
/** A tick, drawn from its short stroke to its long one. */
const TICK = (() => {
  const p = Skia.Path.Make();
  p.moveTo(CHECK * 0.24, CHECK * 0.52);
  p.lineTo(CHECK * 0.42, CHECK * 0.7);
  p.lineTo(CHECK * 0.78, CHECK * 0.3);
  return p;
})();

/**
 * Once every card is in and ticked, a soft band of light crosses the list
 * once, left to right, and is gone. Never loops; reduced motion never sees it.
 */
function GlowSweep({ t }: { t: SharedValue<number> }) {
  const [box, setBox] = useState({ w: 0, h: 0 });
  const band = Math.max(box.w * 0.45, size.target);
  const style = useAnimatedStyle(() => {
    const g = glowAt(t.value);
    return {
      opacity: g.opacity * opacity.band,
      transform: [{ translateX: -band + (box.w + band) * g.at }],
    };
  });
  return (
    <View
      style={[StyleSheet.absoluteFill, styles.glowClip]}
      pointerEvents="none"
      onLayout={(e) => setBox({ w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height })}
    >
      {box.w > 0 ? (
        <Animated.View style={[StyleSheet.absoluteFill, { width: band }, style]}>
          <Canvas style={StyleSheet.absoluteFill}>
            <Rect x={0} y={0} width={band} height={box.h}>
              <LinearGradient
                start={vec(0, 0)}
                end={vec(band, 0)}
                colors={['transparent', colors.accent, colors.text, colors.accent, 'transparent']}
                positions={[0, 0.35, 0.5, 0.65, 1]}
              />
            </Rect>
          </Canvas>
        </Animated.View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  // Full screen, no chrome: the floodlit scene, the copy, what unlocked and the way on.
  screen: { flex: 1, backgroundColor: colors.bg, overflow: 'hidden' },
  stage: { alignItems: 'center' },
  bottomScroll: { flex: 1 },
  bottom: { flexGrow: 1, justifyContent: 'flex-end', paddingHorizontal: space.lg },
  title: { ...type.h1, color: colors.text, textAlign: 'center' },
  body: { ...type.body, color: colors.muted, textAlign: 'center', marginTop: space.sm },
  list: { marginTop: space.md, marginBottom: space.lg, gap: space.xs },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    paddingVertical: space.xs,
    paddingHorizontal: space.sm,
  },
  itemText: { ...type.body, color: colors.text, fontWeight: '700', flex: 1, flexShrink: 1 },
  check: { width: CHECK, height: CHECK },
  // The sweep stays within the list's own rounded edge.
  glowClip: { overflow: 'hidden', borderRadius: radius.lg },
});
