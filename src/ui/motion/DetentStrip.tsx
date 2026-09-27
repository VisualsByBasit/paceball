import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
} from 'react-native-reanimated';
// Reanimated's own peer, pinned by the worklets override in package.json.
import { scheduleOnRN } from 'react-native-worklets';
import * as Haptics from 'expo-haptics';
import { colors, motion, opacity, radius, size, space, stroke } from '../tokens';

/** A bar at rest, and the selected one, which grows to nearly fill the strip. */
const BAR_REST = space.md;
const BAR_SELECTED = size.detent - space.xl;

function clamp(n: number, lo: number, hi: number): number {
  'worklet';
  return Math.min(hi, Math.max(lo, n));
}

type DetentStripProps = {
  count: number;
  /** The selected item. Changing it from outside moves the playhead there. */
  index: number;
  /**
   * The furthest item the playhead may reach, when that is short of the end.
   * On Mark it is the last frame decoded so far: scrubbing past it would show
   * one frame while recording another's number. Items beyond it are dimmed.
   */
  max?: number;
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
 * The gesture is a PanResponder. Touches arrive on the JS thread; everything
 * after that (the spring, the selection, the selected bar) runs on the UI
 * thread. The bars themselves are plain views drawn once; only the selected
 * one moves, so a clip of hundreds of frames costs one animated bar, not
 * hundreds.
 */
export function DetentStrip({ count, index, max, onChange, accessibilityLabel }: DetentStripProps) {
  const [width, setWidth] = useState(0);
  const item = width > 0 && count > 0 ? width / count : 0;
  const limit = Math.max(0, Math.min(count - 1, max ?? count - 1));

  // Where the playhead is, in px from the strip's left edge. React never
  // re-renders for it.
  const playhead = useSharedValue(0);
  // Whether the hand is driving. Only then do crossings tick and report: a
  // move made by changing `index` is the parent's own doing.
  const byHand = useSharedValue(false);
  // While a throw lands, the selection is held between where it was and where
  // it is going, so the spring's overshoot moves the line but cannot select
  // the item past the target and tick back.
  const lo = useSharedValue(0);
  const hi = useSharedValue(limit);

  // Derived values recompute on the UI thread whenever a shared value they
  // read changes. Plain JS values they close over, like `item`, are captured
  // at render; a new one rebuilds the worklet.
  const selected = useDerivedValue(() => {
    if (item <= 0) return -1;
    return clamp(Math.floor(playhead.value / item), lo.value, hi.value);
  });

  const geometry = useRef({ width, count, limit });
  const onChangeRef = useRef(onChange);
  const lastReported = useRef(index);
  useEffect(() => {
    geometry.current = { width, count, limit };
    // Frames arriving widen the reach at once, unless a throw is landing.
    if (lo.value === 0) hi.value = limit;
  }, [width, count, limit, lo, hi]);
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
  // worklet, so anything that has to happen in JS (haptics, React state) is
  // handed back with scheduleOnRN.
  useAnimatedReaction(
    () => selected.value,
    (next, prev) => {
      if (prev === null || prev < 0 || next < 0 || next === prev) return;
      if (byHand.value) scheduleOnRN(crossed, next);
    }
  );

  // The selected bar grows as it becomes the selected one.
  const grow = useSharedValue(BAR_SELECTED);
  useAnimatedReaction(
    () => selected.value,
    (next, prev) => {
      if (prev === null || next === prev) return;
      grow.value = BAR_REST;
      grow.value = withSpring(BAR_SELECTED, motion.pop);
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
    hi.value = limit;
    const x = (clamp(index, 0, limit) + 0.5) * item;
    playhead.value = sameGeometry ? withSpring(x, motion.settle) : x;
  }, [index, item, count, limit, playhead, byHand, lo, hi]);

  const pan = useMemo(() => {
    let originX = 0;

    const follow = (x: number) => {
      const { width: w, count: n, limit: last } = geometry.current;
      if (w <= 0 || n <= 0) return;
      const cell = w / n;
      // A fresh spring on every move. It starts from wherever the playhead is,
      // at whatever speed it already has, so it trails the finger smoothly.
      playhead.value = withSpring(clamp(x, cell / 2, (last + 0.5) * cell), motion.drag);
    };

    const land = (x: number, vx: number) => {
      const { width: w, count: n, limit: last } = geometry.current;
      if (w <= 0 || n <= 0) return;
      const cell = w / n;
      // vx is px per ms. Carry the release on a little, then land on an item.
      const target = clamp(Math.floor((x + vx * motion.throw) / cell), 0, last);
      const from = selected.value;
      lo.value = Math.min(from, target);
      hi.value = Math.max(from, target);
      playhead.value = withSpring((target + 0.5) * cell, motion.settle, (finished) => {
        if (finished) {
          lo.value = 0;
          hi.value = last;
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
        hi.value = geometry.current.limit;
        follow(originX);
      },
      // Tracked as an offset from where the finger landed. locationX drifts
      // once the drag leaves the strip; grant point plus dx does not.
      onPanResponderMove: (_e, g) => follow(originX + g.dx),
      onPanResponderRelease: (_e, g) => land(originX + g.dx, g.vx),
      onPanResponderTerminate: (_e, g) => land(originX + g.dx, g.vx),
    });
  }, [playhead, byHand, lo, hi, selected]);

  const onAccessibilityAction = (e: AccessibilityActionEvent) => {
    const { actionName } = e.nativeEvent;
    const step = actionName === 'increment' ? 1 : actionName === 'decrement' ? -1 : 0;
    const next = clamp(index + step, 0, limit);
    if (next !== index) onChange(next);
  };

  const head = useAnimatedStyle(() => ({
    opacity: item > 0 ? opacity.full : 0,
    transform: [{ translateX: playhead.value - stroke.medium / 2 }],
  }));

  // Never thinner than a heavy stroke, so it can be seen on a long clip where
  // each frame is under a dp wide.
  const barWidth = Math.max(item / 2, stroke.heavy);
  const lit = useAnimatedStyle(() => ({
    opacity: selected.value < 0 ? 0 : opacity.full,
    height: grow.value,
    transform: [{ translateX: (selected.value + 0.5) * item - barWidth / 2 }],
  }));

  return (
    <View
      style={styles.strip}
      onLayout={(e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width)}
      accessible
      accessibilityRole="adjustable"
      accessibilityLabel={accessibilityLabel}
      accessibilityValue={{ min: 0, max: limit, now: index }}
      accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
      onAccessibilityAction={onAccessibilityAction}
      {...pan.panHandlers}
    >
      <Bars count={count} limit={limit} />
      <View style={styles.litRow} pointerEvents="none">
        <Animated.View style={[styles.lit, { width: barWidth }, lit]} />
      </View>
      <Animated.View style={[styles.head, head]} pointerEvents="none" />
    </View>
  );
}

/** Every item as a resting bar, drawn once. Those past the reachable limit are dimmed. */
const Bars = memo(function Bars({ count, limit }: { count: number; limit: number }) {
  return (
    <View style={styles.bars} pointerEvents="none">
      {Array.from({ length: count }, (_, i) => (
        <View key={i} style={styles.cell}>
          <View style={[styles.bar, i > limit && styles.unreached]} />
        </View>
      ))}
    </View>
  );
});

const styles = StyleSheet.create({
  strip: {
    height: size.detent,
    borderRadius: radius.sm,
    backgroundColor: colors.surface,
    overflow: 'hidden',
  },
  bars: {
    ...StyleSheet.absoluteFill,
    flexDirection: 'row',
    alignItems: 'center',
  },
  cell: { flex: 1, height: '100%', alignItems: 'center', justifyContent: 'center' },
  bar: {
    width: '50%',
    minWidth: stroke.hairline,
    height: BAR_REST,
    borderRadius: radius.pill,
    backgroundColor: colors.muted,
  },
  unreached: { opacity: opacity.disabled },
  litRow: { ...StyleSheet.absoluteFill, justifyContent: 'center' },
  lit: { borderRadius: radius.pill, backgroundColor: colors.accent },
  head: {
    ...StyleSheet.absoluteFill,
    top: space.xs,
    bottom: space.xs,
    width: stroke.medium,
    backgroundColor: colors.text,
  },
});
