import Constants from "expo-constants";
import { NativeModules, Platform } from "react-native";
import * as SecureStore from "expo-secure-store";
import * as Speech from "expo-speech";
import { speechInputModule } from "../speechInput";
import type { CaptureEvents, VoicePorts } from "./types";

const keyName = "roam.picovoice.access-key";
export const wakeNativeAvailable = () =>
  Platform.OS === "ios" &&
  !!NativeModules.PvPorcupine &&
  !!NativeModules.PvVoiceProcessor;
export async function saveWakeKey(key: string) {
  if (!wakeNativeAvailable())
    throw new Error("Use the ROAM iOS development build.");
  if (key.trim())
    await SecureStore.setItemAsync(keyName, key.trim(), {
      keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
    });
  else await SecureStore.deleteItemAsync(keyName);
}
export function nativeAudioPorts(): Pick<
  VoicePorts,
  "wake" | "speech" | "tts"
> {
  const recognition = speechInputModule();
  let key: string | null = null;
  let manager: Awaited<
    ReturnType<
      typeof import("@picovoice/porcupine-react-native").PorcupineManager.fromKeywordPaths
    >
  > | null = null;
  let events: CaptureEvents | null = null;
  let listeners: { remove(): void }[] = [];
  let speakingGeneration = 0;
  const bundled = Constants.expoConfig?.extra?.roamWakeModelBundled === true;
  const stopSpeech = async () => {
    events = null;
    listeners.forEach((listener) => listener.remove());
    listeners = [];
    if (!recognition) return;
    recognition.abort();
    // Native end/abort is asynchronous. Do not hand off the microphone until inactive.
    for (let attempt = 0; attempt < 40; attempt++) {
      if ((await recognition.getStateAsync()) === "inactive") return;
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    throw new Error("Speech capture did not release audio.");
  };
  return {
    wake: {
      // Concurrent wake/TTS has not been validated on iOS hardware. Explicit stop
      // and push-to-talk interruption remain available; never advertise barge-in.
      supportsBargeIn: false,
      availability: () =>
        !wakeNativeAvailable()
          ? "development-build"
          : bundled
            ? "ready"
            : "setup-required",
      async start(detected, error, active = () => true) {
        if (!wakeNativeAvailable() || !bundled)
          throw new Error("Wake setup is incomplete.");
        const { VoiceProcessor } =
          require("@picovoice/react-native-voice-processor") as typeof import("@picovoice/react-native-voice-processor");
        if (!(await VoiceProcessor.instance.hasRecordAudioPermission()))
          throw new Error("Microphone permission is required.");
        if (!active()) return;
        key = await SecureStore.getItemAsync(keyName);
        if (!key) throw new Error("Wake setup is incomplete.");
        if (!manager) {
          const { PorcupineManager } =
            require("@picovoice/porcupine-react-native") as typeof import("@picovoice/porcupine-react-native");
          manager = await PorcupineManager.fromKeywordPaths(
            key,
            ["hey-roam_ios.ppn"],
            detected,
            error,
            undefined,
            "cpu",
            [0.5],
          );
        }
        if (!active()) return;
        try {
          await manager.start();
        } catch (failure) {
          // The SDK adds listeners before start. Stop the shared processor even
          // when manager.start fails before its internal listening flag is set.
          const { VoiceProcessor } =
            require("@picovoice/react-native-voice-processor") as typeof import("@picovoice/react-native-voice-processor");
          VoiceProcessor.instance.clearFrameListeners();
          VoiceProcessor.instance.clearErrorListeners();
          await VoiceProcessor.instance.stop();
          manager.delete();
          manager = null;
          throw failure;
        }
      },
      async stop() {
        await manager?.stop();
      },
      async dispose() {
        await manager?.stop();
        manager?.delete();
        manager = null;
        key = null;
      },
    },
    speech: {
      available: !!recognition,
      async start(next) {
        if (!recognition)
          throw new Error("Speech input requires the development build.");
        const permission = await recognition.requestPermissionsAsync();
        if (!next.active()) return;
        if (!permission.granted || !recognition.isRecognitionAvailable())
          throw new Error("Speech permission is unavailable.");
        events = next;
        listeners = [
          recognition.addListener("result", (event) =>
            events?.result(event.results[0]?.transcript ?? "", event.isFinal),
          ),
          recognition.addListener("end", () => events?.end()),
          recognition.addListener("error", () => events?.error()),
        ];
        recognition.start({
          lang: "en-US",
          interimResults: true,
          continuous: false,
          recordingOptions: { persist: false },
        });
      },
      stop: stopSpeech,
    },
    tts: {
      speak(text, volume, done, error) {
        const generation = ++speakingGeneration;
        Speech.speak(text, {
          language: "en-US",
          rate: 0.95,
          volume,
          onDone: () => {
            if (generation === speakingGeneration) done();
          },
          onStopped: () => {
            if (generation === speakingGeneration) error();
          },
          onError: () => {
            if (generation === speakingGeneration) error();
          },
        });
      },
      async stop() {
        speakingGeneration++;
        await Speech.stop();
      },
    },
  };
}
