/**
 * Readers for expo-router search params. A param can arrive as one string, a
 * repeated param as an array, or not at all; screens that cross the capture,
 * mark and result steps read their numbers through these rather than trusting
 * a default.
 */
type Param = string | string[] | undefined;

/** The param's text, or '' when it is missing. A repeated param gives its first value. */
export function first(value: Param): string {
  return Array.isArray(value) ? (value[0] ?? '') : (value ?? '');
}

/** A finite number, or null. An empty param is missing, not zero. */
export function finiteNumber(value: Param): number | null {
  const raw = first(value).trim();
  if (raw === '') return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

/** A number above zero, or null. fps and frame counts have no sane default. */
export function positiveNumber(value: Param): number | null {
  const n = finiteNumber(value);
  return n !== null && n > 0 ? n : null;
}
