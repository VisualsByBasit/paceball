import { useMemo } from 'react';
import { BlurMask, Group, Oval, Path, Rect, Shader, Skia } from '@shopify/react-native-skia';
import { useDerivedValue } from 'react-native-reanimated';
import { colors, opacity as opacities } from '../tokens';
import { wicketLayout, type Camera } from './geometry';
import { effect, MATERIAL } from './materials';

/** Something Reanimated drives, shared or derived: anything with a value to read. */
export type Driven<T> = { readonly value: T };
/** A number that may move: a plain value, or one Reanimated drives. */
export type Animatable = number | Driven<number>;

export function val(v: Animatable): number {
  'worklet';
  return typeof v === 'number' ? v : v.value;
}

/**
 * The ball: lit lime leather with a raised, stitched seam, turning by `spin`
 * radians about an axis tilted `tilt` from the horizontal.
 */
export function Ball3D({
  cx,
  cy,
  r,
  spin = 0,
  tilt = -1.2,
  opacity = 1,
}: {
  cx: Animatable;
  cy: Animatable;
  r: Animatable;
  spin?: Animatable;
  tilt?: Animatable;
  opacity?: Animatable;
}) {
  const source = effect('ball');
  const uniforms = useDerivedValue(() => ({
    center: [val(cx), val(cy)],
    radius: Math.max(val(r), 0.5),
    light: MATERIAL.light,
    spin: val(spin),
    tilt: val(tilt),
    base: MATERIAL.lime,
    seamColor: MATERIAL.seam,
    stitchColor: MATERIAL.wood,
    rimColor: MATERIAL.floodlight,
    alpha: val(opacity),
  }));
  const rect = useDerivedValue(() => {
    const radius = Math.max(val(r), 0.5) + 1;
    return Skia.XYWHRect(val(cx) - radius, val(cy) - radius, radius * 2, radius * 2);
  });
  if (!source) return null;
  return (
    <Rect rect={rect}>
      <Shader source={source} uniforms={uniforms} />
    </Rect>
  );
}

/** A soft shadow on the ground: an oval, blurred more the further it falls. */
export function GroundShadow({
  cx,
  cy,
  rx,
  ry,
  blur,
  opacity = opacities.secondary,
}: {
  cx: Animatable;
  cy: Animatable;
  rx: Animatable;
  ry: Animatable;
  blur: Animatable;
  opacity?: Animatable;
}) {
  const rect = useDerivedValue(() =>
    Skia.XYWHRect(val(cx) - val(rx), val(cy) - val(ry), val(rx) * 2, val(ry) * 2)
  );
  const b = useDerivedValue(() => Math.max(val(blur), 0.5));
  const o = useDerivedValue(() => val(opacity));
  return (
    <Oval rect={rect} color={colors.bg} opacity={o}>
      <BlurMask blur={b} style="normal" />
    </Oval>
  );
}

/** A painted wooden cylinder: a stump standing in (0, 0, w, h), or a bail lying across it. */
function Cylinder({
  w,
  h,
  horizontal,
  glow,
  groundShade,
  opacity = 1,
}: {
  w: number;
  h: number;
  horizontal: boolean;
  glow: Animatable;
  groundShade: number;
  opacity?: Animatable;
}) {
  const source = effect('cylinder');
  const uniforms = useDerivedValue(() => ({
    size: [w, h],
    light: MATERIAL.light,
    paint: MATERIAL.wood,
    lime: MATERIAL.lime,
    glow: val(glow),
    horizontal: horizontal ? 1 : 0,
    groundShade,
    alpha: val(opacity),
  }));
  if (!source) return null;
  return (
    <Rect x={0} y={0} width={w} height={h}>
      <Shader source={source} uniforms={uniforms} />
    </Rect>
  );
}

/** Where a flying bail is: an offset in pixels, a turn in radians, and how solid it is. */
export type BailMotion = { dx: number; dy: number; turn: number; opacity: number };
const STILL: BailMotion = { dx: 0, dy: 0, turn: 0, opacity: 1 };

/**
 * Three stumps and two bails standing on the ground at (x, y), `height` tall,
 * each with its shadow thrown back and to the right by the floodlight.
 *
 * `glow` turns the set lime. `lean` tips each stump about its foot, in
 * degrees; `bails` moves each bail from its groove. Both are optional, for the
 * scenes where the wicket is struck.
 */
export function Wicket3D({
  x,
  y,
  height,
  glow = 0,
  lean,
  bails,
  shadow = true,
}: {
  x: number;
  y: number;
  height: number;
  glow?: Animatable;
  lean?: Driven<number[]>;
  bails?: Driven<BailMotion[]>;
  shadow?: boolean;
}) {
  const layout = wicketLayout(x, y, height);
  return (
    <Group>
      {shadow ? (
        <>
          <GroundShadow
            cx={x + layout.width * 0.2}
            cy={y}
            rx={layout.width * 0.85}
            ry={layout.stumpW * 0.9}
            blur={layout.stumpW * 0.9}
            opacity={opacities.scrim}
          />
          {layout.stumps.map((s, i) => (
            <StumpShadow key={i} x={s.x} w={s.w} y={y} h={height} />
          ))}
        </>
      ) : null}
      {layout.stumps.map((s, i) => (
        <Stump key={i} index={i} x={s.x} y={s.y} w={s.w} h={s.h} glow={glow} lean={lean} />
      ))}
      {layout.bails.map((b, i) => (
        <Bail key={i} index={i} x={b.x} y={b.y} w={b.w} h={b.h} glow={glow} bails={bails} />
      ))}
    </Group>
  );
}

