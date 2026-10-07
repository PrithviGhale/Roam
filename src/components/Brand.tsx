import { Text, View } from "react-native";
import { useTheme } from "../themes/ThemeProvider";
import { RoamPulse } from "./RoamPulse";
import { space } from "../design/tokens";
export function Brand({ large = false }: { large?: boolean }) {
  const {
    theme: { colors },
  } = useTheme();
  return (
    <View
      accessible
      accessibilityLabel="ROAM"
      style={{ flexDirection: "row", alignItems: "center", gap: space.sm }}
    >
      <RoamPulse size={large ? 44 : 32} />
      <Text
        style={{
          color: colors.text,
          fontSize: large ? 28 : 21,
          fontWeight: "700",
          letterSpacing: 3,
        }}
      >
        ROAM
      </Text>
    </View>
  );
}
