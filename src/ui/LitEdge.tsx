import { useState, type ReactNode } from 'react';
import { StyleSheet, View, type LayoutChangeEvent, type StyleProp, type ViewStyle } from 'react-native';
import { BlurMask, Canvas, LinearGradient, Rect, RoundedRect, vec } from '@shopify/react-native-skia';
import { colors, opacity, radius, space, stroke } from './tokens';

/**
 * A subtle lit edge round the one control a screen is built around: a soft
 * lime glow falling off beneath it, and a fine highlight along its top edge
 * as if a floodlight caught it. The control itself, its target and its
 * states are unchanged.
 */
export function LitEdge({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  const [box, setBox] = useState<{ w: number; h: number } | null>(null);
  const bleed = space.md;
  return (
    <View
      style={[styles.wrap, style]}
      onLayout={(e: LayoutChangeEvent) => setBox({ w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height })}
    >
      {box ? (
        <Canvas
          pointerEvents="none"
          style={[styles.layer, { left: -bleed, top: -bleed, width: box.w + bleed * 2, height: box.h + bleed * 2 }]}
        >
          <RoundedRect
            x={bleed + stroke.medium}
            y={bleed + space.xs}
            width={box.w - stroke.medium * 2}
            height={box.h}
            r={radius.lg}
            color={colors.accent}
            opacity={opacity.inactive}
          >
            <BlurMask blur={space.sm + space.xs} style="normal" />
          </RoundedRect>
        </Canvas>
      ) : null}
      {children}
      {box ? (
        <Canvas
          pointerEvents="none"
          style={[styles.layer, { left: radius.md, top: stroke.hairline, width: box.w - radius.md * 2, height: stroke.medium }]}
        >
          <Rect x={0} y={0} width={box.w - radius.md * 2} height={stroke.medium} opacity={opacity.secondary}>
            <LinearGradient
              start={vec(0, 0)}
              end={vec(box.w - radius.md * 2, 0)}
              colors={['transparent', colors.text, 'transparent']}
            />
          </Rect>
        </Canvas>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: 'relative' },
  layer: { position: 'absolute' },
});
