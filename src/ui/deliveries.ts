import type { MeasurementState } from '../physics/measurementState';
import { implausible } from './gauge';

/** A delivery as a list reads it: which one, when, and what it can honestly show. */
export type ListedDelivery = { id: string; createdAt: number; state: MeasurementState };

/**
 * Whether a delivery's reading counts toward a best, the Home hero, Stats and
 * Compare: measured, and not implausible by the rules the "Off the scale" and
 * "very wide range" cautions use. An implausible reading is still saved and
 * listed, with "Check this reading"; it just never counts.
 */
export function countsAsReading(
  state: MeasurementState
): state is Extract<MeasurementState, { kind: 'measured' }> {
  return state.kind === 'measured' && !implausible(state);
}

/** A measured reading that breaks either rule, for its "Check this reading" tag. */
export function needsChecking(state: MeasurementState): boolean {
  return state.kind === 'measured' && implausible(state);
}

/** Only the deliveries whose readings count, in the order given. */
export function countingDeliveries<T extends ListedDelivery>(deliveries: readonly T[]): T[] {
  return deliveries.filter((d) => countsAsReading(d.state));
}

/**
 * The personal best: the highest measured speed, and of equals the most
 * recent. Only a measured delivery counts, read through its own
 * measurementState, so its range is the recomputed one, and never an
 * implausible one: a best off the scale would be the marks' mistake, not the
 * bowler's pace. Null with nothing that counts: a best of 0.0 would not be a
 * reading.
 */
export function personalBest<T extends ListedDelivery>(deliveries: readonly T[]): T | null {
  let best: T | null = null;
  for (const delivery of deliveries) {
    if (!countsAsReading(delivery.state)) continue;
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

export const HERO_BEST = 'Personal best · Highest estimate';
export const HERO_FEATURED = 'Featured delivery';

/**
 * What Home's hero shows: the delivery the player chose, while it is saved and
 * its reading counts, otherwise the personal best. It is called the personal
 * best only when it is the highest estimate, so a slower delivery is never
 * named one. Null with nothing that counts.
 */
export function heroDelivery<T extends ListedDelivery>(
  deliveries: readonly T[],
  chosenId: string | null | undefined
): { delivery: T; isBest: boolean; title: string } | null {
  const best = personalBest(deliveries);
  if (best === null || best.state.kind !== 'measured') return null;
  const chosen = chosenId
    ? deliveries.find((d) => d.id === chosenId && countsAsReading(d.state))
    : undefined;
  const delivery = chosen ?? best;
  const isBest =
    delivery.id === best.id ||
    (delivery.state.kind === 'measured' && delivery.state.speedKmh >= best.state.speedKmh);
  return { delivery, isBest, title: isBest ? HERO_BEST : HERO_FEATURED };
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

/**
 * The newest delivery whose reading counts, for "Latest reading". Deliveries
 * arrive newest first, as listSessions returns them. Null when none counts.
 */
export function latestMeasured<T extends ListedDelivery>(deliveries: readonly T[]): T | null {
  return deliveries.find((d) => countsAsReading(d.state)) ?? null;
}

/**
 * How many deliveries carry a reading that counts: guessed, unusable and
 * implausible ones do not.
 */
export function measuredCount(deliveries: readonly ListedDelivery[]): number {
  return countingDeliveries(deliveries).length;
}

/** A week, for Home's "This week": the seven days up to now, not a calendar week. */
export const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

/** Measured deliveries saved in the seven days up to `now`. Guessed and unusable ones do not count. */
export function measuredThisWeek(deliveries: readonly ListedDelivery[], now: number): number {
  return deliveries.filter(
    (d) => d.state.kind === 'measured' && d.createdAt <= now && now - d.createdAt < WEEK_MS
  ).length;
}
