import { Pressable, Text, View } from "react-native";
import { useTheme } from "../themes/ThemeProvider";
import type { Place, PlaceSuggestion } from "../types/domain";
import {
  formatArrivalTime,
  formatDetour,
  formatDistance,
} from "../utils/format";
import { space, radius, type } from "../design/tokens";
import { Icon } from "./ui";
export function PlaceList({
  places,
  onSelect,
  numbered = false,
  actionLabel,
  disabled = false,
  displayOnly = false,
}: {
  places: Place[];
  onSelect(place: Place): void;
  numbered?: boolean;
  actionLabel?: string;
  disabled?: boolean;
  displayOnly?: boolean;
}) {
  const {
    theme: { colors },
  } = useTheme();
  return (
    <View style={{ gap: space.sm }}>
      {places.map((place, index) => {
        const facts = [
          place.rating !== undefined
            ? `★ ${place.rating.toFixed(1)}${place.ratingCount !== undefined ? ` · ${place.ratingCount} reviews` : ""}`
            : null,
          place.businessStatus === "CLOSED_PERMANENTLY"
            ? "Permanently closed"
            : place.openNow === undefined
              ? null
              : place.openNow
                ? "Open now"
                : "Closed now",
        ]
          .filter(Boolean)
          .join(" · ");
        return (
          <Pressable
            key={place.id}
            accessibilityRole={displayOnly ? "text" : "button"}
            accessibilityState={{ disabled }}
            accessibilityLabel={`${displayOnly ? "" : (actionLabel ?? "View")} ${place.name}${place.verifiedDetour ? `, verified detour ${formatDetour(place.verifiedDetour.durationSeconds)}` : ""}${place.source === "mock" ? ", demo place" : ""}`}
            disabled={disabled || displayOnly}
            onPress={() => onSelect(place)}
            style={({ pressed }) => ({
              minHeight: 88,
              padding: space.md,
              gap: space.sm,
              borderRadius: radius.lg,
              borderWidth: 1,
              borderColor: colors.border,
              backgroundColor: colors.surface,
              opacity: disabled ? 0.45 : pressed ? 0.7 : 1,
            })}
          >
            <View
              style={{
                flexDirection: "row",
                gap: space.sm,
                alignItems: "center",
              }}
            >
              <View style={{ flex: 1, gap: space.xxs }}>
                <Text style={{ ...type.heading, color: colors.text }}>
                  {numbered ? `${index + 1}. ` : ""}
                  {place.name}
                </Text>
                {facts && place.source === "verified" ? (
                  <Text style={{ ...type.small, color: colors.muted }}>
                    {facts}
                  </Text>
                ) : null}
              </View>
              <Icon
                name="arrow-forward-outline"
                size={18}
                color={colors.muted}
              />
            </View>
            {place.source === "mock" ? (
              <Text style={{ ...type.small, color: colors.accent }}>
                Demo place · fictional
              </Text>
            ) : place.verifiedDetour ? (
              <View style={{ gap: space.xxs }}>
                <View
                  style={{
                    flexDirection: "row",
                    gap: space.lg,
                    flexWrap: "wrap",
                  }}
                >
                  <Text style={{ ...type.title, color: colors.accent }}>
                    {formatDetour(place.verifiedDetour.durationSeconds)}
                  </Text>
                  <Text
                    style={{
                      ...type.heading,
                      color: colors.text,
                      alignSelf: "center",
                    }}
                  >
                    {place.verifiedDetour.distanceMeters < 0 ? "−" : "+"}
                    {formatDistance(
                      Math.abs(place.verifiedDetour.distanceMeters),
                    )}
                  </Text>
                </View>
                <Text style={{ ...type.small, color: colors.muted }}>
                  Verified route comparison ·{" "}
                  {formatArrivalTime(place.verifiedDetour.calculatedAt)}
                </Text>
              </View>
            ) : place.routeOffsetMeters !== undefined ? (
              <Text style={{ ...type.small, color: colors.muted }}>
                {formatDistance(place.aheadMeters)} ahead ·{" "}
                {formatDistance(place.routeOffsetMeters)} off route, approximate
              </Text>
            ) : place.distanceMeters !== undefined ? (
              <Text style={{ ...type.small, color: colors.muted }}>
                {formatDistance(place.distanceMeters)} away · straight-line
              </Text>
            ) : null}
            <Text
              numberOfLines={2}
              style={{ ...type.small, color: colors.muted }}
            >
              {place.address ?? place.subtitle}
            </Text>
            {actionLabel && (
              <Text
                style={{
                  ...type.body,
                  fontWeight: "600",
                  color: colors.accent,
                }}
              >
                {actionLabel} →
              </Text>
            )}
          </Pressable>
        );
      })}
    </View>
  );
}
export function SuggestionsList({
  suggestions,
  onSelect,
  disabled,
}: {
  suggestions: PlaceSuggestion[];
  onSelect(suggestion: PlaceSuggestion): void;
  disabled: boolean;
}) {
  const {
    theme: { colors },
  } = useTheme();
  return (
    <View>
      {suggestions.map((suggestion) => (
        <Pressable
          key={suggestion.id}
          accessibilityRole="button"
          accessibilityState={{ disabled }}
          accessibilityLabel={`Route to ${suggestion.name}`}
          disabled={disabled}
          onPress={() => onSelect(suggestion)}
          style={({ pressed }) => ({
            minHeight: 76,
            paddingVertical: space.md,
            flexDirection: "row",
            alignItems: "center",
            gap: space.sm,
            borderBottomWidth: 1,
            borderBottomColor: colors.border,
            opacity: disabled ? 0.45 : pressed ? 0.6 : 1,
          })}
        >
          <Icon name="navigate-outline" size={18} color={colors.accent} />
          <View style={{ flex: 1, gap: space.xxs }}>
            <Text style={{ ...type.heading, color: colors.text }}>
              {suggestion.name}
            </Text>
            <Text style={{ ...type.small, color: colors.muted }}>
              {suggestion.subtitle}
            </Text>
            {suggestion.source === "mock" && (
              <Text style={{ ...type.small, color: colors.accent }}>
                Demo place
              </Text>
            )}
          </View>
          <Icon name="arrow-forward" size={18} color={colors.muted} />
        </Pressable>
      ))}
    </View>
  );
}
