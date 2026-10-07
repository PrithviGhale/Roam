import { Text, View } from "react-native";
import { useTheme } from "../themes/ThemeProvider";
import { Eyebrow } from "./ui";

export function SpeedDisplay({
  speedMph,
  small = false,
}: {
  speedMph: number | null;
  small?: boolean;
}) {
  const {
    theme: { colors },
  } = useTheme();
  return (
    <View
      style={{ alignItems: "center", minWidth: 49, gap: 2 }}
      accessibilityLabel={
        speedMph === null ? "Speed unavailable" : `${speedMph} miles per hour`
      }
    >
      <Text
        style={{
          color: colors.text,
          fontSize: small ? 25 : 37,
          fontWeight: "600",
          fontVariant: ["tabular-nums"],
          lineHeight: small ? 31 : 43,
        }}
      >
        {speedMph ?? "—"}
      </Text>
      <Eyebrow>MPH</Eyebrow>
    </View>
  );
}
