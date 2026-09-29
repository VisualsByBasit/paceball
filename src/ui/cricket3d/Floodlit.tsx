import { useState, type ReactNode } from 'react';
import { StyleSheet, View, type LayoutChangeEvent, type StyleProp, type ViewStyle } from 'react-native';
import { Canvas, LinearGradient, Rect, vec } from '@shopify/react-native-skia';
import { colors, opacity, radius } from '../tokens';
import { Ball3D, Pitch3D, Stadium3D, Wicket3D } from './Kit';
import { camera } from './geometry';

/**
 * A card on a floodlit night: the kit's stadium behind whatever it holds,
 * dimmed towards the foot so text on it keeps its contrast. The backdrop is
 * static and drawn once, at the card's own size.
 */
export function FloodlitPanel({
  children,
  style,
  intensity = opacity.secondary,
}: {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  intensity?: number;
}) {
  const [box, setBox] = useState<{ w: number; h: number } | null>(null);
  return (
    <View
      style={[styles.panel, style]}
      onLayout={(e: LayoutChangeEvent) => setBox({ w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height })}
    >
      {box ? (
        <Canvas style={StyleSheet.absoluteFill} pointerEvents="none">
          <Stadium3D width={box.w} height={box.h} horizon={box.h * 0.62} intensity={intensity} />
          <Rect x={0} y={0} width={box.w} height={box.h}>
            <LinearGradient
              start={vec(0, box.h * 0.35)}
              end={vec(0, box.h)}
              colors={['transparent', colors.bg]}
            />
          </Rect>
        </Canvas>
      ) : null}
      {children}
    </View>
  );
}

/**
 * A still life for an empty screen: the ball resting on the pitch in front of
 * the stumps, under the floodlights. Nothing moves and nothing is measured.
 */
export function CricketStill({ width, height }: { width: number; height: number }) {
  const horizon = height * 0.42;
  const focal = height * 1.5;
  const camH = 1.1;
  const stumpZ = 6;
  const cam = camera(width, horizon, focal, camH);
  const scale = focal / stumpZ;
  const foot = horizon + camH * scale;
  const stumpH = 0.71 * scale;
  const ballZ = stumpZ - 1.6;
  const ballScale = focal / ballZ;
  const ballR = 0.12 * ballScale;
  const ballX = width / 2 - 0.55 * ballScale;
  const ballY = horizon + camH * ballScale - ballR;
  return (
    <Canvas style={{ width, height }} pointerEvents="none">
      <Stadium3D width={width} height={height} horizon={horizon} />
      <Pitch3D width={width} height={height} cam={cam} stumpZ={stumpZ} />
      <Wicket3D x={width / 2} y={foot} height={stumpH} />
      <Ball3D cx={ballX} cy={ballY} r={ballR} spin={0.9} />
    </Canvas>
  );
}

const styles = StyleSheet.create({
  panel: { borderRadius: radius.xl, overflow: 'hidden', backgroundColor: colors.bg },
});
