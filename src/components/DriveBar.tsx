import { useEffect, useRef } from "react";
import { Animated, Pressable, Text, View } from "react-native";
import { router } from "expo-router";
import { useRoam } from "../contexts/RoamProvider";
import { useTheme } from "../themes/ThemeProvider";
import { useRouteProgress } from "../hooks/useRouteProgress";
import {
  formatArrivalTime,
  formatDistance,
  formatDuration,
} from "../utils/format";
import { motion, radius, space, type } from "../design/tokens";
import { useReducedMotion } from "../hooks/useReducedMotion";
import { Button, Icon } from "./ui";
import { GoogleAttribution } from "./GoogleAttribution";
import { RoamPulse } from "./RoamPulse";
import { acknowledge } from "../services/haptics";
export function DriveBar({ planning = false }: { planning?: boolean }) {
  const { tripState, startTrip, retryRoute, fresh, navigation } = useRoam();
  const {
    theme: { colors },
  } = useTheme();
  const progress = useRouteProgress();
  const trip = tripState.trip;
  const reduced = useReducedMotion();
  const fade = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    fade.stopAnimation();
    if (reduced) {
      fade.setValue(1);
      return;
    }
    fade.setValue(0.75);
    const animation = Animated.timing(fade, {
      toValue: 1,
      duration: motion.quick,
      useNativeDriver: true,
    });
    animation.start();
    return () => animation.stop();
  }, [trip?.route?.id, planning, fade, reduced]);
  if (!trip) return null;
  const loading =
    tripState.status === "loading" ||
    tripState.tracking?.state === "rerouting" ||
    navigation.rerouting ||
    navigation.mode === "starting";
  const error = tripState.status === "error" || !!tripState.tracking?.error;
  const next = trip.stops.find((stop) => !stop.visited);
  return (
    <Animated.View
      style={{
        opacity: fade,
        backgroundColor: colors.surface,
        borderWidth: 1,
        borderColor: colors.border,
        borderRadius: radius.lg,
        padding: space.md,
        gap: space.sm,
      }}
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`View trip to ${trip.destination.name}`}
        onPress={() => router.navigate("/trips")}
        style={{
          minHeight: 44,
          flexDirection: "row",
          alignItems: "center",
          gap: space.sm,
        }}
      >
        <View
          style={{
            width: 3,
            height: 32,
            borderRadius: radius.sm,
            backgroundColor: colors.route,
          }}
        />
        <View style={{ flex: 1, gap: space.xxs }}>
          <Text
            numberOfLines={1}
            style={{ ...type.heading, color: colors.text }}
          >
            {trip.destination.name}
          </Text>
          <Text
            numberOfLines={1}
            style={{ ...type.small, color: colors.muted }}
          >
            {next
              ? `Next · ${next.place.name}`
              : planning
                ? "Your destination"
                : "Destination ahead"}
          </Text>
        </View>
        <Icon name="chevron-forward" color={colors.muted} size={18} />
      </Pressable>
      {loading ? (
        <RoamPulse phase="usingTool" label />
      ) : error ? (
        <Text style={{ ...type.small, color: colors.text }}>
          Route update unavailable. Your trip is kept.
        </Text>
      ) : progress && trip.route?.source === "verified" ? (
        <>
          <View
            style={{
              flexDirection: "row",
              flexWrap: "wrap",
              columnGap: space.xl,
              rowGap: space.xs,
            }}
          >
            <Text style={{ ...type.heading, color: colors.text }}>
              {formatDuration(progress.durationSeconds)}
            </Text>
            <Text style={{ ...type.heading, color: colors.text }}>
              {formatDistance(progress.distanceMeters)}
            </Text>
            <Text
              style={{
                ...type.small,
                color: colors.muted,
                alignSelf: "center",
              }}
            >
              Arrival {formatArrivalTime(progress.arrivalTime)}
            </Text>
          </View>
          {!planning && progress.progressAvailable && (
            <View
              accessible
              accessibilityLabel={`${Math.round(progress.percentageCompleted)} percent complete, estimated from GPS`}
              style={{
                backgroundColor: colors.elevated,
                height: 3,
                borderRadius: radius.sm,
              }}
            >
              <View
                style={{
                  backgroundColor: colors.route,
                  height: 3,
                  borderRadius: radius.sm,
                  width: `${Math.min(100, Math.max(0, progress.percentageCompleted))}%`,
                }}
              />
            </View>
          )}
          {!planning && (
            <Text style={{ ...type.small, color: colors.muted }}>
              {progress.offRoute
                ? "Checking your position against the route"
                : progress.estimated
                  ? "Remaining journey · GPS estimate"
                  : "Last route estimate · waiting for accurate GPS"}
            </Text>
          )}
        </>
      ) : (
        <Text style={{ ...type.small, color: colors.muted }}>
          A verified route is needed to start driving.
        </Text>
      )}
      {planning && (
        <Button
          disabled={
            loading || !fresh || trip.route?.source !== "verified" || error
          }
          onPress={() => {
            startTrip();
            acknowledge();
          }}
          icon="navigate-outline"
        >
          Start trip
        </Button>
      )}
      {error && (
        <Button secondary onPress={() => retryRoute()}>
          Try route again
        </Button>
      )}
      {trip.route && <GoogleAttribution compact places={[trip.destination]} />}
    </Animated.View>
  );
}
