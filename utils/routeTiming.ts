import type { Coordinate, Route } from "../types/domain";
import { pointAlongRoute, projectOntoRoute } from "./geo";
// Use verified leg durations where available; otherwise distribute route duration by geometry.
export function durationAtFraction(route: Route, fraction: number): number {
  const distance = route.legs.reduce((sum, leg) => sum + leg.distanceMeters, 0);
  const duration = route.legs.reduce(
    (sum, leg) => sum + leg.durationSeconds,
    0,
  );
  if (!distance || !duration) return route.durationSeconds * fraction;
  let target = distance * fraction,
    seconds = 0;
  for (const leg of route.legs) {
    const used = Math.min(leg.distanceMeters, Math.max(0, target));
    seconds += leg.distanceMeters
      ? (leg.durationSeconds * used) / leg.distanceMeters
      : 0;
    target -= used;
  }
  return (seconds * route.durationSeconds) / duration;
}
export function timeAheadPoint(
  route: Route,
  origin: Coordinate,
  minutes: number,
): Coordinate | null {
  const driver = projectOntoRoute(origin, route.geometry);
  if (!driver || driver.offsetMeters > 150 || route.durationSeconds <= 0)
    return null;
  const elapsed = durationAtFraction(
    route,
    driver.progressMeters / Math.max(1, driver.totalMeters),
  );
  const target = Math.min(route.durationSeconds, elapsed + minutes * 60);
  let low = driver.progressMeters / Math.max(1, driver.totalMeters),
    high = 1;
  for (let i = 0; i < 24; i++) {
    const middle = (low + high) / 2;
    if (durationAtFraction(route, middle) < target) low = middle;
    else high = middle;
  }
  return pointAlongRoute(
    route.geometry,
    ((low + high) / 2) * driver.totalMeters,
  );
}
export function arrivalTimestamp(
  seconds: number,
  now = Date.now(),
): string | null {
  return Number.isFinite(seconds) && seconds >= 0 && Number.isFinite(now)
    ? new Date(now + seconds * 1000).toISOString()
    : null;
}
