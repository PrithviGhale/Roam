import { StyleSheet, Text, View } from "react-native";
import { useTheme } from "../themes/ThemeProvider";
import { hasGoogleServices } from "../services/config";
import { Icon } from "./ui";
import type { MapCanvasProps } from "./MapCanvas.types";

// react-native-maps is native-only. This illustration keeps browser UI review usable.
export function MapCanvas({ destination }: MapCanvasProps) {
  const {
    theme: { colors },
  } = useTheme();
  if (hasGoogleServices)
    return (
      <View
        style={[
          StyleSheet.absoluteFill,
          {
            backgroundColor: colors.background,
            alignItems: "center",
            justifyContent: "center",
            padding: 30,
          },
        ]}
      >
        <Text style={{ color: colors.muted, textAlign: "center" }}>
          Browser UI preview. Open ROAM on iPhone with the Google Maps provider
          to view the driving route.
        </Text>
      </View>
    );
  return (
    <View
      style={[
        StyleSheet.absoluteFill,
        { backgroundColor: colors.mapLand, overflow: "hidden" },
      ]}
    >
      <View
        style={{
          position: "absolute",
          top: "25%",
          left: "-20%",
          width: "45%",
          height: "90%",
          backgroundColor: colors.mapWater,
          transform: [{ rotate: "-22deg" }],
        }}
      />
      <View
        style={{
          position: "absolute",
          left: "58%",
          top: "25%",
          width: 100,
          height: 210,
          backgroundColor: colors.mapPark,
          borderRadius: 8,
          transform: [{ rotate: "-22deg" }],
        }}
      />
      <View
        style={{
          position: "absolute",
          left: "-20%",
          top: "-10%",
          width: "150%",
          height: "130%",
          transform: [{ rotate: "-22deg" }],
        }}
      >
        {Array.from({ length: 17 }, (_, i) => (
          <View
            key={`h${i}`}
            style={{
              position: "absolute",
              top: i * 65,
              width: "100%",
              height: i === 7 ? 12 : 5,
              backgroundColor: colors.mapRoad,
            }}
          />
        ))}
        {Array.from({ length: 9 }, (_, i) => (
          <View
            key={`v${i}`}
            style={{
              position: "absolute",
              left: i * 95,
              height: "100%",
              width: i === 3 ? 12 : 5,
              backgroundColor: colors.mapRoad,
            }}
          />
        ))}
      </View>
      <Text
        style={{
          position: "absolute",
          top: "40%",
          left: "42%",
          color: colors.muted,
          letterSpacing: 3,
          fontSize: 11,
        }}
      >
        MAP PREVIEW
      </Text>
      <Text
        style={{
          position: "absolute",
          top: "62%",
          left: "35%",
          color: colors.muted,
          letterSpacing: 2,
          fontSize: 11,
        }}
      >
        ILLUSTRATION · NO LIVE MAP
      </Text>
      <View
        style={{
          position: "absolute",
          top: "52%",
          left: "50%",
          width: 50,
          height: 50,
          borderRadius: 25,
          borderWidth: 1,
          borderColor: colors.accent,
          backgroundColor: colors.accentSoft,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Icon name="navigate" color={colors.accent} size={25} />
      </View>
      {destination?.source === "mock" && (
        <View style={{ position: "absolute", top: "40%", left: "65%" }}>
          <Icon name="location" size={34} color={colors.accent} />
        </View>
      )}
    </View>
  );
}
