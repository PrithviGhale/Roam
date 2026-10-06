import type { RoamTheme } from "./types";

export const roamLight: RoamTheme = {
  id: "light",
  name: "ROAM Light",
  colors: {
    background: "#F1F4F2",
    surface: "#FFFFFF",
    elevated: "#E8EFEB",
    border: "#D2DDD7",
    text: "#14231D",
    muted: "#63756C",
    accent: "#246C55",
    onAccent: "#FFFFFF",
    accentSoft: "#DDEEE5",
    danger: "#A43F2A",
    scrim: "#0B101266",
    mapLand: "#E8EEE9",
    mapRoad: "#FFFFFF",
    mapWater: "#BBD8DF",
    mapPark: "#CBDCCA",
  },
  mapStyle: [
    { elementType: "geometry", stylers: [{ color: "#E8EEE9" }] },
    { elementType: "labels.text.fill", stylers: [{ color: "#63756C" }] },
    {
      featureType: "road",
      elementType: "geometry",
      stylers: [{ color: "#FFFFFF" }],
    },
    {
      featureType: "water",
      elementType: "geometry",
      stylers: [{ color: "#BBD8DF" }],
    },
    {
      featureType: "poi.park",
      elementType: "geometry",
      stylers: [{ color: "#CBDCCA" }],
    },
    { featureType: "poi.business", stylers: [{ visibility: "off" }] },
  ],
};
