import { MAX_PLAUSIBLE_TRAVEL_M, PITCH_LENGTH_M } from './computeSpeed';
import { outerShoeCmFromEu, type CalibrationMethod, type MarkerSource } from '../types';

/**
 * A regulation ball measures 224-229 mm around, so a shade over 72 mm across.
 * The shortest ruler on offer, and the least forgiving of a sloppy tap.
 */
export const BALL_DIAMETER_M = 0.072;

/** Sanity bounds for a distance the user measures themselves, in metres. */
export const MIN_CUSTOM_METRES = 0.1;
export const MAX_CUSTOM_METRES = 100;

/**
 * How close the ball's travel may come to the calibration distance before the
 * marks are suspect. Only meaningful for a ruler laid along the pitch.
 */
const RULER_WARN_FRACTION = 0.8;

/** A4 is 297 mm on the long edge — the ruler nearly everyone already owns. */
export const A4_LONG_EDGE_MM = 297;

/** Sanity bounds for an outer shoe length, in centimetres. */
export const MIN_SHOE_CM = 15;
export const MAX_SHOE_CM = 40;

/** Sanity bounds for an EU shoe size. Matches what the data layer accepts. */
export const MIN_SHOE_EU = 15;
export const MAX_SHOE_EU = 60;

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
  /**
   * Whether the ruler is laid along the pitch, so the ball's travel approaching
   * it means the marks are wrong. A ball is 0.072 m and a standing bowler under
   * 2 m — every real delivery travels many times either, so travel past those
   * says nothing and must not warn.
   */
  rulerBoundsTravel: boolean;
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
    rulerBoundsTravel: true,
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
    rulerBoundsTravel: true,
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
    rulerBoundsTravel: false,
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
    rulerBoundsTravel: false,
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

export type TravelWarning = {
  /** 'impossible' wins over 'ruler' — it is the stronger claim about the same marks. */
  kind: 'impossible' | 'ruler';
  message: string;
};

/**
 * Whether the ball's travel says the marks are wrong, and what to say about it.
 *
 * Two independent guards. The physical one holds for every method: no delivery
 * covers more than MAX_PLAUSIBLE_TRAVEL_M between release and bounce, whatever
 * it was scaled against. The ruler one applies only where the reference is laid
 * along the pitch — travel approaching a 0.072 m ball or a standing bowler is
 * normal and says nothing, which is why warning on the pitch length alone left
 * markers, ball and height unguarded.
 *
 * There is deliberately no lower bound: a short indoor throw measured off
 * markers can legitimately be 3 m.
 */
export function travelWarning(
  travelMetres: number,
  calRealMetres: number,
  method: CalibrationMethod
): TravelWarning | null {
  const spec = CALIBRATION_SPECS[method];
  const check = `${spec.checkHint}, and that the ball marks are on the ball.`;

  if (travelMetres > MAX_PLAUSIBLE_TRAVEL_M) {
    return {
      kind: 'impossible',
      message:
        `The ball reads as travelling ${travelMetres.toFixed(1)} m before bouncing, which is ` +
        `further than a cricket delivery can carry. ${check}`,
    };
  }

  if (spec.rulerBoundsTravel && travelMetres >= calRealMetres * RULER_WARN_FRACTION) {
    return {
      kind: 'ruler',
      message:
        `The ball reads as travelling ${travelMetres.toFixed(1)} m before bouncing, nearly the ` +
        `whole ${formatMetres(calRealMetres)} it was scaled against. ${check}`,
    };
  }

  return null;
}

export type MarkerSourceSpec = {
  source: MarkerSource;
  /** Full name, for the picker. */
  title: string;
  /** Two or three words, for a chip or a working row. */
  short: string;
  /** One line saying what the number entered means. */
  detail: string;
  /** How well a distance established this way is known. */
  accuracy: string;
  /** Whether the distance is counted in paces rather than typed in metres. */
  paced: boolean;
};

/** Best first — a taped distance is ten times better than a shoe-size guess. */
export const MARKER_SOURCE_ORDER: MarkerSource[] = [
  'measured',
  'paced-measured-shoe',
  'paced-shoe-size',
];

export const MARKER_SOURCE_SPECS: Record<MarkerSource, MarkerSourceSpec> = {
  measured: {
    source: 'measured',
    title: 'Tape or rule',
    short: 'Taped',
    detail: 'You measured the gap and typed it in.',
    accuracy: '± 0.5%',
    paced: false,
  },
  'paced-measured-shoe': {
    source: 'paced-measured-shoe',
    title: 'Paced, shoe measured',
    short: 'Paced, measured shoe',
    detail: 'Heel-to-toe paces, scaled by a shoe you measured once.',
    accuracy: '± 1%',
    paced: true,
  },
  'paced-shoe-size': {
    source: 'paced-shoe-size',
    title: 'Paced, shoe size',
    short: 'Paced, shoe size',
    detail: 'Heel-to-toe paces, scaled from your EU shoe size.',
    accuracy: '± 5%',
    paced: true,
  },
};

