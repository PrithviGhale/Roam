import { Pressable, StyleSheet, Text, View } from "react-native";
import { QUICK_ACTIONS } from "../constants/places";
import { useTheme } from "../themes/ThemeProvider";
import type { Place, PlaceSuggestion } from "../types/domain";
import { formatDistance } from "../utils/format";
import { Icon } from "./ui";

export function PlaceList({
  places,
  onSelect,
  numbered = false,
  actionLabel,
  disabled = false,
}: {
  places: Place[];
  onSelect: (place: Place) => void;
  numbered?: boolean;
  actionLabel?: string;
  disabled?: boolean;
}) {
  const {
    theme: { colors },
  } = useTheme();
  return (
    <View style={{ gap: 10 }}>
      {places.map((place, index) => (
        <Pressable
          key={place.id}
          accessibilityRole="button"
          accessibilityLabel={`${actionLabel ?? "View"} ${place.name}${place.source === "mock" ? ", demo place" : ""}`}
          disabled={disabled}
          onPress={() => onSelect(place)}
          style={({ pressed }) => [
            styles.row,
            {
              backgroundColor: colors.surface,
              borderColor: colors.border,
              opacity: pressed || disabled ? 0.6 : 1,
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
              {numbered ? `${index + 1}. ` : ""}
              {place.name}
            </Text>
            <Text style={{ color: colors.muted, fontSize: 11 }}>
              {place.subtitle}
            </Text>
            {place.source === "mock" ? (
              <Text
                style={{
                  color: colors.accent,
                  fontSize: 10,
                  fontWeight: "600",
                }}
              >
                DEMO PLACE
              </Text>
            ) : (
              <>
                <Text style={{ color: colors.accent, fontSize: 11 }}>
                  {[
                    place.rating !== undefined
                      ? `★ ${place.rating.toFixed(1)}${place.ratingCount !== undefined ? ` (${place.ratingCount})` : ""}`
                      : null,
                    place.openNow !== undefined
                      ? place.openNow
                        ? "Open now"
                        : "Closed now"
                      : null,
                    place.businessStatus === "CLOSED_PERMANENTLY"
                      ? "Permanently closed"
                      : null,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </Text>
                {place.distanceMeters !== undefined && (
                  <Text style={{ color: colors.muted, fontSize: 10 }}>
                    {formatDistance(place.distanceMeters)} away · straight-line
                  </Text>
                )}
                {place.routeOffsetMeters !== undefined && (
                  <Text style={{ color: colors.muted, fontSize: 10 }}>
                    {formatDistance(place.aheadMeters)} ahead ·{" "}
                    {formatDistance(place.routeOffsetMeters)} off route
                    (approx.)
                  </Text>
                )}
              </>
            )}
          </View>
          <View style={{ gap: 5, alignItems: "center" }}>
            {actionLabel && (
              <Text
                style={{
                  color: colors.accent,
                  fontSize: 10,
                  fontWeight: "600",
                }}
              >
                {actionLabel}
              </Text>
            )}
            <Icon
              name="arrow-up-right-box-outline"
              size={18}
              color={colors.muted}
            />
          </View>
        </Pressable>
      ))}
    </View>
  );
}
export function SuggestionsList({
  suggestions,
  onSelect,
  disabled,
}: {
  suggestions: PlaceSuggestion[];
  onSelect: (suggestion: PlaceSuggestion) => void;
  disabled: boolean;
}) {
  const {
    theme: { colors },
  } = useTheme();
  return (
    <View style={{ gap: 10 }}>
      {suggestions.map((suggestion) => (
        <Pressable
          key={suggestion.id}
          disabled={disabled}
          accessibilityRole="button"
          accessibilityLabel={`Route to ${suggestion.name}`}
          onPress={() => onSelect(suggestion)}
          style={({ pressed }) => [
            styles.row,
            {
              backgroundColor: colors.surface,
              borderColor: colors.border,
              opacity: pressed || disabled ? 0.5 : 1,
            },
          ]}
        >
          <Icon name="location-outline" color={colors.accent} />
          <View style={{ flex: 1, gap: 6 }}>
            <Text
              style={{ color: colors.text, fontSize: 15, fontWeight: "600" }}
            >
              {suggestion.name}
            </Text>
            <Text style={{ color: colors.muted, fontSize: 12 }}>
              {suggestion.subtitle}
            </Text>
            {suggestion.source === "mock" && (
              <Text style={{ color: colors.accent, fontSize: 10 }}>
                DEMO PLACE
              </Text>
            )}
          </View>
          <Icon name="arrow-forward-outline" size={18} color={colors.muted} />
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
