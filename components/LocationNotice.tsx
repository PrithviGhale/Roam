import { ActivityIndicator, Text, View } from "react-native";
import { useRoam } from "../contexts/RoamProvider";
import { useTheme } from "../themes/ThemeProvider";
import { Button, Panel } from "./ui";

export function LocationNotice() {
  const { status, error, canAskAgain, retry, fresh } = useRoam();
  const {
    theme: { colors },
  } = useTheme();
  if (status === "ready" && fresh) return null;
  const pending = status === "locating" || status === "requesting";
  return (
    <Panel style={{ padding: 14, gap: 10 }}>
      {pending ? (
        <View style={{ flexDirection: "row", gap: 10, alignItems: "center" }}>
          <ActivityIndicator size="small" color={colors.accent} />
          <Text style={{ color: colors.text, fontSize: 12 }}>
            {status === "requesting"
              ? "Getting location permission…"
              : "Finding your GPS position…"}
          </Text>
        </View>
      ) : (
        <>
          <Text style={{ color: colors.text, fontSize: 13, fontWeight: "600" }}>
            {status === "denied"
              ? "Let ROAM find your way"
              : "Location signal unavailable"}
          </Text>
          <Text style={{ color: colors.muted, fontSize: 11, lineHeight: 17 }}>
            {error ??
              (status === "denied"
                ? "ROAM needs location access to provide navigation and nearby recommendations."
                : "Your position has not updated recently. Speed is unavailable until GPS reconnects.")}
          </Text>
          <Button secondary icon="location-outline" onPress={retry}>
            {status === "denied" && !canAskAgain
              ? "Open Settings"
              : "Retry location"}
          </Button>
        </>
      )}
    </Panel>
  );
}
