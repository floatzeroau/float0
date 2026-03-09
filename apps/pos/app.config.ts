import { ExpoConfig, ConfigContext } from "expo/config";

export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  name: "Float POS",
  slug: "float-pos",
  version: "0.0.1",
  orientation: "landscape",
  icon: "./assets/icon.png",
  scheme: "float-pos",
  newArchEnabled: true,
  ios: {
    bundleIdentifier: "com.float0.pos",
    supportsTablet: true,
    isTabletOnly: true,
    requireFullScreen: true,
  },
  plugins: ["expo-dev-client"],
  experiments: {
    tsconfigPaths: true,
  },
});
