import { useCallback, useEffect, useState } from 'react';
import { BackHandler, StyleSheet, Text, View } from 'react-native';
import { Redirect, useFocusEffect, useRouter } from 'expo-router';
import Animated, {
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ActionButton } from '../src/ui/ActionButton';
import { PurchaseEmblem } from '../src/ui/PurchaseEmblem';
import {
  armedCelebration,
  celebrationExit,
  clearCelebration,
  type CelebrationFrom,
} from '../src/ui/celebration';
import { colors, motion, space, type } from '../src/ui/tokens';

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
  const exit = celebrationExit(from);

  // Back to what started the purchase. The button works from the first frame:
  // nothing here has to be watched to the end.
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

  // The copy arrives once the bail has settled.
  const copyIn = useSharedValue(reduced ? 1 : 0);
  useEffect(() => {
    copyIn.value = reduced
      ? 1
      : withDelay(
          motion.celebrate.bail,
          withTiming(1, {
            duration: motion.celebrate.copy - motion.celebrate.bail,
            easing: Easing.linear,
          })
        );
  }, [reduced, copyIn]);
  const copy = useAnimatedStyle(() => ({ opacity: copyIn.value }));

  return (
    <View
      style={[
        styles.screen,
        { paddingTop: insets.top + space.xxl, paddingBottom: insets.bottom + space.lg },
      ]}
    >
      <View style={styles.middle}>
        <PurchaseEmblem />
        <Animated.View style={[styles.copy, copy]}>
          <Text style={styles.title} accessibilityRole="header">
            You're on Pro
          </Text>
          <Text style={styles.body}>More deliveries. The same honest readings.</Text>
        </Animated.View>
      </View>
      <ActionButton label={exit.label} onPress={go} />
    </View>
  );
}

const styles = StyleSheet.create({
  // Full screen, no chrome: the emblem, two lines and the way on.
  screen: { flex: 1, backgroundColor: colors.bg, paddingHorizontal: space.lg },
  middle: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  copy: { alignItems: 'center', marginTop: space.xl },
  title: { ...type.h1, color: colors.text, textAlign: 'center' },
  body: { ...type.body, color: colors.muted, textAlign: 'center', marginTop: space.sm },
});
