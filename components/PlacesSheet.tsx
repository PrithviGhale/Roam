import {
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
import { isCancelled } from "../services/errors";
import type { Place, PlaceCategory, PlaceSuggestion } from "../types/domain";
import { BottomSheet } from "./BottomSheet";
import { PlaceList, SuggestionsList } from "./PlaceList";
import { GoogleAttribution } from "./GoogleAttribution";
import { Button, Icon } from "./ui";
import { StatusCard } from "./StatusCard";
import { acknowledge } from "../services/haptics";

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
        setSelectionError("ROAM couldn’t load that place. Try again.");
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
            : "Choose where you’re heading"
          : "Preview · Fictional places"
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
        style={{ flex: 1, minHeight: 0 }}
        keyboardDismissMode="interactive"
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ paddingBottom: 20, gap: 15 }}
      >
        {!category && !query && tripState.trip && (
          <View style={{ gap: 8 }}>
            <Text style={{ color: colors.muted, fontSize: 13 }}>
              CURRENT DESTINATION
            </Text>
            <Text
              style={{ color: colors.text, fontSize: 17, fontWeight: "600" }}
            >
              {tripState.trip.destination.name}
            </Text>
            <Text style={{ color: colors.muted, fontSize: 13 }}>
              Searching for a new destination will replace this route.
            </Text>
          </View>
        )}
        {!google && (
          <Text style={{ color: colors.muted, fontSize: 12, lineHeight: 19 }}>
            These demo places are fictional and cannot be used for driving
            routes.
          </Text>
        )}
        {google && category && (
          <Text style={{ color: colors.muted, fontSize: 11, lineHeight: 18 }}>
            {alongRoute
              ? "Verified detours compare driving routes. Other distances are approximate."
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
          <StatusCard loading title="Finding your destination" />
        ) : selected ? (
          <View style={{ gap: 12 }}>
            <PlaceList places={[selected]} displayOnly onSelect={() => {}} />
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
                    void addTripStop(selected).then(() => acknowledge());
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
          </View>
        ) : loading ? (
          <StatusCard
            loading
            title={
              alongRoute
                ? "Finding stops and checking detours"
                : "Looking for places"
            }
          />
        ) : error ? (
          <View style={{ gap: 15 }}>
            <Text style={{ color: colors.text }}>
              ROAM couldn’t load places. Try again.
            </Text>
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
                ? "Where are you heading?"
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
