import type { CalibrationMethod, MarkConfidence, MarkerSource, Point, Session } from '../types';

/**
 * Stumps to stumps on a full-size cricket pitch. This is the ruler for
 * 'stumps' calibration — it is NOT the distance the ball travels.
 */
export const PITCH_LENGTH_M = 20.12;

/**
 * The longest ground a real delivery can cover between release and bounce.
 *
 * The ball is released about 2 m past the crease and pitches short of the far
 * stumps, so real travel runs about 8-14 m and cannot reach the pitch length.
 * Past this the marks are wrong, whatever the ruler was — this bound is
 * physical, so it holds for every calibration method.
 */
export const MAX_PLAUSIBLE_TRAVEL_M = 18;

/** A confidence that still yields a reading. 'guessed' yields none at all. */
type MeasuredConfidence = Exclude<MarkConfidence, 'guessed'>;

/**
 * The long edge, in pixels, of the frames the four points are marked on. The
 * extractor caps every frame here, so a tap on a 4K clip is still a tap in a
 * 1280 px image — and that is the space MARK_SIGMA_PX is quoted in. Capture
 * takes its cap from this, so the two cannot drift apart.
 */
export const MARKING_LONG_EDGE_PX = 1280;

/**
 * Timing uncertainty, in frames — k in the model below. Neither release nor
 * bounce can be pinned inside a frame's exposure, so the frame delta is only
 * good to ±1 at each end. A bounce that was hard to see doubles that.
 */
const K_TIMING: Record<MeasuredConfidence, number> = { seen: 2, uncertain: 4 };

/**
 * How far a tap can land from the thing it marks, in pixels of the space the
 * points are given in. A smeared ball is far harder to hit than a stump base.
 */
const MARK_SIGMA_PX: Record<MeasuredConfidence, number> = { seen: 3, uncertain: 10 };

/** How well each fixed reference length is known, as a fraction of itself. */
const FIXED_REFERENCE_UNCERTAINTY: Record<Exclude<CalibrationMethod, 'markers'>, number> = {
  stumps: 0.005,
  ball: 0.01,
  height: 0.02,
};

/**
 * Pacing measures the OUTER shoe, not the foot, and the same error repeats on
 * every step rather than averaging out — so each source is known differently.
 */
const MARKER_UNCERTAINTY: Record<MarkerSource, number> = {
  measured: 0.005,
  'paced-measured-shoe': 0.01,
  'paced-shoe-size': 0.05,
};

/**
 * A markers session that recorded no source. Nothing in the stored data can say
 * whether the distance was taped or paced, so it takes the widest of the three
 * rather than flattering itself with the narrowest. Collecting markerSource at
 * marking time is what narrows it.
 */
const UNKNOWN_MARKER_UNCERTAINTY = MARKER_UNCERTAINTY['paced-shoe-size'];

/** How well the real-world reference length itself is known, as a fraction. */
export function referenceUncertainty(
  method: CalibrationMethod,
  markerSource?: MarkerSource
): number {
  if (method !== 'markers') return FIXED_REFERENCE_UNCERTAINTY[method];
  return markerSource === undefined
    ? UNKNOWN_MARKER_UNCERTAINTY
    : MARKER_UNCERTAINTY[markerSource];
}

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
  /** Which ruler the calibration marks span — sets how well it is known. */
  calibrationMethod: CalibrationMethod;
  /** How the markers distance was established. Only read for 'markers'. */
  markerSource?: MarkerSource;
  /** Whether the ball was visible in the frame the bounce was marked on. */
  markConfidence: MarkConfidence;
  /**
   * Tap uncertainty, in pixels of the space the four points are given in.
   * Defaults to MARK_SIGMA_PX for the confidence.
   *
   * Points marked on the extracted JPEG use the default. A caller working in
   * the video's own pixels must scale this by the same factor it scaled the
   * points up by — otherwise the pixel terms shrink by that factor and the
   * reading claims precision that was never marked.
   */
  pixelSigma?: number;
};

