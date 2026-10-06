import { useEffect, useRef, useState } from "react";
import { placesService } from "../services/places";
import { errorMessage, isCancelled } from "../services/errors";
import { projectOntoRoute } from "../utils/geo";
import type {
  Coordinate,
  Place,
  PlaceCategory,
  PlaceSuggestion,
  Route,
} from "../types/domain";

export function usePlaces(
  query: string,
  category: PlaceCategory | null,
  origin: Coordinate | null,
  enabled: boolean,
  route: Route | null = null,
  sessionToken?: string,
) {
  const [places, setPlaces] = useState<Place[]>([]);
  const [suggestions, setSuggestions] = useState<PlaceSuggestion[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [alongRoute, setAlongRoute] = useState(false);
  const searchQuery = query.trim();
  const latest = useRef({ origin, route });
  latest.current = { origin, route };
  const snapshot = useRef<{
    origin: Coordinate | null;
    route: Route | null;
    category: PlaceCategory | null;
    attempt: number;
  } | null>(null);
  useEffect(() => {
    if (!enabled) {
      snapshot.current = null;
      setLoading(false);
      return;
    }
    // Snapshot at sheet opening / explicit refresh, never issue calls on every GPS update.
    if (
      !snapshot.current ||
      snapshot.current.category !== category ||
      snapshot.current.attempt !== attempt
    )
      snapshot.current = { ...latest.current, category, attempt };
    const context = snapshot.current;
    const projection =
      context.route && context.origin
        ? projectOntoRoute(context.origin, context.route.geometry)
        : null;
    setAlongRoute(Boolean(projection && projection.offsetMeters <= 3000));
    const controller = new AbortController();
    let cancelled = false;
    setPlaces([]);
    setSuggestions([]);
    setError(null);
    if (
      !category &&
      placesService.mode === "google" &&
      searchQuery.length < 2
    ) {
      setLoading(false);
      return;
    }
    setLoading(true);
    const timer = setTimeout(
      () => {
        const options = { signal: controller.signal, sessionToken };
        const request = category
          ? context.route && context.origin
            ? placesService.alongRoute(
                category,
                context.origin,
                context.route,
                options,
              )
            : placesService.nearby(category, context.origin, options)
          : placesService.autocomplete(searchQuery, context.origin, options);
        void request
          .then((value) => {
            if (!cancelled) {
              if (category) setPlaces(value as Place[]);
              else setSuggestions(value as PlaceSuggestion[]);
            }
          })
          .catch((error) => {
            if (!cancelled && !isCancelled(error))
              setError(errorMessage(error));
          })
          .finally(() => {
            if (!cancelled) setLoading(false);
          });
      },
      category ? 0 : 350,
    );
    return () => {
      cancelled = true;
      controller.abort();
      clearTimeout(timer);
    };
  }, [searchQuery, category, enabled, attempt, sessionToken]);
  return {
    places,
    suggestions,
    loading,
    error,
    alongRoute,
    retry: () => setAttempt((value) => value + 1),
  };
}
