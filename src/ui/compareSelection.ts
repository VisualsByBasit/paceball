import type { MeasurementState } from '../physics/measurementState';

/** Compare takes exactly this many deliveries. */
export const COMPARE_COUNT = 2;

export type Selectability = { selectable: true } | { selectable: false; reason: string };

/**
 * Only a measured delivery has a speed and a range to compare. The reason is
 * shown on the dimmed row, so it stays short.
 */
export function compareSelectability(reading: MeasurementState): Selectability {
  switch (reading.kind) {
    case 'measured':
      return { selectable: true };
    case 'not-seen':
      return { selectable: false, reason: "Can't compare: bounce not seen" };
    case 'unusable':
      return { selectable: false, reason: "Can't compare: no reading saved" };
  }
}

/**
 * Tapping a picked delivery unpicks it; tapping another adds it while there is
 * room. A third tap does nothing, so a pick is never dropped without the user
 * seeing it go.
 */
export function togglePick(picked: readonly string[], id: string): string[] {
  if (picked.includes(id)) return picked.filter((p) => p !== id);
  if (picked.length >= COMPARE_COUNT) return [...picked];
  return [...picked, id];
}

/**
 * The older delivery is A and the newer B, so a delta (B - A) reads as change
 * over time. Ties on time fall back to the id, so the order is stable.
 */
export function orderForCompare<T extends { id: string; createdAt: number }>(x: T, y: T): [T, T] {
  if (x.createdAt !== y.createdAt) return x.createdAt < y.createdAt ? [x, y] : [y, x];
  return x.id <= y.id ? [x, y] : [y, x];
}
