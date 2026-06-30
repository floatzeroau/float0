import { Platform } from 'react-native';

export const colors = {
  // Brand palette (Float0 v10.0 — locked)
  paper: '#FBFBF9',
  ink: '#0F1115',
  teal: '#0F6C5C',
  tealDeep: '#004050',
  spring: '#5ADC82',
  yellow: '#FFDA59',
  butter: '#FFF3D9',
  mist: '#E8E8E5',

  // Action colour — legacy "primary" repointed to teal so existing
  // components pick up the brand colour automatically
  primary: '#0F6C5C',
  primaryLight: 'rgba(15, 108, 92, 0.12)',
  primaryDark: '#004050',

  // Pay / positive actions — teal is the action colour; keep a dedicated
  // success only for genuine status, not buttons
  success: '#0F6C5C',
  successDark: '#004050',
  successLight: 'rgba(15, 108, 92, 0.10)',

  // Status
  online: '#5ADC82',
  attention: '#FFDA59',

  // Pack — purple is the locked pack identity (pack pill + converted-pack
  // badge ONLY)
  pack: '#5840BE',
  packLight: 'rgba(88, 64, 190, 0.12)',
  packDark: '#3F2B96',

  danger: '#C2554A',
  dangerLight: 'rgba(194, 85, 74, 0.10)',
  warning: '#FFDA59',
  warningDark: '#E0B83F',
  info: '#0F6C5C',

  // Text
  textPrimary: '#0F1115',
  textSecondary: '#5B5F66',
  textMuted: '#8A8F98',
  textDisabled: '#BBBFC6',

  // Surfaces — product grid background (tileBg/tileBgEnd) kept at the
  // pre-FLO-155 values; product section background is a locked decision.
  surface: '#FFFFFF',
  surfaceAlt: '#F5F5F4',
  background: '#FFFFFF',
  tileBg: '#F7F8FA',
  tileBgEnd: '#EEF0F4',

  // Borders
  border: '#E8E8E5',
  borderLight: '#F0F0EE',

  overlay: 'rgba(15,17,21,0.5)',
  white: '#fff',
  black: '#000',

  // Pills / tabs
  pillInactive: '#E8E8E5',
  pillActive: '#0F1115',
  pillActiveText: '#FBFBF9',
  tabActive: '#0F6C5C',
  tabInactive: '#8A8F98',
};

// TODO(FLO-155): swap to JetBrains Mono once font assets are bundled
// (expo-font + assets/fonts/JetBrainsMono-{Regular,Medium}.ttf + native
// rebuild). For now we use the platform monospace so prices read mono-ish.
const platformMono = Platform.OS === 'ios' ? 'Menlo' : 'monospace';
const platformMonoMedium = Platform.OS === 'ios' ? 'Menlo-Bold' : 'monospace';

export const fonts = {
  mono: platformMono,
  monoMedium: platformMonoMedium,
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
