/**
 * The kit's shapes and its camera, free of React and Skia so they can be
 * checked on their own. Proportions follow the Laws, stylised only where the
 * phone needs it: a stump is 71.1 cm tall and a wicket 22.86 cm across.
 */

/** A wicket drawn `height` tall: where its three stumps and two bails sit, from its foot at (x, y). */
export function wicketLayout(x: number, y: number, height: number) {
  const stumpW = height * 0.07;
  const width = height * 0.36;
  const gap = (width - stumpW * 3) / 2;
  const left = x - width / 2;
  const stumps = [0, 1, 2].map((i) => ({ x: left + i * (stumpW + gap), y: y - height, w: stumpW, h: height }));
  const bailH = stumpW * 0.5;
  const bailW = gap + stumpW * 1.1;
  const bails = [0, 1].map((i) => ({
    x: stumps[i].x + stumpW * 0.45,
    y: y - height - bailH * 0.75,
    w: bailW,
    h: bailH,
  }));
  return { stumps, bails, width, stumpW, bailH, footY: y };
}

export type Camera = { cx: number; horizon: number; focal: number; camH: number };

/**
 * A camera standing `camH` metres above a flat ground, looking level down it:
 * the horizon at `horizon`, and `focal` pixels for a metre at one metre away.
 */
export function camera(width: number, horizon: number, focal: number, camH: number): Camera {
  return { cx: width / 2, horizon, focal, camH };
}

/** A point on the ground (x across, z away), on the screen, with pixels per metre there. */
export function onGround(cam: Camera, x: number, z: number): { x: number; y: number; scale: number } {
  'worklet';
  const scale = cam.focal / z;
  return { x: cam.cx + x * scale, y: cam.horizon + cam.camH * scale, scale };
}

/** A point `up` metres above the ground at (x, z). */
export function above(cam: Camera, x: number, z: number, up: number): { x: number; y: number; scale: number } {
  'worklet';
  const g = onGround(cam, x, z);
  return { x: g.x, y: g.y - up * g.scale, scale: g.scale };
}
