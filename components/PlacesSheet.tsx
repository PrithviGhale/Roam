import {
  ActivityIndicator,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";
import { useState } from "react";
import { useRoam } from "../contexts/RoamProvider";
import { usePlaces } from "../hooks/usePlaces";
import { useTheme } from "../themes/ThemeProvider";
import { QUICK_ACTIONS } from "../constants/places";
import type { Place, PlaceCategory } from "../types/domain";
import { BottomSheet } from "./BottomSheet";
import { PlaceList } from "./PlaceList";
import { Button, Icon } from "./ui";

export function PlacesSheet({
  visible,
  category,
  onClose,
  onSelect,
}: {
  visible: boolean;
  category: PlaceCategory | null;
  onClose: () => void;
  onSelect: (place: Place) => void;
}) {
  const {
    theme: { colors },
  } = useTheme();
  const { coordinate } = useRoam();
  const [query, setQuery] = useState("");
  const { places, loading, error, retry } = usePlaces(
    query,
    category,
    coordinate,
    visible,
  );
  return (
    <BottomSheet
      visible={visible}
      onClose={onClose}
      title={
        category
          ? `${QUICK_ACTIONS.find((action) => action.category === category)?.label} stops`
          : "Find your next destination"
      }
      subtitle="Explore the prototype · Sample results"
      tall
    >
      {!category && (
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: 12,
            backgroundColor: colors.surface,
            borderRadius: 16,
            paddingHorizontal: 15,
            marginBottom: 15,
          }}
        >
          <Icon name="search-outline" color={colors.accent} size={20} />
          <TextInput
            autoFocus
            accessibilityLabel="Destination search"
            placeholder="Try coffee, food, or Juniper…"
            placeholderTextColor={colors.muted}
            value={query}
            onChangeText={setQuery}
            returnKeyType="search"
            autoCorrect={false}
            style={{ minHeight: 54, flex: 1, color: colors.text, fontSize: 15 }}
          />
        </View>
      )}
      <ScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ paddingBottom: 20, gap: 15 }}
      >
        <Text style={{ color: colors.muted, fontSize: 12, lineHeight: 19 }}>
          Demo places are fictional, with sample pins near the map center. Live
          search, distances, ratings, and opening hours are not connected.
        </Text>
        {loading ? (
          <ActivityIndicator
            accessibilityLabel="Loading places"
            color={colors.accent}
            style={{ padding: 30 }}
          />
        ) : error ? (
          <View style={{ gap: 15 }}>
            <Text style={{ color: colors.danger }}>{error}</Text>
            <Button secondary onPress={retry}>
              Try again
            </Button>
          </View>
        ) : places.length ? (
          <PlaceList places={places} onSelect={onSelect} />
        ) : (
          <View style={{ paddingVertical: 35, gap: 10 }}>
            <Icon name="search-outline" size={30} color={colors.muted} />
            <Text
              style={{ color: colors.text, fontSize: 17, fontWeight: "600" }}
            >
              No demo matches yet
            </Text>
            <Text style={{ color: colors.muted, fontSize: 13 }}>
              Try “coffee,” “food,” “gas,” or “parking.”
            </Text>
          </View>
        )}
      </ScrollView>
    </BottomSheet>
  );
}
