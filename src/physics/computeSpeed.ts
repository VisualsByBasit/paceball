import type { Point } from '../types';

/**
 * Stumps to stumps on a full-size cricket pitch. This is the ruler for
 * 'stumps' calibration — it is NOT the distance the ball travels.
 */
export const PITCH_LENGTH_M = 20.12;

/**
 * One frame of uncertainty at each end of the measurement. Neither release nor
 * bounce can be pinned inside a frame's exposure, so the frame delta is only
 * good to ±1 at each end.
 */
const FRAME_UNCERTAINTY = 2;

export type SpeedInput = {
  /** First calibration point — one set of stumps. */
  calA: Point;
  /** Second calibration point — the other set of stumps. */
  calB: Point;
  /** The ball as it leaves the hand. */
  release: Point;
  /** The ball as it pitches. */
  bounce: Point;
  /** Real-world distance between calA and calB, in metres. */
  calRealMetres: number;
  /** Frames per second, read from the file. Never assumed. */
  fps: number;
};

export type SpeedResult = {
  /** Average speed over the ball's flight to the bounce, in km/h. */
  speedKmh: number;
  /** Uncertainty either side of speedKmh, whole km/h, rounded up. */
  errorKmh: number;
  /**
   * Ground the ball actually covered between the marks. Around 11 m on a full
   * delivery — the ball is released past the crease and pitches short of the
   * far stumps, so this is well under the pitch length.
   */
  travelMetres: number;
  /** The scale factor derived from the calibration marks. */
  pixelsPerMetre: number;
  /** Frames between release and bounce. */
  frameDelta: number;
  /** Flight time to the bounce, in seconds. */
  seconds: number;
};

function distance(a: Point, b: Point): number {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

/**
 * Turns four marked points into an average speed to the bounce.
 *
 * The pitch is the ruler: the two calibration marks establish how many pixels a
 * metre is worth, and that scale is then applied to the much shorter distance
 * the ball actually travelled. Reading the ball's travel as the full pitch
 * length would nearly double every result.
 *
 * Throws on input that cannot produce a meaningful reading rather than
 * returning a number that looks measured but is not.
 */
export function computeSpeed({
  calA,
  calB,
  release,
  bounce,
  calRealMetres,
  fps,
}: SpeedInput): SpeedResult {
  if (!Number.isFinite(fps) || fps <= 0) {
    throw new Error('Frame rate must be a positive number read from the clip.');
  }
  if (!Number.isFinite(calRealMetres) || calRealMetres <= 0) {
    throw new Error('Calibration distance must be a positive number of metres.');
  }

  const calPixels = distance(calA, calB);
  if (calPixels <= 0) {
    throw new Error(
      'The two calibration marks are on the same spot, so there is no scale to measure against.'
    );
  }

  const pixelsPerMetre = calPixels / calRealMetres;

  const travelPixels = distance(release, bounce);
  if (travelPixels <= 0) {
    throw new Error('Release and bounce are on the same spot, so the ball covered no ground.');
  }

  const travelMetres = travelPixels / pixelsPerMetre;

  const frameDelta = bounce.frame - release.frame;
  if (!Number.isInteger(frameDelta) || frameDelta <= 0) {
    throw new Error('Bounce must be on a later frame than release.');
  }

  const seconds = frameDelta / fps;
  const speedKmh = (travelMetres / seconds) * 3.6;

  // Relative uncertainty from the frame count, carried onto the speed. Rounded
  // up, because understating the error is worse than overstating it.
  const errorKmh = Math.ceil(speedKmh * (FRAME_UNCERTAINTY / frameDelta));

  return { speedKmh, errorKmh, travelMetres, pixelsPerMetre, frameDelta, seconds };
}
