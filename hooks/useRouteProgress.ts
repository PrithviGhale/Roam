import { useEffect, useState } from "react";
import { AppState } from "react-native";
import { useRoam } from "../contexts/RoamProvider";
import { tripProgress } from "../utils/tripProgress";
export function useRouteProgress() {
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
  return tripProgress(
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
}
