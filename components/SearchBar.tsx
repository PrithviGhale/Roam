import { Pressable, Text, View } from "react-native";
import { useTheme } from "../themes/ThemeProvider";
import { Icon } from "./ui";

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
        borderRadius: 21,
        paddingHorizontal: 18,
        minHeight: 66,
        flexDirection: "row",
        alignItems: "center",
        gap: 13,
        opacity: pressed ? 0.7 : 1,
      })}
    >
      <Icon name="search-outline" color={colors.accent} size={22} />
      <View style={{ flex: 1, gap: 4 }}>
        <Text style={{ color: colors.text, fontWeight: "600", fontSize: 16 }}>
          Where are you going?
        </Text>
        <Text style={{ color: colors.muted, fontSize: 11 }}>
          A new destination. A new story.
        </Text>
      </View>
      <Icon name="arrow-forward-outline" size={19} color={colors.muted} />
    </Pressable>
  );
}
