export const colors = {
  primary: '#2563EB',
  primaryLight: 'rgba(37, 99, 235, 0.12)',
  primaryDark: '#1D4ED8',
  success: '#16A34A',
  successDark: '#15803D',
  successLight: '#ecfdf5',
  danger: '#dc2626',
  dangerLight: '#fef2f2',
  warning: '#f59e0b',
  warningDark: '#d97706',
  info: '#2563EB',
  pack: '#5840BE',
  packLight: 'rgba(88, 64, 190, 0.12)',
  packDark: '#3F2B96',
  textPrimary: '#0A0A0A',
  textSecondary: '#6B6B6B',
  textMuted: '#999',
  textDisabled: '#bbb',
  surface: '#FFFFFF',
  surfaceAlt: '#F5F5F5',
  background: '#FFFFFF',
  tileBg: '#F7F8FA',
  tileBgEnd: '#EEF0F4',
  border: '#E5E5E5',
  borderLight: '#F0F0F0',
  overlay: 'rgba(0,0,0,0.5)',
  white: '#fff',
  black: '#000',
  pillInactive: '#EEEEEE',
  pillActive: '#1F1F1F',
  pillActiveText: '#FFFFFF',
  tabActive: '#1F1F1F',
  tabInactive: '#6B6B6B',
};

export const spacing = {
  xxs: 2,
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
  xxxl: 40,
};

export const radii = { xs: 4, sm: 6, md: 8, lg: 12, xl: 16 };

export const typography = {
  size: {
    xxs: 10,
    xs: 11,
    sm: 12,
    md: 13,
    base: 14,
    lg: 16,
    xl: 18,
    xxl: 20,
    '3xl': 24,
    '4xl': 28,
    '5xl': 36,
  },
  weight: {
    medium: '500' as const,
    semibold: '600' as const,
    bold: '700' as const,
  },
};

export const shadows = {
  card: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 2,
    elevation: 1,
  },
};
