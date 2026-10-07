import type { MapStyleElement } from "react-native-maps";
import type { RoamTheme } from "../themes/types";
export function mapStyle(colors: RoamTheme["colors"]): MapStyleElement[] {
  return [
    { elementType: "geometry", stylers: [{ color: colors.mapLand }] },
    { elementType: "labels.text.fill", stylers: [{ color: colors.muted }] },
    { elementType: "labels.text.stroke", stylers: [{ color: colors.mapLand }] },
    {
      featureType: "road",
      elementType: "geometry",
      stylers: [{ color: colors.mapRoad }],
    },
    {
      featureType: "road.highway",
      elementType: "geometry",
      stylers: [{ color: colors.border }],
    },
    {
      featureType: "road",
      elementType: "labels.text.fill",
      stylers: [{ color: colors.text }],
    },
    {
      featureType: "water",
      elementType: "geometry",
      stylers: [{ color: colors.mapWater }],
    },
    {
      featureType: "poi.park",
      elementType: "geometry",
      stylers: [{ color: colors.mapPark }],
    },
    {
      featureType: "poi.business",
      elementType: "labels.icon",
      stylers: [{ visibility: "off" }],
    },
    {
      featureType: "transit",
      elementType: "labels.icon",
      stylers: [{ visibility: "off" }],
    },
  ];
}
