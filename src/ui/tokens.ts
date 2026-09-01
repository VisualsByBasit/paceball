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

export const type = {
  hero:    { fontSize: 96, fontWeight: '900' as const, letterSpacing: -4 },
  h1:      { fontSize: 30, fontWeight: '800' as const, letterSpacing: -0.8 },
  h2:      { fontSize: 20, fontWeight: '700' as const },
  body:    { fontSize: 15, fontWeight: '400' as const },
  caption: { fontSize: 13, fontWeight: '500' as const },
  label:   { fontSize: 11, fontWeight: '900' as const, letterSpacing: 1.6 },
} as const;