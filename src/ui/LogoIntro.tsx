import { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { useVideoPlayer, VideoView } from 'expo-video';
import Animated, {
  FadeIn,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
// Reanimated's own peer, pinned by the worklets override in package.json.
import { scheduleOnRN } from 'react-native-worklets';
import { usePurchases } from '../purchases';
import { getSettings } from '../settings';
import { LaunchIntro } from './LaunchIntro';
import { badgeTop, introStart, nextIntroPhase, type IntroEvent, type IntroPhase } from './logoIntroPlan';
import { colors, motion, radius, space, stroke, type } from './tokens';

const SOURCE = require('../../assets/intro/logo-reveal.mp4');

/** Once per launch of the app's process: a warm return to the app never plays it again. */
let played = false;

/**
 * The logo intro, over the root stack on a cold start, straight after the
 * native splash: the logo reveal video, full length, for everyone. A tap
 * anywhere skips it, and reduced motion never shows it. For Pro, a small lime
 * PRO badge shows under the logo when the video ends, then it fades into Home.
 * Its sound follows Settings (on by default) and never stops the user's own
 * music. If the video cannot play, the drawn intro runs instead. Whatever
 * happens, the app is never held behind it for more than motion.logoIntro.cap.
 */
export function LogoIntro() {
  const reduced = useReducedMotion();
  const [phase, setPhase] = useState<IntroPhase>(() => introStart({ played, reduced }));
  const { isPro } = usePurchases();
  const proRef = useRef(isPro);
  proRef.current = isPro;
  const started = useRef(Date.now());

  const send = useCallback((event: IntroEvent) => {
    setPhase((current) => nextIntroPhase(current, event, proRef.current));
  }, []);

  useEffect(() => {
    played = true;
    // The hard stop: never longer than this from the first frame, whatever the video does.
    const cap = setTimeout(() => send('cap'), motion.logoIntro.cap);
    return () => clearTimeout(cap);
  }, [send]);

  // Pro's badge holds for its time, or for what is left before the cap.
  useEffect(() => {
    if (phase !== 'badge') return;
    const left = motion.logoIntro.cap - motion.logoIntro.fade - (Date.now() - started.current);
    const hold = setTimeout(() => send('badgeShown'), Math.max(0, Math.min(motion.logoIntro.badge, left)));
    return () => clearTimeout(hold);
  }, [phase, send]);

  // Only a Pro run reaches the badge, and it stays while the intro fades out.
  const badged = useRef(false);
  if (phase === 'badge') badged.current = true;

  if (phase === 'done') return null;
  // The video could not play: the drawn intro, which ends itself.
  if (phase === 'fallback') return <LaunchIntro />;
  return <IntroVideo phase={phase} badge={badged.current} send={send} />;
}

function IntroVideo({
  phase,
  badge,
  send,
}: {
  phase: IntroPhase;
  badge: boolean;
  send: (event: IntroEvent) => void;
}) {
  const { width, height } = useWindowDimensions();
  const player = useVideoPlayer(SOURCE, (p) => {
    p.loop = false;
    p.muted = !getSettings().introSound;
    // Alongside whatever the user is listening to, never stopping it.
    p.audioMixingMode = 'mixWithOthers';
    p.play();
  });

  useEffect(() => {
    const ended = player.addListener('playToEnd', () => send('ended'));
    const status = player.addListener('statusChange', ({ status: now }) => {
      if (now === 'error') send('error');
    });
    return () => {
      ended.remove();
      status.remove();
    };
  }, [player, send]);

  const shown = useSharedValue(1);
  useEffect(() => {
    if (phase !== 'leaving') return;
    shown.value = withTiming(0, { duration: motion.logoIntro.fade }, (finished) => {
      if (finished) scheduleOnRN(send, 'left');
    });
  }, [phase, shown, send]);
  const fade = useAnimatedStyle(() => ({ opacity: shown.value }));

  return (
    <Animated.View style={[StyleSheet.absoluteFill, styles.overlay, fade]}>
      <Pressable
        style={StyleSheet.absoluteFill}
        onPress={() => send('tap')}
        accessibilityRole="button"
        accessibilityLabel="Paceball. Skip the intro"
      >
        {/* Contained, on the video's own background: nothing is cropped on
            any screen shape, and there is no seam. */}
        <VideoView
          player={player}
          style={StyleSheet.absoluteFill}
          contentFit="contain"
          nativeControls={false}
          pointerEvents="none"
        />
        {badge && width > 0 ? (
          <Animated.View
            entering={FadeIn.duration(motion.fade)}
            style={[styles.badgeRow, { top: badgeTop(width, height, space.md) }]}
            pointerEvents="none"
          >
            <View style={styles.badge}>
              <Text style={styles.badgeText}>PRO</Text>
            </View>
          </Animated.View>
        ) : null}
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  overlay: { backgroundColor: colors.bg },
  badgeRow: { position: 'absolute', left: space.md, right: space.md, alignItems: 'center' },
  badge: {
    borderWidth: stroke.medium,
    borderColor: colors.accent,
    borderRadius: radius.pill,
    paddingHorizontal: space.md,
    paddingVertical: space.xs,
    backgroundColor: colors.bg,
  },
  badgeText: { ...type.label, color: colors.accent },
});
