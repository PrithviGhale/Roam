import type {
  ActiveTrip,
  Coordinate,
  Place,
  PlaceCategory,
  PlacesService,
  RequestOptions,
  TripState,
} from "../types/domain";
import { ServiceError } from "./errors";
import { sampleAhead, rankRoutePlaces } from "./routeAware";
import { distanceBetween } from "../utils/geo";
import { rankRecommendations } from "./routeAware";
import type { DetourService } from "./detours";
import { timeAheadPoint } from "../utils/routeTiming";
import { LIMITS } from "../../shared/limits";
export interface TripPort {
  getSnapshot(): TripState;
  applyStopsAtomic(
    expected: ActiveTrip,
    stops: ActiveTrip["stops"],
    signal?: AbortSignal,
  ): Promise<boolean>;
  cancel(): void;
  refreshAtomic?(expected: ActiveTrip, signal?: AbortSignal): Promise<boolean>;
}
export interface SearchArguments {
  query?: string;
  maxResults?: number;
  minRating?: number;
  nearDestination?: boolean;
  timeAheadMinutes?: number;
  maxDetourMinutes?: number;
}
// AI and UI share V0.2 providers. Qualified queries reuse Text Search, not a second adapter.
export function createTripTools(
  places: PlacesService,
  trip: TripPort,
  getLocation: () => Coordinate | null,
  detours?: DetourService,
) {
  const search = async (
    category: PlaceCategory | null,
    args: SearchArguments = {},
    options?: RequestOptions,
  ): Promise<Place[]> => {
    if (places.mode !== "google")
      throw new ServiceError(
        "configuration",
        "Connect Google Places before using real assistant searches.",
      );
    const current = trip.getSnapshot().trip;
    const destinationBias =
      (args.nearDestination ?? category === "parking") &&
      current?.destination.source === "verified";
    const origin = destinationBias
      ? current.destination.coordinate
      : getLocation();
    if (!origin)
      throw new ServiceError(
        "location",
        "A fresh GPS location is needed to search for stops.",
      );
    const route = !destinationBias ? current?.route : null;
    const timedAnchor =
      args.timeAheadMinutes !== undefined && route
        ? timeAheadPoint(route, origin, args.timeAheadMinutes)
        : null;
    if (
      args.timeAheadMinutes !== undefined &&
      (!timedAnchor || destinationBias)
    )
      throw new ServiceError(
        "invalid-data",
        "A current on-route GPS fix and active route are needed for a time-ahead search. The timing is approximate.",
      );
    let results: Place[];
    if (args.query?.trim()) {
      const suffix =
        category === "food"
          ? "restaurant"
          : category === "gas"
            ? "gas station"
            : category === "coffee"
              ? "coffee shop"
              : category === "restroom"
                ? "public bathroom"
                : category === "parking"
                  ? "parking"
                  : "";
      const query = `${args.query.trim()} ${suffix}`.trim().slice(0, 200);
      const samples = timedAnchor
        ? [timedAnchor]
        : route
          ? sampleAhead(route, origin)
          : [origin];
      const replies = await Promise.allSettled(
        samples.map((point) => places.search(query, point, options)),
      );
      if (options?.signal?.aborted)
        throw new ServiceError("cancelled", "Request cancelled.");
      const successes = replies.filter((reply) => reply.status === "fulfilled");
      if (!successes.length) {
        const failure = replies.find((reply) => reply.status === "rejected");
        throw failure?.status === "rejected"
          ? failure.reason
          : new ServiceError("network", "Place search failed.");
      }
      const unique = [
        ...new Map(
          successes
            .flatMap((reply) => reply.value)
            .filter((place) => place.source === "verified")
            .map((place) => [place.id, place]),
        ).values(),
      ];
      results = route
        ? rankRoutePlaces(unique, route, origin)
        : unique
            .map((place) => ({
              ...place,
              distanceMeters: distanceBetween(origin, place.coordinate),
            }))
            .sort((a, b) => a.distanceMeters - b.distanceMeters);
    } else if (category)
      results = timedAnchor
        ? rankRoutePlaces(
            await places.nearby(category, timedAnchor, options),
            route!,
            origin,
          )
        : route
          ? await places.alongRoute(category, origin, route, options)
          : await places.nearby(category, origin, options);
    else
      throw new ServiceError(
        "invalid-data",
        "Tell me what place to search for.",
      );
    results = results
      .filter(
        (place) =>
          place.source === "verified" &&
          (!timedAnchor ||
            distanceBetween(timedAnchor, place.coordinate) <= 3000) &&
          (args.minRating === undefined ||
            (place.rating !== undefined && place.rating >= args.minRating)),
      )
      .map((place) => (category ? { ...place, category } : place));
    if (current?.route && detours) {
      const driver = getLocation();
      if (driver) {
        // Destination search bias is not the comparison origin: always compare from the driver.
        results = await detours.verify(results, current, driver, options);
        if (trip.getSnapshot().trip !== current)
          throw new ServiceError("cancelled", "Trip changed. Search again.");
        results = rankRecommendations(results, args.query);
      }
    }
    if (args.maxDetourMinutes !== undefined)
      results = results.filter(
        (place) =>
          place.verifiedDetour &&
          place.verifiedDetour.durationSeconds <= args.maxDetourMinutes! * 60,
      );
    return results.slice(
      0,
      Math.min(LIMITS.MAX_PLACE_RESULTS, args.maxResults ?? 3),
    );
  };
  return {
    searchFood: (args?: SearchArguments, options?: RequestOptions) =>
      search("food", args, options),
    searchGas: (args?: SearchArguments, options?: RequestOptions) =>
      search("gas", args, options),
    searchRestrooms: (args?: SearchArguments, options?: RequestOptions) =>
      search("restroom", args, options),
    searchCoffee: (args?: SearchArguments, options?: RequestOptions) =>
      search("coffee", args, options),
    searchParking: (args?: SearchArguments, options?: RequestOptions) =>
      search("parking", args, options),
    searchPlaces: (args: SearchArguments, options?: RequestOptions) =>
      search(null, args, options),
    getCurrentRoute: () => trip.getSnapshot().trip?.route ?? null,
  };
}
