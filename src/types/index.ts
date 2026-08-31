export type CalibrationMethod =
  | 'stumps'    // both wickets marked, 20.12 m
  | 'ball'      // ball diameter in hand, ~0.072 m
  | 'height'    // bowler height from profile
  | 'markers';  // two placed objects, paced distance

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
  releaseSpeedKmh: number | null;
  releaseAngleDeg: number | null;
};

export type Player = {
  id: string;
  name: string;
  createdAt: number;
  heightCm?: number;        // for 'height' calibration
  shoeSizeEu?: number;      // for heel-to-toe pacing
};

export type Trend = {
  points: { t: number; speedKmh: number }[];
  best: number;
  avg: number;
  count: number;
};

export type Diff = {
  label: string;
  a: number;
  b: number;
  delta: number;
  better: 'a' | 'b' | 'equal';
};