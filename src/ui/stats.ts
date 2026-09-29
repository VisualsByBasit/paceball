import type { MeasurementState } from '../physics/measurementState';
import type { SpeedUnit } from '../settings/settings';
import type { MarkConfidence } from '../types';
import { countsAsReading, needsChecking, personalBest, WEEK_MS, type ListedDelivery } from './deliveries';
import { readingView, type MeasuredReading } from './reading';

/** A saved delivery as Stats reads it: its reading, and how the bounce was marked. */
export type StatsDelivery = ListedDelivery & { confidence: MarkConfidence };

/** One point on "Speed over time": a measured, plausible reading with its own range. */
export type SpeedPoint = { id: string; t: number; view: MeasuredReading };

/** A day's bar on "Deliveries per day". */
export type DayCount = { start: number; count: number };

export type StatsSummary = {
  /** Every saved delivery, whatever it reads. */
  deliveries: number;
  /** Deliveries whose reading counts: measured and plausible. */
  measured: number;
  /** Deliveries saved in the seven days up to now. */
  thisWeek: number;
  best: StatsDelivery | null;
  /** Oldest to newest, plausible measured readings only. */
  points: SpeedPoint[];
  /** The last seven local days, oldest first, today last. */
  perDay: DayCount[];
  /**
   * How the bounce was marked, over the deliveries Stats counts (every one but
   * an implausible reading). A record saved before the question was asked
   * reads as seen, as everywhere else.
   */
  confidence: { seen: number; uncertain: number; guessed: number; total: number };
  /** Measured against no speed, over the same deliveries. */
  outcome: { measured: number; noSpeed: number };
  /** Implausible readings: saved and listed, but left out of every figure above but `deliveries`. */
  toCheck: number;
};

/** The start of the local day a time falls in. */
export function localDayStart(t: number): number {
  const d = new Date(t);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

/** The last `days` local days up to and including today, oldest first, each with its count. */
export function deliveriesPerDay(times: readonly number[], now: number, days = 7): DayCount[] {
  const today = localDayStart(now);
  const out: DayCount[] = [];
  for (let i = days - 1; i >= 0; i--) {
    // Stepped by calendar day rather than 24 h, so a clock change cannot skip one.
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    out.push({ start: d.getTime(), count: 0 });
  }
  for (const t of times) {
    const start = localDayStart(t);
    const slot = out.find((day) => day.start === start);
    if (slot) slot.count += 1;
  }
  return out;
}

/**
 * Everything the Stats screen shows, from the saved deliveries alone. Nothing
 * is sampled or invented: an empty list gives zeros and nulls, never a speed.
 * Implausible readings (off the scale, or a range wider than 25 km/h) count as
 * saved deliveries and nowhere else.
 */
export function statsSummary(list: readonly StatsDelivery[], unit: SpeedUnit, now: number): StatsSummary {
  const counted = list.filter((d) => !needsChecking(d.state, unit));
  const points = counted
    .filter((d) => countsAsReading(d.state, unit))
    .sort((a, b) => a.createdAt - b.createdAt || a.id.localeCompare(b.id))
    .flatMap((d): SpeedPoint[] => {
      const view = readingView(d.state, unit);
      return view.kind === 'measured' ? [{ id: d.id, t: d.createdAt, view }] : [];
    });
  const confidence = { seen: 0, uncertain: 0, guessed: 0, total: counted.length };
  for (const d of counted) confidence[d.confidence] += 1;
  return {
    deliveries: list.length,
    measured: points.length,
    thisWeek: list.filter((d) => d.createdAt <= now && now - d.createdAt < WEEK_MS).length,
    best: personalBest(list, unit),
    points,
    perDay: deliveriesPerDay(list.map((d) => d.createdAt), now),
    confidence,
    outcome: { measured: points.length, noSpeed: counted.length - points.length },
    toCheck: list.length - counted.length,
  };
}

/** A share as a whole percentage, and 0 of nothing is 0, never NaN. */
export function percent(part: number, whole: number): number {
  return whole > 0 ? Math.round((part / whole) * 100) : 0;
}

/**
 * How many KPI tiles fit across without their text overrunning: each needs
 * `minTile` dp at the user's text size, with `gap` between. Never fewer than
 * one, never more than `max`.
 */
export function tileColumns(width: number, fontScale: number, minTile: number, gap: number, max: number): number {
  const need = minTile * Math.max(fontScale, 1);
  for (let n = max; n > 1; n--) {
    if ((width - gap * (n - 1)) / n >= need) return n;
  }
  return 1;
}

/**
 * A smooth line through points that never bends past them: monotone cubic
 * (Fritsch-Carlson), so between two readings the line stays between their
 * values and never draws a speed faster or slower than its neighbours. Returns
 * the two control points for each segment.
 */
export function monotoneControls(
  xs: readonly number[],
  ys: readonly number[]
): { c1: [number, number]; c2: [number, number] }[] {
  const n = xs.length;
  if (n < 2) return [];
  const h: number[] = [];
  const delta: number[] = [];
  for (let i = 0; i < n - 1; i++) {
    h.push(xs[i + 1] - xs[i]);
    delta.push(h[i] === 0 ? 0 : (ys[i + 1] - ys[i]) / h[i]);
  }
  const m: number[] = new Array(n).fill(0);
  m[0] = delta[0];
  m[n - 1] = delta[n - 2];
  for (let i = 1; i < n - 1; i++) {
    m[i] = delta[i - 1] * delta[i] <= 0 ? 0 : (delta[i - 1] + delta[i]) / 2;
  }
  for (let i = 0; i < n - 1; i++) {
    if (delta[i] === 0) {
      m[i] = 0;
      m[i + 1] = 0;
      continue;
    }
    const a = m[i] / delta[i];
    const b = m[i + 1] / delta[i];
    const s = a * a + b * b;
    if (s > 9) {
      const tau = 3 / Math.sqrt(s);
      m[i] = tau * a * delta[i];
      m[i + 1] = tau * b * delta[i];
    }
  }
  const out: { c1: [number, number]; c2: [number, number] }[] = [];
  for (let i = 0; i < n - 1; i++) {
    const d = h[i] / 3;
    out.push({ c1: [xs[i] + d, ys[i] + m[i] * d], c2: [xs[i + 1] - d, ys[i + 1] - m[i + 1] * d] });
  }
  return out;
}

/** Which point a tap at `x` is nearest to, on a chart with points at `xs`. */
export function nearestIndex(xs: readonly number[], x: number): number {
  let best = 0;
  for (let i = 1; i < xs.length; i++) {
    if (Math.abs(xs[i] - x) < Math.abs(xs[best] - x)) best = i;
  }
  return best;
}

/** For callers that list states rather than deliveries. */
export function confidenceOf(state: MeasurementState, markConfidence: MarkConfidence | undefined): MarkConfidence {
  if (state.kind === 'not-seen') return 'guessed';
  return markConfidence ?? 'seen';
}
