import type { Coordinate, Place, Route } from "../types/domain";

export const origin: Coordinate = { latitude: 0, longitude: 0 };
export const destination: Place = {
  id: "destination",
  name: "Destination",
  subtitle: "Test address",
  category: "destination",
  coordinate: { latitude: 0, longitude: 0.2 },
  source: "verified",
};
export const stop: Place = {
  id: "stop",
  name: "Coffee",
  subtitle: "Test stop",
  category: "coffee",
  coordinate: { latitude: 0, longitude: 0.1 },
  source: "verified",
};
export function routeFor(place = destination): Route {
  return {
    id: "test-route",
    destination: place,
    geometry: [origin, { latitude: 0, longitude: 0.1 }, place.coordinate],
    distanceMeters: 25000,
    durationSeconds: 1500,
    source: "verified",
    origin,
    end: place.coordinate,
    legs: [],
    calculatedAt: "2026-10-06T12:00:00Z",
  };
}
export function deferred<T>() {
  let resolve!: (value: T) => void, reject!: (error: unknown) => void;
  const promise = new Promise<T>((accept, fail) => {
    resolve = accept;
    reject = fail;
  });
  return { promise, resolve, reject };
}
