import { requireOptionalNativeModule } from "expo";
import { Platform } from "react-native";
import type { NativeNavigation } from "./types";
export type * from "./types";
export function nativeNavigation(): NativeNavigation | null {
  if (Platform.OS !== "ios") return null;
  try {
    const module =
      requireOptionalNativeModule<NativeNavigation>("RoamNavigation");
    // A V0.7 binary may have the same module name. Never select its Google
    // adapter; the v3 bridge advertises its routing capability.
    return typeof module?.calculateRoute === "function" ? module : null;
  } catch {
    return null;
  }
}
