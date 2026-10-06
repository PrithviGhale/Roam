# V0.2 architecture

Expo Router retains four tabs. ThemeProvider persists only the theme. RoamProvider retains the single foreground GPS subscription and hosts a subscribable TripController using `useSyncExternalStore`. AssistantProvider retains the shared conversation and simulated voice states / native read-aloud behavior.

## Trip state

The controller owns destination, ordered stops, route, start time, loading/error state, and cancellation generation. ETA and distance belong to the same route record as the geometry, avoiding duplicated state. Selecting a destination resets stops; adding/removing stops preserves the destination and trip start. Every input change immediately clears old geometry/metadata. Failures retain requested destination/stops for retry. Cancel clears the whole trip; aborted or late responses cannot restore it. Same-destination and loading-time stop/retry taps are ignored. At most five verified stops are supported.

The route-progress hook performs local GPS projection only. After Start Trip it scales the original route duration/distance by remaining geometry fraction. It is labeled an estimate and does not refresh traffic or call providers. More than 1 km off route, it shows the original estimate with an explicit refresh message. Completed stops remain until manually removed.

## Providers

`services/places.ts` and `routes.ts` select Google adapters when a public REST key or optional proxy URL is configured. Otherwise places use the retained demo adapter and routing is unavailable. Mock places cannot enter a real route. Configured errors never fall back to fabricated data.

`services/google/client.ts` is the bounded HTTP boundary with injected fetch for tests, field masks, public-key headers, 12-second timeout, cancellation, and safe error mapping. Google raw JSON is normalized to internal types inside the adapters; missing rating/hours remain missing and malformed places are rejected. Autocomplete returns suggestions without fictional coordinates; Details resolves the selected suggestion. Routes decodes an encoded polyline and normalizes duration/distance, legs, origin/end, bounds, and calculation timestamp. Routes uses DRIVE / TRAFFIC_AWARE with ordered intermediate place IDs.

`usePlaces` debounces autocomplete and snapshots location/route on sheet opening, category change, or explicit retry. Cleanup aborts and ignores stale results. `routeAware.ts` is pure geometry/ranking: project driver, sample 2/8 km ahead, deduplicate, filter behind/outside corridor, and rank convenience. At most two Nearby Search requests are issued. Partial success remains usable; all-failed searches show an error. No GPS-driven API calls, per-result driving detours, persistent result cache, or automatic retry loops are added.

`services/tools.ts` exposes `searchFood`, `searchGas`, `searchRestrooms`, `searchCoffee`, `searchParking`, `addTripStop`, `removeTripStop`, and `getCurrentRoute` using the same providers/controller. It is a factory for a future tool runtime, not an AI integration. Future server tools must validate arguments, authenticate clients, protect keys, and return verified data; AI should not invent map facts or silently mutate trips.

## Map and UI

Native MapCanvas renders Google results only with the Google provider. A missing native Google manager gives a readable development-build message. No-key iOS demo retains Apple Maps. A loaded route triggers one camera fit; GPS and overlay-height updates do not steal a manually panned camera. Recenter is explicit. Geometry, final flag, numbered stops, and current-location marker share theme tokens. Map padding reserves attribution space. Web is a UI preview without Google geometry.

NavigationSummary reuses SpeedDisplay; PlacesSheet handles selection/add-stop controls and pinned Google attribution; Trips exposes ordered stop removal and cancellation. Existing sheets, themes, foreground permission recovery, speed validation, and assistant UI remain. Google-result and trip data live in memory, without a history store.

## Verification boundaries

Node tests inject fixture responses and deferred requests to verify errors and cancellation races. TypeScript/Expo Doctor/export checks validate code and dependency/bundle compatibility. They do not verify actual Google authorization, provider rendering, camera placement, iPhone safe areas, physical GPS, or billing. Use the device checklist before claiming these paths are device-tested.
