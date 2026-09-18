/**
 * How much of the frame's width the reference should span.
 *
 * The app measures one pixels-per-metre from the reference and applies it along
 * the whole pitch. The further away the phone is, the more the real scale varies
 * along that line, and a reading taken from a small reference reads low. That
 * error is NOT in the error range, which only knows about frame timing, the
 * reference length and how well the marks were placed. Filling the frame with
 * the reference is what keeps it small.
 *
 * 0.6 is deliberately forgiving: it flags the framing that costs accuracy
 * without nagging about a delivery shot from a sensible distance.
 */
export const TIGHT_REFERENCE_FRACTION = 0.6;

export type Framing = {
  /** The reference's span as a fraction of the frame's width. */
  fraction: number;
  /** Whether the reference filled enough of the frame to trust the scale. */
  tight: boolean;
};

/**
 * How well the reference filled the frame, once the marks exist.
 *
 * Before the marks are placed there is nothing to measure this from, which is
 * why the guide at capture is guidance and makes no claim about the framing it
 * cannot see. Returns null when the inputs cannot describe a span at all.
 */
export function referenceFraming(
  referenceSpanPx: number,
  frameWidthPx: number
): Framing | null {
  if (!Number.isFinite(referenceSpanPx) || referenceSpanPx <= 0) return null;
  if (!Number.isFinite(frameWidthPx) || frameWidthPx <= 0) return null;
  const fraction = referenceSpanPx / frameWidthPx;
  return { fraction, tight: fraction >= TIGHT_REFERENCE_FRACTION };
}

/** The span between two marked points, in the pixels they were marked in. */
export function spanBetween(
  a: { x: number; y: number },
  b: { x: number; y: number }
): number {
  return Math.hypot(b.x - a.x, b.y - a.y);
}
