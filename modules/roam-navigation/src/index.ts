import { requireOptionalNativeModule } from "expo";
import { Platform } from "react-native";
import type { NativeNavigation } from "./types";
export type * from "./types";
export function nativeNavigation(): NativeNavigation | null {
  if (Platform.OS !== "ios") return null;
  try {
    return requireOptionalNativeModule<NativeNavigation>("RoamNavigation");
  } catch {
    return null;
  }
}