/**
 * The outer shoe length a pace count is scaled by, in centimetres.
 *
 * Pacing heel to toe measures the SHOE, sole included, not the foot. A measured
 * length is used as it is; a size is converted with the Paris-point rule. Null
 * when the profile cannot supply what the chosen source needs.
 */
export function shoeLengthCmFrom(
  source: MarkerSource,
  shoe: { lengthCm: number | null; sizeEu: number | null }
): number | null {
  if (source === 'paced-measured-shoe') return shoe.lengthCm;
  if (source === 'paced-shoe-size') {
    return shoe.sizeEu === null ? null : outerShoeCmFromEu(shoe.sizeEu);
  }
  return null;
}

/** What the user has typed for a markers distance, and how they established it. */
export type MarkersDraft = {
  source: MarkerSource;
  /** Raw metres text, for a taped distance. */
  metres: string;
  /** Raw pace count text, for the two paced sources. */
  paces: string;
};

export type CalibrationDistance = {
  /** The distance to scale by, or null while it cannot be established. */
  metres: number | null;
  /** Why there is no distance yet. Null while the user has not said enough. */
  problem: string | null;
  /** Heel-to-toe paces behind the distance, when it was paced. */
  paceCount: number | null;
};

const NO_DISTANCE: CalibrationDistance = { metres: null, problem: null, paceCount: null };

/** Comma decimals are what a lot of keyboards offer first. */
function parseTyped(value: string): number | null {
  const trimmed = value.trim();
  if (trimmed.length === 0) return null;
  const parsed = Number(trimmed.replace(',', '.'));
  return Number.isFinite(parsed) ? parsed : null;
}

function outOfBounds(metres: number): string | null {
  return metres < MIN_CUSTOM_METRES || metres > MAX_CUSTOM_METRES
    ? `A measured distance has to be between ${MIN_CUSTOM_METRES} m and ${MAX_CUSTOM_METRES} m.`
    : null;
}

/**
 * Resolves the chosen method to a real-world distance. The typed value is only
 * complained about once there is something to complain about, so the field does
 * not turn red before it has been filled in.
 *
 * A paced distance is the pace count times the outer shoe length. That is why
 * the source is recorded rather than inferred: the same gap paced from a shoe
 * size is ten times less certain than one taped, and the error range has to
 * say so.
 */
export function resolveCalibrationMetres(
  method: CalibrationMethod,
  markers: MarkersDraft,
  heightCm: number | null,
  shoeLengthCm: number | null = null
): CalibrationDistance {
  const spec = CALIBRATION_SPECS[method];

  if (spec.source === 'fixed') {
    return { metres: spec.metres, problem: null, paceCount: null };
  }

  if (spec.source === 'profile') {
    if (heightCm === null) {
      return {
        ...NO_DISTANCE,
        problem: 'There is no height on the player profile to measure against.',
      };
    }
    return { metres: heightCm / 100, problem: null, paceCount: null };
  }

  if (MARKER_SOURCE_SPECS[markers.source].paced) {
    const paceCount = parseTyped(markers.paces);
    if (paceCount === null) {
      return markers.paces.trim().length === 0
        ? NO_DISTANCE
        : { ...NO_DISTANCE, problem: 'Enter how many heel-to-toe paces you counted.' };
    }
    if (paceCount <= 0) {
      return { ...NO_DISTANCE, problem: 'Enter how many heel-to-toe paces you counted.' };
    }
    if (shoeLengthCm === null) {
      return {
        ...NO_DISTANCE,
        problem: 'Add your shoe length or size below, so the paces have a scale.',
      };
    }
    const metres = (paceCount * shoeLengthCm) / 100;
    const problem = outOfBounds(metres);
    return problem === null ? { metres, problem: null, paceCount } : { ...NO_DISTANCE, problem };
  }

  const typed = parseTyped(markers.metres);
  if (typed === null) {
    return markers.metres.trim().length === 0
      ? NO_DISTANCE
      : { ...NO_DISTANCE, problem: 'Enter the distance in metres, like 4.5.' };
  }
  if (typed <= 0) {
    return { ...NO_DISTANCE, problem: 'Enter the distance in metres, like 4.5.' };
  }
  const problem = outOfBounds(typed);
  return problem === null
    ? { metres: typed, problem: null, paceCount: null }
    : { ...NO_DISTANCE, problem };
}
