import { Platform, UIManager } from "react-native";

export function supportsGoogleMap(): boolean {
  if (Platform.OS === "android") return true;
  if (Platform.OS !== "ios") return false;
  try {
    return UIManager.hasViewManagerConfig("AIRGoogleMap");
  } catch {
    return false;
  }
}
