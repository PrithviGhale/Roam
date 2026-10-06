import { router } from "expo-router";
import { Text, View } from "react-native";
import { Page } from "../../components/Page";
import { Button, Eyebrow, Icon, IconButton, Panel } from "../../components/ui";
import { NavigationSummary } from "../../components/NavigationSummary";
import { GoogleAttribution } from "../../components/GoogleAttribution";
import { useTheme } from "../../themes/ThemeProvider";
import { useRoam } from "../../contexts/RoamProvider";

export default function TripsScreen() {
  const {
    theme: { colors },
  } = useTheme();
  const { tripState, removeTripStop, cancelTrip } = useRoam();
  const trip = tripState.trip;
  return (
    <Page
      title={trip ? "Your next chapter." : "Every road has a story."}
      subtitle={
        trip
          ? "Your destination, route, and stops. All in one place."
          : "Your journeys will live here. Let’s start with somewhere new."
      }
    >
      {trip ? (
        <>
          <NavigationSummary />
          <Button
            secondary
            icon="map-outline"
            onPress={() => router.navigate("/")}
          >
            View route on map
          </Button>
          <View style={{ gap: 12 }}>
            <Eyebrow>STOPS IN ORDER · {trip.stops.length} / 5</Eyebrow>
            {!trip.stops.length && (
              <Text
                style={{ color: colors.muted, fontSize: 13, lineHeight: 21 }}
              >
                Tap Food, Gas, Restroom, Coffee, or Parking on the map, then
                choose a place and add it as a stop.
              </Text>
            )}
            {trip.stops.map((stop, index) => (
              <Panel
                key={stop.id}
                style={{ flexDirection: "row", gap: 12, alignItems: "center" }}
              >
                <View
                  style={{
                    width: 32,
                    height: 32,
                    borderRadius: 16,
                    backgroundColor: colors.accentSoft,
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <Text style={{ color: colors.accent, fontWeight: "700" }}>
                    {index + 1}
                  </Text>
                </View>
                <View style={{ flex: 1, gap: 6 }}>
                  <Text
                    style={{
                      color: colors.text,
                      fontSize: 15,
                      fontWeight: "600",
                    }}
                  >
                    {stop.place.name}
                  </Text>
                  <Text style={{ color: colors.muted, fontSize: 11 }}>
                    {stop.place.address ?? stop.place.subtitle}
                  </Text>
                </View>
                <View
                  style={{ opacity: tripState.status === "loading" ? 0.4 : 1 }}
                >
                  <IconButton
                    icon="remove-circle-outline"
                    label={`Remove ${stop.place.name} from trip`}
                    onPress={() => {
                      if (tripState.status !== "loading")
                        void removeTripStop(stop.id);
                    }}
                  />
                </View>
              </Panel>
            ))}
            {trip.stops.length > 0 && (
              <GoogleAttribution
                places={trip.stops.map((stop) => stop.place)}
              />
            )}
          </View>
          <Button secondary icon="close-outline" onPress={cancelTrip}>
            {trip.startedAt ? "End Trip" : "Cancel Route"}
          </Button>
          <Text style={{ color: colors.muted, fontSize: 11, lineHeight: 18 }}>
            Stops are visited in the order added. Route recalculation uses your
            current GPS position. Remove a completed stop before refreshing to
            avoid routing back to it.
          </Text>
        </>
      ) : (
        <Panel style={{ alignItems: "center", paddingVertical: 35, gap: 19 }}>
          <View
            style={{
              width: 75,
              height: 75,
              borderRadius: 25,
              backgroundColor: colors.accentSoft,
              justifyContent: "center",
              alignItems: "center",
            }}
          >
            <Icon name="trail-sign-outline" size={32} color={colors.accent} />
          </View>
          <Text style={{ color: colors.text, fontSize: 20, fontWeight: "600" }}>
            A fresh start
          </Text>
          <Text
            style={{
              color: colors.muted,
              fontSize: 13,
              lineHeight: 21,
              textAlign: "center",
            }}
          >
            Choose a destination and plan your first route. Long-term trip
            history and saved places are coming in a future version.
          </Text>
          <Button icon="map-outline" onPress={() => router.navigate("/")}>
            Explore the map
          </Button>
        </Panel>
      )}
    </Page>
  );
}
