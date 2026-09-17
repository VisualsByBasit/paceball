/** Analyses a free user may save in a week. The fourth in seven days needs Pro. */
export const FREE_ANALYSES_PER_WEEK = 3;

/** Rolling, not calendar: the last seven days from now, to the millisecond. */
export const FREE_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

/** The fields the count reads. A whole Session is one. */
export type CountableDelivery = { createdAt: number; playerId: string };

/**
 * How many deliveries this player saved inside the rolling window.
 *
 * The edge is exclusive: a delivery exactly FREE_WINDOW_MS old has left the
 * window, so the allowance comes back seven days after it was used rather than
 * a moment later. Counted per player, because the limit follows the bowler
 * whose deliveries they are.
 */
export function analysesInWindow(
  deliveries: readonly CountableDelivery[],
  now: number,
  playerId: string | null
): number {
  if (playerId === null) return 0;
  const since = now - FREE_WINDOW_MS;
  let count = 0;
  for (const delivery of deliveries) {
    if (delivery.playerId !== playerId) continue;
    if (!Number.isFinite(delivery.createdAt)) continue;
    // Future timestamps would otherwise fall outside the window and hand back
    // free analyses to a phone whose clock is ahead.
    if (delivery.createdAt > since) count += 1;
  }
  return count;
}

/** How many a free user has left, never below zero. */
export function freeAnalysesLeft(used: number): number {
  return Math.max(0, FREE_ANALYSES_PER_WEEK - used);
}
