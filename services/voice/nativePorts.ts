import { NativeModules, Platform } from "react-native";
import { File, Paths } from "expo-file-system";
import * as SecureStore from "expo-secure-store";
import * as Speech from "expo-speech";
import { speechInputModule } from "../speechInput";
import { WakeRuntime, VoiceSetupError } from "./WakeRuntime";
import type { CaptureEvents, WakeAvailability } from "./types";

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
export function nativeAudioPorts() {
  const recognition = speechInputModule();
  let events: CaptureEvents | null = null;
  let listeners: { remove(): void }[] = [];
  let speakingGeneration = 0;
  let ttsActive = false;
  let recognitionActive = false;
  const modelExists = () => {
    try {
      const file = new File(Paths.bundle, "hey-roam_ios.ppn");
      return file.exists && file.size > 0;
    } catch {
      return false;
    }
  };
  const processor = () =>
    (
      require("@picovoice/react-native-voice-processor") as typeof import("@picovoice/react-native-voice-processor")
    ).VoiceProcessor.instance;
  const runtime = new WakeRuntime({
    available: wakeNativeAvailable,
    modelExists,
    readKey: () => SecureStore.getItemAsync(keyName),
    permission: () => processor().hasRecordAudioPermission(),
    async create(key, sensitivity, detected, error) {
      const { PorcupineManager } =
        require("@picovoice/porcupine-react-native") as typeof import("@picovoice/porcupine-react-native");
      return PorcupineManager.fromKeywordPaths(
        key,
        ["hey-roam_ios.ppn"],
        detected,
        error,
        undefined,
        "cpu",
        [sensitivity],
      );
    },
    async recoverStart() {
      processor().clearFrameListeners();
      processor().clearErrorListeners();
      await processor().stop();
    },
  });
  const stopWake = async () => {
    await runtime.stop();
    // Manager.start can fail before its private listening flag is set. Verify
    // the shared recorder too; never hand off an orphaned processor microphone.
    if (wakeNativeAvailable() && (await processor().isRecording())) {
      processor().clearFrameListeners();
      processor().clearErrorListeners();
      await processor().stop();
      if (await processor().isRecording())
        throw new Error("Wake capture did not release audio.");
    }
  };
  const stopSpeech = async () => {
    events = null;
    listeners.forEach((listener) => listener.remove());
    listeners = [];
    if (!recognition) return;
    recognition.abort();
    for (let attempt = 0; attempt < 40; attempt++) {
      if ((await recognition.getStateAsync()) === "inactive") {
        recognitionActive = false;
        return;
      }
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    throw new Error("Speech capture did not release audio.");
  };
  return {
    diagnostics: () => ({
      ...runtime.diagnostics(),
      recognitionActive,
      ttsActive,
    }),
    inspect: () => runtime.inspect(),
    setSensitivity: (value: number) => runtime.setSensitivity(value),
    wake: {
      supportsBargeIn: false,
      // Build metadata is not evidence of a resource in an installed binary.
      availability: (): WakeAvailability =>
        !wakeNativeAvailable() ? "development-build" : "ready",
      start: (
        detected: () => void,
        error: () => void,
        active?: () => boolean,
      ) => runtime.start(detected, error, active),
      stop: stopWake,
      dispose: async () => {
        await stopWake();
        await runtime.dispose();
      },
    },
    speech: {
      available: !!recognition,
      async start(next: CaptureEvents) {
        if (!recognition)
          throw new Error("Speech input requires the development build.");
        const permission = await recognition.requestPermissionsAsync();
        if (!next.active()) return;
        if (!permission.granted || !recognition.isRecognitionAvailable())
          throw new VoiceSetupError(
            "permission",
            "Allow microphone and speech recognition in iPhone Settings to speak. You can continue with text.",
          );
        events = next;
        // Resolve only on the native start event. Permission prompts and a queued
        // native start must never make Pulse claim it is already listening.
        await new Promise<void>((resolve, reject) => {
          const timeout = setTimeout(
            () => reject(new Error("Recognition startup timed out.")),
            5000,
          );
          listeners = [
            recognition.addListener("start", () => {
              clearTimeout(timeout);
              if (!next.active()) {
                reject(new Error("Capture canceled."));
                return;
              }
              recognitionActive = true;
              resolve();
            }),
            recognition.addListener("result", (event) =>
              events?.result(event.results[0]?.transcript ?? "", event.isFinal),
            ),
            recognition.addListener("end", () => {
              clearTimeout(timeout);
              recognitionActive = false;
              reject(new Error("Recognition ended before startup."));
              events?.end();
            }),
            recognition.addListener("error", (event) => {
              clearTimeout(timeout);
              const started = recognitionActive;
              recognitionActive = false;
              reject(new Error("Recognition failed."));
              if (started && event.error === "no-speech") events?.end();
              else events?.error();
            }),
          ];
          try {
            recognition.start({
              lang: "en-US",
              interimResults: true,
              continuous: false,
              recordingOptions: { persist: false },
            });
          } catch {
            clearTimeout(timeout);
            reject(new Error("Recognition failed."));
          }
        }).catch(async (failure) => {
          await stopSpeech();
          throw failure;
        });
      },
      stop: stopSpeech,
    },
    tts: {
      reportsStart: true,
      speak(
        text: string,
        volume: number,
        done: () => void,
        error: () => void,
        started = () => {},
      ) {
        const generation = ++speakingGeneration;
        Speech.speak(text, {
          language: "en-US",
          rate: 0.95,
          volume,
          onStart: () => {
            if (generation === speakingGeneration) {
              ttsActive = true;
              started();
            }
          },
          onDone: () => {
            if (generation === speakingGeneration) {
              ttsActive = false;
              done();
            }
          },
          onStopped: () => {
            if (generation === speakingGeneration) {
              ttsActive = false;
              error();
            }
          },
          onError: () => {
            if (generation === speakingGeneration) {
              ttsActive = false;
              error();
            }
          },
        });
      },
      async stop() {
        speakingGeneration++;
        await Speech.stop();
        ttsActive = false;
      },
    },
  };
}
