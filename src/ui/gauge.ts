import type { SpeedUnit } from '../settings/settings';

/** Where the dial starts and how far it sweeps, clockwise, in degrees from three o'clock. */
export const GAUGE_START_DEG = 150;
export const GAUGE_SWEEP_DEG = 240;
/** Ticks and the step the scale grows by. */
export const GAUGE_STEP = 20;

/**
 * The top of the dial. 160 km/h covers nearly every delivery; the mph dial is
 * the same ground, 100 mph. A reading whose range runs past that gets the
 * next step of 20 above its upper bound, so the whole range is always on the
 * dial.
 */
export function gaugeMax(upper: number, unit: SpeedUnit): number {
  const base = unit === 'mph' ? 100 : 160;
  if (upper <= base) return base;
  return Math.floor(upper / GAUGE_STEP) * GAUGE_STEP + GAUGE_STEP;
}

/** A speed as a share of the dial, held between its ends. */
export function gaugeFraction(speed: number, max: number): number {
  'worklet';
  if (!(max > 0)) return 0;
  return Math.min(Math.max(speed / max, 0), 1);
}

/**
 * Where the needle points for one frame of the sweep. Never past the reading:
 * the sweep's curve settles onto it without passing, and this holds the line
 * even for a frame that arrives past the end.
 */
export function needleDeg(shown: number, value: number, max: number): number {
  'worklet';
  const held = Math.min(Math.max(shown, 0), value);
  return GAUGE_START_DEG + GAUGE_SWEEP_DEG * gaugeFraction(held, max);
}

/** The measured range as a stretch of the dial, lower to upper bound, never below zero. */
export function bandDeg(speed: number, error: number, max: number): { from: number; sweep: number } {
  const from = GAUGE_START_DEG + GAUGE_SWEEP_DEG * gaugeFraction(speed - error, max);
  const to = GAUGE_START_DEG + GAUGE_SWEEP_DEG * gaugeFraction(speed + error, max);
  return { from, sweep: to - from };
}
