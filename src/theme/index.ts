import { Platform, TextStyle, ViewStyle } from 'react-native';

export const colors = {
  // Brand
  primary: '#16A34A',
  primaryDark: '#15803D',
  primaryDeep: '#0B5A34',
  primarySoft: '#DCFCE7',
  primaryTint: '#F0FDF4',
  accent: '#22C55E',

  // Dark hero / splash surfaces
  heroStart: '#0A3D2A',
  heroEnd: '#062016',
  night: '#03140D',
  nightGlow: '#0F5132',

  // Neutrals
  background: '#F5F8F6',
  surface: '#FFFFFF',
  border: '#E5ECE8',
  divider: '#EEF2EF',
  text: '#0F1A14',
  textSecondary: '#5B6B63',
  textMuted: '#8A9A92',
  textOnDark: '#FFFFFF',
  textOnDarkMuted: 'rgba(255,255,255,0.72)',

  // Risk levels
  high: '#DC2626',
  highSoft: '#FEE2E2',
  medium: '#EA8A0C',
  mediumSoft: '#FFEDD5',
  low: '#16A34A',
  lowSoft: '#DCFCE7',

  info: '#2563EB',
  infoSoft: '#DBEAFE',
};

export type RiskLevel = 'high' | 'medium' | 'low';

export const riskColors: Record<RiskLevel, { fg: string; bg: string; label: string }> = {
  high: { fg: colors.high, bg: colors.highSoft, label: 'High' },
  medium: { fg: colors.medium, bg: colors.mediumSoft, label: 'Medium' },
  low: { fg: colors.low, bg: colors.lowSoft, label: 'Low' },
};

export const spacing = {
  xxs: 2,
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
  xxxl: 32,
};

export const radius = {
  sm: 6,
  md: 10,
  lg: 14,
  xl: 20,
  pill: 999,
};

export const typography = {
  display: { fontSize: 40, fontWeight: '800', letterSpacing: -0.5 },
  h1: { fontSize: 24, fontWeight: '700' },
  h2: { fontSize: 20, fontWeight: '700' },
  h3: { fontSize: 16, fontWeight: '700' },
  amountXL: { fontSize: 30, fontWeight: '800' },
  amount: { fontSize: 17, fontWeight: '700' },
  body: { fontSize: 14, fontWeight: '400' },
  bodyStrong: { fontSize: 14, fontWeight: '600' },
  caption: { fontSize: 12, fontWeight: '400' },
  captionStrong: { fontSize: 12, fontWeight: '600' },
  tiny: { fontSize: 10, fontWeight: '600' },
} satisfies Record<string, TextStyle>;

export const shadow = {
  card: Platform.select<ViewStyle>({
    web: { boxShadow: '0 2px 10px rgba(15, 26, 20, 0.06)' } as ViewStyle,
    default: {
      shadowColor: '#0F1A14',
      shadowOpacity: 0.06,
      shadowRadius: 10,
      shadowOffset: { width: 0, height: 2 },
      elevation: 2,
    },
  }),
  glow: Platform.select<ViewStyle>({
    web: { boxShadow: '0 6px 20px rgba(22, 163, 74, 0.45)' } as ViewStyle,
    default: {
      shadowColor: colors.primary,
      shadowOpacity: 0.45,
      shadowRadius: 14,
      shadowOffset: { width: 0, height: 6 },
      elevation: 8,
    },
  }),
};

export const theme = { colors, riskColors, spacing, radius, typography, shadow };
export default theme;
