import { test } from "node:test";
import assert from "node:assert/strict";
import {
  createGoogleClient,
  type GoogleClient,
  type GoogleRequest,
} from "../src/services/google/client";
import { createGooglePlacesService } from "../src/services/google/places";
import {
  createGoogleRoutesService,
  normalizeRoute,
} from "../src/services/google/routes";
import {
  normalizePlace,
  normalizePlaceResults,
  normalizeSuggestions,
} from "../src/services/google/normalization";
import { ServiceError } from "../src/services/errors";
import { destination, origin, routeFor, stop } from "./fixtures";

const rawPlace = {
  id: "place",
  displayName: { text: "Coffee shop" },
  formattedAddress: "A real address",
  location: { latitude: 0, longitude: 0.08 },
  primaryType: "coffee_shop",
};
const rawRoute = {
  routes: [
    {
      distanceMeters: 12000,
      duration: "720.5s",
      polyline: { encodedPolyline: "_p~iF~ps|U_ulLnnqC_mqNvxq`@" },
      viewport: {
        low: { latitude: 38.5, longitude: -126.453 },
        high: { latitude: 43.252, longitude: -120.2 },
      },
      legs: [
        {
          distanceMeters: 12000,
          duration: "720.5s",
          startLocation: { latLng: { latitude: 38.5, longitude: -120.2 } },
          endLocation: { latLng: { latitude: 43.252, longitude: -126.453 } },
        },
      ],
    },
  ],
};
test("normalization preserves only real optional place values and attribution", () => {
  const basic = normalizePlace(rawPlace, "coffee");
  assert.equal(basic.source, "verified");
  assert.equal(basic.rating, undefined);
  assert.equal(basic.openNow, undefined);
  const rich = normalizePlace(
    {
      ...rawPlace,
      rating: 4.7,
      userRatingCount: 14,
      currentOpeningHours: { openNow: false },
      attributions: [
        { provider: "Provider", providerUri: "https://example.com" },
      ],
    },
    "coffee",
  );
  assert.equal(rich.openNow, false);
  assert.equal(rich.rating, 4.7);
  assert.equal(rich.ratingCount, 14);
  assert.equal(rich.attributions?.[0]?.provider, "Provider");
  const invalidOptional = normalizePlace({
    ...rawPlace,
    rating: 100,
    userRatingCount: -1,
    currentOpeningHours: { openNow: "yes" },
  });
  assert.equal(invalidOptional.rating, undefined);
  assert.equal(invalidOptional.ratingCount, undefined);
  assert.equal(invalidOptional.openNow, undefined);
});
test("malformed place coordinates are rejected and do not become map markers", () => {
  assert.throws(
    () =>
      normalizePlace({ ...rawPlace, location: { latitude: 91, longitude: 0 } }),
    /usable location/,
  );
  assert.throws(
    () => normalizePlace({ ...rawPlace, location: null }),
    /usable location/,
  );
  assert.deepEqual(
    normalizePlaceResults({ places: [rawPlace, { id: "bad" }] }, "food").map(
      (place) => place.id,
    ),
    ["place"],
  );
});
test("autocomplete normalizes cities/addresses without inventing coordinates", () => {
  const suggestions = normalizeSuggestions({
    suggestions: [
      {
        placePrediction: {
          placeId: "city",
          structuredFormat: {
            mainText: { text: "Boston" },
            secondaryText: { text: "MA, USA" },
          },
        },
      },
      { queryPrediction: { text: "not a place" } },
    ],
  });
  assert.deepEqual(suggestions, [
    { id: "city", name: "Boston", subtitle: "MA, USA", source: "verified" },
  ]);
});
test("route normalization decodes geometry, units, snapped endpoints and bounds", () => {
  const route = normalizeRoute(rawRoute, origin, destination);
  assert.equal(route.durationSeconds, 720.5);
  assert.equal(route.distanceMeters, 12000);
  assert.equal(route.geometry.length, 3);
  assert.deepEqual(route.origin, { latitude: 38.5, longitude: -120.2 });
  assert.equal(route.legs.length, 1);
  assert.ok(route.bounds);
});
test("no route and incomplete provider response are useful errors", () => {
  assert.throws(
    () => normalizeRoute({ routes: [] }, origin, destination),
    /No driving route/,
  );
  for (const route of [
    {
      distanceMeters: 10,
      duration: "unknown",
      polyline: { encodedPolyline: "??" },
    },
    { distanceMeters: -1, duration: "1s" },
    { duration: "1s" },
  ])
    assert.throws(
      () => normalizeRoute({ routes: [route] }, origin, destination),
      /incomplete route/,
    );
});
test("destination suggestions share the same token with selected place details", async () => {
  const calls: { request: GoogleRequest; token?: string }[] = [];
  const client: GoogleClient = {
    async request(request, options) {
      calls.push({ request, token: options?.sessionToken });
      return request.operation === "details"
        ? rawPlace
        : {
            suggestions: [
              {
                placePrediction: { placeId: "place", text: { text: "Coffee" } },
              },
            ],
          };
    },
  };
  const places = createGooglePlacesService(client);
  assert.deepEqual(await places.autocomplete("", origin), []);
  assert.equal(calls.length, 0);
  const suggestions = await places.autocomplete("Coffee", origin, {
    sessionToken: "session",
  });
  await places.getDetails(suggestions[0]!, { sessionToken: "session" });
  assert.equal(calls.length, 2);
  assert.ok(calls.every((call) => call.token === "session"));
  assert.equal(calls[0]?.request.body?.sessionToken, "session");
  assert.ok(calls[1]?.request.fieldMask.includes("location"));
});
test("nearby search requires GPS, uses real category types and avoids fallback fake data", async () => {
  const calls: GoogleRequest[] = [];
  const places = createGooglePlacesService({
    async request(request) {
      calls.push(request);
      return { places: [rawPlace] };
    },
  });
  await assert.rejects(places.nearby("food", null), /GPS/);
  assert.equal(calls.length, 0);
  const results = await places.nearby("restroom", origin);
  assert.deepEqual(calls[0]?.body?.includedTypes, ["public_bathroom"]);
  assert.equal(results[0]?.source, "verified");
  assert.ok(results[0]?.distanceMeters);
  await assert.rejects(
    createGooglePlacesService({
      async request() {
        throw new ServiceError("permission", "Denied.");
      },
    }).nearby("coffee", origin),
    /Denied/,
  );
});
test("along-route search has a two-call budget, deduplicates places and tolerates partial failure", async () => {
  let calls = 0;
  const places = createGooglePlacesService({
    async request() {
      calls++;
      return { places: [rawPlace] };
    },
  });
  assert.equal(
    (await places.alongRoute("coffee", origin, routeFor())).length,
    1,
  );
  assert.equal(calls, 2);
  calls = 0;
  const partial = createGooglePlacesService({
    async request() {
      if (++calls === 1) throw new ServiceError("network", "Unavailable");
      return { places: [rawPlace] };
    },
  });
  assert.equal(
    (await partial.alongRoute("coffee", origin, routeFor())).length,
    1,
  );
});
test("Routes adapter sends ordered intermediate place IDs and exact masks", async () => {
  const calls: GoogleRequest[] = [];
  const routes = createGoogleRoutesService({
    async request(request) {
      calls.push(request);
      return rawRoute;
    },
  });
  await routes.getRoute(origin, destination, [{ id: stop.id, place: stop }]);
  assert.deepEqual(calls[0]?.body?.intermediates, [{ placeId: "stop" }]);
  assert.deepEqual(calls[0]?.body?.destination, { placeId: "destination" });
  assert.equal(calls[0]?.body?.travelMode, "DRIVE");
  assert.equal(calls[0]?.body?.routingPreference, "TRAFFIC_AWARE");
  assert.ok(calls[0]?.fieldMask.includes("encodedPolyline"));
  assert.ok(!calls[0]?.fieldMask.includes("*"));
  await assert.rejects(
    routes.getRoute(origin, { ...destination, source: "mock" }),
    /Demo/,
  );
  assert.equal(calls.length, 1);
});
test("HTTP client uses header credentials, bounds endpoints and returns redacted errors", async () => {
  const calls: { url: string; init: RequestInit }[] = [];
  const fetcher: typeof fetch = async (url, init) => {
    calls.push({ url: String(url), init: init ?? {} });
    return new Response(JSON.stringify(rawPlace));
  };
  const client = createGoogleClient({
    apiKey: "test-only-key",
    iosBundleIdentifier: "test.bundle",
    fetch: fetcher,
  });
  await client.request(
    {
      operation: "details",
      placeId: "place/with?characters",
      fieldMask: "location",
    },
    { sessionToken: "token" },
  );
  assert.match(calls[0]!.url, /place%2Fwith%3Fcharacters/);
  assert.ok(!calls[0]!.url.includes("test-only-key"));
  assert.equal(
    (calls[0]!.init.headers as Record<string, string>)[
      "X-Ios-Bundle-Identifier"
    ],
    "test.bundle",
  );
  assert.equal(
    (calls[0]!.init.headers as Record<string, string>)["X-Goog-Api-Key"],
    "test-only-key",
  );
  for (const [status, code] of [
    [403, "permission"],
    [429, "quota"],
    [400, "invalid-data"],
    [503, "network"],
  ] as const) {
    const failing = createGoogleClient({
      apiKey: "test-only-key",
      fetch: async () => new Response("private response body", { status }),
    });
    await assert.rejects(
      failing.request({ operation: "routes", fieldMask: "duration" }),
      (error) =>
        error instanceof ServiceError &&
        error.code === code &&
        !error.message.includes("private response"),
    );
  }
});
test("missing configuration, caller cancellation and request timeout are distinct", async () => {
  const request: GoogleRequest = {
    operation: "routes",
    fieldMask: "routes.duration",
  };
  await assert.rejects(
    createGoogleClient({}).request(request),
    (error) => error instanceof ServiceError && error.code === "configuration",
  );
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(
    createGoogleClient({ apiKey: "test-only-key" }).request(request, {
      signal: controller.signal,
    }),
    (error) => error instanceof ServiceError && error.code === "cancelled",
  );
  const waiting: typeof fetch = async (_url, init) =>
    new Promise((_resolve, reject) =>
      init?.signal?.addEventListener(
        "abort",
        () => reject(new Error("Aborted")),
        { once: true },
      ),
    );
  await assert.rejects(
    createGoogleClient({
      apiKey: "test-only-key",
      fetch: waiting,
      timeoutMs: 5,
    }).request(request),
    (error) => error instanceof ServiceError && error.code === "timeout",
  );
});
