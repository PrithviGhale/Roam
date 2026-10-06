import { useMemo } from "react";
import { useRoam } from "../contexts/RoamProvider";
import { tripProgress } from "../utils/tripProgress";
export function useRouteProgress() {
  const {
    coordinate,
    fresh,
    tripState: { trip },
  } = useRoam();
  return useMemo(
    () => tripProgress(trip, coordinate, fresh),
    [trip, coordinate, fresh],
  );
}
