import { Platform, type TextStyle } from 'react-native';

export const colors = {
  bg: '#0A0B0D',
  surface: '#14161A',
  line: '#1F232A',
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
  /** How far a released drag carries on, as milliseconds of its release speed. */
  throw: 120,
  /** Cubic-bezier control points: fast start, long settle, never past 1. */
  settleCurve: [0.16, 1, 0.3, 1] as const,
  /** Playhead chasing the finger. Just under critical damping, so it lags a touch. */
  drag: { mass: 0.6, stiffness: 280, damping: 24 },
  /** Playhead landing after release. Underdamped, so it overshoots once and rests. */
  settle: { mass: 1, stiffness: 200, damping: 18 },
  /** A bar growing as it becomes the selected one. */
  pop: { mass: 0.5, stiffness: 340, damping: 16 },
};

/** Defined out here so `mono` can compose it rather than restate it. */
const tabular = { fontVariant: ['tabular-nums'] as TextStyle['fontVariant'] };

export const type = {
  hero:    { fontSize: 96, fontWeight: '900' as const, letterSpacing: -4 },
  h1:      { fontSize: 30, fontWeight: '800' as const, letterSpacing: -0.8 },
  h2:      { fontSize: 20, fontWeight: '700' as const },
  body:    { fontSize: 15, fontWeight: '400' as const },
  caption: { fontSize: 13, fontWeight: '500' as const },
  label:   { fontSize: 11, fontWeight: '900' as const, letterSpacing: 1.6 },

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
