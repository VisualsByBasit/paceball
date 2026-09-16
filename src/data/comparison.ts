import type { Diff, Session } from '../types';
import { measurementState } from '../physics/measurementState';

/** Deltas are B - A. Distance and angle are descriptive, not quality scores. */
export function compareSessions(a: Session, b: Session): Diff[] {
  const readingA = measurementState(a);
  const readingB = measurementState(b);
  if (readingA.kind !== 'measured' || readingB.kind !== 'measured') {
    throw new Error('Both deliveries need measured speeds to compare.');
  }
  const diffs: Diff[] = [];
  const speedA = readingA.speedKmh;
  const speedB = readingB.speedKmh;
  diffs.push({
    label: 'Speed', a: speedA, b: speedB,
    delta: speedB - speedA,
    better: speedB > speedA ? 'b' : speedB < speedA ? 'a' : 'equal',
  });
  diffs.push({
    label: 'Distance', a: a.travelMetres, b: b.travelMetres,
    delta: b.travelMetres - a.travelMetres, better: 'equal',
  });
  // The shared Diff type only accepts numbers. Omit unavailable measurements;
  // a missing angle must never turn into a fabricated zero-degree reading.
  if (a.releaseAngleDeg !== null && b.releaseAngleDeg !== null) {
    diffs.push({
      label: 'Angle', a: a.releaseAngleDeg, b: b.releaseAngleDeg,
      delta: b.releaseAngleDeg - a.releaseAngleDeg, better: 'equal',
    });
  }
  return diffs;
}
