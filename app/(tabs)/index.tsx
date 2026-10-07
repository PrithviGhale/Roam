import { useState } from "react";
import {
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTheme } from "../../themes/ThemeProvider";
import { useRoam } from "../../contexts/RoamProvider";
import { useAssistant } from "../../contexts/AssistantProvider";
import { MapCanvas } from "../../components/MapCanvas";
import { Brand } from "../../components/Brand";
import { SearchBar } from "../../components/SearchBar";
import { QuickActions } from "../../components/QuickActions";
import { DrivingHUD } from "../../components/DrivingHUD";
import { LocationNotice } from "../../components/LocationNotice";
import { PlacesSheet } from "../../components/PlacesSheet";
import { BottomSheet } from "../../components/BottomSheet";
import { RoamAssistant } from "../../components/RoamAssistant";
import { NavigationSummary } from "../../components/NavigationSummary";
import { Icon, IconButton, Panel } from "../../components/ui";
import { hasGoogleServices } from "../../services/config";
import { supportsGoogleMap } from "../../services/mapCapability";
import type { PlaceCategory, Place } from "../../types/domain";

export default function MapScreen() {
  const { theme, setTheme } = useTheme();
  const { colors } = theme;
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();
  const compact = height < 740;
  const {
    coordinate,
    heading,
    destination,
    selectDestination,
    tripState,
    fresh,
    status,
    retry,
  } = useRoam();
  const driving = Boolean(tripState.trip?.startedAt);
  const { stopVoice } = useAssistant();
  const [googleSupported] = useState(supportsGoogleMap);
  const [recenter, setRecenter] = useState(0);
  const [bottomHeight, setBottomHeight] = useState(240);
  const [placesOpen, setPlacesOpen] = useState(false);
  const [category, setCategory] = useState<PlaceCategory | null>(null);
  const [assistantOpen, setAssistantOpen] = useState(false);
  const openPlaces = (next: PlaceCategory | null) => {
    stopVoice();
    setAssistantOpen(false);
    setCategory(next);
    setPlacesOpen(true);
  };
  const select = (place: Place) => {
    void selectDestination(place);
    setPlacesOpen(false);
  };
  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <MapCanvas
        coordinate={coordinate}
        heading={heading}
        destination={destination}
        route={tripState.trip?.route ?? null}
        stops={tripState.trip?.stops ?? []}
        recenterToken={recenter}
        bottomInset={bottomHeight + 16}
      />
      <View
        pointerEvents="box-none"
        style={[styles.top, { paddingTop: insets.top + 10 }]}
      >
        <View style={styles.header}>
          <Brand />
          <View
            style={[
              styles.badge,
              { backgroundColor: colors.surface, borderColor: colors.border },
            ]}
          >
            <View
              style={{
                width: 5,
                height: 5,
                borderRadius: 3,
                backgroundColor: colors.accent,
              }}
            />
            <Text
              style={{ color: colors.muted, fontSize: 9, letterSpacing: 1 }}
            >
              V0.4
            </Text>
          </View>
          <View style={{ flex: 1 }} />
          <IconButton
            icon={theme.id === "dark" ? "sunny-outline" : "moon-outline"}
            label="Switch map theme"
            onPress={() => setTheme(theme.id === "dark" ? "light" : "dark")}
          />
        </View>
        {!driving && (
          <View style={{ paddingHorizontal: 20, paddingBottom: 12 }}>
            <SearchBar onPress={() => openPlaces(null)} />
          </View>
        )}
        <QuickActions onSelect={openPlaces} />
        {!compact && !driving && (
          <View style={{ paddingHorizontal: 20, paddingTop: 10 }}>
            <Panel style={{ padding: 10 }}>
              <Text style={{ color: colors.muted, fontSize: 10 }}>
                {Platform.OS === "web"
                  ? "Browser UI preview · Native Google map runs on your phone."
                  : !hasGoogleServices
                    ? "Demo mode · Configure Google for real places and routes."
                    : !googleSupported
                      ? "Google map support is missing. Use a Google-enabled iOS development build to display routes."
                      : "Google Places + Routes · Ready for your next destination."}
              </Text>
            </Panel>
          </View>
        )}
      </View>
      <View
        pointerEvents="box-none"
        style={styles.bottom}
        onLayout={(event) => setBottomHeight(event.nativeEvent.layout.height)}
      >
        <View
          style={{ alignItems: "flex-end", marginBottom: compact ? 8 : 14 }}
        >
          <IconButton
            icon="locate-outline"
            label="Recenter map on your location"
            onPress={() => {
              if (status === "denied" || status === "unavailable") retry();
              setRecenter((value) => value + 1);
            }}
          />
        </View>
        {tripState.trip ? (
          <NavigationSummary compact={compact} />
        ) : Platform.OS !== "web" && (status !== "ready" || !fresh) ? (
          <LocationNotice />
        ) : (
          <DrivingHUD />
        )}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Ask ROAM assistant"
          onPress={() => setAssistantOpen(true)}
          style={({ pressed }) => [
            styles.ask,
            { backgroundColor: colors.accent, opacity: pressed ? 0.8 : 1 },
            compact && { minHeight: 54 },
          ]}
        >
          <View style={[styles.mic, { borderColor: colors.onAccent + "30" }]}>
            <Icon name="mic-outline" color={colors.onAccent} size={22} />
          </View>
          <View style={{ flex: 1, gap: 3 }}>
            <Text
              style={{
                color: colors.onAccent,
                fontSize: 17,
                fontWeight: "700",
              }}
            >
              Ask ROAM
            </Text>
            {!compact && (
              <Text
                style={{ color: colors.onAccent, fontSize: 10, opacity: 0.75 }}
              >
                A little help. A better journey.
              </Text>
            )}
          </View>
          <Icon name="sparkles-outline" color={colors.onAccent} size={22} />
        </Pressable>
      </View>
      <PlacesSheet
        visible={placesOpen}
        category={category}
        onClose={() => setPlacesOpen(false)}
        onSelect={select}
      />
      <BottomSheet
        visible={assistantOpen}
        onClose={() => {
          stopVoice();
          setAssistantOpen(false);
        }}
        title="Ask ROAM"
        subtitle="Your co-pilot. Wherever the road goes."
        tall
      >
        <RoamAssistant onPlaces={openPlaces} />
      </BottomSheet>
    </View>
  );
}
const styles = StyleSheet.create({
  root: { flex: 1 },
  top: { position: "absolute", left: 0, right: 0, top: 0 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 20,
    gap: 10,
    paddingBottom: 16,
  },
  badge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 7,
    paddingVertical: 5,
  },
  bottom: { position: "absolute", left: 20, right: 20, bottom: 16 },
  ask: {
    minHeight: 68,
    borderRadius: 23,
    paddingHorizontal: 17,
    flexDirection: "row",
    alignItems: "center",
    gap: 13,
    marginTop: 12,
  },
  mic: {
    width: 38,
    height: 38,
    borderRadius: 13,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
});
