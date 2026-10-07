import { useEffect, useRef, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import MapView, { Marker, Polyline, PROVIDER_GOOGLE } from "react-native-maps";
import { useTheme } from "../themes/ThemeProvider";
import { mapsService } from "../services/maps";
import { hasGoogleServices } from "../services/config";
import { supportsGoogleMap } from "../services/mapCapability";
import { Icon } from "./ui";
import type { MapCanvasProps } from "./MapCanvas.types";
import { useRoam } from "../contexts/RoamProvider";
import { useReducedMotion } from "../hooks/useReducedMotion";

export function LegacyMapCanvas({
  coordinate,
  heading,
  destination,
  recenterToken,
  bottomInset,
  topInset = 120,
  recommendation,
  route,
  stops,
}: MapCanvasProps) {
  const { theme } = useTheme();
  const { navigation, navigator, tripState } = useRoam();
  const reduced = useReducedMotion();
  const map = useRef<MapView>(null);
  const [ready, setReady] = useState(false);
  const [googleSupported] = useState(supportsGoogleMap);
  const google = hasGoogleServices && googleSupported;
  const hasCentered = useRef(false);
  const latest = useRef({ coordinate, bottomInset, topInset, reduced });
  latest.current = { coordinate, bottomInset, topInset, reduced };
  useEffect(() => {
    if (!ready || !coordinate || hasCentered.current || route) return;
    hasCentered.current = true;
    map.current?.animateToRegion(
      mapsService.regionFor(coordinate),
      latest.current.reduced ? 0 : 240,
    );
  }, [coordinate, ready, route]);
  useEffect(() => {
    if (ready && recenterToken > 0)
      map.current?.animateToRegion(
        mapsService.regionFor(latest.current.coordinate),
        latest.current.reduced ? 0 : 240,
      );
  }, [recenterToken, ready]);
  useEffect(() => {
    if (
      !ready ||
      !route ||
      !google ||
      navigation.camera === "FREE" ||
      (tripState.trip?.startedAt && navigation.camera !== "OVERVIEW")
    )
      return;
    hasCentered.current = true;
    const points = [
      ...route.geometry,
      route.destination.coordinate,
      ...stops.map((stop) => stop.place.coordinate),
    ];
    if (latest.current.coordinate) points.push(latest.current.coordinate);
    map.current?.fitToCoordinates(points, {
      animated: !latest.current.reduced,
      edgePadding: {
        top: latest.current.topInset,
        left: 40,
        right: 40,
        bottom: latest.current.bottomInset,
      },
    });
    // GPS and overlay-height changes must not steal a panned camera.
  }, [route, ready, google, navigation.camera]);
  useEffect(() => {
    if (!ready || !destination || destination.source !== "mock") return;
    const points = latest.current.coordinate
      ? [latest.current.coordinate, destination.coordinate]
      : [destination.coordinate];
    map.current?.fitToCoordinates(points, {
      animated: !latest.current.reduced,
      edgePadding: {
        top: latest.current.topInset,
        left: 40,
        right: 40,
        bottom: latest.current.bottomInset,
      },
    });
  }, [destination, ready]);
  useEffect(() => {
    if (
      !ready ||
      !coordinate ||
      navigation.camera !== "FOLLOW" ||
      !tripState.trip?.startedAt
    )
      return;
    map.current?.animateCamera(
      { center: coordinate, heading: heading ?? 0, pitch: 0, zoom: 16 },
      { duration: reduced ? 0 : 240 },
    );
  }, [
    ready,
    coordinate,
    heading,
    navigation.camera,
    tripState.trip?.startedAt,
    reduced,
  ]);
  if (hasGoogleServices && !googleSupported)
    return (
      <View
        style={[
          StyleSheet.absoluteFill,
          {
            backgroundColor: theme.colors.background,
            alignItems: "center",
            justifyContent: "center",
            paddingHorizontal: 35,
          },
        ]}
      >
        <Text
          style={{
            color: theme.colors.muted,
            fontSize: 13,
            textAlign: "center",
            lineHeight: 21,
          }}
        >
          This build does not include native Google Maps.\nOpen ROAM in a
          Google-enabled iOS development build to display real routes.
        </Text>
      </View>
    );
  return (
    <MapView
      ref={map}
      style={StyleSheet.absoluteFill}
      provider={google ? PROVIDER_GOOGLE : undefined}
      initialRegion={mapsService.regionFor(coordinate)}
      onMapReady={() => setReady(true)}
      onPanDrag={() => navigator.setCamera("FREE")}
      userInterfaceStyle={theme.id}
      customMapStyle={google ? theme.mapStyle : undefined}
      showsCompass
      showsScale
      rotateEnabled
      pitchEnabled
      showsUserLocation={false}
      showsMyLocationButton={false}
      toolbarEnabled={false}
      legalLabelInsets={{
        top: topInset,
        left: 15,
        right: 15,
        bottom: bottomInset,
      }}
      appleLogoInsets={{ top: 0, left: 15, right: 0, bottom: bottomInset }}
      mapPadding={{ top: topInset, right: 15, bottom: bottomInset, left: 15 }}
    >
      {google && route && (
        <>
          <Polyline
            coordinates={route.geometry}
            strokeColor={theme.colors.background}
            strokeWidth={9}
          />
          <Polyline
            coordinates={route.geometry}
            strokeColor={theme.colors.route}
            strokeWidth={5}
          />
        </>
      )}
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
              borderRadius: 12,
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
                borderRadius: 8,
                backgroundColor: theme.colors.accent,
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Icon
                name={heading === null ? "ellipse" : "navigate"}
                size={21}
                color={theme.colors.onAccent}
              />
            </View>
          </View>
        </Marker>
      )}
      {(google || destination?.source === "mock") && destination && (
        <Marker
          coordinate={destination.coordinate}
          title={destination.name}
          description={
            destination.source === "mock"
              ? "Fictional demo place"
              : "Final destination"
          }
        >
          <View
            style={{
              width: 42,
              height: 42,
              borderRadius: 8,
              backgroundColor: theme.colors.text,
              borderWidth: 2,
              borderColor: theme.colors.accent,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Icon name="flag" color={theme.colors.background} size={20} />
          </View>
        </Marker>
      )}
      {google &&
        stops.map((stop, index) => (
          <Marker
            key={stop.id}
            coordinate={stop.place.coordinate}
            title={stop.place.name}
            description={`Stop ${index + 1}`}
          >
            <View
              style={{
                width: 34,
                height: 34,
                borderRadius: 8,
                backgroundColor: theme.colors.accent,
                borderWidth: 2,
                borderColor: theme.colors.background,
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Text
                style={{
                  color: theme.colors.onAccent,
                  fontSize: 14,
                  fontWeight: "700",
                }}
              >
                {index + 1}
              </Text>
            </View>
          </Marker>
        ))}
      {google && recommendation?.source === "verified" && (
        <Marker
          coordinate={recommendation.coordinate}
          title={recommendation.name}
          description="Recommended place"
        >
          <View
            style={{
              width: 36,
              height: 36,
              borderRadius: 8,
              borderWidth: 2,
              borderColor: theme.colors.accent,
              backgroundColor: theme.colors.surface,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Icon
              name="sparkles-outline"
              color={theme.colors.accent}
              size={20}
            />
          </View>
        </Marker>
      )}
    </MapView>
  );
}
