export type Session = {
  id: string;
  createdAt: number;
  playerId: string;

  videoPath: string;
  framesDir: string;
  fps: number;
  frameCount: number;

  distanceM: number;
  releaseFrame: number;
  bounceFrame: number;

  speedKmh: number;
  errorKmh: number;
  releaseSpeedKmh: number | null;
  releaseAngleDeg: number | null;
};

export type Player = {
  id: string;
  name: string;
  createdAt: number;
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
  better: "a" | "b" | "equal";
};