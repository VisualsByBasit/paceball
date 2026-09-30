/**
 * How long Capture records for. "Until stopped" is a normal camera: it records
 * until the button is tapped. A length stops it by itself once that much
 * footage has been filmed. Either way the 3-second minimum stands, so no
 * length is shorter than it and stop stays locked until it has passed.
 */

/** 0 is until stopped. The rest are seconds, in the order the stepper walks them. */
export const RECORD_LENGTH_OPTIONS = [0, 3, 5, 10, 15, 20, 30] as const;
export type RecordLength = (typeof RECORD_LENGTH_OPTIONS)[number];

export function isRecordLength(value: unknown): value is RecordLength {
  return (RECORD_LENGTH_OPTIONS as readonly unknown[]).includes(value);
}

/**
 * One step along, held at either end: minus from 3 s goes back to until
 * stopped, and nothing goes past 30 s.
 */
export function stepRecordLength(current: RecordLength, direction: 1 | -1): RecordLength {
  const i = RECORD_LENGTH_OPTIONS.indexOf(current);
  const next = Math.min(RECORD_LENGTH_OPTIONS.length - 1, Math.max(0, i + direction));
  return RECORD_LENGTH_OPTIONS[next];
}

/** Whether a step that way would change anything. */
export function canStepRecordLength(current: RecordLength, direction: 1 | -1): boolean {
  return stepRecordLength(current, direction) !== current;
}

/** As the stepper writes it. */
export function recordLengthLabel(seconds: RecordLength): string {
  return seconds === 0 ? 'Until stopped' : `${seconds} s`;
}

/** As a screen reader says it. */
export function recordLengthSpoken(seconds: RecordLength): string {
  return seconds === 0 ? 'Record length, until stopped' : `Record length, ${seconds} seconds`;
}

/** Whether a recording with this length has filmed enough to stop by itself. */
export function reachedLength(elapsedMs: number, seconds: RecordLength): boolean {
  return seconds !== 0 && elapsedMs >= seconds * 1000;
}

/**
 * What the time readout shows: the time filmed so far until stopped, or the
 * time left when a length is set, counting down to zero. Idle, it shows where
 * the next recording starts from.
 */
export function readoutMs(elapsedMs: number, seconds: RecordLength, recording: boolean): number {
  if (seconds === 0) return recording ? elapsedMs : 0;
  const total = seconds * 1000;
  return recording ? Math.max(0, total - elapsedMs) : total;
}
