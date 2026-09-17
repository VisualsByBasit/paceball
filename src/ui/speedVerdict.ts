/** One delivery's speed and error range, in the unit they are shown in. */
export type SpeedReading = { speed: number; error: number };

export type SpeedVerdict =
  /** The ranges overlap or touch: the difference is within the error. */
  | { kind: 'too-close'; delta: number }
  /** The ranges are clear of each other, so one really was faster. */
  | { kind: 'faster'; faster: 'a' | 'b'; delta: number };

/**
 * Absorbs float noise in `speedB - speedA` on figures already rounded for
 * display, so ranges that touch on screen are never read as a clear gap.
 */
const TOUCH_TOLERANCE = 1e-9;

/**
 * Whether one delivery was measurably faster than the other.
 *
 * Diff.better only compares the two speeds, so a 0.3 km/h gap between readings
 * each good to ± 4 would crown a winner that the measurement cannot support.
 * Here a delivery is only called faster when the ranges do not overlap:
 * |speedB - speedA| must exceed errorA + errorB. Touching counts as overlapping.
 *
 * Delta is B - A, matching getComparison, so it reads as change over time when
 * A is the older delivery.
 */
export function speedVerdict(a: SpeedReading, b: SpeedReading): SpeedVerdict {
  const delta = b.speed - a.speed;
  if (Math.abs(delta) <= a.error + b.error + TOUCH_TOLERANCE) {
    return { kind: 'too-close', delta };
  }
  return { kind: 'faster', faster: delta > 0 ? 'b' : 'a', delta };
}
