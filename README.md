# ROAM · V0.4

**Your AI for the road.** iPhone-first Expo SDK 54, React Native and TypeScript, Google Places/Routes, foreground GPS, and a Gemini assistant behind a Cloudflare Worker. V0.4 adds verified driving-detour comparisons, local arrival/progress estimates, conservative rerouting, and development diagnostics. The existing four tabs, themes, destination search, stop controls, text assistant, read-aloud and optional push-to-talk remain.

This is a route-planning/driving prototype. No turn-by-turn Navigation SDK, wake word, CarPlay, weather, community reports, police reports, fuel prices, background navigation or account UI is included.

## Run locally

Use **Node 22+** (validated with Node 24.11.1 / npm 11). Install dependencies and copy the templates:

```powershell
npm ci
Copy-Item server/.dev.vars.example server/.dev.vars
Copy-Item .env.example .env
```

Enable Google **Places API (New)** and **Routes API**, attach billing, and create a server REST key restricted to those APIs. Get a Gemini key from [Google AI Studio](https://aistudio.google.com/apikey); confirm access to [gemini-3.8-flash](https://ai.google.dev/gemini-api/docs/models/gemini-3.8-flash) and review its [pricing/quotas](https://ai.google.dev/gemini-api/docs/pricing).

Fill **server/.dev.vars** (ignored by Git):

```env
GEMINI_API_KEY=your_private_gemini_key
GOOGLE_MAPS_API_KEY=your_private_places_routes_key
ROAM_ACCESS_TOKEN=your_private_testing_gate
```

Fill **.env** (ignored by Git):

```env
EXPO_PUBLIC_ROAM_API_URL=http://YOUR_LAN_IPV4:8787
EXPO_PUBLIC_ROAM_ACCESS_TOKEN=the_same_testing_gate
EXPO_PUBLIC_GOOGLE_MAPS_IOS_KEY=your_application_restricted_ios_sdk_key
EXPO_PUBLIC_GOOGLE_IOS_BUNDLE_IDENTIFIER=host.exp.Exponent
```

Use the computer's IPv4 address from `ipconfig` for an iPhone on the same Wi-Fi; use `http://localhost:8787` for the computer's browser. Start two terminals:

```sh
npm run server
```

```sh
npx expo start --go --clear
```

Use a compatible SDK 54 Expo Go installation. Allow LAN port 8787 and Metro only on a trusted private network. If native transport blocks local HTTP, use an HTTPS development endpoint/tunnel. No backend is deployed by starting Expo.

**V0.4 routes all app Places/Routes REST requests through the Worker.** Remove legacy `EXPO_PUBLIC_GOOGLE_MAPS_API_KEY` from `.env`. It is no longer read by the mobile configuration or used as a native map key fallback. Never create `EXPO_PUBLIC_GEMINI_API_KEY`. The native Maps SDK key and testing token are intentionally public/extractable; they are not server secrets or user authentication. With no Worker URL the app retains the explicit fictional demo. A configured failure never silently substitutes fictional results.

## Expo Go, iOS development build, production

| Build                      | Capabilities / configuration                                                                                                                                                                                                                                                         |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Expo Go, SDK 54 compatible | Text assistant, TTS where supported, foreground GPS, Google REST through Worker. Native Google map support depends on the installed binary; a missing manager gets a readable setup message. Speech recognition cannot be added to Expo Go.                                          |
| ROAM iOS development build | Native Google map with your Maps SDK for iOS key, speech recognition 3.1.3, microphone/speech/foreground-location permission strings, dev client, diagnostics in Profile. Native configuration changes require rebuilding.                                                           |
| Production build           | Diagnostics route redirects to Profile and its entry is hidden. Use HTTPS Worker, published access protection, restricted native SDK key and provider quotas. Per-user authentication/privacy/terms and physical-device validation still need completion before public distribution. |

For Windows, create a signed EAS iPhone development build (Apple development signing/device registration required):

```sh
npx eas-cli login
npx eas-cli device:create
npx eas-cli build --platform ios --profile development
npx expo start --dev-client --clear
```

`eas.json` already includes a development-client profile. Supply native build variables through the selected EAS environment: `EXPO_PUBLIC_GOOGLE_MAPS_IOS_KEY`, `EXPO_PUBLIC_GOOGLE_IOS_BUNDLE_IDENTIFIER=com.prithvighale.roam`, and your HTTPS/LAN API URL/token as appropriate. Use a separate native iOS SDK key restricted to **Maps SDK for iOS** and bundle `com.prithvighale.roam`; optional Android key must be restricted to package/signing certificate. Metro cannot change native modules, permissions or compiled SDK keys. See [Google API security guidance](https://developers.google.com/maps/api-security-best-practices/).

Push-to-talk uses the maintainer's SDK 54 version of [expo-speech-recognition](https://github.com/jamsch/expo-speech-recognition), pinned to **3.1.3**. Tap to speak/finish; capture lasts at most twenty seconds, only foreground, without saved audio files. Permission/network/recognizer errors retain text fallback. Dismissal/background stops capture, requests and TTS. OS speech services may process audio remotely. No always-listening microphone. Voice replies during a started trip are concise and interruptible; actual audio-session behavior requires an iPhone.

## Verified detours and recommendations

1. Places returns candidates using at most **two** route-ahead samples (2 km / 8 km), or **one** destination/time-ahead sample. Each provider search requests at most five results. Deduplicate, filter known rating requirements, and pre-rank using active-polyline projection, route offset, distance ahead, ratings/review count, verified open status and query match.
2. Check at most **three finalists**. Calculate one **fresh baseline** from the current driver origin through the existing **unvisited** ordered stops to the destination. For each finalist calculate the same plan with the candidate inserted before the next unvisited stop ahead of it. Existing stops retain their relative order.
3. Store candidate minus baseline **duration seconds** and **distance meters**, original/candidate totals, calculation timestamp and insertion index. These are Google Routes comparisons; straight-line distances and corridor offsets are never labeled driving detours. Signed differences are retained because a different route can be faster/shorter. UI rounds minute labels upward by magnitude.
4. Rank successful comparisons first; lower added time dominates ratings. Within the scored order: added seconds × 50, added meters × 0.1, corridor offset × 4, distance ahead × 0.15, minus rating × 80, minus log10(1 + review count) × 45, plus 2000 for known closed status, minus 100 per name/query token match. Geometry excludes locations more than 100 m behind or 2 km outside the corridor when the driver can be projected. Off-route drivers fall back to nearby relevance.
5. Cache comparisons in app-session memory for **60 seconds**, only within **150 m** of the comparison origin, keyed by route calculation, destination, ordered/visited stops and candidate. Bound to thirty entries. Changed plans/visited state, movement or expiry invalidate the entry. Cards show the route snapshot clock time. Old detour facts are removed from new assistant context/replies while ten-minute place references remain usable. No location history is persisted.

**Routes budget per recommendation search:** a cold check needs **1 + N requests, N ≤ 3**, so at most **4**. A full cache hit needs **0**; partial misses need a fresh baseline plus missing candidates. No route/candidates or a full five-stop plan needs 0 checks. Failed comparisons leave cards unverified. A max-detour constraint excludes both unchecked and over-limit candidates, including failures; empty results mean none of the checked finalists met the limit, not that no possible business exists.

Requests are sequential/cancelable and bounded by existing transport deadlines. Search never mutates the active trip. Adding a recommended candidate uses the preview insertion policy, then recalculates the actual trip from fresh GPS. Detours are snapshots; traffic and origin changes can alter the later route. Drive/traffic-aware Routes calculations do not include time spent at the stop.

## Arrival, progress and rerouting

Route duration and arrival timestamp are separate. Before starting, arrival = current device time + verified route duration. During a trip, project GPS onto the polyline, scale geometric fraction to Google's route distance, and use verified leg-duration distribution where available (route-wide fraction otherwise). Remaining duration + current local time produces arrival. The UI and assistant label this a **GPS progress estimate**, not live navigation/traffic. Inaccurate/stale/off-route fixes suppress the current arrival/progress rather than inventing updates.

Completed distance aggregates across successful route changes. The displayed percentage is completed distance divided by completed + revised remaining route distance; it can change when the plan changes. No GPS history or accumulated point-to-point track is used. Self-intersecting routes, parallel roads and sparse geometry still need physical validation.

Automatic rerouting runs only after Start Trip. A local distance-to-polyline check requires fresh fixes, accuracy ≤ 50 m, and offset greater than **max(70 m, 3 × reported accuracy)**. Require **three distinct updates over ≥ 6 seconds**; stale, duplicate, inaccurate or recovered fixes do not count. Attempts have a **60-second cooldown**, including failures. Planning and ordinary GPS motion issue no route refreshes. Manual refresh, destination/stop changes and confirmed deviation are the refresh triggers.

While rerouting, show “Finding a better route…” and retain old geometry. Commit the new route only after success; failures keep the exact previous trip/route and display a recoverable error. Cancel/new-destination races cannot resurrect an old route. Three fresh accurate fixes (≤ 25 m accuracy) within 40 m of the next stop mark it visited without a provider call; visited stops are skipped in later routes. If GPS misses the stop, use **Mark visited** in Trips. This is not proof that you entered a business.

Driving mode reduces destination/setup controls, emphasizes speed, destination, remaining duration/distance, arrival and progress, and retains large Ask ROAM/quick-action targets. Gemini receives `tripStarted`; system instructions and grounded templates shorten replies to a top recommendation or brief status. Exact detours appear only when computed.

Try “I'm hungry,” “Find gas within a five-minute detour,” “Find coffee about 30 minutes from now,” “Find coffee near the destination,” “What time will I get there?” and “How much longer?” Time-ahead uses route geometry and leg-duration inversion to estimate a search region; it does not guarantee a stop arrival time. Qualified timed candidates must fall within 3 km of that region. Requests beyond remaining travel clamp to the destination.

## Assistant / backend foundation

Model **gemini-3.8-flash**, SDK **@google/genai 2.27.0**, low thinking. Gemini requests functions; the phone validates/executes the existing Places/Routes/trip services and returns typed receipts. Compact context includes arrival, progress, detour facts and driving state, without coordinates or polylines. Signed two-minute continuations preserve original model parts/thought signatures. Final response plans choose grounded UI templates; numeric facts never come from unrestricted model prose.

Tools: `searchFood`, `searchGas`, `searchRestrooms`, `searchCoffee`, `searchParking`, `searchPlaces`, `getTripStatus`, `rerouteTrip`, `addTripStop`, `removeTripStop`, `cancelTrip`. Search parameters extend existing tools with `timeAheadMinutes` (1–120), `maxDetourMinutes` (0–60), `nearDestination`, known rating and query. No overlapping detour/progress tool swarm. Recent displayed IDs/order and pending confirmation expire after ten minutes. Recommendations require acceptance; explicit named/numbered actions can execute. Ambiguous removals need clarification. One mutation per message; failures preserve the trip. Restroom access/parking availability and prices are unknown.

`server/src/auth.ts` centralizes identity/authorization. It strictly parses one Bearer credential, rejects malformed/combined headers, hashes secrets to equal lengths, and compares with timing-safe Node crypto under `nodejs_compat`. `AUTH_MODE=prototype` is the current shared testing gate; trusted localhost/private-IP development may omit the token. Published requests fail closed without protection. Future `AUTH_MODE=user` requires an injected trusted `UserTokenVerifier` and fails closed when absent; it does not silently fall back to prototype auth. User rate keys hash verified subjects. No user identity is trusted from a client header, and no account UI was added.

The Worker uses fixed Google endpoints/field masks and validates coordinates, strings, stops, results, history and tool arguments. JSON bodies are capped at 128 KiB with a read deadline; errors are sanitized and responses are not cached. Private REST/Gemini keys stay in ignored server variables/Worker secrets. No prompt, precise GPS, audio or credentials are written to production application logs. No database or long-term conversation store.

| Native rate binding    | Default per minute / Cloudflare location |
| ---------------------- | ---------------------------------------: |
| All protected requests |                                       90 |
| Gemini rounds          |                                       20 |
| Places operations      |                                       45 |
| Routes operations      |                                       24 |
| Diagnostics            |                                        5 |

Prototype requests share a rate identity; future verified users get hashed identities plus a shared provider ceiling. These [Cloudflare rate bindings](https://developers.cloudflare.com/workers/runtime-apis/bindings/rate-limit/) are per location and eventually consistent, **not global spend caps**. Set upstream quotas and billing alerts too. Local behavior uses the same bounded defaults and no external auth service.

Cost defaults live in `shared/limits.ts`: five place results/stops, three detour finalists, twelve AI history messages, three model rounds/six tools per turn, one mutation, sixty-second detour TTL and reroute cooldown. Search responses show at most five cards (default three). Tune lower values there and rebuild; the DetourService/RouteDeviationMonitor constructors also accept lower/test overrides. Worker `MAX_PLACE_RESULTS`, `MAX_STOPS`, `MAX_AI_HISTORY_MESSAGES` may lower incoming budgets; match client constants or excessive client requests will fail safely. Rate amounts live in `server/wrangler.jsonc`. Regenerate types after config changes:

```sh
npm run types --workspace server
```

## Deploy Worker manually

This requires your Cloudflare account and secrets; it was not deployed during implementation.

```sh
npm exec --workspace server -- wrangler login
npm exec --workspace server -- wrangler secret put GEMINI_API_KEY
npm exec --workspace server -- wrangler secret put GOOGLE_MAPS_API_KEY
npm exec --workspace server -- wrangler secret put ROAM_ACCESS_TOKEN
npm run deploy --workspace server
```

Enter keys interactively. Set the phone's URL to the resulting HTTPS endpoint; restart Expo. Adjust `ALLOWED_ORIGINS` for browser testing. Native requests have no browser Origin header. A Cloudflare Worker has no fixed dedicated egress IP by default: use API restrictions on the server key and protected endpoints; don't copy a laptop IP restriction and assume it works on Workers. Native SDK keys need separate application restrictions. Add real auth/global budget controls before a public release.

## Development diagnostics

Open **Profile → Device diagnostics** in a development session. The entry and screen are disabled in production.

- Permission reads don't prompt. Show current GPS coordinate, accuracy, speed, heading, timestamp/freshness and route tracking only on this screen; no GPS history/logs.
- Worker health proves reachability only. Auth check makes no upstream call and reports credentials as **configured/untested**, not “connected.”
- Optional explicit Places and Routes buttons each make **one billable request** using fixed Boston sample data, with no phone location. Gemini reads model metadata without generation; this does not prove inference quota. Provider probes on published hosts require `ENABLE_DEV_DIAGNOSTICS=true`; leave false in production. Five diagnostic requests/minute.
- Separately test microphone/speech permission, start/stop recognition, transcript/confidence when available, available TTS voices/playback/stop. Diagnostic transcription is not sent to Gemini. Background/dismiss cancels work; audio persistence stays disabled.
- Missing backend/native speech, unauthorized, throttled, unavailable and untested states remain distinct. Audio completion callbacks cannot prove that a speaker was audible.

## Validation and remaining work

Credential-free tests use mocked Gemini and Google adapters. All original **64 tests** remain. V0.4 has **93 passing tests** (74 app/service, 19 backend), both TypeScript checks passing, **18/18 Expo Doctor checks**, successful **iOS/web exports**, and a successful **Worker dry-run build**. Local Worker runtime smoke checks returned V0.4 health, authenticated development configuration, honest missing-provider state, and malformed-header 401. `npm ci` succeeded. No automated suite needs live billing credentials. Dependency audit is **44 remaining findings**, down from 45; see the audit document for severity and scope.

```sh
npm run check
npx expo-doctor
npx expo export --platform ios --platform web --max-workers 2
npm run server:build
```

`server:build` is a dry run, not deployment. No lint task is configured. See [architecture](docs/architecture.md), [physical-device checklist](docs/device-checklist.md), [assistant checks](docs/assistant-checklist.md), and [dependency audit](docs/security-audit.md).

No physical iPhone, live Maps/Gemini call, signed EAS build, microphone/TTS audio session or public Worker deployment has been verified. Configure keys/billing, URL/token, native SDK restrictions and signing before those tests. Account auth remains an interface rather than a deployed identity provider. No navigation guidance, stop dwell time, guaranteed timed arrivals or global billing cap is claimed.

V0.2 checkpoint: `5c9ea61a24ed828223a3c0f303a603f8775d06dd`. V0.3: `5ed237739b5669572371572578fd75a90873c4d9`. V0.4 is a separate forward commit; history is retained.
