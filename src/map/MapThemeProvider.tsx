import {
  createContext,
  useContext,
  useEffect,
  useState,
  useSyncExternalStore,
  type PropsWithChildren,
} from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useTheme } from "../themes/ThemeProvider";
import { resolveMapTheme, type MapPreference } from "./themes";
import { MapPreferences } from "./MapPreferences";
const Context = createContext({
  preference: "automatic" as MapPreference,
  theme: "night" as "night" | "day",
  setPreference: (_value: MapPreference) => {},
});
export function MapThemeProvider({ children }: PropsWithChildren) {
  const { theme } = useTheme(),
    [store] = useState(() => new MapPreferences(AsyncStorage));
  const preference = useSyncExternalStore(
    store.subscribe,
    store.getSnapshot,
    store.getSnapshot,
  );
  useEffect(() => {
    void store.hydrate();
  }, [store]);
  return (
    <Context.Provider
      value={{
        preference,
        theme: resolveMapTheme(preference, theme.id),
        setPreference: store.set,
      }}
    >
      {children}
    </Context.Provider>
  );
}
export const useMapTheme = () => useContext(Context);
