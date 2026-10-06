import type { ActiveTrip, Coordinate } from "../types/domain";
import { projectOntoRoute } from "./geo";
export function tripProgress(
  trip: ActiveTrip | null,
  coordinate: Coordinate | null,
  fresh: boolean,
) {
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
}
