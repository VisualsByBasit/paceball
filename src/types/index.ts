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
  travelMetres: number;     // derived, NOT the pitch length

  // results
  speedKmh: number;         // avg speed to bounce
  errorKmh: number;
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
