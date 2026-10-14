import { Platform } from "react-native";
import { requireNativeView } from "expo";
import { useEffect, useState, type ComponentType } from "react";
import type { ViewProps } from "react-native";
import { StyleSheet, View, Text, Pressable } from "react-native";
import { nativeNavigation } from "../../modules/roam-navigation/src";
import { useRoam } from "../contexts/RoamProvider";
import { useTheme } from "../themes/ThemeProvider";
import { useMapTheme } from "../map/MapThemeProvider";
import { LegacyMapCanvas } from "./LegacyMapCanvas";
import type { MapCanvasProps } from "./MapCanvas.types";
type NativeMapProps = ViewProps & {
  theme: string;
  routeID: string;
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
  onMapStatus: (e: { nativeEvent: { state: string } }) => void;
};
const NativeMap =
  Platform.OS === "ios" && nativeNavigation()
    ? (requireNativeView("RoamNavigation") as ComponentType<NativeMapProps>)
    : null;
export function MapCanvas(props: MapCanvasProps) {
  const { theme } = useTheme();
  const mapTheme = useMapTheme();
  const { navigation, navigator } = useRoam();
  const [mapboxAvailable, setMapboxAvailable] = useState(false);
  const [mapFailed, setMapFailed] = useState(false);
  useEffect(() => {
    let mounted = true;
    void navigator.available().then((a) => {
      if (mounted) setMapboxAvailable(a.available && a.provider === "mapbox");
    });
    return () => {
      mounted = false;
    };
  }, [navigator]);
  if (
    !NativeMap ||
    mapFailed ||
    !mapboxAvailable ||
    (props.route &&
      props.route.provider !== "mapbox" &&
      navigation.mode !== "native")
  )
    return (
      <>
        <LegacyMapCanvas {...props} />
        {mapFailed && (
          <View
            style={{
              position: "absolute",
              top: (props.topInset ?? 80) + 12,
              left: 20,
              right: 20,
              padding: 12,
              backgroundColor: theme.colors.surface,
              borderRadius: 14,
            }}
          >
            <Text style={{ color: theme.colors.text }}>
              Map unavailable. Your trip and controls are still here.
            </Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Retry ROAM map"
              onPress={() => setMapFailed(false)}
              style={{ minHeight: 44, justifyContent: "center" }}
            >
              <Text style={{ color: theme.colors.accent }}>Try map again</Text>
            </Pressable>
          </View>
        )}
      </>
    );
  return (
    <NativeMap
      style={StyleSheet.absoluteFill}
      theme={mapTheme.theme === "night" ? "dark" : "light"}
      routeID={props.route?.provider === "mapbox" ? props.route.id : ""}
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
          : props.route?.provider === "mapbox"
            ? props.route.geometry
            : []
      }
      coordinate={
        props.coordinate
          ? { ...props.coordinate, heading: props.heading ?? -1 }
          : null
      }
      onCameraChange={() => navigator.setCamera("FREE")}
      onMapStatus={({ nativeEvent }) => {
        if (nativeEvent.state === "unavailable") setMapFailed(true);
      }}
    />
  );
}
