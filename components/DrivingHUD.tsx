import { StyleSheet, Text, View } from "react-native";
import { useRoam } from "../contexts/RoamProvider";
import { useTheme } from "../themes/ThemeProvider";
import { compassLabel } from "../utils/location";
import { Eyebrow, Icon, Panel } from "./ui";

export function DrivingHUD() {
  const { speedMph, heading, status, fresh } = useRoam();
  const {
    theme: { colors },
  } = useTheme();
  return (
    <Panel style={styles.panel}>
      <View
        style={styles.speed}
        accessibilityLabel={
          speedMph === null ? "Speed unavailable" : `${speedMph} miles per hour`
        }
      >
        <Text style={[styles.number, { color: colors.text }]}>
          {speedMph ?? "—"}
        </Text>
        <Eyebrow>MPH</Eyebrow>
      </View>
      <View style={[styles.divider, { backgroundColor: colors.border }]} />
      <View style={{ flex: 1, gap: 7 }}>
        <Eyebrow>ON THE ROAD</Eyebrow>
        <Text style={{ color: colors.text, fontSize: 14, fontWeight: "600" }}>
          Your next chapter awaits
        </Text>
        <Text style={{ color: colors.muted, fontSize: 11 }}>
          Road name unavailable
        </Text>
      </View>
      <View style={{ alignItems: "center", gap: 5 }}>
        <Icon name="compass-outline" color={colors.accent} size={22} />
        <Text style={{ color: colors.text, fontSize: 11, fontWeight: "700" }}>
          {compassLabel(heading)}
        </Text>
        <Text style={{ color: colors.muted, fontSize: 9 }}>
          {status === "ready" && fresh ? "GPS" : "NO FIX"}
        </Text>
      </View>
    </Panel>
  );
}
const styles = StyleSheet.create({
  panel: { flexDirection: "row", alignItems: "center", gap: 14, padding: 16 },
  speed: { alignItems: "center", minWidth: 49, gap: 2 },
  number: {
    fontSize: 37,
    fontWeight: "600",
    fontVariant: ["tabular-nums"],
    lineHeight: 43,
  },
  divider: { width: 1, height: 46 },
});
