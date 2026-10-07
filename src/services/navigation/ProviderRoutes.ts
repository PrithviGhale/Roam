import {
  nativeRouteSchema,
  type NativeNavigation,
} from "../../../modules/roam-navigation/src/types";
export { nativeRouteSchema } from "../../../modules/roam-navigation/src/types";
import type { RoutesService, Route, RouteProvider } from "../../types/domain";
import { ServiceError } from "../errors";

/** One routing boundary for previews, mutations and detour comparisons. */
export function createProviderRoutes(
  getNative: () => NativeNavigation | null,
  fallback: RoutesService,
  activeProvider: () => RouteProvider | null = () => null,
): RoutesService {
  return {
    async getRoute(origin, destination, stops = [], options) {
      if (options?.signal?.aborted)
        throw new ServiceError("cancelled", "Request cancelled.");
      const required = options?.requiredProvider ?? activeProvider();
      if (required === "google" || required === "fallback")
        return fallback.getRoute(origin, destination, stops, options);
      const native = getNative();
      let available = false;
      try {
        const status = await native?.availability();
        available =
          status?.available === true &&
          status.provider === "mapbox" &&
          !!native?.calculateRoute;
      } catch {}
      if (!available || !native?.calculateRoute) {
        if (required === "mapbox")
          throw new ServiceError(
            "configuration",
            "Mapbox navigation is unavailable. Your existing trip is kept.",
          );
        return fallback.getRoute(origin, destination, stops, options);
      }
      try {
        const points = [
          ...stops.filter((s) => !s.visited).map((s) => s.place),
          destination,
        ].map((p) => ({ id: p.id, name: p.name, ...p.coordinate }));
        const result = nativeRouteSchema.parse(
          await native.calculateRoute(origin, points),
        );
        if (options?.signal?.aborted)
          throw new ServiceError("cancelled", "Request cancelled.");
        if (result.legs.length !== points.length) throw new Error("leg-count");
        return {
          ...result,
          source: "verified",
          origin,
          destination,
          end: destination.coordinate,
        } satisfies Route;
      } catch (error) {
        if (options?.signal?.aborted)
          throw new ServiceError("cancelled", "Request cancelled.");
        // An active session or an explicitly pinned comparison must never switch.
        if (required === "mapbox")
          throw new ServiceError(
            "invalid-data",
            "Mapbox could not update the route. Your existing trip is kept.",
          );
        // Planning can recover through the existing Google Routes adapter.
        return fallback.getRoute(origin, destination, stops, options);
      }
    },
  };
}
