export type CalibrationMethod =
  | 'stumps'    // both wickets marked, 20.12 m
  | 'ball'      // ball diameter in hand, ~0.072 m
  | 'height'    // bowler height from profile
  | 'markers';  // two placed objects, distance measured or paced

/**
 * How the markers distance was established. Pacing measures the OUTER shoe,
 * not the foot, and the same error repeats on every step rather than
 * averaging out — so each source carries its own uncertainty.
 */
export type MarkerSource =
  | 'measured'             // tape or rule, ~0.5%
  | 'paced-measured-shoe'  // shoe length measured once against A4, ~1%
  | 'paced-shoe-size';     // derived from EU size, ~5%

/**
 * Whether the ball was actually visible in the frame the bounce was marked on.
 *
 * 'seen'      - visible; the reading stands on a mark that was looked at.
 * 'uncertain' - smeared or part-hidden; the mark widens the error range.
 * 'guessed'   - not visible at all. The frame came from context, not from the
 *               ball, so NO speed is derived from it. A number would be invented.
 */
export type MarkConfidence = 'seen' | 'uncertain' | 'guessed';

/** Outer shoe length from EU size. Paris points are 2/3 cm; +1.2 for the sole. */
export const outerShoeCmFromEu = (eu: number) => eu * 0.667 + 1.2;

export type Point = {
  x: number;
  y: number;
  frame: number;
};

export type Session = {
  id: string;
  createdAt: number;
  playerId: string;

  // capture
  videoPath: string;
  framesDir: string;
  fps: number;              // ACTUAL, e.g. 59.82 — never assume 60
  frameCount: number;
  width: number;
  height: number;
  exposureBias: number;

  // calibration — the ruler
  calibrationMethod: CalibrationMethod;
  markerSource?: MarkerSource;   // only when calibrationMethod is 'markers'
  paceCount?: number;            // heel-to-toe paces, when the distance was paced
  calA: Point;
  calB: Point;
  calRealMetres: number;    // 20.12 for stumps
  pixelsPerMetre: number;   // derived

  // measurement — the ball
  release: Point;
  bounce: Point;
  /**
   * How well the bounce frame was seen. Absent on records saved before this was
   * asked, which are read as 'seen'.
   */
  markConfidence?: MarkConfidence;
  travelMetres: number;     // derived, NOT the pitch length

  // results
  /**
   * Average speed to the bounce, or null when markConfidence is 'guessed'. A
   * guessed bounce frame gives a guessed flight time, so there is no measured
   * speed to record — and null is never displayed, exported or put in a trend.
   */
  speedKmh: number | null;
  errorKmh: number | null;
  /** 1 = frame timing only. 2 = timing, reference and pixel marking combined. */
  uncertaintyModelVersion: 1 | 2;
  releaseSpeedKmh: number | null;
  releaseAngleDeg: number | null;
};

export type Player = {
  id: string;
  name: string;
  createdAt: number;
  heightCm?: number;        // for 'height' calibration
  shoeSizeEu?: number;      // converted with outerShoeCmFromEu, ~5%
  shoeLengthCm?: number;    // measured outer length, ~1%. Wins if both are set.
};

export type TrendPoint = {
  id: string;              // the session id, so History can open it directly
  t: number;
  speedKmh: number;
  errorKmh: number;
};

export type Trend = {
  points: TrendPoint[];
  best: number | null;     // null when there are no sessions
  avg: number | null;
  count: number;
};

export type Diff = {
  label: string;
  a: number;
  b: number;
  delta: number;
  better: 'a' | 'b' | 'equal';
};
