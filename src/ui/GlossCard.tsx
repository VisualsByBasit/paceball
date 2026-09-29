import { useMemo, useState, type ReactNode } from 'react';
import {
  Pressable,
  StyleSheet,
  View,
  type LayoutChangeEvent,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import {
  BlurMask,
  Canvas,
  Circle,
  Group,
  LinearGradient,
  Path,
  RadialGradient,
  RoundedRect,
  Skia,
  vec,
} from '@shopify/react-native-skia';
import { interpolateColor } from 'react-native-reanimated';
import { colors, opacity, radius, scene, size, space, stroke } from './tokens';

// Shades mixed from the tokens, as the 3D kit mixes its own: the card's lit top,
// and a lime that has caught the floodlight.
const SURFACE_LIT = interpolateColor(0.07, [0, 1], [colors.surface, colors.text]);
const LIME_LIT = interpolateColor(0.35, [0, 1], [colors.accent, colors.text]);
const BADGE_LIT = interpolateColor(0.14, [0, 1], [colors.surface, colors.text]);

type GlossCardProps = {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  onPress?: () => void;
  accessibilityLabel?: string;
};

/**
 * A card with depth, lit like the 3D kit: a soft gradient from a floodlit top
 * down to the night, a fine highlight along its top edge, and a soft shadow
 * beneath. Everything drawn sits behind the content in a canvas of its own;
 * the text is ordinary views, so it wraps and scales like any other.
 */
export function GlossCard({ children, style, onPress, accessibilityLabel }: GlossCardProps) {
  const [box, setBox] = useState<{ w: number; h: number } | null>(null);
  const bleed = space.md;
  const onLayout = (e: LayoutChangeEvent) =>
    setBox({ w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height });

  const backdrop = box ? (
    <Canvas
      pointerEvents="none"
      style={[styles.layer, { left: -bleed, top: -bleed, width: box.w + bleed * 2, height: box.h + bleed * 2 }]}
    >
      {/* The shadow, falling a little below the card. */}
      <RoundedRect x={bleed + space.xs} y={bleed + space.sm} width={box.w - space.sm} height={box.h - space.xs} r={radius.lg} color={scene.night} opacity={opacity.scrim}>
        <BlurMask blur={space.md - space.xs} style="normal" />
      </RoundedRect>
      <RoundedRect x={bleed} y={bleed} width={box.w} height={box.h} r={radius.lg}>
        <LinearGradient start={vec(0, bleed)} end={vec(0, bleed + box.h)} colors={[SURFACE_LIT, colors.surface, colors.bg]} positions={[0, 0.45, 1]} />
      </RoundedRect>
      {/* The rim, brightest where the light falls on the top edge. */}
      <RoundedRect x={bleed + stroke.hairline / 2} y={bleed + stroke.hairline / 2} width={box.w - stroke.hairline} height={box.h - stroke.hairline} r={radius.lg} style="stroke" strokeWidth={stroke.hairline}>
        <LinearGradient start={vec(0, bleed)} end={vec(0, bleed + box.h)} colors={[colors.control, colors.line, colors.line]} positions={[0, 0.3, 1]} />
      </RoundedRect>
      <RoundedRect x={bleed + radius.lg} y={bleed} width={box.w - radius.lg * 2} height={stroke.hairline} r={0} opacity={opacity.secondary}>
        <LinearGradient start={vec(bleed + radius.lg, 0)} end={vec(bleed + box.w - radius.lg, 0)} colors={['transparent', colors.text, 'transparent']} />
      </RoundedRect>
    </Canvas>
  ) : null;

  if (onPress) {
    return (
      <Pressable
        style={[styles.card, style]}
        onLayout={onLayout}
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel}
      >
        {backdrop}
        {children}
      </Pressable>
    );
  }
  return (
    <View style={[styles.card, style]} onLayout={onLayout} accessibilityLabel={accessibilityLabel}>
      {backdrop}
      {children}
    </View>
  );
}

export type StatIconName =
  | 'deliveries'
  | 'measured'
  | 'week'
  | 'best'
  | 'trend'
  | 'bars'
  | 'gauge'
  | 'donut'
  | 'lock'
  | 'export'
  | 'quality'
  | 'compare';

