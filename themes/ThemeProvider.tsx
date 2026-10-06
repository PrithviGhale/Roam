import {
  createContext,
  useContext,
  useEffect,
  useState,
  type PropsWithChildren,
} from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { roamDark } from "./roamDark";
import { roamLight } from "./roamLight";

const ThemeContext = createContext({
  theme: roamDark,
  setTheme: (_id: "dark" | "light") => {},
});
export function ThemeProvider({ children }: PropsWithChildren) {
  const [id, setId] = useState<"dark" | "light">("dark");
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => {
    let mounted = true;
    void AsyncStorage.getItem("roam.theme")
      .then((value) => {
        if (mounted && (value === "dark" || value === "light")) setId(value);
      })
      .catch(() => {})
      .finally(() => {
        if (mounted) setHydrated(true);
      });
    return () => {
      mounted = false;
    };
  }, []);
  useEffect(() => {
    if (hydrated) void AsyncStorage.setItem("roam.theme", id).catch(() => {});
  }, [id, hydrated]);
  return (
    <ThemeContext.Provider
      value={{ theme: id === "dark" ? roamDark : roamLight, setTheme: setId }}
    >
      {children}
    </ThemeContext.Provider>
  );
}
export const useTheme = () => useContext(ThemeContext);
