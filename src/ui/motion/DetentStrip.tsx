import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  PanResponder,
  StyleSheet,
  View,
  type AccessibilityActionEvent,
  type LayoutChangeEvent,
} from 'react-native';
import Animated, {
  useAnimatedReaction,
  useAnimatedStyle,
  useDerivedValue,
  useSharedValue,
  withSpring,
  withTiming,
  type DerivedValue,
} from 'react-native-reanimated';
// Reanimated's own peer, pinned by the worklets override in package.json.
import { scheduleOnRN } from 'react-native-worklets';
import * as Haptics from 'expo-haptics';
import { colors, motion, opacity, radius, stroke } from '../tokens';

/** Same height as the scrubber on Mark, so it can drop in there. */
const STRIP_HEIGHT = 56;
const BAR_REST = 16;
const BAR_SELECTED = 40;

function clamp(n: number, lo: number, hi: number): number {
  'worklet';
  return Math.min(hi, Math.max(lo, n));
}

type DetentStripProps = {
  count: number;
  /** The selected item. Changing it from outside moves the playhead there. */
  index: number;
  /** Fires once per item the playhead crosses under the hand, not only on release. */
  onChange: (index: number) => void;
  accessibilityLabel: string;
};

/**
 * A strip of `count` items with a playhead that has weight. It chases the
 * finger on a spring rather than sitting under it, carries a flick on, and
 * lands on the nearest item with a single overshoot. Every item it crosses
 * under the hand ticks the haptics and reports, so a screen scrubbing frames
 * follows along live.
 *
 * The gesture is a PanResponder, like the scrubber on Mark. Touches arrive on
 * the JS thread; everything after that — the spring, the selection, the bars —
 * runs on the UI thread.
 */
