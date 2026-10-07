import type { ExpoConfig } from "expo/config";
import { existsSync } from "node:fs";
import { join } from "node:path";

const config: ExpoConfig = {
  name: "ROAM",
  slug: "roam",
  version: "0.7.0",
  orientation: "portrait",
  scheme: "roam",
  userInterfaceStyle: "automatic",
  ios: {
    supportsTablet: false,
    bundleIdentifier: "com.prithvighale.roam",
  },
  android: {
    package: "com.prithvighale.roam",
  },
  web: { bundler: "metro", output: "single" },
  extra: {
    roamWakeModelBundled: existsSync(
      join(__dirname, "assets/wake/hey-roam_ios.ppn"),
    ),
  },
  plugins: [
    "expo-router",
    "expo-dev-client",
    "expo-font",
    "expo-status-bar",
    "expo-secure-store",
    "./plugins/withRoamWakeWord",
    "./plugins/withRoamNavigation",
    [
      "react-native-maps",
      {
        // iOS uses the local module and current Google SDK, avoiding the maps pod pin.
        androidGoogleMapsApiKey:
          process.env.EXPO_PUBLIC_GOOGLE_MAPS_ANDROID_KEY,
      },
    ],
    [
      "expo-speech-recognition",
      {
        microphonePermission:
          "ROAM uses the microphone for voice commands and, when you enable Hey ROAM during a foreground trip, local wake-phrase detection.",
        speechRecognitionPermission:
          "ROAM turns your spoken requests into text so you can ask your driving assistant.",
      },
    ],
    [
      "expo-location",
      {
        locationWhenInUsePermission:
          "ROAM uses your location to show your position, driving speed, and nearby places.",
        locationAlwaysPermission: false,
        locationAlwaysAndWhenInUsePermission: false,
        motionUsagePermission: false,
        isIosBackgroundLocationEnabled: false,
        isAndroidBackgroundLocationEnabled: false,
        isAndroidForegroundServiceEnabled: false,
      },
    ],
  ],
};

export default config;