/** Line icons on a 24 unit grid, drawn with round caps. */
const ICONS: Record<StatIconName, string> = {
  // A ball and its seam.
  deliveries: 'M12 4a8 8 0 1 0 0.01 0 M8 6.6c2.2 3 2.2 7.8 0 10.8 M16 6.6c-2.2 3 -2.2 7.8 0 10.8',
  // A speedometer and its needle.
  measured: 'M4.5 16.5a8 8 0 1 1 15 0 M12 15.5l4 -6',
  // A calendar page.
  week: 'M5 6.5h14v12.5h-14z M5 10.5h14 M9 4.5v4 M15 4.5v4',
  // A bolt: the fastest.
  best: 'M13.5 3.5l-7 10h5l-1 7l7.5 -10.5h-5z',
  // A line rising through readings.
  trend: 'M4 17l5 -5l4 3l7 -8 M15 7h5v5',
  // Three bars on a baseline.
  bars: 'M4 19.5h16 M7 19v-6 M12 19v-12 M17 19v-8',
  // A half dial.
  gauge: 'M4 17a8 8 0 0 1 16 0 M12 17l-3.5 -5',
  // A ring with its share cut out.
  donut: 'M12 4a8 8 0 1 0 8 8 M12 4v8h8',
  // A padlock.
  lock: 'M7 11h10v8.5h-10z M9 11v-2.5a3 3 0 0 1 6 0v2.5',
  // Out of the box: sharing.
  export: 'M12 14.5v-10.5 M8 8l4 -4l4 4 M5 12v7.5h14v-7.5',
  // A camera.
  quality: 'M4 8h4l1.8 -2.5h4.4l1.8 2.5h4v11h-16z M12 16.5a3.2 3.2 0 1 0 0.01 0',
  // Two deliveries side by side.
  compare: 'M8 5v14 M16 5v14 M4.5 8.5l3.5 -3.5l3.5 3.5 M12.5 15.5l3.5 3.5l3.5 -3.5',
};

/** A single icon, in the colour given. Decorative: the words beside it carry the meaning. */
export function StatIcon({ name, color, dim = size.icon }: { name: StatIconName; color: string; dim?: number }) {
  const path = useMemo(() => Skia.Path.MakeFromSVGString(ICONS[name]), [name]);
  const scale = dim / 24;
  return (
    <Canvas style={{ width: dim, height: dim }} pointerEvents="none">
      {path ? (
        <Group transform={[{ scale }]}>
          <Path path={path} style="stroke" strokeWidth={stroke.medium * 0.9} strokeCap="round" strokeJoin="round" color={color} />
        </Group>
      ) : null}
    </Canvas>
  );
}

/**
 * An icon in a lit round badge, like a lamp on the instrument: domed, lit from
 * the upper left, with a lime glow when the tile it heads is live. A locked
 * tile's badge is unlit.
 */
export function IconBadge({ name, live = true, small = false }: { name: StatIconName; live?: boolean; small?: boolean }) {
  const d = small ? size.iconBadgeSmall : size.iconBadge;
  const r = d / 2;
  return (
    <View style={[styles.badge, small && styles.badgeSmall]} importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
      <Canvas style={StyleSheet.absoluteFill} pointerEvents="none">
        {live ? (
          <Circle cx={r} cy={r} r={r * 0.8} color={colors.accent} opacity={opacity.faint}>
            <BlurMask blur={r * 0.35} style="normal" />
          </Circle>
        ) : null}
        <Circle cx={r} cy={r} r={r - stroke.hairline}>
          <RadialGradient c={vec(r * 0.7, r * 0.55)} r={r * 1.3} colors={[BADGE_LIT, colors.surface, colors.bg]} positions={[0, 0.5, 1]} />
        </Circle>
        <Circle cx={r} cy={r} r={r - stroke.hairline} style="stroke" strokeWidth={stroke.hairline} color={live ? colors.control : colors.line} />
      </Canvas>
      <StatIcon name={name} color={live ? LIME_LIT : colors.muted} dim={small ? size.iconSmall : size.icon} />
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: radius.lg, padding: space.md },
  layer: { position: 'absolute' },
  badge: {
    width: size.iconBadge,
    height: size.iconBadge,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeSmall: { width: size.iconBadgeSmall, height: size.iconBadgeSmall },
});
