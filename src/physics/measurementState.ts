import { sessionErrorKmh, type MeasurableSession } from './computeSpeed';

/**
 * What a delivery can honestly show. Derived on every read from what was saved;
 * nothing here is stored.
 *
 * measured - a speed, and the v2 error range recomputed from the marks. The
 *            stored error is never used: a v1 record's is timing alone.
 * not-seen - the bounce was marked without the ball visible in that frame, so
 *            the flight time behind any speed would be a guess.
 * unusable - a speed is on the record, but the marks it was saved with cannot
 *            produce an error range. A speed without its range is not shown.
 *
 * Neither of the last two carries a number, so a screen switching on this has
 * nothing to fall back to.
 */
export type MeasurementState =
  | { kind: 'measured'; speedKmh: number; errorKmh: number }
  | { kind: 'not-seen' }
  | { kind: 'unusable' };

/**
 * Pure, and free of the data layer by design: src/data can call this on read,
 * and the dependency stays one-way.
 */
export function measurementState(session: MeasurableSession): MeasurementState {
  if (session.markConfidence === 'guessed') return { kind: 'not-seen' };

  // A seen bounce stored without a speed is something validation rejects. Should
  // one get through, it is still a delivery nothing can be read from.
  const { speedKmh } = session;
  if (speedKmh === null || !Number.isFinite(speedKmh) || speedKmh <= 0) {
    return { kind: 'unusable' };
  }

  const errorKmh = sessionErrorKmh(session);
  if (errorKmh === null) return { kind: 'unusable' };

  return { kind: 'measured', speedKmh, errorKmh };
}
