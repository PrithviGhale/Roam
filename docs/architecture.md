# V0.3 architecture

Expo Router retains four tabs. ThemeProvider persists only the theme. RoamProvider retains the single foreground GPS subscription and hosts a subscribable TripController using `useSyncExternalStore`. AssistantProvider owns session conversation, bounded requests, optional native push-to-talk, and read-aloud state. V0.2 was checkpointed before these changes.

## AI boundaries

`shared/assistant.ts` defines strict Zod tool/wire schemas and SDK function declarations. `server/src/gemini.ts` uses the current Google GenAI SDK and Flash model. The Worker signs stateless continuations (two-minute expiry) preserving original model parts/thought signatures; the phone returns validated receipts matched to issued calls. No polylines, precise GPS or GPS history are sent to Gemini. Each message is limited to twelve history items, three model calls, six local tools and one trip mutation.

`services/assistant/engine.ts` executes the allowlisted tools using the existing providers/controller. `references.ts` resolves actual displayed IDs/order and ten-minute pending confirmations. User ordinals override incorrect model targets. Ambiguous removal ignores model guesses. `context.ts` projects the same local trip progress as the HUD and builds compact facts. Free-form model factual prose never renders: a validated response plan selects grounded result/status/mutation/clarification templates. Only successful receipts acknowledge route changes.

`TripController.applyStopsAtomic` is the assistant transaction boundary. It guards the captured trip identity, calculates before replacing the plan, and restores the previous state on failure/abort if no newer action superseded it. UI add/remove behavior stays compatible with V0.2. Searches and AI errors cannot clear routes.

The Worker also implements V0.2's Google proxy contract with fixed endpoints/masks, bounded operation schemas, private REST credentials, sanitized errors, request-body limits and native rate-limit bindings. A shared prototype token is required on published hosts; local trusted LAN use can omit it. The token is public in the phone and is not user authentication. Browser origins are allowlisted. Rate bindings are per Cloudflare location. All request state is local to the request or signed continuation; there is no persistent conversation store.

`services/speechInput.ts` looks up the optional native speech module without importing a missing module into Expo Go. Native builds register bounded foreground capture, permission/final-result/error/end listeners and cancellation. Expo Go/web keep text and TTS. Recognition never persists audio files; iOS may use its online speech service. Automatic speech uses concise grounded text, supports interruption, and stops on assistant dismissal/app background.

## Trip state

The controller owns destination, ordered stops, route, start time, loading/error state, and cancellation generation. ETA and distance belong to the same route record as the geometry, avoiding duplicated state. Selecting a destination resets stops; adding/removing stops preserves the destination and trip start. Every input change immediately clears old geometry/metadata. Failures retain requested destination/stops for retry. Cancel clears the whole trip; aborted or late responses cannot restore it. Same-destination and loading-time stop/retry taps are ignored. At most five verified stops are supported.

The route-progress hook performs local GPS projection only. After Start Trip it scales the original route duration/distance by remaining geometry fraction. It is labeled an estimate and does not refresh traffic or call providers. More than 1 km off route, it shows the original estimate with an explicit refresh message. Completed stops remain until manually removed.

## Providers

`services/places.ts` and `routes.ts` select Google adapters when a public REST key or optional proxy URL is configured. Otherwise places use the retained demo adapter and routing is unavailable. Mock places cannot enter a real route. Configured errors never fall back to fabricated data.

`services/google/client.ts` is the bounded HTTP boundary with injected fetch for tests, field masks, public-key headers, 12-second timeout, cancellation, and safe error mapping. Google raw JSON is normalized to internal types inside the adapters; missing rating/hours remain missing and malformed places are rejected. Autocomplete returns suggestions without fictional coordinates; Details resolves the selected suggestion. Routes decodes an encoded polyline and normalizes duration/distance, legs, origin/end, bounds, and calculation timestamp. Routes uses DRIVE / TRAFFIC_AWARE with ordered intermediate place IDs.

`usePlaces` debounces autocomplete and snapshots location/route on sheet opening, category change, or explicit retry. Cleanup aborts and ignores stale results. `routeAware.ts` is pure geometry/ranking: project driver, sample 2/8 km ahead, deduplicate, filter behind/outside corridor, and rank convenience. At most two Nearby Search requests are issued. Partial success remains usable; all-failed searches show an error. No GPS-driven API calls, per-result driving detours, persistent result cache, or automatic retry loops are added.

`services/tools.ts` exposes reusable category/qualified searches and current-route access with a typed TripPort. The assistant engine adds status, guarded add/remove/cancel execution using this same provider/controller boundary. Server declarations and client argument validation use the central shared schemas. Per-user authentication remains a future improvement; the prototype protects published requests with a shared testing token.

## Map and UI

Native MapCanvas renders Google results only with the Google provider. A missing native Google manager gives a readable development-build message. No-key iOS demo retains Apple Maps. A loaded route triggers one camera fit; GPS and overlay-height updates do not steal a manually panned camera. Recenter is explicit. Geometry, final flag, numbered stops, and current-location marker share theme tokens. Map padding reserves attribution space. Web is a UI preview without Google geometry.

NavigationSummary reuses SpeedDisplay; PlacesSheet handles selection/add-stop controls and pinned Google attribution; Trips exposes ordered stop removal and cancellation. Existing sheets, themes, foreground permission recovery, speed validation, and assistant UI remain. Google-result and trip data live in memory, without a history store.

## Verification boundaries

Node tests inject fixture responses and deferred requests to verify errors and cancellation races. TypeScript/Expo Doctor/export checks validate code and dependency/bundle compatibility. They do not verify actual Google authorization, provider rendering, camera placement, iPhone safe areas, physical GPS, or billing. Use the device checklist before claiming these paths are device-tested.
