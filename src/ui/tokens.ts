import { Platform, type TextStyle } from 'react-native';

export const colors = {
  bg: '#0A0B0D',
  surface: '#14161A',
  line: '#1F232A',
  /**
   * Input outlines, unselected controls and chart axes. 3.6:1 on bg, where
   * `line` is too faint to mark a boundary anything depends on.
   */
  control: '#626A76',
  accent: '#D4FF3F',
  warn: '#FFC247',
  danger: '#FF6B6B',
  text: '#FFFFFF',
  muted: '#8A9099',
} as const;

export const space = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 48,
} as const;

export const radius = {
  sm: 8,
  md: 14,
  lg: 18,
  xl: 24,
  pill: 999,
} as const;

/** Fixed sizes for things the hand has to hit or the eye has to find. */
export const size = {
  /** The smallest touch target anywhere. */
  target: 48,
  /** A primary button's height. */
  button: 56,
  /** The record button, and the shape inside it. */
  record: 80,
  recordInner: 64,
  /** The frame scrubber's height. */
  detent: 72,
  /** The magnifier over the frame while a mark is being placed. */
  loupe: 96,
  /** A delivery row's minimum height. */
  row: 80,
  /** Screens narrower than this show the Result reading at heroCompact, not hero. */
  compactBelow: 380,
  /** The wicket under a completed reading: three stumps and a bail. */
  wicket: {
    width: 36,
    height: 40,
    stump: 4,
    bail: 3,
    /** How far the bail falls to sit on the stumps. */
    drop: 4,
  },
} as const;

/** Border widths. Flat design, so these stay thin and few. */
export const stroke = {
  hairline: 1,
  medium: 2,
  heavy: 3,
} as const;

/**
 * Opacity steps, named for what they mean rather than what they measure, so a
 * disabled control reads as disabled on every screen.
 */
export const opacity = {
  disabled: 0.3,
  inactive: 0.5,
  secondary: 0.6,
  scrim: 0.75,
  full: 1,
} as const;

/**
 * Motion. Durations in milliseconds; springs are Reanimated spring configs.
 *
 * A measured number never overshoots — a reading must not show, even for a
 * frame, more than was measured — so values move on `settleCurve`, which
 * decelerates onto its target without passing it. Springs are for things the
 * hand moves: the playhead, a bar growing under it.
 */
export const motion = {
  /** A reading counting up from zero to what was measured. */
  countUp: 700,
  /** Secondary text arriving once a number has landed. */
  fade: 240,
  /** Between one path dot appearing and the next. */
  dotStagger: 70,
  /** The endpoint's single pulse once a path has drawn. */
  pulse: 560,
  /** A held step button: the pause before it starts repeating, like a keyboard key. */
  holdDelay: 400,
  /** Then one step every this many milliseconds while it stays held. */
  holdRepeat: 75,
  /** How far a released drag carries on, as milliseconds of its release speed. */
  throw: 120,
  /** Cubic-bezier control points: fast start, long settle, never past 1. */
  settleCurve: [0.16, 1, 0.3, 1] as const,
  /** Cubic-bezier control points for things that move in and out: routes and sheets. */
  standardCurve: [0.2, 0, 0, 1] as const,
  /** A route pushed or popped, on standardCurve. */
  nav: 180,
  /** A bottom sheet opening and closing, on standardCurve. */
  sheet: { in: 220, out: 180 },
  /** A button's outline and colour under the finger, linear. Nothing scales. */
  press: { in: 80, out: 120 },
  /** The wicket locking once a reading lands: the bail falls, then it all turns lime. */
  lock: { bail: 180, colour: 120 },
  /** The purchase emblem, from the first stump to the last line of copy. */
  celebrate: 1100,
  /** A notice arriving. Opacity only, never a shake. */
  notice: 120,
  /** The record button turning from a circle to a rounded square and back, with the recorder. */
  record: 160,
  /** A lens swap: the preview fades out, waits for the new lens, then fades back in. */
  lens: { out: 120, in: 180 },
  /** Playhead chasing the finger. Just under critical damping, so it lags a touch. */
  drag: { mass: 0.6, stiffness: 280, damping: 24 },
  /** Playhead landing after release. Underdamped, so it overshoots once and rests. */
  settle: { mass: 1, stiffness: 200, damping: 18 },
  /** A bar growing as it becomes the selected one. */
  pop: { mass: 0.5, stiffness: 340, damping: 16 },
};

/** Defined out here so `mono` can compose it rather than restate it. */
const tabular = { fontVariant: ['tabular-nums'] as TextStyle['fontVariant'] };

/**
 * Every size carries its line height, so a line of text is the same height on
 * every screen and nothing is left to the platform's default leading.
 */
export const type = {
  /** A reading on Result. */
  hero:        { fontSize: 96, lineHeight: 104, fontWeight: '900' as const, letterSpacing: -4 },
  /** A reading on Result when the screen is narrower than `size.compactBelow`. */
  heroCompact: { fontSize: 64, lineHeight: 72, fontWeight: '900' as const, letterSpacing: -2.5 },
  /** A reading anywhere else: personal best, stats, analysis, compare. */
  reading:     { fontSize: 40, lineHeight: 48, fontWeight: '900' as const, letterSpacing: -1.5 },
  h1:          { fontSize: 30, lineHeight: 36, fontWeight: '800' as const, letterSpacing: -0.8 },
  h2:          { fontSize: 20, lineHeight: 28, fontWeight: '700' as const },
  /** 16 rather than 15, for reading outdoors in daylight. */
  body:        { fontSize: 16, lineHeight: 24, fontWeight: '400' as const },
  button:      { fontSize: 16, lineHeight: 24, fontWeight: '700' as const },
  caption:     { fontSize: 13, lineHeight: 18, fontWeight: '500' as const },
  label:       { fontSize: 11, lineHeight: 16, fontWeight: '900' as const, letterSpacing: 1.6 },

  /**
   * Equal-width digits in the system face. Spread it over a size —
   * `{ ...type.h1, ...type.tabular }` — for any number that changes in place,
   * like a timer or a frame counter, so the text does not jitter as it counts.
   */
  tabular,

  /**
   * Fixed-width face for measured data — the readings themselves, not counters
   * in the interface. Spread it over a size the same way; it carries `tabular`,
   * so a reading gets both the mono face and steady digits.
   */
  mono: {
    fontFamily: Platform.select({
      ios: 'Menlo',
      android: 'monospace',
      default: 'monospace',
    }),
    ...tabular,
  },
};
