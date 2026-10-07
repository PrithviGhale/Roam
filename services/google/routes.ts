import type {
  Coordinate,
  Place,
  Route,
  RouteLeg,
  TripStop,
  RoutesService,
} from "../../types/domain";
import { validCoordinate } from "../../utils/location";
import { decodePolyline } from "../../utils/polyline";
import { ServiceError } from "../errors";
import type { GoogleClient } from "./client";
import { finite, googleCoordinate, record, string } from "./normalization";
import { LIMITS } from "../../shared/limits";

function duration(value: unknown): number | undefined {
  if (typeof value !== "string" || !/^\d+(?:\.\d+)?s$/.test(value))
    return undefined;
  const seconds = Number(value.slice(0, -1));
  return Number.isFinite(seconds) ? seconds : undefined;
}
export function normalizeRoute(
  value: unknown,
  origin: Coordinate,
  destination: Place,
  stops: TripStop[] = [],
): Route {
  const routes = record(value).routes;
  if (!Array.isArray(routes) || !routes.length)
    throw new ServiceError(
      "no-route",
      "No driving route was found. Try another destination or remove a stop.",
    );
  const route = record(routes[0]),
    encoded = string(record(route.polyline).encodedPolyline);
  const distanceMeters = finite(route.distanceMeters),
    durationSeconds = duration(route.duration);
  if (
    !encoded ||
    distanceMeters === undefined ||
    distanceMeters < 0 ||
    durationSeconds === undefined
  )
    throw new ServiceError(
      "invalid-data",
      "Google returned incomplete route information. Please retry.",
    );
  const legs: RouteLeg[] = Array.isArray(route.legs)
    ? route.legs.flatMap((value) => {
        const leg = record(value),
          start = googleCoordinate(record(leg.startLocation).latLng),
          end = googleCoordinate(record(leg.endLocation).latLng),
          distance = finite(leg.distanceMeters),
          seconds = duration(leg.duration);
        return start &&
          end &&
          distance !== undefined &&
          distance >= 0 &&
          seconds !== undefined
          ? [{ start, end, distanceMeters: distance, durationSeconds: seconds }]
          : [];
      })
    : [];
  const geometry = decodePolyline(encoded),
    viewport = record(route.viewport),
    low = googleCoordinate(viewport.low),
    high = googleCoordinate(viewport.high);
  return {
    id: `${destination.id}:${stops.map((stop) => stop.id).join(",")}:${encoded}`,
    destination,
    geometry,
    distanceMeters,
    durationSeconds,
    source: "verified",
    origin: legs[0]?.start ?? origin,
    end: legs.at(-1)?.end ?? destination.coordinate,
    legs,
    calculatedAt: new Date().toISOString(),
    ...(low && high ? { bounds: { low, high } } : {}),
  };
}
export function createGoogleRoutesService(client: GoogleClient): RoutesService {
  return {
    async getRoute(origin, destination, stops = [], options) {
      if (
        !validCoordinate(origin) ||
        !validCoordinate(destination.coordinate) ||
        stops.some((stop) => !validCoordinate(stop.place.coordinate))
      )
        throw new ServiceError(
          "invalid-data",
          "A destination or stop has invalid coordinates. Choose another place.",
        );
      if (
        destination.source !== "verified" ||
        stops.some((stop) => stop.place.source !== "verified")
      )
        throw new ServiceError(
          "invalid-data",
          "Demo places cannot be used for real driving routes.",
        );
      if (stops.length > LIMITS.MAX_STOPS)
        throw new ServiceError(
          "invalid-data",
          "ROAM supports up to five stops per trip.",
        );
      const waypoint = (coordinate: Coordinate) => ({
        location: { latLng: coordinate },
      });
      const response = await client.request(
        {
          operation: "routes",
          fieldMask:
            "routes.duration,routes.distanceMeters,routes.polyline.encodedPolyline,routes.viewport,routes.legs.distanceMeters,routes.legs.duration,routes.legs.startLocation,routes.legs.endLocation",
          body: {
            origin: waypoint(origin),
            destination: { placeId: destination.id },
            ...(stops.length
              ? {
                  intermediates: stops.map((stop) => ({
                    placeId: stop.place.id,
                  })),
                }
              : {}),
            travelMode: "DRIVE",
            routingPreference: "TRAFFIC_AWARE",
            computeAlternativeRoutes: false,
            polylineQuality: "HIGH_QUALITY",
            polylineEncoding: "ENCODED_POLYLINE",
            units: "IMPERIAL",
            languageCode: "en-US",
          },
        },
        options,
      );
      return normalizeRoute(response, origin, destination, stops);
    },
  };
}
