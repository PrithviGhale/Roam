import { Platform } from "react-native";
import * as Haptics from "expo-haptics";
export function acknowledge() {
  if (Platform.OS !== "web")
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
}
