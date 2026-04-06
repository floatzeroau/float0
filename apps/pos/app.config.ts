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
    infoPlist: {
      // Allow all orientations in Info.plist so React Native modals don't crash
      // with "presented with 0x2 orientations mask but app only supports 0x18".
      // Actual landscape lock is enforced at runtime via expo-screen-orientation.
      UISupportedInterfaceOrientations: [
        'UIInterfaceOrientationPortrait',
        'UIInterfaceOrientationLandscapeLeft',
        'UIInterfaceOrientationLandscapeRight',
      ],
      'UISupportedInterfaceOrientations~ipad': [
        'UIInterfaceOrientationPortrait',
        'UIInterfaceOrientationPortraitUpsideDown',
        'UIInterfaceOrientationLandscapeLeft',
        'UIInterfaceOrientationLandscapeRight',
      ],
    },
  },
  android: {
    adaptiveIcon: {
      foregroundImage: './assets/adaptive-icon.png',
      backgroundColor: '#635BFF',
    },
  },
  plugins: ['expo-dev-client', 'expo-screen-orientation'],
  experiments: {
    tsconfigPaths: true,
  },
});
