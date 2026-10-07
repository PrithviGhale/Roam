import {
  createContext,
  useContext,
  useEffect,
  useState,
  type PropsWithChildren,
} from "react";
import { AppState, Platform } from "react-native";
import { requireOptionalNativeModule } from "expo";
const PowerContext = createContext<boolean | null>(null);
export function PowerProvider({ children }: PropsWithChildren) {
  const [lowPower, setLowPower] = useState<boolean | null>(null);
  useEffect(() => {
    if (Platform.OS === "web") return;
    if (!requireOptionalNativeModule("ExpoBattery")) return;
    const Battery = require("expo-battery") as typeof import("expo-battery");
    let active = true;
    const refresh = async () => {
      try {
        if (await Battery.isAvailableAsync()) {
          const value = await Battery.isLowPowerModeEnabledAsync();
          if (active) setLowPower(value);
        }
      } catch {
        if (active) setLowPower(null);
      }
    };
    void refresh();
    const battery = Battery.addLowPowerModeListener((event) => {
      if (active) setLowPower(event.lowPowerMode);
    });
    const app = AppState.addEventListener("change", (state) => {
      if (state === "active") void refresh();
    });
    return () => {
      active = false;
      battery.remove();
      app.remove();
    };
  }, []);
  return (
    <PowerContext.Provider value={lowPower}>{children}</PowerContext.Provider>
  );
}
export const useLowPower = () => useContext(PowerContext);
