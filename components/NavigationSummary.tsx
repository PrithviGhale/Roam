import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  Text,
  View,
} from "react-native";
import { router } from "expo-router";
import { useRoam } from "../contexts/RoamProvider";
import { useTheme } from "../themes/ThemeProvider";
import { useRouteProgress } from "../hooks/useRouteProgress";
import { formatArrival, formatDistance, formatDuration } from "../utils/format";
import { Button, Eyebrow, IconButton, Panel } from "./ui";
import { SpeedDisplay } from "./SpeedDisplay";
import { GoogleAttribution } from "./GoogleAttribution";

export function NavigationSummary({ compact = false }: { compact?: boolean }) {
  const {
    theme: { colors },
  } = useTheme();
  const {
    tripState,
    speedMph,
    startTrip,
    cancelTrip,
    retryRoute,
    fresh,
    retry,
  } = useRoam();
  const progress = useRouteProgress();
  const trip = tripState.trip;
  if (!trip) return null;
  const busy = tripState.status === "loading";
  return (
    <Panel style={{ padding: compact ? 10 : 16, gap: compact ? 6 : 10 }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
        <View style={{ flex: 1, gap: 5 }}>
          <Eyebrow>
            {trip.destination.source === "mock"
              ? "DEMO DESTINATION PREVIEW"
              : trip.startedAt
                ? "TRIP IN PROGRESS"
                : "YOUR NEXT DESTINATION"}
          </Eyebrow>
          <Text
            numberOfLines={1}
            style={{ color: colors.text, fontSize: 17, fontWeight: "700" }}
          >
            {trip.destination.name}
          </Text>
        </View>
        <IconButton
          icon="close"
          label={trip.startedAt ? "End trip" : "Cancel route"}
          onPress={cancelTrip}
          style={{ width: 44, height: 44 }}
        />
      </View>
      {trip.destination.source === "verified" && (
        <GoogleAttribution
          compact
          places={[trip.destination, ...trip.stops.map((stop) => stop.place)]}
        />
      )}
      <ScrollView
        style={{ maxHeight: compact ? 100 : 200 }}
        contentContainerStyle={{ gap: 8 }}
      >
        {busy ? (
          <View
            style={{
              flexDirection: "row",
              gap: 10,
              alignItems: "center",
              paddingVertical: 10,
            }}
          >
            <ActivityIndicator color={colors.accent} />
            <Text style={{ color: colors.muted, fontSize: 13 }}>
              {trip.stops.length
                ? "Calculating route with stops…"
                : "Planning your driving route…"}
            </Text>
          </View>
        ) : tripState.error ? (
          <Text
            accessibilityLiveRegion="polite"
            style={{ color: colors.danger, fontSize: 12, lineHeight: 18 }}
          >
            {tripState.error}
          </Text>
        ) : progress ? (
          <>
            <View
              style={{ flexDirection: "row", gap: 16, alignItems: "center" }}
            >
              <SpeedDisplay
                speedMph={speedMph}
                small={compact || !trip.startedAt}
              />
              <View style={{ flex: 1, gap: 4 }}>
                <Text
                  style={{
                    color: colors.accent,
                    fontSize: compact ? 21 : 25,
                    fontWeight: "700",
                  }}
                >
                  {formatDuration(progress.durationSeconds)}
                </Text>
                <Text style={{ color: colors.muted, fontSize: 11 }}>
                  {formatDistance(progress.distanceMeters)} ·{" "}
                  {formatArrival(
                    progress.durationSeconds,
                    progress.estimated
                      ? Date.now()
                      : Date.parse(trip.route!.calculatedAt),
                  )}{" "}
                  arrival
                </Text>
              </View>
            </View>
            <Text style={{ color: colors.muted, fontSize: 10 }}>
              {progress.offRoute
                ? "You may be off route. Refresh for a new route."
                : progress.estimated
                  ? "Estimated remaining · GPS progress, no live traffic refresh"
                  : "Google driving estimate · No turn-by-turn guidance"}
            </Text>
          </>
        ) : (
          <Text style={{ color: colors.muted, fontSize: 11 }}>
            Sample pin only. Configure Google services to plan a real route.
          </Text>
        )}
        {!fresh && trip.destination.source === "verified" && (
          <Pressable
            accessibilityRole="button"
            onPress={retry}
            style={{ minHeight: 44, justifyContent: "center" }}
          >
            <Text style={{ color: colors.accent, fontSize: 12 }}>
              GPS unavailable · Retry location
            </Text>
          </Pressable>
        )}
      </ScrollView>
      {trip.destination.source === "verified" && (
        <View style={{ flexDirection: "row", gap: 8, alignItems: "center" }}>
          <View style={{ flex: 1 }}>
            {tripState.error ? (
              <Button
                secondary
                disabled={busy}
                onPress={() => void retryRoute()}
              >
                Retry route
              </Button>
            ) : (
              <Button
                icon={trip.startedAt ? "refresh-outline" : "navigate-outline"}
                disabled={busy || !progress}
                onPress={() => {
                  if (trip.startedAt) void retryRoute();
                  else startTrip();
                }}
              >
                {busy
                  ? "Calculating…"
                  : trip.startedAt
                    ? "Refresh route"
                    : "Start Trip"}
              </Button>
            )}
          </View>
          <IconButton
            icon="list-outline"
            label={`Trip details, ${trip.stops.length} stops`}
            onPress={() => router.navigate("/trips")}
          />
        </View>
      )}
    </Panel>
  );
}
