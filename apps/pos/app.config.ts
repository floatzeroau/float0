import { ExpoConfig, ConfigContext } from 'expo/config';

export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  name: 'Float POS',
  slug: 'float-pos',
  version: '0.0.1',
  orientation: 'landscape',
  icon: './assets/icon.png',
  scheme: 'float-pos',
  newArchEnabled: true,
  splash: {
    image: './assets/splash.png',
    resizeMode: 'contain',
    backgroundColor: '#635BFF',
  },
  ios: {
    bundleIdentifier: 'com.float0.pos',
    supportsTablet: true,
    isTabletOnly: true,
    requireFullScreen: true,
  },
  android: {
    adaptiveIcon: {
      foregroundImage: './assets/adaptive-icon.png',
      backgroundColor: '#635BFF',
    },
  },
  plugins: ['expo-dev-client'],
  experiments: {
    tsconfigPaths: true,
  },
});
