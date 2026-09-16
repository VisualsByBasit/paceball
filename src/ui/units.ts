import type { SpeedUnit } from '../settings/settings';

/** Exact, by definition of the international mile. */
const KM_PER_MILE = 1.609344;

/** A speed in the chosen unit. Readings are stored in km/h and converted here only. */
export function speedIn(kmh: number, unit: SpeedUnit): number {
  return unit === 'mph' ? kmh / KM_PER_MILE : kmh;
}

/**
 * An error range in the chosen unit, whole and rounded up. The stored range is
 * already rounded up in km/h; rounding the converted figure up again keeps it
 * from ever claiming more precision than was measured.
 */
export function errorIn(errorKmh: number, unit: SpeedUnit): number {
  return unit === 'mph' ? Math.ceil(errorKmh / KM_PER_MILE) : errorKmh;
}

export function formatSpeed(kmh: number, unit: SpeedUnit): string {
  return speedIn(kmh, unit).toFixed(1);
}

/** Short unit, for beside a number. */
export function unitLabel(unit: SpeedUnit): string {
  return unit === 'mph' ? 'mph' : 'km/h';
}

/** The unit as a screen reader should say it. */
export function unitSpoken(unit: SpeedUnit): string {
  return unit === 'mph' ? 'miles per hour' : 'kilometres per hour';
}
