import { motion } from './tokens';

/**
 * The launch intro's scene and timeline, kept free of React and Skia so the
 * beats can be checked on their own.
 *
 * A small 3D scene seen from a fixed camera: a pitch running away into the
 * dark, a wicket on it, and a ball bowled in from far down the pitch in a
 * straight line. Distances are in metres, stylised: the ball is drawn larger
 * than a real one so it reads on a phone. Nothing here is a measurement, and
 * nothing is drawn along the ball's path.
 */

export const INTRO = motion.intro;

/** How high the camera sits above the pitch. Screen y grows downwards, so the pitch is at +y. */
const CAMERA_HEIGHT = 1.1;
/** How far down the pitch the stumps stand. */
export const STUMP_Z = 6;
export const STUMP_HEIGHT = 0.71;
export const STUMP_WIDTH = 0.045;
/** Outside edge to outside edge of the three stumps, widened a touch for the screen. */
export const WICKET_WIDTH = 0.28;
export const BAIL_HEIGHT = 0.03;
const BALL_RADIUS = 0.1;

/** Where the ball comes from, out of the dark, and where it meets the middle stump. */
const BALL_FROM = { x: -0.7, y: 0.1, z: 42 };
const BALL_TO = { x: 0.02, y: CAMERA_HEIGHT - STUMP_HEIGHT * 0.55, z: STUMP_Z - 0.12 };

/** Seam turns per second: enough to read as spin, slow enough not to strobe at 60 fps. */
const SEAM_TURNS_PER_SECOND = 9;

export type View = { cx: number; cy: number; focal: number };
export type Point3 = { x: number; y: number; z: number };

/**
 * The camera for a screen: the horizon a little above the middle, and a lens
 * that makes the wicket about a fifth of the screen's height.
 */
export function viewFor(width: number, height: number): View {
  return { cx: width / 2, cy: height * 0.38, focal: height * 1.86 };
}

/** A point in the scene on the screen, and how many pixels a metre is at its depth. */
export function project(p: Point3, view: View): { x: number; y: number; scale: number } {
  'worklet';
  const scale = view.focal / p.z;
  return { x: view.cx + p.x * scale, y: view.cy + p.y * scale, scale };
}

/** The pitch surface, as it meets the ground. */
export function onGround(x: number, z: number): Point3 {
  'worklet';
  return { x, y: CAMERA_HEIGHT, z };
}

function clamp01(v: number): number {
  'worklet';
  return Math.min(Math.max(v, 0), 1);
}

/** Decelerating onto 1, never past it. */
export function easeOut(v: number): number {
  'worklet';
  const c = clamp01(v);
  return 1 - (1 - c) * (1 - c) * (1 - c);
}

/**
 * The ball at a moment of the intro. Up to impact it runs in a straight line
 * from far down the pitch to the middle stump, at an even pace in depth, so
 * perspective alone makes it rush at the end. After impact it drops away
 * behind the wicket and fades within a quarter of a second.
 */
export function ballAt(t: number): { p: Point3; radius: number; opacity: number } {
  'worklet';
  if (t <= INTRO.impact) {
    const u = clamp01(t / INTRO.impact);
    return {
      p: {
        x: BALL_FROM.x + (BALL_TO.x - BALL_FROM.x) * u,
        y: BALL_FROM.y + (BALL_TO.y - BALL_FROM.y) * u,
        z: BALL_FROM.z + (BALL_TO.z - BALL_FROM.z) * u,
      },
      radius: BALL_RADIUS,
      opacity: clamp01(t / 120),
    };
  }
  const u = clamp01((t - INTRO.impact) / 250);
  return {
    p: { x: BALL_TO.x - 0.25 * u, y: BALL_TO.y + 0.3 * u * u, z: BALL_TO.z + 0.8 * u },
    radius: BALL_RADIUS,
    opacity: 1 - u,
  };
}

