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
export interface TripPort {
  getSnapshot(): TripState;
  applyStopsAtomic(
    expected: ActiveTrip,
    stops: ActiveTrip["stops"],
    signal?: AbortSignal,
  ): Promise<boolean>;
  cancel(): void;
}
export interface SearchArguments {
  query?: string;
  maxResults?: number;
  minRating?: number;
  nearDestination?: boolean;
}
// AI and UI share V0.2 providers. Qualified queries reuse Text Search, not a second adapter.
export function createTripTools(
  places: PlacesService,
  trip: TripPort,
  getLocation: () => Coordinate | null,
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
      const samples = route ? sampleAhead(route, origin) : [origin];
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
      results = route
        ? await places.alongRoute(category, origin, route, options)
        : await places.nearby(category, origin, options);
    else
      throw new ServiceError(
        "invalid-data",
        "Tell me what place to search for.",
      );
    return results
      .filter(
        (place) =>
          place.source === "verified" &&
          (args.minRating === undefined ||
            (place.rating !== undefined && place.rating >= args.minRating)),
      )
      .slice(0, args.maxResults ?? 3)
      .map((place) => (category ? { ...place, category } : place));
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
