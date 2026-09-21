/**
 * What the camera actually produced: the recorded frame size and the frame rate
 * read from the last file, and the bitrate this camera writes when left on its
 * own default. Nothing here is assumed about the camera.
 */
export type RecordingProfile = {
  width: number;
  height: number;
  fps: number;
  /**
   * Bits per second of a recording made with no target requested, measured as
   * file size over duration. Null until such a recording exists. Only ever
   * updated from a default recording, so a Pro recording can never raise the
   * baseline it is compared against.
   */
  defaultBitRate: number | null;
};

/**
 * How far above the camera's own default a Pro target is set. Phones differ a
 * lot in what they write by default (one measured around 34 Mbps at 1080p60), so
 * the target follows the phone rather than a fixed bits-per-pixel figure, which
 * landed below that default and made Pro video worse.
 */
const PRO_GAIN = 1.5;

/**
 * The least a target must exceed the default by to count as higher quality. A
 * target any closer than this is not requested, and nothing claims Pro quality.
 */
export const MIN_PRO_GAIN = 1.2;

/**
 * A ceiling, so a high default cannot ask the encoder for a bitrate no phone
 * should be writing to storage for a three second clip.
 */
export const MAX_BIT_RATE = 48_000_000;

/** A clip shorter than this gives a file size too dominated by the container. */
const MIN_MEASURED_MS = 1000;

const usable = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n) && n > 0;

/**
 * The bitrate to ask for, or null to leave the camera on its own default.
 *
 * Null until this install has made a recording at the default, which is what
 * the first recording on a fresh install always is. After that the target is
 * set clearly above what the camera produced on its own, capped. If the cap
 * leaves it no clearly higher than the default, nothing is requested: asking
 * for a rate at or below the default can only make the video worse.
 *
 * It changes only how the frames are compressed. The resolution and the frame
 * rate are untouched, which is what the measurement reads.
 */
export function highBitRate(profile: RecordingProfile | null | undefined): number | null {
  const observed = profile?.defaultBitRate;
  if (!usable(observed)) return null;
  const target = Math.min(Math.round(observed * PRO_GAIN), MAX_BIT_RATE);
  if (target < observed * MIN_PRO_GAIN) return null;
  return target;
}

/** Bits per second of a finished file, from its size and duration. */
export function observedBitRate(sizeBytes: number, durationMs: number): number | null {
  if (!usable(sizeBytes) || !usable(durationMs) || durationMs < MIN_MEASURED_MS) return null;
  return Math.round((sizeBytes * 8) / (durationMs / 1000));
}

/**
 * What to remember from a finished recording, so the next one can be encoded
 * better. The default bitrate is only taken from a recording that requested
 * nothing; a recording made at a Pro target keeps the default already known.
 */
export function profileFrom(
  info: { width: number; height: number; derivedFps: number; durationMs: number },
  sizeBytes: number | null,
  requestedBitRate: number | null,
  previous: RecordingProfile | null | undefined
): RecordingProfile | null {
  if (!usable(info.width) || !usable(info.height) || !usable(info.derivedFps)) return null;
  const measured =
    requestedBitRate === null && sizeBytes !== null
      ? observedBitRate(sizeBytes, info.durationMs)
      : null;
  return {
    width: info.width,
    height: info.height,
    fps: info.derivedFps,
    defaultBitRate: measured ?? previous?.defaultBitRate ?? null,
  };
}
