import { Pressable, StyleSheet, Text, View } from "react-native";
import { QUICK_ACTIONS } from "../constants/places";
import { useTheme } from "../themes/ThemeProvider";
import type { Place } from "../types/domain";
import { Icon } from "./ui";

export function PlaceList({
  places,
  onSelect,
}: {
  places: Place[];
  onSelect: (place: Place) => void;
}) {
  const {
    theme: { colors },
  } = useTheme();
  return (
    <View style={{ gap: 10 }}>
      {places.map((place) => (
        <Pressable
          key={place.id}
          accessibilityRole="button"
          accessibilityLabel={`Preview ${place.name}, demo place`}
          onPress={() => onSelect(place)}
          style={({ pressed }) => [
            styles.row,
            {
              backgroundColor: colors.surface,
              borderColor: colors.border,
              opacity: pressed ? 0.6 : 1,
            },
          ]}
        >
          <View style={[styles.icon, { backgroundColor: colors.accentSoft }]}>
            <Icon
              name={
                QUICK_ACTIONS.find(
                  (action) => action.category === place.category,
                )?.icon ?? "location-outline"
              }
              color={colors.accent}
            />
          </View>
          <View style={{ flex: 1, gap: 5 }}>
            <Text
              style={{ color: colors.text, fontSize: 15, fontWeight: "600" }}
            >
              {place.name}
            </Text>
            <Text style={{ color: colors.muted, fontSize: 11 }}>
              {place.subtitle}
            </Text>
            <Text
              style={{ color: colors.accent, fontSize: 10, fontWeight: "600" }}
            >
              DEMO PLACE
            </Text>
          </View>
          <Icon
            name="arrow-up-right-box-outline"
            size={18}
            color={colors.muted}
          />
        </Pressable>
      ))}
    </View>
  );
}
const styles = StyleSheet.create({
  row: {
    minHeight: 100,
    borderWidth: 1,
    borderRadius: 20,
    padding: 14,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  icon: {
    width: 44,
    height: 44,
    borderRadius: 15,
    alignItems: "center",
    justifyContent: "center",
  },
});
