import { useMemo } from 'react';
import { Platform } from 'react-native';
import {
  BlurMask,
  Canvas,
  Circle,
  Group,
  Line,
  LinearGradient,
  matchFont,
  RadialGradient,
  Rect,
  RoundedRect,
  Shader,
  Text as SkiaText,
  vec,
  type SkFont,
} from '@shopify/react-native-skia';
import { useDerivedValue, type SharedValue } from 'react-native-reanimated';
import {
  Ball3D,
  effect,
  GroundShadow,
  MATERIAL,
  Pitch3D,
  Stadium3D,
  Wicket3D,
  wicketLayout,
  type BailMotion,
  type Camera,
} from './cricket3d';
import {
  badgeAt,
  bailAt,
  ballAt,
  flashAt,
  particleAt,
  PARTICLES,
  pushAt,
  shakeAt,
  stumpKick,
  type Particle,
} from './celebrationScene';
import { colors, opacity, radius, scene } from './tokens';

/** Where everything in the scene sits, from the screen size. */
export function celebrationLayout(width: number, height: number) {
  const sceneH = height * 0.5;
  const horizon = sceneH * 0.45;
  const foot = sceneH * 0.92;
  const camH = 1.1;
  const focal = height * 1.2;
  // The stumps stand where the ground at their foot says they are.
  const stumpZ = (camH * focal) / (foot - horizon);
  const stumpH = (0.71 * focal) / stumpZ;
  const cam: Camera = { cx: width / 2, horizon, focal, camH };
  const badgeW = Math.min(width * 0.46, stumpH * 1.9);
  const badgeH = badgeW * 0.4;
  return {
    sceneH,
    cam,
    stumpZ,
    foot,
    stumpH,
    x: width / 2,
    badge: { w: badgeW, h: badgeH, x: width / 2 - badgeW / 2, y: foot - stumpH * 1.55 - badgeH },
  };
}

/** The floodlit stadium and pitch behind the whole screen: static, drawn once. */
export function CelebrationBackdrop({ width, height }: { width: number; height: number }) {
  const l = celebrationLayout(width, height);
  return (
    <Canvas style={{ width, height }} pointerEvents="none">
      <Stadium3D width={width} height={height} horizon={l.cam.horizon} />
      <Pitch3D width={width} height={height} cam={l.cam} stumpZ={l.stumpZ} />
    </Canvas>
  );
}

/**
 * Everything that moves: the ball rockets in and smashes the stumps, they
 * kick back, both bails spin off and fall with their shadows, a burst of lime
 * and white light and a few sparks comes off the hit, and the metallic PRO
 * badge rises into place above the wicket with a light sweeping across it.
 */
export function CelebrationScene({ t, width, height }: { t: SharedValue<number>; width: number; height: number }) {
  const l = useMemo(() => celebrationLayout(width, height), [width, height]);
  const H = l.stumpH;
  const impact = { x: l.x, y: l.foot - H * 0.65 };

  const camera = useDerivedValue(() => {
    const s = shakeAt(t.value) * H;
    return [{ translateX: s }, { translateY: s * 0.6 }, { scale: pushAt(t.value) }];
  });
  const lean = useDerivedValue(() => [0, 1, 2].map((i) => stumpKick(t.value, i)));
  const bails = useDerivedValue<BailMotion[]>(() =>
    [0, 1].map((i) => {
      const b = bailAt(t.value, i);
      return { dx: b.dx * H, dy: b.dy * H, turn: (b.turn * Math.PI) / 180, opacity: b.opacity };
    })
  );
  const flash = useDerivedValue(() => flashAt(t.value) * opacity.secondary);

  return (
    <Canvas style={{ width, height: l.sceneH }} pointerEvents="none">
      <Group transform={camera} origin={vec(l.x, l.foot - H / 2)}>
        {[0, 1].map((i) => (
          <BailShadow key={i} t={t} index={i} layout={l} />
        ))}
        <Wicket3D x={l.x} y={l.foot} height={H} lean={lean} bails={bails} />
        <FlyingBall t={t} layout={l} />
        <Circle cx={impact.x} cy={impact.y} r={H * 0.9} opacity={flash}>
          <RadialGradient
            c={vec(impact.x, impact.y)}
            r={H * 0.9}
            colors={[colors.text, colors.accent, 'transparent']}
            positions={[0, 0.25, 1]}
          />
        </Circle>
        {PARTICLES.map((p, i) => (
          <Spark key={i} t={t} p={p} x={impact.x} y={impact.y} unit={H} />
        ))}
      </Group>
      <Badge t={t} layout={l} />
    </Canvas>
  );
}

type Layout = ReturnType<typeof celebrationLayout>;

function FlyingBall({ t, layout }: { t: SharedValue<number>; layout: Layout }) {
  const H = layout.stumpH;
  const r0 = H * 0.09;
  const b = useDerivedValue(() => ballAt(t.value));
  const cx = useDerivedValue(() => layout.x + b.value.x * H);
  const cy = useDerivedValue(() => layout.foot - b.value.y * H);
  const r = useDerivedValue(() => r0 * b.value.scale);
  const o = useDerivedValue(() => b.value.opacity);
  const spin = useDerivedValue(() => (t.value / 1000) * Math.PI * 2 * 11);
  // Its shadow on the ground below, sharper as it comes down to the wicket.
  const shadowX = useDerivedValue(() => layout.x + b.value.x * H + b.value.y * H * 0.3);
  const shadowO = useDerivedValue(() => b.value.opacity * opacity.inactive);
  const shadowBlur = useDerivedValue(() => Math.max(r0 * (0.4 + b.value.y), 1));
  return (
    <>
      <GroundShadow cx={shadowX} cy={layout.foot} rx={r0 * 1.4} ry={r0 * 0.35} blur={shadowBlur} opacity={shadowO} />
      <Ball3D cx={cx} cy={cy} r={r} spin={spin} opacity={o} />
    </>
  );
}

