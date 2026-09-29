import { PITCH_LENGTH_M } from '../physics/computeSpeed';

/**
 * Where everything sits in the "where to stand" picture, from its width. A
 * camera a little behind and above the phone looks square at the pitch, which
 * runs left to right with a wicket at each end; the phone stands 6.5 m back
 * from the pitch's centre line, inside the 5 to 8 m the guide asks for.
 * The stumps and the phone are drawn larger than life so they read at this
 * size; the distances are true.
 */
export const PLACEMENT = {
  /** The pitch's centre line, metres from the camera. */
  pitchZ: 8.5,
  /** The phone, metres from the camera: 6.5 m in front of the pitch. */
  phoneZ: 2,
  /** How high the camera and the phone stand, metres. */
  camH: 4,
  phoneH: 1.3,
  /** Stumps drawn this much taller than life, to read at diagram size. */
  stumpBoost: 2.2,
} as const;

/** Half the distance between the two sets of stumps. */
const HALF = PITCH_LENGTH_M / 2;

export function placementLayout(width: number) {
  const height = Math.round(width * 0.72);
  const { pitchZ, phoneZ, camH, phoneH, stumpBoost } = PLACEMENT;
  // Wide enough for both wickets, with a margin either side.
  const focal = (0.9 * width * pitchZ) / (PITCH_LENGTH_M + 2.4);
  const horizon = height * 0.14;
  const cx = width / 2;
  const ground = (z: number) => horizon + (camH * focal) / z;
  const scaleAt = (z: number) => focal / z;
  const pitchY = ground(pitchZ);
  const stumpH = 0.71 * scaleAt(pitchZ) * stumpBoost;
  const wickets = [-HALF, HALF].map((x) => ({ x: cx + x * scaleAt(pitchZ), y: pitchY }));
  const phone = {
    x: cx,
    y: horizon + ((camH - phoneH) * focal) / phoneZ,
    w: width * 0.2,
    h: width * 0.11,
  };
  return {
    width,
    height,
    cam: { cx, horizon, focal, camH },
    pitchZ,
    pitchY,
    stumpH,
    wickets,
    phone,
    /** Where the "20.12 m" dimension line runs, above the stumps. */
    ruler: { y: pitchY - stumpH - height * 0.08, from: wickets[0].x, to: wickets[1].x },
    /** How far back the phone stands from the pitch's centre line, metres. */
    standOff: pitchZ - phoneZ,
  };
}
