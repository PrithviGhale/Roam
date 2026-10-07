import type { ExpoConfig } from "expo/config";

const config: ExpoConfig = {
  name: "ROAM",
  slug: "roam",
  version: "0.4.0",
  orientation: "portrait",
  scheme: "roam",
  userInterfaceStyle: "automatic",
  newArchEnabled: true,
  ios: {
    supportsTablet: false,
    bundleIdentifier: "com.prithvighale.roam",
    config: {
      googleMapsApiKey: process.env.EXPO_PUBLIC_GOOGLE_MAPS_IOS_KEY,
    },
  },
  android: {
    package: "com.prithvighale.roam",
    config: {
      googleMaps: {
        apiKey: process.env.EXPO_PUBLIC_GOOGLE_MAPS_ANDROID_KEY,
      },
    },
  },
  web: { bundler: "metro", output: "single" },
  plugins: [
    "expo-router",
    "expo-dev-client",
    "expo-font",
    [
      "expo-speech-recognition",
      {
        microphonePermission:
          "ROAM uses the microphone only when you tap to speak.",
        speechRecognitionPermission:
          "ROAM turns your spoken requests into text so you can ask your driving assistant.",
      },
    ],
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
