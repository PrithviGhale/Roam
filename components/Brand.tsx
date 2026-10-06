import { Text, View } from "react-native";
import { useTheme } from "../themes/ThemeProvider";
import { Icon } from "./ui";

export function Brand({ large = false }: { large?: boolean }) {
  const {
    theme: { colors },
  } = useTheme();
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
      <View
        style={{
          width: large ? 48 : 34,
          height: large ? 48 : 34,
          borderRadius: large ? 16 : 12,
          backgroundColor: colors.accent,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Icon name="navigate" size={large ? 25 : 19} color={colors.onAccent} />
      </View>
      <Text
        style={{
          color: colors.text,
          fontSize: large ? 32 : 25,
          fontWeight: "800",
          letterSpacing: 4,
        }}
      >
        ROAM
      </Text>
    </View>
  );
}
