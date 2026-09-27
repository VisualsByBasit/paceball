import type { MeasurementState } from '../physics/measurementState';

/** A delivery as a list reads it: which one, when, and what it can honestly show. */
export type ListedDelivery = { id: string; createdAt: number; state: MeasurementState };

/**
 * The personal best: the highest measured speed, and of equals the most
 * recent. Only a measured delivery counts, read through its own
 * measurementState, so its range is the recomputed one. Null with nothing
 * measured: a best of 0.0 would not be a reading.
 */
export function personalBest(deliveries: readonly ListedDelivery[]): ListedDelivery | null {
  let best: ListedDelivery | null = null;
  for (const delivery of deliveries) {
    if (delivery.state.kind !== 'measured') continue;
    if (best === null || best.state.kind !== 'measured') {
      best = delivery;
      continue;
    }
    const speed = delivery.state.speedKmh;
    const top = best.state.speedKmh;
    if (speed > top || (speed === top && delivery.createdAt > best.createdAt)) best = delivery;
  }
  return best;
}

/** The start of the local day a time falls in. */
function dayStart(t: number): number {
  const d = new Date(t);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

/**
 * The heading a delivery is grouped under: Today, Yesterday, or the date as
 * the phone writes it. `date` is passed in so the phone's own format is used
 * on screen and a fixed one in tests.
 */
export function dayHeading(t: number, now: number, date: (t: number) => string): string {
  const days = Math.round((dayStart(now) - dayStart(t)) / (24 * 60 * 60 * 1000));
  if (days === 0) return 'Today';
  if (days === 1) return 'Yesterday';
  return date(t);
}

/** A list with a heading before each new day, in the order given (newest first). */
export function groupByDay<T extends { id: string; createdAt: number }>(
  items: readonly T[],
  now: number,
  date: (t: number) => string
): ({ kind: 'day'; key: string; heading: string } | { kind: 'item'; key: string; item: T })[] {
  const rows: ({ kind: 'day'; key: string; heading: string } | { kind: 'item'; key: string; item: T })[] = [];
  let last: string | null = null;
  // Keyed by id and by heading, so a delete never shifts the keys after it.
  for (const item of items) {
    const heading = dayHeading(item.createdAt, now, date);
    if (heading !== last) {
      rows.push({ kind: 'day', key: `day-${heading}`, heading });
      last = heading;
    }
    rows.push({ kind: 'item', key: item.id, item });
  }
  return rows;
}

/** The compare confirm button, by how many are picked out of two. */
export function compareFooterLabel(picked: number): string {
  if (picked <= 0) return 'Choose 2 deliveries';
  if (picked === 1) return 'Choose 1 more delivery';
  return 'Compare 2 deliveries';
}
