import { useEffect, useState } from "react";
import { AppState } from "react-native";
import { useRoam } from "../contexts/RoamProvider";
import { tripProgress } from "../utils/tripProgress";
export function useRouteProgress() {
  const { navigation } = useRoam();
  const {
    coordinate,
    fresh,
    accuracy,
    tripState: { trip, progress },
  } = useRoam();
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const timer = setInterval(() => {
      if (AppState.currentState === "active") setNow(Date.now());
    }, 15_000);
    return () => clearInterval(timer);
  }, []);
  const fallback = tripProgress(
    trip,
    coordinate,
    fresh,
    Math.max(now, Date.now()),
    accuracy,
    trip?.startedAt
      ? progress?.route === trip.route &&
        Date.now() - progress.timestamp <= 15000
        ? progress.projection
        : null
      : undefined,
  );
  const g =
    navigation.mode === "native" &&
    navigation.updatedAt !== null &&
    Date.now() - navigation.updatedAt <= 15000
      ? navigation.guidance
      : null;
  if (navigation.mode === "native")
    return g
      ? {
          distanceMeters: g.remainingDistanceMeters,
          durationSeconds: g.remainingDurationSeconds,
          arrivalTime: new Date(
            Date.now() + g.remainingDurationSeconds * 1000,
          ).toISOString(),
          completedMeters: 0,
          percentageCompleted: 0,
          progressAvailable: false,
          estimated: false,
          offRoute: false,
        }
      : null;
  return fallback;
}
