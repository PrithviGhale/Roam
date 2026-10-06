import { useEffect, useRef, useState } from "react";
import { StyleSheet, View } from "react-native";
import MapView, { Marker } from "react-native-maps";
import { useTheme } from "../themes/ThemeProvider";
import { mapsService } from "../services/maps";
import { Icon } from "./ui";
import type { MapCanvasProps } from "./MapCanvas.types";

export function MapCanvas({
  coordinate,
  heading,
  destination,
  recenterToken,
  bottomInset,
}: MapCanvasProps) {
  const { theme } = useTheme();
  const map = useRef<MapView>(null);
  const [ready, setReady] = useState(false);
  const hasCentered = useRef(false);
  const latestCoordinate = useRef(coordinate);
  latestCoordinate.current = coordinate;
  useEffect(() => {
    if (!ready || !coordinate || hasCentered.current) return;
    hasCentered.current = true;
    map.current?.animateToRegion(mapsService.regionFor(coordinate), 700);
  }, [coordinate, ready]);
  useEffect(() => {
    if (ready && recenterToken > 0)
      map.current?.animateToRegion(
        mapsService.regionFor(latestCoordinate.current),
        500,
      );
  }, [recenterToken, ready]);
  useEffect(() => {
    if (!ready || !destination) return;
    const points = latestCoordinate.current
      ? [latestCoordinate.current, destination.coordinate]
      : [destination.coordinate];
    map.current?.fitToCoordinates(points, {
      animated: true,
      edgePadding: { top: 210, left: 55, right: 55, bottom: bottomInset + 80 },
    });
  }, [destination, ready, bottomInset]);
  return (
    <MapView
      ref={map}
      style={StyleSheet.absoluteFill}
      initialRegion={mapsService.regionFor(coordinate)}
      onMapReady={() => setReady(true)}
      userInterfaceStyle={theme.id}
      customMapStyle={theme.mapStyle}
      showsCompass
      showsScale
      rotateEnabled
      pitchEnabled
      showsUserLocation={false}
      showsMyLocationButton={false}
      toolbarEnabled={false}
      mapPadding={{ top: 210, right: 15, bottom: bottomInset, left: 15 }}
    >
      {coordinate && (
        <Marker
          coordinate={coordinate}
          anchor={{ x: 0.5, y: 0.5 }}
          title="Your location"
          tracksViewChanges
          rotation={heading ?? 0}
          flat
        >
          <View
            style={{
              width: 48,
              height: 48,
              borderRadius: 24,
              backgroundColor: theme.colors.accentSoft,
              borderWidth: 1,
              borderColor: theme.colors.accent,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <View
              style={{
                width: 32,
                height: 32,
                borderRadius: 16,
                backgroundColor: theme.colors.accent,
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Icon name="navigate" size={21} color={theme.colors.onAccent} />
            </View>
          </View>
        </Marker>
      )}
      {destination && (
        <Marker
          coordinate={destination.coordinate}
          title={destination.name}
          description="Fictional demo place"
          pinColor={theme.colors.accent}
        />
      )}
    </MapView>
  );
}
