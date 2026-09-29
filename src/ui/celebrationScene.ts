import { motion } from './tokens';

/**
 * The purchase celebration's timeline and motion, kept free of React and Skia
 * so every beat can be checked on its own. Distances are in stump heights, so
 * the scene scales with the screen; times are milliseconds from the start.
 * Nothing here is a measurement.
 */
export const CELEBRATE = motion.celebrate;

/** What Pro unlocks, in the order it ticks in. Only what the build ships. */
export const UNLOCKED = [
  'Unlimited analyses',
  'Watermark-free exports',
  'Higher recording quality',
  'Compare deliveries',
  'Your stats',
] as const;

function clamp01(v: number): number {
  'worklet';
  return Math.min(Math.max(v, 0), 1);
}

/** Decelerating onto 1, never past it. */
function easeOut(v: number): number {
  'worklet';
  const c = clamp01(v);
  return 1 - (1 - c) * (1 - c) * (1 - c);
}

/** Accelerating from rest: the ball gathers pace as it comes. */
function easeIn(v: number): number {
  'worklet';
  const c = clamp01(v);
  return c * c;
}

/**
 * The ball, relative to the middle stump's foot, in stump heights: x across,
 * y up. It rockets in from far off to the left and above, growing as it comes
 * (`scale`), meets the middle stump two thirds of the way up at impact, then
 * drops away behind the wicket and fades.
 */
export function ballAt(t: number): { x: number; y: number; scale: number; opacity: number } {
  'worklet';
  if (t <= CELEBRATE.impact) {
    const u = easeIn((t - CELEBRATE.ball) / (CELEBRATE.impact - CELEBRATE.ball));
    return {
      x: -2.6 + 2.6 * u,
      y: 1.9 - 1.25 * u,
      scale: 0.35 + 0.65 * u,
      opacity: t < CELEBRATE.ball ? 0 : clamp01((t - CELEBRATE.ball) / 60),
    };
  }
  const s = (t - CELEBRATE.impact) / 1000;
  return {
    x: 0.35 * s * 3,
    y: 0.65 + 0.9 * s - 4.5 * s * s,
    scale: 1 - 0.3 * clamp01(s * 3),
    opacity: 1 - clamp01(s / 0.3),
  };
}

/** How far each stump is kicked back by the hit, in degrees: leg, middle, off. */
export const STUMP_KICK = [-9, 24, 13] as const;

/** A stump's lean: upright until the hit, then thrown back fast and held. */
export function stumpKick(t: number, index: number): number {
  'worklet';
  if (t <= CELEBRATE.impact) return 0;
  return STUMP_KICK[index] * easeOut((t - CELEBRATE.impact) / 180);
}

/**
 * A bail after the hit, in stump heights from its groove: thrown up and out,
 * spinning, falling under gravity to the ground a stump height below, where it
 * rests. `onGround` is how close it is to landing, for its shadow.
 */
export function bailAt(
  t: number,
  index: number
): { dx: number; dy: number; turn: number; opacity: number; onGround: number } {
  'worklet';
  if (t <= CELEBRATE.impact) return { dx: 0, dy: 0, turn: 0, opacity: 1, onGround: 0 };
  const s = (t - CELEBRATE.impact) / 1000;
  const vx = index === 0 ? -0.9 : 1.2;
  const vy = index === 0 ? 2.4 : 2.8;
  const spin = index === 0 ? -900 : 1080;
  // Lands when it has fallen back a stump height below where it sat.
  const g = 9;
  const land = (vy + Math.sqrt(vy * vy + 2 * g)) / g;
  const tt = Math.min(s, land);
  const up = vy * tt - 0.5 * g * tt * tt;
  return {
    dx: vx * tt,
    dy: -up,
    turn: spin * tt,
    opacity: 1,
    onGround: clamp01(1 - Math.max(up + 1, 0)),
  };
}

