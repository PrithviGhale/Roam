import { Pressable, ScrollView, Text } from "react-native";
import { QUICK_ACTIONS } from "../constants/places";
import { useTheme } from "../themes/ThemeProvider";
import type { PlaceCategory } from "../types/domain";
import { Icon } from "./ui";

export function QuickActions({
  onSelect,
}: {
  onSelect: (category: PlaceCategory) => void;
}) {
  const {
    theme: { colors },
  } = useTheme();
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={{ paddingHorizontal: 20, gap: 8 }}
    >
      {QUICK_ACTIONS.map((action) => (
        <Pressable
          key={action.category}
          accessibilityRole="button"
          accessibilityLabel={`Find ${action.label}`}
          onPress={() => onSelect(action.category)}
          style={({ pressed }) => ({
            backgroundColor: colors.surface,
            borderColor: colors.border,
            borderWidth: 1,
            borderRadius: 18,
            minHeight: 46,
            paddingHorizontal: 15,
            gap: 7,
            flexDirection: "row",
            alignItems: "center",
            opacity: pressed ? 0.6 : 1,
          })}
        >
          <Icon name={action.icon} size={17} color={colors.accent} />
          <Text style={{ color: colors.text, fontSize: 12, fontWeight: "600" }}>
            {action.label}
          </Text>
        </Pressable>
      ))}
    </ScrollView>
  );
}
