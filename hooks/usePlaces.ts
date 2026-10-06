import { useEffect, useState } from "react";
import { placesService } from "../services/places";
import type { Coordinate, Place, PlaceCategory } from "../types/domain";

export function usePlaces(
  query: string,
  category: PlaceCategory | null,
  origin: Coordinate | null,
  enabled: boolean,
) {
  const [places, setPlaces] = useState<Place[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  // A GPS update should not re-query a sheet while the driver is reading it.
  const latitude = origin ? Math.round(origin.latitude * 1000) / 1000 : null;
  const longitude = origin ? Math.round(origin.longitude * 1000) / 1000 : null;
  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    const timer = setTimeout(
      () => {
        const center =
          latitude !== null && longitude !== null
            ? { latitude, longitude }
            : null;
        const request = category
          ? placesService.nearby(category, center)
          : placesService.search(query, center);
        void request
          .then((value) => {
            if (!cancelled) setPlaces(value);
          })
          .catch(() => {
            if (!cancelled)
              setError("Places couldn’t be loaded. Please try again.");
          })
          .finally(() => {
            if (!cancelled) setLoading(false);
          });
      },
      category ? 0 : 200,
    );
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [query, category, latitude, longitude, enabled, attempt]);
  return {
    places,
    loading,
    error,
    retry: () => setAttempt((value) => value + 1),
  };
}
