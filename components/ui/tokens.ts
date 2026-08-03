/**
 * Fremmo design tokens. Plan §S0 ships these in sprint zero; §S1 builds the system on top.
 *
 * Direction: the product is portfolio-first (plan §2/§S3), so the interface is a quiet
 * warm-neutral frame around other people's photographs. One saturated accent —
 * a deep sindoor red — carries every primary action; marigold is reserved for the
 * celebratory moments (verified badges, "free on your date"), never for chrome.
 *
 * These values are mirrored by the @theme block in styles.css. Keep them in sync:
 * the CSS drives Tailwind utilities, this file drives anything computed in JS
 * (chart colours, OG image generation, the Expo app's StyleSheet).
 */

export const colors = {
  /** Warm near-black. Pure #000 next to a photograph reads as a hole. */
  ink: {
    50: '#F7F5F3',
    100: '#EDE9E5',
    200: '#D9D2CB',
    300: '#BCB2A8',
    400: '#948779',
    500: '#736758',
    600: '#5A5044',
    700: '#443C33',
    800: '#2C2721',
    900: '#1A1614',
    950: '#0F0C0B',
  },

  /** Sindoor red — the primary action colour. */
  primary: {
    50: '#FDF4F2',
    100: '#FBE6E1',
    200: '#F7CDC3',
    300: '#EFA795',
    400: '#E37A60',
    500: '#D4553A',
    600: '#B3402B',
    700: '#953224',
    800: '#7B2C22',
    900: '#672921',
    950: '#38120D',
  },

  /** Marigold — celebration only: verified badges, availability, trust signals. */
  accent: {
    50: '#FEF9EC',
    100: '#FCEFC9',
    200: '#F9DD8F',
    300: '#F5C455',
    400: '#E8A33D',
    500: '#DE8A21',
    600: '#C46A17',
    700: '#A34C16',
    800: '#853C19',
    900: '#6E3218',
    950: '#3F1809',
  },

  /** Haldi green — success, "responded in 40 min", availability confirmations. */
  success: {
    50: '#F2F9F1',
    100: '#E0F1DE',
    500: '#4C9A47',
    600: '#3A7C37',
    700: '#2F612E',
  },

  warning: { 50: '#FEF8EC', 500: '#D99B1C', 700: '#8F6210' },
  danger: { 50: '#FEF2F2', 500: '#DC3545', 700: '#991B22' },

  /** Warm paper, not clinical white — photographs sit better on it. */
  surface: {
    DEFAULT: '#FFFCF9',
    raised: '#FFFFFF',
    sunken: '#F7F3EE',
    inverse: '#1A1614',
  },
} as const

export const typography = {
  /**
   * Two families. A high-contrast serif for editorial moments (vendor names, story
   * headlines) and a neutral sans for everything functional. Both must carry
   * Devanagari for the Hindi UI in plan §2's Could tier.
   */
  fontFamily: {
    display: ['"Fraunces"', 'Georgia', 'serif'],
    sans: ['"Inter"', 'system-ui', '-apple-system', 'sans-serif'],
    mono: ['"JetBrains Mono"', 'ui-monospace', 'monospace'],
  },
  fontSize: {
    xs: ['0.75rem', { lineHeight: '1rem' }],
    sm: ['0.875rem', { lineHeight: '1.25rem' }],
    base: ['1rem', { lineHeight: '1.5rem' }],
    lg: ['1.125rem', { lineHeight: '1.75rem' }],
    xl: ['1.25rem', { lineHeight: '1.75rem' }],
    '2xl': ['1.5rem', { lineHeight: '2rem' }],
    '3xl': ['1.875rem', { lineHeight: '2.25rem' }],
    '4xl': ['2.25rem', { lineHeight: '2.5rem' }],
    '5xl': ['3rem', { lineHeight: '1.1' }],
    '6xl': ['3.75rem', { lineHeight: '1.05' }],
  },
} as const

export const radius = {
  none: '0',
  sm: '0.25rem',
  DEFAULT: '0.5rem',
  md: '0.625rem',
  lg: '0.875rem',
  xl: '1.25rem',
  '2xl': '1.75rem',
  full: '9999px',
} as const

/** Soft, warm-tinted shadows — a neutral grey shadow looks dirty on warm paper. */
export const shadows = {
  sm: '0 1px 2px 0 rgb(26 22 20 / 0.05)',
  DEFAULT: '0 1px 3px 0 rgb(26 22 20 / 0.08), 0 1px 2px -1px rgb(26 22 20 / 0.06)',
  md: '0 4px 12px -2px rgb(26 22 20 / 0.10), 0 2px 6px -2px rgb(26 22 20 / 0.06)',
  lg: '0 12px 28px -6px rgb(26 22 20 / 0.14), 0 4px 10px -4px rgb(26 22 20 / 0.07)',
  xl: '0 24px 48px -12px rgb(26 22 20 / 0.20)',
} as const

/**
 * Plan §13 performance gate: "LCP < 2.5 s on 4G mid-range Android". Mobile is the
 * default target, not an adaptation — most Indian wedding research happens on a phone.
 */
export const breakpoints = {
  sm: '640px',
  md: '768px',
  lg: '1024px',
  xl: '1280px',
  '2xl': '1536px',
} as const

export const tokens = { colors, typography, radius, shadows, breakpoints } as const
export default tokens
