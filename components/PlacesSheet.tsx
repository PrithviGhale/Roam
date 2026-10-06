import {
  ActivityIndicator,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";
import { useEffect, useRef, useState } from "react";
import * as Crypto from "expo-crypto";
import { useRoam } from "../contexts/RoamProvider";
import { usePlaces } from "../hooks/usePlaces";
import { useTheme } from "../themes/ThemeProvider";
import { QUICK_ACTIONS } from "../constants/places";
import { placesService } from "../services/places";
import { errorMessage, isCancelled } from "../services/errors";
import type { Place, PlaceCategory, PlaceSuggestion } from "../types/domain";
import { BottomSheet } from "./BottomSheet";
import { PlaceList, SuggestionsList } from "./PlaceList";
import { GoogleAttribution } from "./GoogleAttribution";
import { Button, Icon, Panel } from "./ui";

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
  const { coordinate, fresh, tripState, addTripStop } = useRoam();
  const [query, setQuery] = useState("");
  const [sessionToken, setSessionToken] = useState<string>();
  const [selected, setSelected] = useState<Place | null>(null);
  const [resolving, setResolving] = useState(false);
  const [selectionError, setSelectionError] = useState<string | null>(null);
  const detailRequest = useRef<AbortController | null>(null);
  const busy = useRef(false);
  const google = placesService.mode === "google";
  useEffect(() => {
    detailRequest.current?.abort();
    busy.current = false;
    setResolving(false);
    setSelected(null);
    setSelectionError(null);
    if (visible) setSessionToken(Crypto.randomUUID());
    else {
      setQuery("");
      setSessionToken(undefined);
    }
    return () => {
      detailRequest.current?.abort();
      busy.current = false;
    };
  }, [visible, category]);
  const { places, suggestions, loading, error, alongRoute, retry } = usePlaces(
    query,
    category,
    fresh ? coordinate : null,
    visible && Boolean(sessionToken),
    tripState.trip?.route ?? null,
    sessionToken,
  );
  const chooseSuggestion = async (suggestion: PlaceSuggestion) => {
    if (busy.current) return;
    busy.current = true;
    setResolving(true);
    setSelectionError(null);
    const controller = new AbortController();
    detailRequest.current = controller;
    try {
      const place = await placesService.getDetails(suggestion, {
        sessionToken,
        signal: controller.signal,
      });
      if (!controller.signal.aborted) onSelect(place);
    } catch (error) {
      if (!controller.signal.aborted && !isCancelled(error))
        setSelectionError(errorMessage(error));
    } finally {
      if (detailRequest.current === controller) {
        busy.current = false;
        setResolving(false);
      }
    }
  };
  const tripBusy = tripState.status === "loading";
  const canAdd =
    selected?.source === "verified" &&
    tripState.trip?.destination.source === "verified" &&
    selected.id !== tripState.trip.destination.id &&
    !tripState.trip.stops.some((stop) => stop.place.id === selected.id) &&
    tripState.trip.stops.length < 5;
  return (
    <BottomSheet
      visible={visible}
      onClose={onClose}
      title={
        selected
          ? selected.name
          : category
            ? `${QUICK_ACTIONS.find((action) => action.category === category)?.label} stops`
            : "Find your next destination"
      }
      subtitle={
        google
          ? category
            ? alongRoute
              ? "Ahead along your route"
              : "Near your current location"
            : "Google Places · Destination search"
          : "Demo mode · Add a Google key for real places"
      }
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
            editable={!resolving}
            placeholder={
              google
                ? "City, address, or place name…"
                : "Try coffee, food, or Juniper…"
            }
            placeholderTextColor={colors.muted}
            value={query}
            maxLength={200}
            onChangeText={(value) => {
              setSelectionError(null);
              setQuery(value);
            }}
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
        {!google && (
          <Text style={{ color: colors.muted, fontSize: 12, lineHeight: 19 }}>
            No Google configuration is set. Demo places are fictional and cannot
            be used for driving routes.
          </Text>
        )}
        {google && category && (
          <Text style={{ color: colors.muted, fontSize: 11, lineHeight: 18 }}>
            {alongRoute
              ? "Ranked for convenience ahead. Distances are map estimates, not driving detours."
              : "Distances are straight-line estimates. Driving distance is calculated when you choose a route."}
            {category === "restroom"
              ? " Restroom coverage and access are not guaranteed; only Google-listed public bathrooms are included."
              : ""}
          </Text>
        )}
        {selectionError && (
          <Text
            accessibilityLiveRegion="polite"
            style={{ color: colors.danger, fontSize: 13 }}
          >
            {selectionError}
          </Text>
        )}
        {resolving ? (
          <View style={{ gap: 10, alignItems: "center", padding: 25 }}>
            <ActivityIndicator color={colors.accent} />
            <Text style={{ color: colors.muted }}>Resolving destination…</Text>
          </View>
        ) : selected ? (
          <Panel style={{ gap: 15 }}>
            <Text style={{ color: colors.muted, fontSize: 13, lineHeight: 20 }}>
              {selected.address ?? selected.subtitle}
            </Text>
            {selected.source === "verified" && (
              <Text style={{ color: colors.accent, fontSize: 12 }}>
                {[
                  selected.rating !== undefined
                    ? `★ ${selected.rating.toFixed(1)}`
                    : null,
                  selected.openNow !== undefined
                    ? selected.openNow
                      ? "Open now"
                      : "Closed now"
                    : null,
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </Text>
            )}
            <Button
              icon="navigate-outline"
              disabled={tripBusy}
              onPress={() => onSelect(selected)}
            >
              {tripState.trip
                ? "Route here instead"
                : selected.source === "mock"
                  ? "Preview demo pin"
                  : "Route here"}
            </Button>
            {tripState.trip && (
              <Button
                secondary
                icon="add-outline"
                disabled={!canAdd || tripBusy}
                onPress={() => {
                  if (canAdd) {
                    void addTripStop(selected);
                    onClose();
                  }
                }}
              >
                Add as stop
              </Button>
            )}
            <Button secondary onPress={() => setSelected(null)}>
              Back to results
            </Button>
          </Panel>
        ) : loading ? (
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
        ) : category && places.length ? (
          <PlaceList places={places} onSelect={setSelected} />
        ) : !category && suggestions.length ? (
          <SuggestionsList
            suggestions={suggestions}
            onSelect={(suggestion) => void chooseSuggestion(suggestion)}
            disabled={resolving}
          />
        ) : (
          <View style={{ paddingVertical: 35, gap: 10 }}>
            <Icon name="search-outline" size={30} color={colors.muted} />
            <Text
              style={{ color: colors.text, fontSize: 17, fontWeight: "600" }}
            >
              {!category && google && query.trim().length < 2
                ? "Where will the road take you?"
                : "No places found"}
            </Text>
            <Text style={{ color: colors.muted, fontSize: 13 }}>
              {!category
                ? google
                  ? "Type at least two characters. Try Boston, Starbucks, or an address."
                  : "Try coffee, food, gas, or parking."
                : "Try refreshing, or choose a different category."}
            </Text>
          </View>
        )}
      </ScrollView>
      {google && <GoogleAttribution places={selected ? [selected] : places} />}
    </BottomSheet>
  );
}
