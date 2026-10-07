import { Pressable, Text, View } from "react-native";
import { useTheme } from "../themes/ThemeProvider";
import { Icon } from "./ui";
import { radius, space, type } from "../design/tokens";

export function SearchBar({ onPress }: { onPress: () => void }) {
  const {
    theme: { colors },
  } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Search for a destination"
      onPress={onPress}
      style={({ pressed }) => ({
        backgroundColor: colors.surface,
        borderColor: colors.border,
        borderWidth: 1,
        borderRadius: radius.md,
        paddingHorizontal: space.md,
        minHeight: 52,
        flexDirection: "row",
        alignItems: "center",
        gap: 13,
        opacity: pressed ? 0.7 : 1,
      })}
    >
      <Icon name="search-outline" color={colors.accent} size={22} />
      <View style={{ flex: 1, gap: 4 }}>
        <Text style={{ ...type.body, color: colors.text, fontWeight: "600" }}>
          Where to next?
        </Text>
      </View>
      <Icon name="arrow-forward-outline" size={19} color={colors.muted} />
    </Pressable>
  );
}
