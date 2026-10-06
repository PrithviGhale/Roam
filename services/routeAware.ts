import type { Coordinate, Place, Route } from "../types/domain";
import {
  distanceBetween,
  pointAlongRoute,
  projectOntoRoute,
} from "../utils/geo";

export function sampleAhead(route: Route, origin: Coordinate): Coordinate[] {
  const projection = projectOntoRoute(origin, route.geometry);
  if (!projection || projection.offsetMeters > 3000) return [origin];
  const samples = [2000, 8000]
    .map((ahead) =>
      pointAlongRoute(
        route.geometry,
        Math.min(projection.totalMeters, projection.progressMeters + ahead),
      ),
    )
    .filter((point): point is Coordinate => point !== null);
  return samples.filter(
    (point, index) =>
      samples.findIndex((other) => distanceBetween(point, other) < 500) ===
      index,
  );
}
// Geometric ranking, not driving-detour estimates: favor points ahead, close to the
// corridor, then nearer stops and known ratings. No Routes call per result.
export function rankRoutePlaces(
  places: Place[],
  route: Route,
  origin: Coordinate,
): Place[] {
  const driver = projectOntoRoute(origin, route.geometry);
  if (!driver || driver.offsetMeters > 3000)
    return places
      .map((place) => ({
        ...place,
        distanceMeters: distanceBetween(origin, place.coordinate),
      }))
      .sort((a, b) => a.distanceMeters - b.distanceMeters);
  const ranked = places.flatMap((place) => {
    const candidate = projectOntoRoute(place.coordinate, route.geometry);
    if (
      !candidate ||
      candidate.progressMeters < driver.progressMeters - 100 ||
      candidate.offsetMeters > 2000
    )
      return [];
    const aheadMeters = Math.max(
      0,
      candidate.progressMeters - driver.progressMeters,
    );
    const score =
      candidate.offsetMeters * 4 +
      aheadMeters * 0.15 -
      (place.rating ?? 0) * 80 +
      (place.openNow === false ? 2000 : 0);
    return [
      {
        place: {
          ...place,
          distanceMeters: distanceBetween(origin, place.coordinate),
          routeOffsetMeters: candidate.offsetMeters,
          aheadMeters,
        },
        score,
      },
    ];
  });
  return ranked.sort((a, b) => a.score - b.score).map((item) => item.place);
}
