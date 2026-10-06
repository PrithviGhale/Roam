import type { ExpoConfig } from "expo/config";

const config: ExpoConfig = {
  name: "ROAM",
  slug: "roam",
  version: "0.2.0",
  orientation: "portrait",
  scheme: "roam",
  userInterfaceStyle: "automatic",
  newArchEnabled: true,
  ios: {
    supportsTablet: false,
    bundleIdentifier: "com.prithvighale.roam",
    config: {
      googleMapsApiKey:
        process.env.EXPO_PUBLIC_GOOGLE_MAPS_IOS_KEY ||
        process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY,
    },
  },
  android: {
    package: "com.prithvighale.roam",
    config: {
      googleMaps: {
        apiKey:
          process.env.EXPO_PUBLIC_GOOGLE_MAPS_ANDROID_KEY ||
          process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY,
      },
    },
  },
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