/** A flying bail's shadow on the ground under it, darker and sharper as it comes down. */
function BailShadow({ t, index, layout }: { t: SharedValue<number>; index: number; layout: Layout }) {
  const H = layout.stumpH;
  const home = wicketLayout(layout.x, layout.foot, H).bails[index];
  const b = useDerivedValue(() => bailAt(t.value, index));
  const cx = useDerivedValue(() => home.x + home.w / 2 + b.value.dx * H);
  const o = useDerivedValue(() => (b.value.dx !== 0 ? (0.25 + 0.75 * b.value.onGround) * opacity.secondary : 0));
  const blur = useDerivedValue(() => Math.max(H * (0.06 - 0.05 * b.value.onGround), 1));
  return <GroundShadow cx={cx} cy={layout.foot} rx={home.w * 0.55} ry={home.h * 0.45} blur={blur} opacity={o} />;
}

/** One light off the hit: a hot core with a soft halo, or a spark drawn as a short streak. */
function Spark({ t, p, x, y, unit }: { t: SharedValue<number>; p: Particle; x: number; y: number; unit: number }) {
  const at = useDerivedValue(() => particleAt(p, t.value));
  const cx = useDerivedValue(() => x + at.value.x * unit);
  const cy = useDerivedValue(() => y + at.value.y * unit);
  const o = useDerivedValue(() => at.value.opacity);
  const halo = useDerivedValue(() => at.value.opacity * opacity.disabled);
  const tail = useDerivedValue(() => vec(cx.value - at.value.vx * unit * 0.035, cy.value - at.value.vy * unit * 0.035));
  const head = useDerivedValue(() => vec(cx.value, cy.value));
  const r = p.size * unit;
  if (p.kind === 'spark') {
    return <Line p1={tail} p2={head} color={scene.floodlight} strokeWidth={Math.max(r * 1.6, 1)} strokeCap="round" opacity={o} />;
  }
  const color = p.kind === 'lime' ? colors.accent : scene.floodlight;
  return (
    <Group>
      <Circle cx={cx} cy={cy} r={r * 3} color={color} opacity={halo} />
      <Circle cx={cx} cy={cy} r={r} color={color} opacity={o} />
    </Group>
  );
}

/** The PRO badge: bevelled brushed metal with a lime edge glow, rising into place, then swept by light. */
function Badge({ t, layout }: { t: SharedValue<number>; layout: Layout }) {
  const plate = effect('plate');
  const { w, h, x, y } = layout.badge;
  const font = useMemo<SkFont | null>(() => {
    try {
      return matchFont({
        fontFamily: Platform.select({ ios: 'Helvetica Neue', default: 'sans-serif' }),
        fontSize: h * 0.56,
        fontWeight: '900',
      });
    } catch {
      return null;
    }
  }, [h]);
  const advances = font ? font.getGlyphWidths(font.getGlyphIDs('PRO')) : [0, 0, 0];
  const tracking = h * 0.08;
  const textW = advances.reduce((sum, v) => sum + v, 0) + tracking * 2;
  const b = useDerivedValue(() => badgeAt(t.value));
  const transform = useDerivedValue(() => [{ translateY: (1 - b.value.rise) * layout.stumpH * 0.9 }]);
  const o = useDerivedValue(() => b.value.rise);
  const glow = useDerivedValue(() => b.value.rise * opacity.secondary);
  const uniforms = useDerivedValue(() => ({
    size: [w, h],
    corner: h * 0.32,
    bevel: h * 0.14,
    light: MATERIAL.light,
    metal: MATERIAL.metal,
    metalDark: MATERIAL.metalDark,
    edgeGlow: MATERIAL.lime,
    sweep: b.value.sweep,
  }));
  const tx = x + w / 2 - textW / 2;
  const letterX = advances.map((_, i) => tx + advances.slice(0, i).reduce((sum, v) => sum + v + tracking, 0));
  const ty = y + h / 2 + h * 0.2;
  return (
    <Group transform={transform} opacity={o}>
      <RoundedRect x={x} y={y} width={w} height={h} r={h * 0.32} color={colors.accent} opacity={glow}>
        <BlurMask blur={h * 0.3} style="normal" />
      </RoundedRect>
      <Group transform={[{ translateX: x }, { translateY: y }]}>
        {plate ? (
          <Rect x={0} y={0} width={w} height={h}>
            <Shader source={plate} uniforms={uniforms} />
          </Rect>
        ) : (
          <RoundedRect x={0} y={0} width={w} height={h} r={radius.md} color={scene.metalDark} />
        )}
      </Group>
      {font
        ? ['P', 'R', 'O'].map((ch, i) => {
            const cx = letterX[i];
            return (
              <Group key={ch}>
                <SkiaText x={cx + h * 0.03} y={ty + h * 0.04} text={ch} font={font} color={scene.night} opacity={opacity.scrim} />
                <SkiaText x={cx} y={ty} text={ch} font={font}>
                  <LinearGradient
                    start={vec(0, ty - h * 0.5)}
                    end={vec(0, ty)}
                    colors={[scene.specular, colors.accent]}
                  />
                </SkiaText>
              </Group>
            );
          })
        : null}
    </Group>
  );
}
