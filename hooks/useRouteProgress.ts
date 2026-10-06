import { useMemo } from "react";
import { useRoam } from "../contexts/RoamProvider";
import { projectOntoRoute } from "../utils/geo";

export function useRouteProgress() {
  const {
    coordinate,
    fresh,
    tripState: { trip },
  } = useRoam();
  return useMemo(() => {
    const route = trip?.route;
    if (!route) return null;
    if (!trip.startedAt || !fresh || !coordinate)
      return {
        distanceMeters: route.distanceMeters,
        durationSeconds: route.durationSeconds,
        estimated: false,
        offRoute: false,
      };
    const projection = projectOntoRoute(coordinate, route.geometry);
    if (!projection || projection.offsetMeters > 1000)
      return {
        distanceMeters: route.distanceMeters,
        durationSeconds: route.durationSeconds,
        estimated: false,
        offRoute: true,
      };
    // Local progress estimate; traffic/ETA is only refreshed on an explicit Routes request.
    const remaining =
      projection.totalMeters > 0
        ? Math.max(0, 1 - projection.progressMeters / projection.totalMeters)
        : 0;
    return {
      distanceMeters: route.distanceMeters * remaining,
      durationSeconds: route.durationSeconds * remaining,
      estimated: true,
      offRoute: false,
    };
  }, [trip, coordinate, fresh]);
}
