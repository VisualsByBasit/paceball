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
/** Faster than this, in km/h, is not a bowled ball: the marks or the reference are wrong. */
export const MAX_PLAUSIBLE_KMH = 180;
/** A range wider than this either side, in km/h, is worth saying so. */
export const WIDE_RANGE_KMH = 25;
export const WIDE_RANGE_CAUTION = 'The range is very wide. Re-marking or a clearer clip will narrow it.';

/** The tag a reading that fails either rule carries in lists, beside its speed. */
export const CHECK_READING = 'Check this reading';

/**
 * What a measured reading should say beside itself, if anything: a speed over
 * MAX_PLAUSIBLE_KMH, or a range wider than WIDE_RANGE_KMH either side. Both
 * are decided in km/h, as the reading is stored, never in the unit shown, so
 * a reading counts or not the same way for every player whatever their
 * setting. The dial's "Off the scale" label is separate: it is only where the
 * needle rests, in the unit shown. Display only: the reading and its range are
 * exactly what was computed.
 *
 * This is the one place those two rules live. Every caution, every "Check this
 * reading" tag, and every decision about where a reading counts (the personal
 * best, the Home hero, Stats, Compare) reads them from here.
 */
export function readingCautions(reading: { speedKmh: number; errorKmh: number }): string[] {
  const cautions: string[] = [];
  if (reading.speedKmh > MAX_PLAUSIBLE_KMH) cautions.push(OFF_SCALE_CAUTION);
  if (reading.errorKmh > WIDE_RANGE_KMH) cautions.push(WIDE_RANGE_CAUTION);
  return cautions;
}

/**
 * Whether a measured reading breaks either rule above. It is still saved,
 * shown with CHECK_READING, re-markable, deletable and shareable; it is only
 * never a personal best, never the Home hero, never in Stats and never offered
 * for Compare.
 */
export function implausible(reading: { speedKmh: number; errorKmh: number }): boolean {
  return readingCautions(reading).length > 0;
}
