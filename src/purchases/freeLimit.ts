/** Analyses a free user gets each period. The fourth inside a period needs Pro. */
export const FREE_ANALYSES_PER_PERIOD = 3;

/** A period is seven days from the anchor, not a calendar week. */
export const PERIOD_MS = 7 * 24 * 60 * 60 * 1000;

/** The field the count reads. A whole Session is one. */
export type CountableDelivery = { createdAt: number };

export type Allowance = {
  /** Analyses saved inside the current period. */
  used: number;
  /** What is left of the period's allowance, never below zero. */
  left: number;
  /** When the current period began, or null before the first ever analysis. */
  periodStart: number | null;
  /** When the allowance comes back, or null before the first ever analysis. */
  nextReset: number | null;
};

const usable = (t: unknown): t is number => typeof t === 'number' && Number.isFinite(t);

/**
 * The anchor: the moment of the first ever saved analysis. Set once and never
 * moved, so every period boundary afterwards falls on that same weekday.
 *
 * Passing the stored anchor back keeps it fixed. Only an install with no anchor
 * yet takes one, from the oldest delivery on file, so an install that already
 * has deliveries anchors to its real first analysis rather than to today.
 */
export function resolveAnchor(
  stored: number | null,
  deliveries: readonly CountableDelivery[]
): number | null {
  if (usable(stored)) return stored;
  let earliest: number | null = null;
  for (const delivery of deliveries) {
    if (!usable(delivery.createdAt)) continue;
    if (earliest === null || delivery.createdAt < earliest) earliest = delivery.createdAt;
  }
  return earliest;
}

/**
 * Which seven-day period `now` falls in, counting from the anchor.
 *
 * A `now` before the anchor means the phone's clock has gone backwards. That is
 * read as the first period rather than as a negative one, so winding the clock
 * back cannot hand out a fresh allowance.
 */
export function periodIndex(anchor: number, now: number): number {
  if (!usable(anchor) || !usable(now)) return 0;
  if (now <= anchor) return 0;
  return Math.floor((now - anchor) / PERIOD_MS);
}

/** The start of the period `now` falls in. */
export function periodStart(anchor: number, now: number): number {
  return anchor + periodIndex(anchor, now) * PERIOD_MS;
}

/** When the current period ends and all three come back. */
export function nextReset(anchor: number, now: number): number {
  return periodStart(anchor, now) + PERIOD_MS;
}

/**
 * The allowance as it stands: what has been used inside the current period, what
 * is left, and when it comes back.
 *
 * Counted across every delivery in the period, whoever bowled it. The anchor is
 * the phone's, so the allowance is the phone's too; counting per player would
 * put the two out of step, and give one phone several allowances on a device
 * that has no way to add a second player yet.
 *
 * The period is anchored, so the count drops to zero on the anniversary weekday
 * of the first ever analysis rather than creeping forward with each delivery.
 * The period's own bounds are what decide, so a delivery saved before the
 * current period began is not counted, and neither is one dated after it ends.
 */
export function allowanceIn(
  deliveries: readonly CountableDelivery[],
  anchor: number | null,
  now: number
): Allowance {
  if (anchor === null || !usable(anchor)) {
    return { used: 0, left: FREE_ANALYSES_PER_PERIOD, periodStart: null, nextReset: null };
  }
  const start = periodStart(anchor, now);
  const end = start + PERIOD_MS;
  let used = 0;
  for (const delivery of deliveries) {
    if (!usable(delivery.createdAt)) continue;
    if (delivery.createdAt >= start && delivery.createdAt < end) used += 1;
  }
  return {
    used,
    left: Math.max(0, FREE_ANALYSES_PER_PERIOD - used),
    periodStart: start,
    nextReset: end,
  };
}

/**
 * What a free user is told about their allowance, or null when there is nothing
 * to say. Pro never sees any of this, so Pro never asks.
 *
 * At zero it names the day the allowance returns, which is the anchor's weekday.
 */
export function allowanceLine(
  allowance: Allowance,
  weekday: (t: number) => string
): string {
  if (allowance.left > 0) {
    return `${allowance.left} of ${FREE_ANALYSES_PER_PERIOD} analyses left this week`;
  }
  if (allowance.nextReset === null) {
    return `No analyses left this week`;
  }
  return `All ${FREE_ANALYSES_PER_PERIOD} come back on ${weekday(allowance.nextReset)}`;
}
