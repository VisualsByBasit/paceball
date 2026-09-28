import type { MeasurementState } from '../physics/measurementState';
import type { SpeedUnit } from '../settings/settings';
import { errorIn, formatSpeed, speedIn, unitLabel, unitSpoken } from './units';

/**
 * What every reading is: the average speed over the stretch between the two
 * ball marks. Release speed is 5-8% higher, so it is never called that.
 */
export const READING_LABEL = 'AVERAGE SPEED';
export const READING_METHOD = 'Release to bounce';
/** Held for the whole count, so the digits do not jump. formatSpeed writes the same. */
export const READING_DECIMALS = 1;

/**
 * A reading as a screen shows it. The number, its unit and its range travel
 * together, so nothing that takes one of these can show the speed alone.
 */
export type MeasuredReading = {
  kind: 'measured';
  /** The speed in the display unit, to count up to. */
  value: number;
  decimals: number;
  /** `value` as it is written, exactly as formatSpeed writes it. */
  speed: string;
  unit: string;
  /** The error range, as it sits under the number: "± 3.1 km/h". */
  range: string;
  /** The same range as a number in the display unit, for drawing it. */
  error: number;
  method: string;
  /** The whole reading in one sentence, so a screen reader never splits it. */
  spoken: string;
};

/**
 * A delivery with nothing to read. It carries no number at all, so a screen
 * switching on it has no speed to show by mistake.
 */
export type NoReading = { kind: 'none'; cause: 'not-seen' | 'unusable' };

export type ReadingView = MeasuredReading | NoReading;

/** Every reading on screen comes through here, from the delivery's own measurementState. */
export function readingView(state: MeasurementState, unit: SpeedUnit): ReadingView {
  if (state.kind !== 'measured') return { kind: 'none', cause: state.kind };
  const speed = formatSpeed(state.speedKmh, unit);
  const error = errorIn(state.errorKmh, unit);
  const label = unitLabel(unit);
  return {
    kind: 'measured',
    value: speedIn(state.speedKmh, unit),
    decimals: READING_DECIMALS,
    speed,
    unit: label,
    range: `± ${error} ${label}`,
    error,
    method: READING_METHOD,
    spoken: `Average speed, release to bounce: ${speed} ${unitSpoken(unit)}, plus or minus ${error}.`,
  };
}

/**
 * The number on screen for one frame of a count. Never more than the reading:
 * the count's curve settles onto it without passing, and this holds the line
 * even for a frame that arrives past the end. Rounding is monotonic, so a
 * shown value at or under the reading never writes a larger figure.
 */
export function countUpText(shown: number, value: number, decimals: number): string {
  'worklet';
  return Math.min(Math.max(shown, 0), value).toFixed(decimals);
}

/**
 * Where a reveal starts. Still, it starts where it ends: the number final and
 * already landed. That is reduced motion, and any reading that is not arriving.
 */
export function revealStart(value: number, still: boolean): { shown: number; landed: number } {
  'worklet';
  return still ? { shown: value, landed: 1 } : { shown: 0, landed: 0 };
}

/**
 * The text React itself holds for the counter. The count is written straight
 * to the native view from the UI thread, but React owns the TextInput's text
 * prop too, and re-sends it on any later commit: saving, the wicket locking,
 * a focus change. Before landing that is the starting figure; from the moment
 * it lands it is the final reading, so no later commit can put anything else
 * on screen.
 */
export function heldText(landed: boolean, value: number, decimals: number, startShown: number): string {
  return landed ? value.toFixed(decimals) : countUpText(startShown, value, decimals);
}