export type Particle = {
  /** Direction, radians, 0 to the right, positive downwards on screen. */
  angle: number;
  /** Stump heights per second. */
  speed: number;
  /** Radius as a share of a stump height. */
  size: number;
  /** A lime light, a white light, or a spark: a small, hot streak. */
  kind: 'lime' | 'white' | 'spark';
  /** How long it lives, ms. */
  life: number;
};

/** A small, fixed random: the same burst on every phone and every run. */
function seeded(i: number): number {
  const x = Math.sin(i * 12.9898 + 78.233) * 43758.5453;
  return x - Math.floor(x);
}

/** The burst off the impact: lime and white light, and a few sparks. */
export const PARTICLES: Particle[] = Array.from({ length: 30 }, (_, i) => {
  const kind: Particle['kind'] = i % 5 === 0 ? 'spark' : i % 2 === 0 ? 'lime' : 'white';
  return {
    angle: -Math.PI * (0.05 + 0.9 * seeded(i)) + (seeded(i + 40) - 0.5) * 0.6,
    speed: (kind === 'spark' ? 3.2 : 1.4) + seeded(i + 80) * (kind === 'spark' ? 2.2 : 1.6),
    size: kind === 'spark' ? 0.012 : 0.02 + seeded(i + 120) * 0.035,
    kind,
    life: 420 + seeded(i + 160) * 380,
  };
});

/** A particle at a moment, relative to the impact point, in stump heights. */
export function particleAt(p: Particle, t: number): { x: number; y: number; opacity: number; vx: number; vy: number } {
  'worklet';
  const age = t - CELEBRATE.impact;
  if (age <= 0 || age >= p.life) return { x: 0, y: 0, opacity: 0, vx: 0, vy: 0 };
  const s = age / 1000;
  const drag = Math.exp(-s * 2.2);
  const vx = Math.cos(p.angle) * p.speed * drag;
  const vy = Math.sin(p.angle) * p.speed * drag + 3.5 * s;
  const travel = (1 - drag) / 2.2;
  return {
    x: Math.cos(p.angle) * p.speed * travel,
    y: Math.sin(p.angle) * p.speed * travel + 1.75 * s * s,
    opacity: 1 - age / p.life,
    vx,
    vy,
  };
}

/** The whole scene's flash of light at impact, dying away over a quarter second. */
export function flashAt(t: number): number {
  'worklet';
  if (t <= CELEBRATE.impact) return 0;
  return Math.exp(-(t - CELEBRATE.impact) / 90);
}

/** A jolt at impact, in stump heights, dying away fast. */
export function shakeAt(t: number): number {
  'worklet';
  if (t <= CELEBRATE.impact) return 0;
  const s = (t - CELEBRATE.impact) / 1000;
  return 0.05 * Math.exp(-s * 28) * Math.sin(s * 95);
}

/** A slow push in over the whole scene: the camera leaning towards the wicket. */
export function pushAt(t: number): number {
  'worklet';
  return 1 + 0.05 * easeOut(t / CELEBRATE.total);
}

/**
 * The PRO badge: `rise` from below into place, 0 to 1, landing without
 * passing its mark, and the light `sweep` crossing it once after it lands.
 */
export function badgeAt(t: number): { rise: number; sweep: number } {
  'worklet';
  const rise = easeOut((t - CELEBRATE.badge) / (CELEBRATE.land - CELEBRATE.badge));
  const u = clamp01((t - CELEBRATE.land) / (CELEBRATE.sweep - CELEBRATE.land));
  return { rise, sweep: -0.3 + 1.6 * u };
}

/** The headline and body: fade up after the badge lands. */
export function copyAt(t: number): number {
  'worklet';
  return easeOut((t - CELEBRATE.copy) / 400);
}

/** One unlocked item: in, and ticked, one after another. */
export function itemAt(t: number, index: number): number {
  'worklet';
  return easeOut((t - CELEBRATE.list - index * CELEBRATE.stagger) / CELEBRATE.tick);
}
