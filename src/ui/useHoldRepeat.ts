import { useCallback, useEffect, useRef, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import { createHoldRepeat, type HoldRepeat } from './holdRepeat';
import { motion } from './tokens';

/**
 * Press handlers for a step button that repeats while held. Stops on release,
 * on cancel (onPressOut fires for both), when the screen loses focus and on
 * unmount, so nothing keeps stepping once the user has gone. A cancelled touch
 * leaves the button exactly as a released one does, so the next activation,
 * including a screen reader's, still steps.
 */
export function useHoldRepeat(onStep: (first: boolean) => void) {
  const onStepRef = useRef(onStep);
  useEffect(() => {
    onStepRef.current = onStep;
  }, [onStep]);

  const [hold] = useState<HoldRepeat>(() =>
    createHoldRepeat({
      delay: motion.holdDelay,
      interval: motion.holdRepeat,
      onStep: (first) => onStepRef.current(first),
    })
  );

  useFocusEffect(
    useCallback(() => () => hold.stop(), [hold])
  );
  useEffect(() => () => hold.stop(), [hold]);

  return {
    onPressIn: hold.pressIn,
    onPressOut: hold.stop,
    onPress: hold.press,
    stop: hold.stop,
  };
}
