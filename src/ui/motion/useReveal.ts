import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { LayoutChangeEvent } from 'react-native';
import { useNavigation } from 'expo-router';
import {
  Easing,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';
// Reanimated's own peer, pinned by the worklets override in package.json.
import { scheduleOnRN } from 'react-native-worklets';
import { revealStart } from '../reading';
import { shouldStartReveal } from '../reveal';
import { motion } from '../tokens';

const SETTLE = Easing.bezier(...motion.settleCurve);

/** The one driver a reading's reveal is drawn from. */
export type Reveal = {
  /** 0 to 1 over motion.countUp on the settle curve, on the UI thread. */
  progress: SharedValue<number>;
  /** 0 to 1 once the sweep has landed: the colour turning lime, after the bail falls. */
  landed: SharedValue<number>;
  /** On the JS side, whether it has landed. True from the start when still. */
  done: boolean;
  /** Reduced motion: final from the first frame, nothing counting. */
  still: boolean;
  /** Put on the view the reveal is drawn in. The sweep waits for it. */
  onLayout: (e: LayoutChangeEvent) => void;
};

/** Only the one navigation event this needs, so the hook works under any navigator. */
type TransitionEvents = {
  addListener: (
    event: 'transitionEnd',
    listener: (e: { data?: { closing?: boolean } }) => void
  ) => () => void;
};

/**
 * Drives the sweep of a reading from zero to its value, once.
 *
 * It starts only when the reading is ready, its view has been laid out and the
 * screen has finished arriving, then one frame later, so the first frame of the
 * sweep is drawn at zero. From there it runs entirely on the UI thread: no
 * React state and no timer moves it, so a busy JS thread cannot stall it.
 */
export function useReveal({
  ready,
  afterTransition = true,
}: {
  ready: boolean;
  /**
   * Wait for the screen's push transition to end. Off for a screen that is
   * not pushed, such as Home, where there is no transition to wait for.
   */
  afterTransition?: boolean;
}): Reveal {
  const still = useReducedMotion();
  const start = revealStart(1, still);
  const progress = useSharedValue(start.shown);
  const landed = useSharedValue(start.landed);
  const [done, setDone] = useState(still);
  const [laidOut, setLaidOut] = useState(false);
  const [settled, setSettled] = useState(!afterTransition);
  const started = useRef(false);
  const navigation = useNavigation<TransitionEvents>();

  // Subscribed before the first paint, so a short transition cannot end
  // before anyone is listening.
  useLayoutEffect(() => {
    if (settled) return;
    const unsubscribe = navigation.addListener('transitionEnd', (e) => {
      if (!e.data?.closing) setSettled(true);
    });
    // A screen that arrives without a transition never reports one.
    const fallback = setTimeout(() => setSettled(true), motion.revealWait);
    return () => {
      unsubscribe();
      clearTimeout(fallback);
    };
  }, [navigation, settled]);

  const onLayout = useCallback((e: LayoutChangeEvent) => {
    if (e.nativeEvent.layout.width > 0) setLaidOut(true);
  }, []);

  useEffect(() => {
    if (still) {
      progress.value = 1;
      landed.value = 1;
      setDone(true);
      return;
    }
    if (!shouldStartReveal({ ready, laidOut, settled, started: started.current })) return;
    // One frame on, so the sweep's clock starts on a frame that is drawn.
    const frame = requestAnimationFrame(() => {
      started.current = true;
      progress.value = 0;
      progress.value = withTiming(1, { duration: motion.countUp, easing: SETTLE }, (finished) => {
        if (!finished) return;
        // After the bail has fallen, over the same time the wicket turns.
        landed.value = withDelay(
          motion.lock.bail,
          withTiming(1, { duration: motion.lock.colour, easing: Easing.linear })
        );
        scheduleOnRN(setDone, true);
      });
    });
    return () => cancelAnimationFrame(frame);
  }, [still, ready, laidOut, settled, progress, landed]);

  return { progress, landed, done, still, onLayout };
}
