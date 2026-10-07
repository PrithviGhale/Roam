import { Platform } from "react-native";
import { requireNativeView } from "expo";
import type { ComponentType } from "react";
import type { ViewProps } from "react-native";
import { StyleSheet } from "react-native";
import { nativeNavigation } from "../../modules/roam-navigation/src";
import { useRoam } from "../contexts/RoamProvider";
import { useTheme } from "../themes/ThemeProvider";
import { LegacyMapCanvas } from "./LegacyMapCanvas";
import type { MapCanvasProps } from "./MapCanvas.types";
type NativeMapProps = ViewProps & {
  theme: string;
  cameraMode: string;
  waypoints: {
    id: string;
    name: string;
    latitude: number;
    longitude: number;
  }[];
  recenterToken: number;
  topInset: number;
  bottomInset: number;
  geometry: { latitude: number; longitude: number }[];
  coordinate: { latitude: number; longitude: number; heading: number } | null;
  onCameraChange: (e: { nativeEvent: { mode: string } }) => void;
};
const NativeMap =
  Platform.OS === "ios" &&
  nativeNavigation() &&
  process.env.EXPO_PUBLIC_GOOGLE_MAPS_IOS_KEY
    ? (requireNativeView("RoamNavigation") as ComponentType<NativeMapProps>)
    : null;
export function MapCanvas(props: MapCanvasProps) {
  const { theme } = useTheme();
  const { navigation, navigator } = useRoam();
  if (!NativeMap) return <LegacyMapCanvas {...props} />;
  return (
    <NativeMap
      style={StyleSheet.absoluteFill}
      theme={theme.id}
      cameraMode={navigation.camera}
      waypoints={[
        ...props.stops.filter((s) => !s.visited).map((s) => s.place),
        ...(props.destination ? [props.destination] : []),
      ].map((p) => ({ id: p.id, name: p.name, ...p.coordinate }))}
      recenterToken={props.recenterToken}
      topInset={props.topInset ?? 120}
      bottomInset={props.bottomInset}
      geometry={
        navigation.mode === "native"
          ? (navigation.geometry ?? [])
          : (props.route?.geometry ?? [])
      }
      coordinate={
        props.coordinate
          ? { ...props.coordinate, heading: props.heading ?? -1 }
          : null
      }
      onCameraChange={() => navigator.setCamera("FREE")}
    />
  );
}
