import type { ActiveTrip, Coordinate } from "../types/domain";
import { projectOntoRoute } from "./geo";
import { arrivalTimestamp, durationAtFraction } from "./routeTiming";
import { validCoordinate } from "./location";
export function tripProgress(
  trip: ActiveTrip | null,
  coordinate: Coordinate | null,
  fresh: boolean,
  now = Date.now(),
  accuracy?: number | null,
) {
  const route = trip?.route;
  if (!route) return null;
  const projection =
    trip.startedAt &&
    fresh &&
    coordinate &&
    validCoordinate(coordinate) &&
    (accuracy === undefined ||
      (accuracy !== null && accuracy >= 0 && accuracy <= 50))
      ? projectOntoRoute(coordinate, route.geometry)
      : null;
  const offRoute = Boolean(
    projection && projection.offsetMeters > Math.max(70, (accuracy ?? 25) * 3),
  );
  const estimated = Boolean(
    projection && !offRoute && projection.totalMeters > 0,
  );
  const fraction = estimated
    ? Math.max(
        0,
        Math.min(1, projection!.progressMeters / projection!.totalMeters),
      )
    : 0;
  const durationSeconds =
    route.durationSeconds - durationAtFraction(route, fraction);
  const previous = trip.completedBeforeRouteMeters ?? 0;
  const completed = previous + route.distanceMeters * fraction;
  return {
    distanceMeters: route.distanceMeters * (1 - fraction),
    completedMeters: completed,
    percentageCompleted:
      previous + route.distanceMeters > 0
        ? (completed / (previous + route.distanceMeters)) * 100
        : 0,
    durationSeconds,
    arrivalTime:
      trip.startedAt && !estimated
        ? null
        : arrivalTimestamp(durationSeconds, now),
    estimated,
    offRoute,
    progressAvailable: Boolean(!trip.startedAt || estimated),
  };
}
