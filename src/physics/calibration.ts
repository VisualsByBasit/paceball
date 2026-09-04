import { PITCH_LENGTH_M } from './computeSpeed';
import type { CalibrationMethod } from '../types';

/**
 * A regulation ball measures 224-229 mm around, so a shade over 72 mm across.
 * The shortest ruler on offer, and the least forgiving of a sloppy tap.
 */
export const BALL_DIAMETER_M = 0.072;

/** Sanity bounds for a distance the user measures themselves, in metres. */
export const MIN_CUSTOM_METRES = 0.1;
export const MAX_CUSTOM_METRES = 100;

export type CalibrationTap = {
  label: string;
  short: string;
  hint: string;
};

export type CalibrationSpec = {
  method: CalibrationMethod;
  /** Full name, for the picker. */
  title: string;
  /** Two or three words, for the chip on the marking screen. */
  short: string;
  /** One line under the title, saying what the two taps span. */
  detail: string;
  /**
   * Where the real-world distance comes from:
   * 'fixed'   - a known constant
   * 'entered' - the user measures and types it
   * 'profile' - the bowler's height, read from their player profile
   */
  source: 'fixed' | 'entered' | 'profile';
  /** The distance in metres. Set for 'fixed' methods, null for the rest. */
  metres: number | null;
  /**
   * Whether both taps have to land on the same frame. A wicket or a cone does
   * not move between frames; a ball in the hand and a standing bowler do.
   */
  sameFrame: boolean;
  /** What to re-check when a reading comes back implausible. */
  checkHint: string;
  a: CalibrationTap;
  b: CalibrationTap;
};

/** Picker order. Stumps first — it is the default and the most accurate. */
export const CALIBRATION_ORDER: CalibrationMethod[] = [
  'stumps',
  'markers',
  'ball',
  'height',
];

export const CALIBRATION_SPECS: Record<CalibrationMethod, CalibrationSpec> = {
  stumps: {
    method: 'stumps',
    title: 'Both sets of stumps',
    short: 'Stumps',
    detail: 'A full pitch, wicket to wicket.',
    source: 'fixed',
    metres: PITCH_LENGTH_M,
    sameFrame: false,
    checkHint: 'Check both wicket marks are on the base of the stumps',
    a: {
      label: 'Near wicket',
      short: 'Near',
      hint: 'Tap the base of the stumps nearest the camera. Any frame.',
    },
    b: {
      label: 'Far wicket',
      short: 'Far',
      hint: 'Tap the base of the stumps at the other end. Any frame.',
    },
  },
  markers: {
    method: 'markers',
    title: 'Two markers',
    short: 'Markers',
    detail: 'Cones, shoes, anything a known distance apart.',
    source: 'entered',
    metres: null,
    sameFrame: false,
    checkHint: 'Check the distance you entered matches the gap between the markers',
    a: {
      label: 'Point A',
      short: 'A',
      hint: 'Tap the base of the first marker. Any frame.',
    },
    b: {
      label: 'Point B',
      short: 'B',
      hint: 'Tap the base of the second marker. Any frame.',
    },
  },
  ball: {
    method: 'ball',
    title: 'The ball',
    short: 'Ball',
    detail: 'Marked across the ball in the hand, before release.',
    source: 'fixed',
    metres: BALL_DIAMETER_M,
    sameFrame: true,
    checkHint: 'Check the two marks span the ball itself, not the hand around it',
    a: {
      label: 'Left edge',
      short: 'Left',
      hint: 'Scrub to a frame with the ball in the hand, then tap its left edge.',
    },
    b: {
      label: 'Right edge',
      short: 'Right',
      hint: 'Tap the right edge of the same ball, on the same frame.',
    },
  },
  height: {
    method: 'height',
    title: "Bowler's height",
    short: 'Height',
    detail: 'Head to feet, taken from the player profile.',
    source: 'profile',
    metres: null,
    sameFrame: true,
    checkHint: 'Check the head and feet marks are on the bowler standing upright',
    a: {
      label: 'Head',
      short: 'Head',
      hint: 'Scrub to a frame where the bowler stands upright, then tap the top of the head.',
    },
    b: {
      label: 'Feet',
      short: 'Feet',
      hint: 'Tap the ground at their feet, on the same frame.',
    },
  },
};

export function isCalibrationMethod(value: string): value is CalibrationMethod {
  return Object.prototype.hasOwnProperty.call(CALIBRATION_SPECS, value);
}

/** Metres, written short. 20.12 m, 1.8 m, 0.072 m. */
export function formatMetres(metres: number): string {
  const fixed = metres < 1 ? metres.toFixed(3) : metres.toFixed(2);
  const trimmed = fixed.includes('.') ? fixed.replace(/\.?0+$/, '') : fixed;
  return `${trimmed} m`;
}

export type CalibrationDistance = {
  /** The distance to scale by, or null while it cannot be established. */
  metres: number | null;
  /** Why there is no distance yet. Null while the user has not said enough. */
  problem: string | null;
};

/**
 * Resolves the chosen method to a real-world distance. The typed value is only
 * complained about once there is something to complain about, so the field does
 * not turn red before it has been filled in.
 */
export function resolveCalibrationMetres(
  method: CalibrationMethod,
  customMetres: string,
  heightCm: number | null
): CalibrationDistance {
  const spec = CALIBRATION_SPECS[method];

  if (spec.source === 'fixed') {
    return { metres: spec.metres, problem: null };
  }

  if (spec.source === 'profile') {
    if (heightCm === null) {
      return {
        metres: null,
        problem: 'There is no height on the player profile to measure against.',
      };
    }
    return { metres: heightCm / 100, problem: null };
  }

  const trimmed = customMetres.trim();
  if (trimmed.length === 0) return { metres: null, problem: null };

  // Comma decimals are what a lot of keyboards offer first.
  const parsed = Number(trimmed.replace(',', '.'));
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return { metres: null, problem: 'Enter the distance in metres, like 4.5.' };
  }
  if (parsed < MIN_CUSTOM_METRES || parsed > MAX_CUSTOM_METRES) {
    return {
      metres: null,
      problem: `A measured distance has to be between ${MIN_CUSTOM_METRES} m and ${MAX_CUSTOM_METRES} m.`,
    };
  }
  return { metres: parsed, problem: null };
}
