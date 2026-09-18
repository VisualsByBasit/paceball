/**
 * What the camera actually produced last time: the recorded frame size and the
 * frame rate read from that file. Nothing here is assumed about the camera.
 */
export type RecordingProfile = {
  width: number;
  height: number;
  fps: number;
};

/**
 * Bits per pixel per frame for a high quality H.264/HEVC encode. The target is
 * derived from the recording itself rather than written down as a number of
 * megabits, so it follows whatever this phone actually records at.
 */
const BITS_PER_PIXEL_PER_FRAME = 0.12;

/**
 * A ceiling, so an unusually large reported frame cannot ask the encoder for a
 * bitrate no phone should be writing to storage for a three second clip.
 */
export const MAX_BIT_RATE = 48_000_000;

/** Below this there is nothing to gain, so the default is left alone. */
const MIN_BIT_RATE = 8_000_000;

const usable = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n) && n > 0;

/**
 * The bitrate to ask for, or null to leave the camera on its own default.
 *
 * Null whenever the profile is missing or unusable, which is what happens before
 * this install has recorded anything: the first clip records at the default and
 * every later one has a real profile to derive from. The SDK takes this as a
 * target the encoder may not meet exactly, and it reports no list of supported
 * bitrates, so this never asserts that a particular rate is available; it asks
 * for one scaled to what this camera has already delivered, and accepts
 * whatever comes back.
 *
 * It changes only how the frames are compressed. The resolution and the frame
 * rate are untouched, which is what the measurement reads.
 */
export function highBitRate(profile: RecordingProfile | null | undefined): number | null {
  if (!profile) return null;
  const { width, height, fps } = profile;
  if (!usable(width) || !usable(height) || !usable(fps)) return null;
  const target = Math.round(width * height * fps * BITS_PER_PIXEL_PER_FRAME);
  if (target < MIN_BIT_RATE) return null;
  return Math.min(target, MAX_BIT_RATE);
}

/** What to remember from a finished recording, so the next one can be encoded better. */
export function profileFrom(info: {
  width: number;
  height: number;
  derivedFps: number;
}): RecordingProfile | null {
  if (!usable(info.width) || !usable(info.height) || !usable(info.derivedFps)) return null;
  return { width: info.width, height: info.height, fps: info.derivedFps };
}
