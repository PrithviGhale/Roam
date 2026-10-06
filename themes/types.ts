import type { MapStyleElement } from "react-native-maps";

export interface RoamTheme {
  id: "dark" | "light";
  name: string;
  colors: {
    background: string;
    surface: string;
    elevated: string;
    border: string;
    text: string;
    muted: string;
    accent: string;
    onAccent: string;
    accentSoft: string;
    danger: string;
    scrim: string;
    mapLand: string;
    mapRoad: string;
    mapWater: string;
    mapPark: string;
  };
  mapStyle: MapStyleElement[];
}