/** How far round the seam has turned, in radians. */
export function seamPhase(t: number): number {
  'worklet';
  return (t / 1000) * SEAM_TURNS_PER_SECOND * Math.PI * 2;
}

/**
 * The visible half of the seam, a great circle on the ball, as points on the
 * screen. The ball spins about an axis in the screen plane at `axis` radians;
 * the seam's circle contains that axis, so it shows as an ellipse whose width
 * breathes with the spin, and only the half facing the camera is drawn.
 */
export function seamPoints(
  cx: number,
  cy: number,
  r: number,
  phase: number,
  axis: number,
  steps: number
): { x: number; y: number }[] {
  'worklet';
  const sinP = Math.sin(phase);
  const cosP = Math.cos(phase);
  const ca = Math.cos(axis);
  const sa = Math.sin(axis);
  // Facing the camera where -sin(s)·cos(phase) > 0: one half of the circle.
  const from = cosP >= 0 ? Math.PI : 0;
  const out: { x: number; y: number }[] = [];
  for (let i = 0; i <= steps; i++) {
    const s = from + (Math.PI * i) / steps;
    const a = r * Math.cos(s);
    const b = r * Math.sin(s) * sinP;
    out.push({ x: cx + a * ca - b * sa, y: cy + a * sa + b * ca });
  }
  return out;
}

/** How far each stump leans once the ball hits: leg, middle, off, in degrees. */
export const STUMP_LEAN = [-5, 14, 8] as const;

/** A stump's lean at a moment: upright until impact, then leaning back fast. */
export function stumpLean(t: number, index: number): number {
  'worklet';
  if (t <= INTRO.impact) return 0;
  return STUMP_LEAN[index] * easeOut((t - INTRO.impact) / 220);
}

/**
 * The two bails after impact, as an offset from where they sat, in screen
 * heights, a turn in degrees and an opacity. They leave on a throw and fall
 * back under gravity, spinning, and are gone before the wordmark settles.
 */
export function bailAt(
  t: number,
  index: number
): { dx: number; dy: number; turn: number; opacity: number } {
  'worklet';
  if (t <= INTRO.impact) return { dx: 0, dy: 0, turn: 0, opacity: 1 };
  const s = (t - INTRO.impact) / 1000;
  const vx = index === 0 ? -0.35 : 0.5;
  const vy = index === 0 ? -0.9 : -1.1;
  const spin = index === 0 ? -720 : 900;
  return {
    dx: vx * s,
    dy: vy * s + 0.5 * 3.2 * s * s,
    turn: spin * s,
    opacity: 1 - clamp01((t - INTRO.wordmark) / 250),
  };
}

/** A small jolt at impact, in pixels, dying away within a tenth of a second or so. */
export function shakeAt(t: number): number {
  'worklet';
  if (t <= INTRO.impact) return 0;
  const s = (t - INTRO.impact) / 1000;
  return 4 * Math.exp(-s * 30) * Math.sin(s * 90);
}

/** The pitch and wicket fade up out of the dark, then dim behind the wordmark. */
export function sceneOpacity(t: number): number {
  'worklet';
  const up = clamp01(t / 250);
  const down = 1 - 0.7 * clamp01((t - INTRO.wordmark) / 300);
  return up * down;
}

/** One letter of the wordmark: opacity and blur, resolving left to right. */
export function letterAt(t: number, index: number): { opacity: number; blur: number; rise: number } {
  'worklet';
  const u = easeOut((t - INTRO.wordmark - index * INTRO.letterStagger) / INTRO.letter);
  return { opacity: u, blur: 8 * (1 - u), rise: 6 * (1 - u) };
}

/** The whole intro, fading to the app over its last quarter second. */
export function introOpacity(t: number): number {
  'worklet';
  return 1 - clamp01((t - INTRO.fadeOut) / (INTRO.total - INTRO.fadeOut));
}

export const WORDMARK = 'PACEBALL';
