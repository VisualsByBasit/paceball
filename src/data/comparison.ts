import type { Diff, Session } from '../types';

/** Deltas are B - A. Distance and angle are descriptive, not quality scores. */
export function compareSessions(a: Session, b: Session): Diff[] {
  const diffs: Diff[] = [
    {
      label: 'Speed', a: a.speedKmh, b: b.speedKmh,
      delta: b.speedKmh - a.speedKmh,
      better: b.speedKmh > a.speedKmh ? 'b' : b.speedKmh < a.speedKmh ? 'a' : 'equal',
    },
    {
      label: 'Distance', a: a.travelMetres, b: b.travelMetres,
      delta: b.travelMetres - a.travelMetres, better: 'equal',
    },
  ];
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
