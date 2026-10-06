import type { RoamTheme } from "./types";

export const roamDark: RoamTheme = {
  id: "dark",
  name: "ROAM Dark",
  colors: {
    background: "#0B1012",
    surface: "#151C20",
    elevated: "#202A2E",
    border: "#303C40",
    text: "#F4F7F6",
    muted: "#99A8AE",
    accent: "#A8E0CF",
    onAccent: "#10251E",
    accentSoft: "#253D36",
    danger: "#FFB8A7",
    scrim: "#00000099",
    mapLand: "#171F23",
    mapRoad: "#364248",
    mapWater: "#102F38",
    mapPark: "#223A32",
  },
  mapStyle: [
    { elementType: "geometry", stylers: [{ color: "#171F23" }] },
    { elementType: "labels.text.fill", stylers: [{ color: "#99A8AE" }] },
    { elementType: "labels.text.stroke", stylers: [{ color: "#171F23" }] },
    {
      featureType: "road",
      elementType: "geometry",
      stylers: [{ color: "#364248" }],
    },
    {
      featureType: "road.highway",
      elementType: "geometry",
      stylers: [{ color: "#52635F" }],
    },
    {
      featureType: "water",
      elementType: "geometry",
      stylers: [{ color: "#102F38" }],
    },
    {
      featureType: "poi.park",
      elementType: "geometry",
      stylers: [{ color: "#223A32" }],
    },
    { featureType: "poi.business", stylers: [{ visibility: "off" }] },
    { featureType: "transit", stylers: [{ visibility: "off" }] },
  ],
};
