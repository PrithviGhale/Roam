import { useReducer, useState } from "react";
import {
  Platform,
  Pressable,
  ScrollView,
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
import { LocationNotice } from "../../components/LocationNotice";
import { PlacesSheet } from "../../components/PlacesSheet";
import { BottomSheet } from "../../components/BottomSheet";
import { RoamAssistant } from "../../components/RoamAssistant";
import { DriveBar } from "../../components/DriveBar";
import { RoamPulse, voiceLabels } from "../../components/RoamPulse";
import { IconButton } from "../../components/ui";
import { tripMode, phoneLayout, overlayReducer } from "../../design/layout";
import { radius, space, type } from "../../design/tokens";
import type { PlaceCategory, Place } from "../../types/domain";
export default function MapScreen() {
  const {
    theme: { colors },
  } = useTheme();
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const layout = phoneLayout(width, height);
  const roam = useRoam();
  const assistant = useAssistant();
  const driving = tripMode(roam.tripState) === "driving";
  const [recenter, setRecenter] = useState(0);
  const [bottomHeight, setBottomHeight] = useState(180);
  const [topHeight, setTopHeight] = useState(120);
  const [mapHeight, setMapHeight] = useState(height);
  const [overlay, dispatch] = useReducer(overlayReducer, { kind: "closed" });
  const openPlaces = (category: PlaceCategory | null) => {
    assistant.stopVoice();
    dispatch({ kind: "places", category });
  };
  const select = (place: Place) => {
    void roam.selectDestination(place);
    dispatch({ kind: "closed" });
  };
  return (
    <View
      onLayout={(event) => setMapHeight(event.nativeEvent.layout.height)}
      style={{ flex: 1, backgroundColor: colors.background }}
    >
      <MapCanvas
        coordinate={roam.coordinate}
        heading={roam.heading}
        destination={roam.destination}
        route={roam.tripState.trip?.route ?? null}
        stops={roam.tripState.trip?.stops ?? []}
        recommendation={
          overlay.kind === "assistant"
            ? assistant.messages.findLast((message) => message.places?.length)
                ?.places?.[0]
            : null
        }
        recenterToken={recenter}
        bottomInset={bottomHeight + space.xl}
        topInset={topHeight + space.md}
      />
      <View
        pointerEvents="box-none"
        onLayout={(event) => setTopHeight(event.nativeEvent.layout.height)}
        style={{
          position: "absolute",
          top: 0,
          left: insets.left,
          right: insets.right,
          paddingTop: insets.top + space.xs,
          gap: space.sm,
          paddingHorizontal: layout.gutter,
        }}
      >
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <Brand />
          <View
            style={{
              backgroundColor: colors.surface,
              paddingHorizontal: space.sm,
              paddingVertical: space.xs,
              borderRadius: radius.sm,
            }}
          >
            <Text
              style={{
                ...type.label,
                color: driving ? colors.accent : colors.muted,
              }}
            >
              {driving ? "DRIVE" : "PLAN"}
            </Text>
          </View>
        </View>
        {!driving && <SearchBar onPress={() => openPlaces(null)} />}
      </View>
      <ScrollView
        pointerEvents="box-none"
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ gap: space.sm }}
        onLayout={(event) => setBottomHeight(event.nativeEvent.layout.height)}
        style={{
          maxHeight: Math.max(120, mapHeight - topHeight - space.xl),
          position: "absolute",
          bottom: space.md,
          left: insets.left + layout.gutter,
          right: insets.right + layout.gutter,
        }}
      >
        <View
          pointerEvents="box-none"
          style={{
            flexDirection: "row",
            alignItems: "flex-end",
            justifyContent: "space-between",
          }}
        >
          {driving ? (
            <View
              accessible
              accessibilityLabel={
                roam.speedMph === null
                  ? "GPS speed unavailable"
                  : `GPS speed approximately ${Math.round(roam.speedMph)} miles per hour`
              }
              style={{
                backgroundColor: colors.surface,
                borderRadius: radius.md,
                padding: space.sm,
                minWidth: 72,
              }}
            >
              <Text style={{ ...type.metric, color: colors.text }}>
                {roam.speedMph === null ? "—" : Math.round(roam.speedMph)}
              </Text>
              <Text style={{ ...type.label, color: colors.muted }}>
                GPS MPH
              </Text>
            </View>
          ) : (
            <View />
          )}
          <IconButton
            icon="locate-outline"
            label="Recenter map on your location"
            onPress={() => {
              if (roam.status === "denied" || roam.status === "unavailable")
                roam.retry();
              setRecenter((value) => value + 1);
            }}
          />
        </View>
        {roam.tripState.trip ? (
          <DriveBar planning={!driving} />
        ) : Platform.OS !== "web" &&
          (roam.status !== "ready" || !roam.fresh) ? (
          <LocationNotice />
        ) : null}
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            backgroundColor: colors.surface,
            borderRadius: radius.lg,
            borderWidth: 1,
            borderColor: colors.border,
          }}
        >
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Open ROAM assistant, ${voiceLabels[assistant.voicePhase]}`}
            onPress={() => dispatch({ kind: "assistant" })}
            style={{
              flex: 1,
              minHeight: 60,
              flexDirection: "row",
              alignItems: "center",
              gap: space.sm,
              padding: space.sm,
            }}
          >
            <RoamPulse phase={assistant.voicePhase} size={36} />
            <View style={{ flex: 1 }}>
              <Text style={{ ...type.heading, color: colors.text }}>ROAM</Text>
              <Text
                accessibilityLiveRegion="polite"
                style={{ ...type.small, color: colors.muted }}
              >
                {assistant.voice.followUp
                  ? "Your answer · listening"
                  : (assistant.voiceNotice ??
                    voiceLabels[assistant.voicePhase])}
              </Text>
            </View>
          </Pressable>
          <IconButton
            style={{ marginRight: space.xs }}
            icon={
              assistant.state === "speaking" || assistant.state === "listening"
                ? "stop-outline"
                : "mic-outline"
            }
            label={
              assistant.state === "speaking" || assistant.state === "listening"
                ? "Stop voice conversation"
                : "Speak to ROAM"
            }
            active={assistant.state === "listening"}
            onPress={assistant.toggleVoice}
          />
        </View>
        {!driving && <QuickActions onSelect={openPlaces} />}
      </ScrollView>
      <PlacesSheet
        visible={overlay.kind === "places"}
        category={overlay.kind === "places" ? overlay.category : null}
        onClose={() => dispatch({ kind: "closed" })}
        onSelect={select}
      />
      <BottomSheet
        visible={overlay.kind === "assistant"}
        onClose={() => {
          assistant.stopVoice();
          dispatch({ kind: "closed" });
        }}
        title="ROAM"
        subtitle="A little help along the way."
        tall
      >
        <RoamAssistant onPlaces={openPlaces} />
      </BottomSheet>
    </View>
  );
}
