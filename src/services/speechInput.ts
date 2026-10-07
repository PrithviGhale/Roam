import { requireOptionalNativeModule } from "expo";
import { Platform } from "react-native";
type SpeechModule =
  typeof import("expo-speech-recognition").ExpoSpeechRecognitionModule;
// Optional lookup keeps Expo Go / web text input working without loading a missing native module.
export function speechInputModule(): SpeechModule | null {
  if (Platform.OS !== "ios") return null;
  try {
    if (!requireOptionalNativeModule<SpeechModule>("ExpoSpeechRecognition"))
      return null;
    // Load the maintained public adapter only after native availability is confirmed.
    const adapter: typeof import("expo-speech-recognition") = require("expo-speech-recognition");
    return adapter.ExpoSpeechRecognitionModule;
  } catch {
    return null;
  }
}
