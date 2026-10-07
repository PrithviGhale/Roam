import type { RoamTheme } from "./types";
import { palettes } from "../design/tokens";
import { mapStyle } from "../design/mapStyle";
export const roamDark: RoamTheme = {
  id: "dark",
  name: "ROAM Dark",
  colors: palettes.dark,
  mapStyle: mapStyle(palettes.dark),
};