export function DetentStrip({ count, index, onChange, accessibilityLabel }: DetentStripProps) {
  const [width, setWidth] = useState(0);
  const item = width > 0 && count > 0 ? width / count : 0;

  // Where the playhead is, in px from the strip's left edge. React never
  // re-renders for it.
  const playhead = useSharedValue(0);
  // Whether the hand is driving. Only then do crossings tick and report — a
  // move made by changing `index` is the parent's own doing.
  const byHand = useSharedValue(false);
  // While a throw lands, the selection is held between where it was and where
  // it is going, so the spring's overshoot moves the line but cannot select
  // the item past the target and tick back.
  const lo = useSharedValue(0);
  const hi = useSharedValue(Math.max(0, count - 1));

  // Derived values recompute on the UI thread whenever a shared value they
  // read changes. Plain JS values they close over, like `item`, are captured
  // at render; a new one rebuilds the worklet.
  const selected = useDerivedValue(() => {
    if (item <= 0) return -1;
    return clamp(Math.floor(playhead.value / item), lo.value, hi.value);
  });

  const geometry = useRef({ width, count });
  const onChangeRef = useRef(onChange);
  const lastReported = useRef(index);
  useEffect(() => {
    geometry.current = { width, count };
  }, [width, count]);
  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  const crossed = useCallback((next: number) => {
    lastReported.current = next;
    // Haptics are garnish. A phone without a motor is not an error.
    Haptics.selectionAsync().catch(() => undefined);
    onChangeRef.current(next);
  }, []);

  // Watches a UI-thread value and reacts when it changes. The reaction is a
  // worklet, so anything that has to happen in JS — haptics, React state — is
  // handed back with scheduleOnRN.
  useAnimatedReaction(
    () => selected.value,
    (next, prev) => {
      if (prev === null || prev < 0 || next < 0 || next === prev) return;
      if (byHand.value) scheduleOnRN(crossed, next);
    }
  );

  // Puts the playhead on `index`. A new layout jumps there; a new index from
  // outside travels there with the same weight a throw lands with.
  const placedFor = useRef({ item: 0, count: 0 });
  useEffect(() => {
    if (item <= 0) return;
    const sameGeometry = placedFor.current.item === item && placedFor.current.count === count;
    placedFor.current = { item, count };
    // The hand already put it there; the parent is only catching up.
    if (sameGeometry && index === lastReported.current) return;

    lastReported.current = index;
    byHand.value = false;
    lo.value = 0;
    hi.value = count - 1;
    const x = (index + 0.5) * item;
    playhead.value = sameGeometry ? withSpring(x, motion.settle) : x;
  }, [index, item, count, playhead, byHand, lo, hi]);

  const pan = useMemo(() => {
    let originX = 0;

    const follow = (x: number) => {
      const { width: w, count: n } = geometry.current;
      if (w <= 0 || n <= 0) return;
      const half = w / n / 2;
      // A fresh spring on every move. It starts from wherever the playhead is,
      // at whatever speed it already has, so it trails the finger smoothly.
      playhead.value = withSpring(clamp(x, half, w - half), motion.drag);
    };

    const land = (x: number, vx: number) => {
      const { width: w, count: n } = geometry.current;
      if (w <= 0 || n <= 0) return;
      const size = w / n;
      // vx is px per ms. Carry the release on a little, then land on an item.
      const target = clamp(Math.floor((x + vx * motion.throw) / size), 0, n - 1);
      const from = selected.value;
      lo.value = Math.min(from, target);
      hi.value = Math.max(from, target);
      playhead.value = withSpring((target + 0.5) * size, motion.settle, (finished) => {
        if (finished) {
          lo.value = 0;
          hi.value = n - 1;
        }
      });
    };

    return PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderTerminationRequest: () => false,
      onPanResponderGrant: (e) => {
        originX = e.nativeEvent.locationX;
        byHand.value = true;
        lo.value = 0;
        hi.value = geometry.current.count - 1;
        follow(originX);
      },
      // Tracked as an offset from where the finger landed, as on Mark.
      // locationX drifts once the drag leaves the strip; grant point plus dx
      // does not.
      onPanResponderMove: (_e, g) => follow(originX + g.dx),
      onPanResponderRelease: (_e, g) => land(originX + g.dx, g.vx),
      onPanResponderTerminate: (_e, g) => land(originX + g.dx, g.vx),
    });
  }, [playhead, byHand, lo, hi, selected]);

  const onAccessibilityAction = (e: AccessibilityActionEvent) => {
    const { actionName } = e.nativeEvent;
    const step = actionName === 'increment' ? 1 : actionName === 'decrement' ? -1 : 0;
    const next = clamp(index + step, 0, count - 1);
    if (next !== index) onChange(next);
  };

  const head = useAnimatedStyle(() => ({
    opacity: item > 0 ? opacity.full : 0,
    transform: [{ translateX: playhead.value - stroke.medium / 2 }],
  }));

  const bars = useMemo(() => Array.from({ length: count }, (_, i) => i), [count]);

  return (
    <View
      style={styles.strip}
      onLayout={(e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width)}
      accessible
      accessibilityRole="adjustable"
      accessibilityLabel={accessibilityLabel}
      accessibilityValue={{ min: 0, max: Math.max(0, count - 1), now: index }}
      accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
      onAccessibilityAction={onAccessibilityAction}
      {...pan.panHandlers}
    >
      <View style={styles.bars} pointerEvents="none">
        {bars.map((i) => (
          <Bar key={i} i={i} selected={selected} />
        ))}
      </View>
      <Animated.View style={[styles.head, head]} pointerEvents="none" />
    </View>
  );
}

function Bar({ i, selected }: { i: number; selected: DerivedValue<number> }) {
  // Returning an animation from a style worklet animates to it. When this bar
  // becomes, or stops being, the selected one, it springs to its new height.
  const style = useAnimatedStyle(() => {
    const on = selected.value === i;
    return {
      height: withSpring(on ? BAR_SELECTED : BAR_REST, motion.pop),
      backgroundColor: withTiming(on ? colors.accent : colors.muted, { duration: motion.fade }),
    };
  });
  return (
    <View style={styles.cell}>
      <Animated.View style={[styles.bar, style]} />
    </View>
  );
}

const styles = StyleSheet.create({
  strip: {
    height: STRIP_HEIGHT,
    borderRadius: radius.sm,
    backgroundColor: colors.surface,
    overflow: 'hidden',
  },
  bars: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    flexDirection: 'row',
    alignItems: 'center',
  },
  cell: { flex: 1, height: '100%', alignItems: 'center', justifyContent: 'center' },
  bar: { width: '50%', minWidth: stroke.hairline, borderRadius: radius.pill },
  head: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    width: stroke.medium,
    backgroundColor: colors.text,
  },
});
