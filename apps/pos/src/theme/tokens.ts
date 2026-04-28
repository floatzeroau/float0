export const colors = {
  primary: '#2563eb',
  primaryLight: '#dbeafe',
  success: '#10b981',
  successDark: '#16a34a',
  successLight: '#ecfdf5',
  danger: '#dc2626',
  dangerLight: '#fef2f2',
  warning: '#f59e0b',
  warningDark: '#d97706',
  pack: '#7c3aed',
  packLight: '#faf5ff',
  textPrimary: '#1a1a1a',
  textSecondary: '#666',
  textMuted: '#999',
  textDisabled: '#bbb',
  surface: '#fff',
  surfaceAlt: '#f5f5f5',
  background: '#f0f0f0',
  border: '#e0e0e0',
  borderLight: '#f0f0f0',
  overlay: 'rgba(0,0,0,0.5)',
  white: '#fff',
  black: '#000',
  tabActive: '#2563eb',
  tabInactive: '#9ca3af',
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
