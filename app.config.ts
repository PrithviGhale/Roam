import type { ExpoConfig } from "expo/config";

const config: ExpoConfig = {
  name: "ROAM",
  slug: "roam",
  version: "0.1.0",
  orientation: "portrait",
  scheme: "roam",
  userInterfaceStyle: "automatic",
  newArchEnabled: true,
  ios: { supportsTablet: false, bundleIdentifier: "com.prithvighale.roam" },
  android: { package: "com.prithvighale.roam" },
  web: { bundler: "metro", output: "single" },
  plugins: [
    "expo-router",
    "expo-font",
    [
      "expo-location",
      {
        locationWhenInUsePermission:
          "ROAM uses your location to show your position, driving speed, and nearby places.",
        isIosBackgroundLocationEnabled: false,
        isAndroidBackgroundLocationEnabled: false,
        isAndroidForegroundServiceEnabled: false,
      },
    ],
  ],
};

export default config;
