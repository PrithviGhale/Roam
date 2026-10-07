import type { RoamTheme } from "./types";
import { palettes } from "../design/tokens";
import { mapStyle } from "../design/mapStyle";
export const roamLight: RoamTheme = {
  id: "light",
  name: "ROAM Light",
  colors: palettes.light,
  mapStyle: mapStyle(palettes.light),
};