export type SpeedResult = {
  /**
   * Average speed over the ball's flight to the bounce, in km/h. null when the
   * bounce was guessed — there is no measured flight time to divide by.
   */
  speedKmh: number | null;
  /** Uncertainty either side of speedKmh, whole km/h, rounded up. null with it. */
  errorKmh: number | null;
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
 * The chosen reference is the ruler: the two calibration marks establish how
 * many pixels a metre is worth, and that scale is then applied to the much
 * shorter distance the ball actually travelled. Reading the ball's travel as
 * the full pitch length would nearly double every result.
 *
 * The error range combines four independent terms in quadrature:
 *
 *   relative² = (kTiming / frameDelta)²   the frame the marks landed on
 *             + refUncertainty²            the reference length itself
 *             + (2σ / calPixelDist)²       marking the calibration
 *             + (2σ / travelPixelDist)²    marking release and bounce
 *
 * The pixel terms matter more than the reference values. ±3 px across stumps
 * 1000 px apart is 0.6%; the same ±3 px across a ball 12 px wide is 50%. Ball
 * calibration has to report itself as that wide when the ball is small in
 * frame, which timing alone never did.
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
  calibrationMethod,
  markerSource,
  markConfidence,
  pixelSigma,
}: SpeedInput): SpeedResult {
  if (!Number.isFinite(fps) || fps <= 0) {
    throw new Error('Frame rate must be a positive number read from the clip.');
  }
  if (!Number.isFinite(calRealMetres) || calRealMetres <= 0) {
    throw new Error('Calibration distance must be a positive number of metres.');
  }
  if (pixelSigma !== undefined && (!Number.isFinite(pixelSigma) || pixelSigma <= 0)) {
    throw new Error('Pixel uncertainty must be a positive number of pixels.');
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

  if (markConfidence === 'guessed') {
    // The bounce frame was not seen, so the flight time behind any speed would
    // be a guess. Where the marks sit is still reported; the number that would
    // look measured is not produced at all.
    return {
      speedKmh: null,
      errorKmh: null,
      travelMetres,
      pixelsPerMetre,
      frameDelta,
      seconds,
    };
  }

  const speedKmh = (travelMetres / seconds) * 3.6;

  // Four independent relative uncertainties, combined in quadrature — hypot is
  // the root of the sum of squares. Rounded up, because understating the error
  // is worse than overstating it.
  const sigma = pixelSigma ?? MARK_SIGMA_PX[markConfidence];
  const relative = Math.hypot(
    K_TIMING[markConfidence] / frameDelta,
    referenceUncertainty(calibrationMethod, markerSource),
    (2 * sigma) / calPixels,
    (2 * sigma) / travelPixels
  );
  const errorKmh = Math.ceil(speedKmh * relative);

  return { speedKmh, errorKmh, travelMetres, pixelsPerMetre, frameDelta, seconds };
}

/**
 * What the error range is recomputed from: the reading, the four marks and the
 * space they live in, and the reference. A whole `Session` is one; so is a
 * delivery still on Result, before anything has been saved.
 */
export type MeasurableSession = Pick<
  Session,
  | 'speedKmh'
  | 'markConfidence'
  | 'calA'
  | 'calB'
  | 'release'
  | 'bounce'
  | 'width'
  | 'height'
  | 'calibrationMethod'
  | 'markerSource'
>;

/**
 * How far a stored session's points were scaled up on the way to disk.
 *
 * Points are marked on the extracted JPEG and saved in the video's own pixels,
 * so a saved mark sits this many times further from its neighbour than the tap
 * that made it. The pixel terms are ratios, so they only come out right if σ is
 * scaled by the same factor — otherwise a 4K clip's reading would claim three
 * times the precision anyone actually marked.
 */
function markingScale(width: number, height: number): number {
  const longEdge = Math.max(width, height);
  if (!Number.isFinite(longEdge) || longEdge <= 0) return 1;
  return longEdge / Math.min(MARKING_LONG_EDGE_PX, longEdge);
}

/**
 * The full v2 error range for a delivery already on disk, in whole km/h.
 *
 * Version 1 records carry a range built from frame timing alone, which treats
 * the ruler as exact and both markings as perfect. Side by side with a v2
 * reading their ± means a different thing, so the stored range is recomputed on
 * read rather than shown as it was written.
 *
 * Every term the full model needs is already in the record — the four marks,
 * the reference and how it was established, the frame rate, the dimensions the
 * points live in. So this is the same arithmetic computeSpeed did, run again on
 * what was saved: exact, not an estimate of what the range would have been. The
 * speed itself is untouched; only the range widens.
 *
 * Legacy records take the defaults defined above. A markers session with no
 * recorded source takes the widest of the three, because nothing stored can say
 * whether the gap was taped or paced; an absent markConfidence reads as seen.
 *
 * Returns null where there is no range to return: a guessed bounce has no
 * reading for one to sit either side of. Returns null too, rather than
 * throwing, for a record whose marks cannot produce one — this runs on a read,
 * and a degenerate mark is not worth failing the read over.
 *
 * Pure, and free of the data layer by design: src/data imports this, never the
 * other way round.
 */
export function sessionErrorKmh(session: MeasurableSession): number | null {
  const { speedKmh } = session;
  if (speedKmh === null || !Number.isFinite(speedKmh)) return null;

  // Absent on records saved before the question was asked, and read as seen —
  // the same default the rest of the app reads them with. A guessed bounce
  // stored with a speed is what validation exists to reject, so it yields
  // nothing here either.
  const confidence = session.markConfidence ?? 'seen';
  if (confidence === 'guessed') return null;

  const calPixels = distance(session.calA, session.calB);
  const travelPixels = distance(session.release, session.bounce);
  const frameDelta = session.bounce.frame - session.release.frame;
  if (!(calPixels > 0) || !(travelPixels > 0) || !(frameDelta > 0)) return null;

  const sigma = MARK_SIGMA_PX[confidence] * markingScale(session.width, session.height);
  const relative = Math.hypot(
    K_TIMING[confidence] / frameDelta,
    referenceUncertainty(session.calibrationMethod, session.markerSource),
    (2 * sigma) / calPixels,
    (2 * sigma) / travelPixels
  );
  return Math.ceil(speedKmh * relative);
}
