import type { SpeedUnit } from '../settings/settings';

/** Where the dial starts and how far it sweeps, clockwise, in degrees from three o'clock. */
export const GAUGE_START_DEG = 150;
export const GAUGE_SWEEP_DEG = 240;

/**
 * The dial's fixed scale. It is never stretched to fit a reading: a reading
 * past the end stops at the end stop and says it is off the scale.
 */
export const GAUGE_MAX: Record<SpeedUnit, number> = { kmh: 180, mph: 110 };
/** Labelled ticks, and the unlabelled ones halfway between. */
export const GAUGE_MAJOR: Record<SpeedUnit, number> = { kmh: 20, mph: 10 };

/** The top of the dial for a unit. The same for every reading. */
export function gaugeMax(unit: SpeedUnit): number {
  return GAUGE_MAX[unit];
}

/** Every tick on the dial, labelled or not, from 0 to the top. */
export function gaugeTicks(unit: SpeedUnit): { value: number; major: boolean }[] {
  const major = GAUGE_MAJOR[unit];
  const minor = major / 2;
  const ticks: { value: number; major: boolean }[] = [];
  for (let v = 0; v <= GAUGE_MAX[unit] + 1e-9; v += minor) {
    ticks.push({ value: v, major: Math.abs(v / major - Math.round(v / major)) < 1e-9 });
  }
  return ticks;
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
 * even for a frame that arrives past the end. Past the top of the dial it
 * rests on the end stop.
 */
export function needleDeg(shown: number, value: number, max: number): number {
  'worklet';
  const held = Math.min(Math.max(shown, 0), value);
  return GAUGE_START_DEG + GAUGE_SWEEP_DEG * gaugeFraction(held, max);
}

/** The measured range as a stretch of the dial, lower to upper bound, held between its ends. */
export function bandDeg(speed: number, error: number, max: number): { from: number; sweep: number } {
  const from = GAUGE_START_DEG + GAUGE_SWEEP_DEG * gaugeFraction(speed - error, max);
  const to = GAUGE_START_DEG + GAUGE_SWEEP_DEG * gaugeFraction(speed + error, max);
  return { from, sweep: to - from };
}

/** Whether the reading, or the top of its range, runs past the end of the dial. */
export function offScale(speed: number, error: number, unit: SpeedUnit): boolean {
  return speed + error > GAUGE_MAX[unit];
}

export const OFF_SCALE_LABEL = 'Off the scale';
export const OFF_SCALE_CAUTION =
  'This reading is faster than a bowled ball can be. Check the reference and your marks.';
/** A range wider than this either side, in km/h, is worth saying so. */
export const WIDE_RANGE_KMH = 25;
export const WIDE_RANGE_CAUTION = 'The range is very wide. Re-marking or a clearer clip will narrow it.';

/**
 * What a measured reading should say beside itself, if anything. Display
 * only: the reading and its range are exactly what was computed.
 */
export function readingCautions(
  reading: { speedKmh: number; errorKmh: number },
  shown: { value: number; error: number },
  unit: SpeedUnit
): string[] {
  const cautions: string[] = [];
  if (offScale(shown.value, shown.error, unit)) cautions.push(OFF_SCALE_CAUTION);
  if (reading.errorKmh > WIDE_RANGE_KMH) cautions.push(WIDE_RANGE_CAUTION);
  return cautions;
}
