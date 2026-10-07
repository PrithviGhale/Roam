import { useState } from "react";
import { router } from "expo-router";
import { Text, View } from "react-native";
import { Page } from "../../components/Page";
import { DriveBar } from "../../components/DriveBar";
import { Button, Eyebrow, IconButton } from "../../components/ui";
import { GoogleAttribution } from "../../components/GoogleAttribution";
import { StatusCard } from "../../components/StatusCard";
import { useTheme } from "../../themes/ThemeProvider";
import { useRoam } from "../../contexts/RoamProvider";
import { space, radius, type } from "../../design/tokens";
export default function TripsScreen() {
  const {
    theme: { colors },
  } = useTheme();
  const { tripState, removeTripStop, cancelTrip, markStopVisited, retryRoute } =
    useRoam();
  const trip = tripState.trip;
  const [busy, setBusy] = useState(false);
  const blocked = busy || tripState.status === "loading";
  const perform = async (action: () => void | Promise<unknown>) => {
    if (blocked) return;
    setBusy(true);
    try {
      await action();
    } finally {
      setBusy(false);
    }
  };
  return (
    <Page
      title="Your journey"
      subtitle={
        trip
          ? "One route. Room for a few good stops."
          : "Choose somewhere worth going."
      }
    >
      {trip ? (
        <>
          <Eyebrow>{trip.startedAt ? "CURRENT TRIP" : "PLANNED ROUTE"}</Eyebrow>
          <DriveBar planning={!trip.startedAt} />
          <Button
            secondary
            icon="map-outline"
            onPress={() => router.navigate("/")}
          >
            View route
          </Button>
          <View style={{ gap: space.md }}>
            <Eyebrow>STOPS · {trip.stops.length} / 5</Eyebrow>
            {!trip.stops.length && (
              <Text style={{ ...type.body, color: colors.muted }}>
                Ask ROAM for a stop, or explore the categories on the map.
              </Text>
            )}
            {trip.stops.map((stop, index) => (
              <View
                key={stop.id}
                style={{ flexDirection: "row", gap: space.sm }}
              >
                <View style={{ alignItems: "center" }}>
                  <View
                    style={{
                      width: 32,
                      height: 32,
                      borderRadius: radius.sm,
                      backgroundColor: colors.accentSoft,
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    <Text style={{ ...type.small, color: colors.accent }}>
                      {stop.visited ? "✓" : index + 1}
                    </Text>
                  </View>
                  <View
                    style={{
                      width: 1,
                      flex: 1,
                      minHeight: space.xl,
                      backgroundColor: colors.border,
                    }}
                  />
                </View>
                <View
                  style={{
                    flex: 1,
                    gap: space.xs,
                    paddingBottom: space.md,
                    borderBottomWidth: 1,
                    borderBottomColor: colors.border,
                  }}
                >
                  <Text style={{ ...type.heading, color: colors.text }}>
                    {stop.place.name}
                  </Text>
                  <Text style={{ ...type.small, color: colors.muted }}>
                    {stop.place.address ?? stop.place.subtitle}
                  </Text>
                  {stop.visited ? (
                    <Text style={{ ...type.small, color: colors.success }}>
                      Visited
                    </Text>
                  ) : (
                    trip.startedAt && (
                      <Button
                        secondary
                        disabled={blocked}
                        onPress={() =>
                          void perform(() => markStopVisited(stop.id))
                        }
                      >
                        Mark visited
                      </Button>
                    )
                  )}
                </View>
                <IconButton
                  disabled={blocked}
                  icon="remove-outline"
                  label={`Remove ${stop.place.name} from trip`}
                  onPress={() => void perform(() => removeTripStop(stop.id))}
                />
              </View>
            ))}
          </View>
          <View style={{ gap: space.xs }}>
            <Eyebrow>DESTINATION</Eyebrow>
            <Text style={{ ...type.heading, color: colors.text }}>
              {trip.destination.name}
            </Text>
            <Text style={{ ...type.body, color: colors.muted }}>
              {trip.destination.address ?? trip.destination.subtitle}
            </Text>
          </View>
          <GoogleAttribution
            compact
            places={[trip.destination, ...trip.stops.map((stop) => stop.place)]}
          />
          <Button
            secondary
            disabled={blocked}
            icon="refresh-outline"
            onPress={retryRoute}
          >
            Refresh route
          </Button>
          <Button
            secondary
            disabled={blocked}
            icon="close-outline"
            onPress={cancelTrip}
          >
            {trip.startedAt ? "End trip" : "Cancel route"}
          </Button>
          <Text style={{ ...type.small, color: colors.muted }}>
            Visited stops are skipped on the next route update. Your journey
            stays on this device for this session.
          </Text>
        </>
      ) : (
        <StatusCard
          title="Your next journey starts here"
          detail="Choose a destination on the map. Add stops as you go."
          action="Open map"
          onPress={() => router.navigate("/")}
        />
      )}
    </Page>
  );
}
