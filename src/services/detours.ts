import type {
  ActiveTrip,
  Coordinate,
  Place,
  RoutesService,
  RequestOptions,
  VerifiedDetour,
  RouteProvider,
} from "../types/domain";
import { distanceBetween, projectOntoRoute } from "../utils/geo";
import { LIMITS } from "../../shared/limits";
import { ServiceError } from "./errors";
export function freshDetour(place: Place, now = Date.now()) {
  const value = place.verifiedDetour;
  const age = value ? now - Date.parse(value.calculatedAt) : Infinity;
  return age >= 0 && age < LIMITS.DETOUR_CACHE_MS ? value : undefined;
}

// Insert before the next stop ahead of this candidate, retaining the user's order.
export function detourInsertionIndex(trip: ActiveTrip, place: Place): number {
  const geometry = trip.route?.geometry ?? [];
  const target = projectOntoRoute(place.coordinate, geometry);
  if (!target) return trip.stops.length;
  const next = trip.stops.findIndex((stop) => {
    const position = projectOntoRoute(stop.place.coordinate, geometry);
    return (
      !stop.visited &&
      position &&
      position.progressMeters > target.progressMeters
    );
  });
  return next < 0 ? trip.stops.length : next;
}
export function compareRoutes(
  baseline: {
    durationSeconds: number;
    distanceMeters: number;
    provider?: RouteProvider;
  },
  candidate: {
    durationSeconds: number;
    distanceMeters: number;
    provider?: RouteProvider;
  },
  insertionIndex: number,
  now: number,
): VerifiedDetour {
  const provider = baseline.provider ?? "google";
  if (provider !== (candidate.provider ?? "google"))
    throw new ServiceError(
      "invalid-data",
      "Routes from different providers cannot be compared.",
    );
  return {
    // Signed deltas: a different route can legitimately be quicker/shorter.
    durationSeconds: candidate.durationSeconds - baseline.durationSeconds,
    distanceMeters: candidate.distanceMeters - baseline.distanceMeters,
    baselineDurationSeconds: baseline.durationSeconds,
    baselineDistanceMeters: baseline.distanceMeters,
    candidateDurationSeconds: candidate.durationSeconds,
    candidateDistanceMeters: candidate.distanceMeters,
    calculatedAt: new Date(now).toISOString(),
    insertionIndex,
    source:
      provider === "mapbox"
        ? "mapbox-routes-comparison"
        : "google-routes-comparison",
    provider,
  };
}
export class DetourService {
  // Session-only bounded cache; no GPS history or persistent location storage.
  private cache = new Map<
    string,
    { origin: Coordinate; expires: number; value: VerifiedDetour }
  >();
  constructor(
    private routes: RoutesService,
    private now = Date.now,
    private finalists = LIMITS.MAX_VERIFIED_DETOUR_CANDIDATES,
  ) {}
  async verify(
    places: Place[],
    trip: ActiveTrip,
    origin: Coordinate,
    options?: RequestOptions,
  ): Promise<Place[]> {
    if (!trip.route || trip.stops.length >= LIMITS.MAX_STOPS)
      return places.map(({ verifiedDetour: _old, ...place }) => place);
    const now = this.now();
    for (const [key, value] of this.cache)
      if (value.expires <= now) this.cache.delete(key);
    const keyFor = (place: Place) =>
      JSON.stringify([
        trip.route!.id,
        trip.route!.calculatedAt,
        trip.destination.id,
        trip.stops.map((s) => [s.id, Boolean(s.visited)]),
        place.id,
      ]);
    const selected = places
      .filter(
        (p) =>
          p.source === "verified" &&
          p.id !== trip.destination.id &&
          !trip.stops.some((s) => s.id === p.id),
      )
      .slice(
        0,
        Math.min(LIMITS.MAX_VERIFIED_DETOUR_CANDIDATES, this.finalists),
      );
    const verified = new Map<string, VerifiedDetour>();
    const missing: Place[] = [];
    for (const place of selected) {
      const entry = this.cache.get(keyFor(place));
      if (
        entry &&
        distanceBetween(origin, entry.origin) <=
          LIMITS.DETOUR_CACHE_MOVEMENT_METERS
      )
        verified.set(place.id, entry.value);
      else missing.push(place);
    }
    if (missing.length) {
      // Fresh origin + identical remaining plan for every comparison, NOT the old original trip duration.
      let baseline;
      try {
        baseline = await this.routes.getRoute(
          origin,
          trip.destination,
          trip.stops.filter((s) => !s.visited),
          options,
        );
      } catch (error) {
        if (options?.signal?.aborted) throw error;
        return places.map(({ verifiedDetour: _old, ...place }) => place);
      }
      for (const place of missing) {
        if (options?.signal?.aborted)
          throw new ServiceError("cancelled", "Request cancelled.");
        const index = detourInsertionIndex(trip, place);
        const stops = [...trip.stops];
        stops.splice(index, 0, { id: place.id, place });
        try {
          const candidate = await this.routes.getRoute(
            origin,
            trip.destination,
            stops.filter((s) => !s.visited),
            { ...options, requiredProvider: baseline.provider ?? "google" },
          );
          if (options?.signal?.aborted)
            throw new ServiceError("cancelled", "Request cancelled.");
          const value = compareRoutes(baseline, candidate, index, this.now());
          verified.set(place.id, value);
          if (this.cache.size >= 30)
            this.cache.delete(this.cache.keys().next().value!);
          this.cache.set(keyFor(place), {
            origin,
            expires: this.now() + LIMITS.DETOUR_CACHE_MS,
            value,
          });
        } catch (error) {
          if (options?.signal?.aborted) throw error;
          // Failed candidate remains unverified. Never synthesize a zero detour.
        }
      }
    }
    return places.map(({ verifiedDetour: _old, ...place }) => ({
      ...place,
      ...(verified.has(place.id)
        ? { verifiedDetour: verified.get(place.id)! }
        : {}),
    }));
  }
}