/** A stump's shadow on the ground behind it: a long, soft sliver falling back and right. */
function StumpShadow({ x, w, y, h }: { x: number; w: number; y: number; h: number }) {
  const path = useMemo(() => {
    const p = Skia.Path.Make();
    p.moveTo(x, y);
    p.lineTo(x + w, y);
    p.lineTo(x + w + h * 0.55, y - h * 0.16);
    p.lineTo(x + h * 0.55, y - h * 0.16);
    p.close();
    return p;
  }, [x, w, y, h]);
  return (
    <Path path={path} color={colors.bg} opacity={opacities.inactive}>
      <BlurMask blur={w * 0.8} style="normal" />
    </Path>
  );
}

function Stump({
  index,
  x,
  y,
  w,
  h,
  glow,
  lean,
}: {
  index: number;
  x: number;
  y: number;
  w: number;
  h: number;
  glow: Animatable;
  lean?: Driven<number[]>;
}) {
  const transform = useDerivedValue(() => [
    { translateX: x },
    { translateY: y },
    { translateX: w / 2 },
    { translateY: h },
    { rotate: ((lean ? lean.value[index] ?? 0 : 0) * Math.PI) / 180 },
    { translateX: -w / 2 },
    { translateY: -h },
  ]);
  return (
    <Group transform={transform}>
      <Cylinder w={w} h={h} horizontal={false} glow={glow} groundShade={1} />
    </Group>
  );
}

function Bail({
  index,
  x,
  y,
  w,
  h,
  glow,
  bails,
}: {
  index: number;
  x: number;
  y: number;
  w: number;
  h: number;
  glow: Animatable;
  bails?: Driven<BailMotion[]>;
}) {
  const motion = useDerivedValue(() => (bails ? bails.value[index] ?? STILL : STILL));
  const transform = useDerivedValue(() => [
    { translateX: x + motion.value.dx + w / 2 },
    { translateY: y + motion.value.dy + h / 2 },
    { rotate: motion.value.turn },
    { translateX: -w / 2 },
    { translateY: -h / 2 },
  ]);
  const opacity = useDerivedValue(() => motion.value.opacity);
  return (
    <Group transform={transform}>
      <Cylinder w={w} h={h} horizontal glow={glow} groundShade={0} opacity={opacity} />
    </Group>
  );
}

/**
 * The ground under the floodlights, filling (0, 0, width, height) below the
 * camera's horizon: the strip, the outfield in mowing stripes, the creases at
 * the wicket `stumpZ` metres away, and haze into the dark. Static: draw it in
 * a canvas of its own so it is not redrawn with every frame of a scene.
 */
export function Pitch3D({
  width,
  height,
  cam,
  stumpZ,
  opacity = 1,
}: {
  width: number;
  height: number;
  cam: Camera;
  stumpZ: number;
  opacity?: Animatable;
}) {
  const source = effect('pitch');
  const uniforms = useDerivedValue(() => ({
    origin: [cam.cx, 0],
    horizon: cam.horizon,
    focal: cam.focal,
    camH: cam.camH,
    stumpZ,
    light: MATERIAL.light,
    turf: MATERIAL.turf,
    turfDeep: MATERIAL.turfDeep,
    pitch: MATERIAL.pitch,
    pitchWorn: MATERIAL.pitchWorn,
    crease: MATERIAL.crease,
    flood: MATERIAL.floodlight,
    haze: MATERIAL.haze,
    alpha: val(opacity),
  }));
  if (!source) return null;
  return (
    <Rect x={0} y={0} width={width} height={height}>
      <Shader source={source} uniforms={uniforms} />
    </Rect>
  );
}

/**
 * The stadium at night behind everything: two banks of floodlights with their
 * bloom, the stands as a dim band with a few lights in it, haze over the
 * ground, and a vignette. Static, like the pitch.
 */
export function Stadium3D({
  width,
  height,
  horizon,
  intensity = 1,
}: {
  width: number;
  height: number;
  horizon: number;
  intensity?: Animatable;
}) {
  const source = effect('stadium');
  const uniforms = useDerivedValue(() => ({
    size: [width, height],
    horizon,
    night: MATERIAL.night,
    haze: MATERIAL.haze,
    flood: MATERIAL.floodlight,
    intensity: val(intensity),
  }));
  if (!source) return <Rect x={0} y={0} width={width} height={height} color={colors.bg} />;
  return (
    <Rect x={0} y={0} width={width} height={height}>
      <Shader source={source} uniforms={uniforms} />
    </Rect>
  );
}
