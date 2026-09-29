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

/**
 * The 3D cricket kit's materials: a floodlit ground at night, painted wood and
 * brushed metal. Only the kit's shaders read these, as lit surfaces; nothing
 * flat in the interface is painted with them. The ball stays `colors.accent`.
 */
export const scene = {
  /** The sky above the stands, and the dark the floodlights cut through. */
  night: '#04050A',
  /** Floodlit air around the lights and over the ground. */
  haze: '#1B2433',
  /** The lamps themselves, and the light they throw. */
  floodlight: '#EEF3FF',
  /** Outfield grass, in its two mowing stripes. */
  turf: '#18361F',
  turfDeep: '#0F2716',
  /** The strip: rolled, dry and a touch lighter where it is worn. */
  pitch: '#7E6C4B',
  pitchWorn: '#9C8962',
  /** Painted crease lines. */
  crease: '#E6EAEE',
  /** Painted stumps and bails. */
  wood: '#F3EEE2',
  /** Brushed metal, for the instrument's bezel, needle hub and the Pro badge. */
  metal: '#9AA1AB',
  metalDark: '#23272E',
  /** What a lit surface reflects: the floodlight's colour, a little warm. */
  specular: '#FFFFFF',
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
  /** The PACEBALL wordmark in the launch intro. */
  introWordmark: 44,
  /** The emblem shown once a purchase is confirmed. */
  emblem: 96,
  /** The widest the Result speedometer is drawn, and its dial's stroke. */
  gauge: 280,
  gaugeStroke: 10,
  /** The personal best's speedometer on Home, a smaller copy of Result's. */
  gaugeSmall: 200,
  /** A delivery row's minimum height. */
  row: 80,
  /** A settings row's minimum height: one line and its value, Android's standard. */
  listRow: 56,
  /** A delivery row's release-frame thumbnail. */
  thumb: 48,
  /** The logo beside the wordmark at the top of Home. */
  logo: 28,
  /** The 3D still life at the top of an empty Home. */
  still: 200,
  /** A recent delivery's card on Home, and the release frame across its top. */
  card: { width: 160, thumb: 120 },
  /** The tab bar along the foot of Home, History and Settings, above the inset. */
  tabBar: 64,
  /** Screens narrower than this show the Result reading at heroCompact, not hero. */
  compactBelow: 380,
  /** The wicket under a completed reading: three lit stumps and two bails, and room for their shadows. */
  wicket: {
    width: 72,
    height: 80,
    stump: 4,
    bail: 3,
    /** How far the bails fall to sit on the stumps. */
    drop: 6,
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
  /**
   * The purchase emblem, as the time each part finishes: the stumps fade in,
   * the ball rolls up beside them, the bail settles, then the copy arrives.
   * 1100 ms from the first stump to the last line of copy, with no springs.
   */
  celebrate: { stumps: 180, ball: 650, bail: 850, copy: 1100 },
  /** A notice arriving. Opacity only, never a shake. */
  notice: 120,
  /** The record button turning from a circle to a rounded square and back, with the recorder. */
  record: 160,
  /** A deleted row leaving its list. */
  collapse: 160,
  /**
   * The launch intro, cold start only, as the time each beat lands: the ball
   * reaches the stumps, the wordmark starts to resolve letter by letter, and
   * the whole intro fades to the app. Never longer than total.
   */
  intro: { impact: 620, wordmark: 850, letter: 220, letterStagger: 25, fadeOut: 1250, total: 1500 },
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
