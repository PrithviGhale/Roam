import type {
  Coordinate,
  PlaceCategory,
  PlacesService,
  RequestOptions,
} from "../../types/domain";
import { distanceBetween } from "../../utils/geo";
import { validCoordinate } from "../../utils/location";
import { ServiceError, isCancelled } from "../errors";
import { rankRoutePlaces, sampleAhead } from "../routeAware";
import { LIMITS } from "../../../shared/limits";
import type { GoogleClient } from "./client";
import {
  normalizePlace,
  normalizePlaceResults,
  normalizeSuggestions,
} from "./normalization";

const fields =
  "id,displayName,formattedAddress,location,primaryType,rating,userRatingCount,currentOpeningHours.openNow,businessStatus,attributions";
const nearbyTypes: Record<PlaceCategory, string[]> = {
  food: ["restaurant"],
  gas: ["gas_station"],
  restroom: ["public_bathroom"],
  coffee: ["coffee_shop", "cafe"],
  parking: ["parking"],
};
function requireOrigin(origin: Coordinate | null): Coordinate {
  if (!origin || !validCoordinate(origin))
    throw new ServiceError(
      "location",
      "A current GPS location is needed to find nearby places. Enable location or retry GPS first.",
    );
  return origin;
}
export function createGooglePlacesService(client: GoogleClient): PlacesService {
  const nearby = async (
    category: PlaceCategory,
    coordinate: Coordinate,
    options?: RequestOptions,
  ) => {
    const value = await client.request(
      {
        operation: "nearby",
        fieldMask: fields
          .split(",")
          .map((field) => `places.${field}`)
          .join(","),
        body: {
          includedTypes: nearbyTypes[category],
          maxResultCount: LIMITS.MAX_PLACE_RESULTS,
          rankPreference: "DISTANCE",
          locationRestriction: { circle: { center: coordinate, radius: 2000 } },
        },
      },
      options,
    );
    return normalizePlaceResults(value, category).map((place) => ({
      ...place,
      distanceMeters: distanceBetween(coordinate, place.coordinate),
    }));
  };
  return {
    mode: "google",
    async search(query, origin, options) {
      if (!query.trim()) return [];
      const value = await client.request(
        {
          operation: "text-search",
          fieldMask: fields
            .split(",")
            .map((field) => `places.${field}`)
            .join(","),
          body: {
            textQuery: query.trim().slice(0, 200),
            pageSize: LIMITS.MAX_PLACE_RESULTS,
            ...(origin && validCoordinate(origin)
              ? { locationBias: { circle: { center: origin, radius: 50000 } } }
              : {}),
          },
        },
        options,
      );
      return normalizePlaceResults(value, "destination");
    },
    async autocomplete(query, origin, options) {
      if (query.trim().length < 2) return [];
      const value = await client.request(
        {
          operation: "autocomplete",
          fieldMask:
            "suggestions.placePrediction.placeId,suggestions.placePrediction.text,suggestions.placePrediction.structuredFormat",
          body: {
            input: query.trim().slice(0, 200),
            languageCode: "en",
            ...(options?.sessionToken
              ? { sessionToken: options.sessionToken }
              : {}),
            ...(origin && validCoordinate(origin)
              ? { locationBias: { circle: { center: origin, radius: 50000 } } }
              : {}),
          },
        },
        options,
      );
      return normalizeSuggestions(value);
    },
    async getDetails(suggestion, options) {
      if (!suggestion.id || suggestion.source !== "verified")
        throw new ServiceError(
          "invalid-data",
          "Choose a real destination before planning a route.",
        );
      const value = await client.request(
        { operation: "details", placeId: suggestion.id, fieldMask: fields },
        options,
      );
      return normalizePlace(value);
    },
    async nearby(category, origin, options) {
      return nearby(category, requireOrigin(origin), options);
    },
    async alongRoute(category, origin, route, options) {
      requireOrigin(origin);
      const responses = await Promise.allSettled(
        sampleAhead(route, origin).map((point) =>
          nearby(category, point, options),
        ),
      );
      if (options?.signal?.aborted)
        throw new ServiceError("cancelled", "Request cancelled.");
      const successes = responses.filter(
        (response) => response.status === "fulfilled",
      );
      if (!successes.length) {
        const failure = responses.find(
          (response) => response.status === "rejected",
        );
        throw failure?.status === "rejected"
          ? failure.reason
          : new ServiceError(
              "network",
              "Couldn’t search along this route. Please retry.",
            );
      }
      for (const response of responses)
        if (response.status === "rejected" && isCancelled(response.reason))
          throw response.reason;
      const unique = new Map(
        successes
          .flatMap((response) => response.value)
          .map((place) => [place.id, place]),
      );
      return rankRoutePlaces([...unique.values()], route, origin).slice(0, 12);
    },
  };
}
