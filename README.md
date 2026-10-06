# ROAM · V0.3

**Your AI for the road.** An iPhone-first Expo SDK 54 / React Native / TypeScript app with real Google Places, driving routes, and a Gemini assistant through a Cloudflare Worker. This remains a route-planning prototype without turn-by-turn guidance. V0.1 and V0.2 functionality is retained.

## V0.3: Gemini driving assistant

The backend uses **`@google/genai` 2.27.0** and **`gemini-3.8-flash`**, with low thinking and bounded output. This exact stable model is listed in [Google's current model documentation](https://ai.google.dev/gemini-api/docs/models/gemini-3.8-flash); no model substitution was necessary. Availability and quotas still depend on your project. No live Gemini or Maps keys were available during implementation.

The phone sends a user message, at most twelve short history messages, and compact trip/result references to the Worker. Gemini chooses registered functions. The phone validates every call, invokes the **same V0.2 Places/Routes adapters and shared trip controller**, and sends compact verified receipts back for the next Gemini round. The Worker preserves signed, two-minute continuation state including original model parts/thought signatures; it stores no session in a database. Gemini secrets never enter the phone bundle.

Tools: `searchFood`, `searchGas`, `searchRestrooms`, `searchCoffee`, `searchParking`, `searchPlaces`, `getTripStatus`, `addTripStop`, `removeTripStop`, and `cancelTrip`. Query qualifiers and known rating filters are supported. Parking defaults to the active destination. Brand/burger queries reuse Text Search at the same bounded route-ahead samples. No second Places or Routes provider was created.

Gemini's final output is a **validated response plan**, rather than unrestricted factual prose. ROAM renders place names, ratings, distances, and trip acknowledgments directly from verified service data and successful receipts. It can choose an existing recommendation ID but cannot supply fictional businesses/numbers to the UI. Unsupported/free-form/malformed factual answers are rejected or replaced with a safe, concise explanation. This intentionally constrains wording while keeping natural-language intent and tool selection in Gemini.

Recent result IDs/order and pending acceptance live on the phone for ten minutes. “Add the second one” uses the displayed order, even if Gemini picks a different ID. A recommendation needs acceptance; explicit named/numbered add, remove, or cancel commands can execute. Ambiguous stop removal needs a name/number. Only one trip mutation is attempted per message. Assistant stop changes are transactional: failed recalculation restores the previous plan and route. Cancel/new-destination races cannot revive an older route. A successful receipt remains authoritative if the final Gemini request fails.

### Local setup: two terminals

```sh
npm ci
```

1. Get a **Gemini API key** from [Google AI Studio](https://aistudio.google.com/apikey). Confirm your project can use `gemini-3.8-flash` and review [pricing/quota](https://ai.google.dev/gemini-api/docs/pricing). Do not assume unlimited free usage.
2. Enable **Places API (New)** and **Routes API** with billing on the Maps project. Create a server REST key restricted to those APIs. Cloudflare Workers do not provide a fixed dedicated egress IP by default; do not copy an IP restriction for your laptop into a deployed Worker key. Keep this key secret and protect the Worker. The native iOS map uses a separate app-restricted **Maps SDK for iOS** key.
3. Copy `server/.dev.vars.example` to `server/.dev.vars` and fill the server secrets:

```env
GEMINI_API_KEY=your_gemini_secret
GOOGLE_MAPS_API_KEY=your_maps_rest_secret
# Optional on a trusted local network; required for a published Worker:
ROAM_ACCESS_TOKEN=your_prototype_access_token
```

4. Copy `.env.example` to `.env` at the root. For an iPhone on the same Wi-Fi, use your computer's **LAN IPv4 address**, not `localhost`:

```env
EXPO_PUBLIC_ROAM_API_URL=http://192.168.1.10:8787
EXPO_PUBLIC_ROAM_ACCESS_TOKEN=the_same_prototype_access_token
EXPO_PUBLIC_GOOGLE_MAPS_IOS_KEY=your_app_restricted_ios_map_key
EXPO_PUBLIC_GOOGLE_IOS_BUNDLE_IDENTIFIER=host.exp.Exponent
```

Use the actual LAN address from `ipconfig`; for a browser on the computer use `http://localhost:8787`. Clear `EXPO_PUBLIC_GOOGLE_MAPS_API_KEY` when using the proxy. Set the bundle identifier variable to `com.prithvighale.roam` for a ROAM native development build. The iOS SDK key is intentionally public and must be app/API restricted. **Never create `EXPO_PUBLIC_GEMINI_API_KEY`.** Public prototype access tokens are extractable too; they are a basic private-testing gate, not user authentication.

Terminal 1:

```sh
npm run server
```

Terminal 2:

```sh
npx expo start --go --clear
```

The Worker listens on port 8787 / all LAN interfaces for phone testing. Allow this port through the local firewall only on a trusted private network. `/health` is a non-secret readiness endpoint; it does not validate upstream keys. Local HTTP can be unsuitable for native transport policies: if the phone blocks it, use a HTTPS development endpoint/tunnel rather than weakening release transport security. No backend is deployed by this repository setup alone.

### Worker deployment (manual, requires your Cloudflare account)

From the repository root:

```sh
npm exec --workspace server -- wrangler login
npm exec --workspace server -- wrangler secret put GEMINI_API_KEY
npm exec --workspace server -- wrangler secret put GOOGLE_MAPS_API_KEY
npm exec --workspace server -- wrangler secret put ROAM_ACCESS_TOKEN
npm run deploy --workspace server
```

Enter values at the interactive prompts; never paste them into committed configuration or shell command arguments. Then set `EXPO_PUBLIC_ROAM_API_URL` to your HTTPS Worker URL and restart Expo. Configure `ALLOWED_ORIGINS` in `server/wrangler.jsonc` for any browser origin you use and regenerate types after config changes. Native requests have no browser Origin header. Published requests fail closed without the prototype access token. Add per-user authentication / stronger abuse controls before public distribution.

The Worker validates schemas and 128 KiB request bodies, rejects arbitrary Google operations/endpoints/field masks, fixes Google field masks server-side, bounds query/result/stop sizes, and sanitizes errors. Cloudflare rate bindings allow 90 protected requests/minute and 20 Gemini rounds/minute per Cloudflare location for the prototype as a whole; these are not a global spending ceiling or per-user quotas. At most three Gemini calls and six local tools are allowed per message; only two rounds can request tools. No automatic retries or long-term conversation/location storage are added. Logs omit prompts, keys and precise location.

### Push-to-talk and read-aloud

`expo-speech-recognition` **3.1.3** is pinned to the maintainer's [SDK 54 release](https://github.com/jamsch/expo-speech-recognition#installation). Actual iPhone push-to-talk requires a **development build**, microphone permission, and speech-recognition permission. Expo Go cannot add this native module. Optional native-module lookup leaves Expo Go/web text input and `expo-speech` read-aloud intact; tapping an unavailable microphone shows an explanation, not a fake listening session.

Tap the microphone, speak, then tap again to finish (or let the recognizer finish). Capture is bounded to twenty seconds, foreground only, and audio-file persistence is disabled. The OS speech service may process audio remotely depending on iOS, locale and device support. Recognizer/network/permission failures retain text fallback. Backgrounding or dismissing the assistant aborts recognition and pending AI work. No wake word or always-listening microphone is added.

Concise replies speak automatically for voice requests or a started trip when “Voice replies” is on. Lists stay on screen as verified cards. The microphone/Stop interrupts speech, and generation guards prevent overlapping or late speech. Actual microphone/TTS audio-session behavior still needs physical-device testing.

`expo-dev-client`, the speech config plugin, and `eas.json` development profile are included. On Windows, register your iPhone and make an EAS development build using the commands in the iPhone section below. Supply the public native build variables through the selected EAS environment; Metro cannot add native permissions/modules or change native SDK keys.

### Gemini testing

See [the V0.3 manual checklist](docs/assistant-checklist.md). With a real destination ready, type “I’m hungry,” “Find me a burger,” “Find Chick-fil-A ahead,” “Add the second one,” “What’s my ETA?”, “Actually remove that stop,” “I need gas,” “I need to pee,” and “Find parking near my destination.” Confirm actual Google cards, route changes, and short grounded answers. Unsupported weather/traffic/prices/timed stops must get an honest limitation. Invalid keys / offline backend must leave the existing route intact.

Automated suites use **mock Gemini and injected Google responses**; they never depend on paid/live calls. `npm run check` runs phone/service TypeScript and tests plus server TypeScript and tests. `npm run server:build` is a Worker **dry run**, not a deployment. No lint task exists in this repository.

## V0.2 implemented features

- Real destination autocomplete, session tokens, selected-place details, and 350 ms search debounce.
- Google driving routes with decoded polylines, camera fitting, final-destination and numbered stop markers, driving duration, arrival estimate, and distance in US units.
- Shared trip state; Start Trip, End / Cancel, explicit Refresh / Retry, and up to five ordered stops. Adding or removing a stop clears old route information immediately and recalculates from the latest fresh GPS fix.
- Food, Gas, Restroom, Coffee, and Parking results near the driver or sampled ahead on the route. Available ratings, addresses, hours, and provider attributions come from Google. Missing fields stay absent.
- GPS speed in MPH, foreground-only location, recentering, retained dark/light themes, four tabs, assistant sheets, and read-aloud responses.
- Loading, no-results, denied-location, timeout, configuration, quota, and network errors. Stale requests cannot restore canceled searches or routes. Missing configuration opens an explicit fictional demo instead of crashing.

## Google Cloud setup

Create a Google Cloud project, attach billing, and enable:

| API                      | Purpose                                                                          |
| ------------------------ | -------------------------------------------------------------------------------- |
| **Places API (New)**     | Autocomplete, Details, Nearby Search; reusable Text Search adapter               |
| **Routes API**           | `computeRoutes`, driving duration/distance, geometry, ordered intermediate stops |
| **Maps SDK for iOS**     | Native Google basemap in an iOS development / standalone build                   |
| **Maps SDK for Android** | Only if building/testing Android                                                 |

The Maps features do not require Legacy Places, Directions, Geocoding, or Navigation SDK. Gemini setup is separate, described above. API names refer to Google Cloud's API Library. See [Places setup](https://developers.google.com/maps/documentation/places/web-service/cloud-setup), [Routes setup](https://developers.google.com/maps/documentation/routes/cloud-setup), and [Expo SDK 54 maps configuration](https://docs.expo.dev/versions/v54.0.0/sdk/map-view/).

Create a REST key for Places and Routes. Apply API restrictions to those two APIs, configure request quotas, and set billing alerts (alerts alone do not cap spending). Create a separate iOS native map key restricted to **Maps SDK for iOS** and the bundle identifier `com.prithvighale.roam`. Android should have its own SDK key restricted to the package and signing certificate. Native key configuration requires rebuilding the app; Metro reloads cannot change native keys.

**Public client keys are extractable.** Direct REST calls are provided for local prototype testing. The client sends `X-Ios-Bundle-Identifier`, defaulting to Expo Go's `host.exp.Exponent`. Test iOS application restrictions for each REST API, including confirming an incorrect identifier is rejected; do not assume a header protects both services. If restrictions prevent Routes requests, use an authenticated backend with a server key restricted by IP and API. Browser referrer restrictions do not protect native REST requests. Expo Go's shared identifier is not a production app restriction. Do not publish with an unrestricted REST key. Google recommends a secure proxy where direct mobile web-service restrictions are insufficient: [API security guidance](https://developers.google.com/maps/api-security-best-practices).

## Environment variables

Copy `.env.example` to `.env` in this directory. `.env` is ignored by Git.

```env
# Minimum for direct, real Places + Routes requests:
EXPO_PUBLIC_GOOGLE_MAPS_API_KEY=your_places_and_routes_key

# Recommended for a native iOS build:
EXPO_PUBLIC_GOOGLE_MAPS_IOS_KEY=your_ios_sdk_key

# Expo Go; change to com.prithvighale.roam for a ROAM native build:
EXPO_PUBLIC_GOOGLE_IOS_BUNDLE_IDENTIFIER=host.exp.Exponent
```

Optional `EXPO_PUBLIC_GOOGLE_MAPS_ANDROID_KEY` supplies the Android SDK key. Native map keys fall back to `EXPO_PUBLIC_GOOGLE_MAPS_API_KEY` if omitted; a fallback key must also allow the applicable Maps SDK. Separate restricted keys are recommended. Every `EXPO_PUBLIC_*` value is visible in the bundle; never place Gemini or other private server credentials there.

`EXPO_PUBLIC_ROAM_API_URL` switches both AI and REST requests to the **implemented V0.3 Worker**. Its Google contract is `POST <base>/google/{autocomplete|details|nearby|text-search|routes}` with operation-specific validated bodies and optional `placeId` / `sessionToken`; it returns the existing Google JSON shape. `EXPO_PUBLIC_ROAM_ACCESS_TOKEN` supplies the optional local / required published prototype bearer token. Prefer this proxy over shipping a direct REST key.

With neither REST key nor proxy URL, the app uses labeled fictional fixtures and previews pins, without calling Google or inventing routes. A configured request failure stays an error; it never silently substitutes demo results.

## Running locally

Use Node.js 22+ for the full app and Worker setup (Node 24.11.1 was used during validation).

```sh
npm ci
npm start
```

After editing `.env`, restart with `npx expo start --clear`. `npm run web` provides UI review; it does not implement a Google web map. Configured mode uses a plain preview background, while unconfigured mode retains the original illustrative demo.

## iPhone testing

1. Install an **Expo Go version compatible with SDK 54**. Compatibility changes over time; check [Expo's version guidance](https://docs.expo.dev/troubleshooting/expo-go-version-mismatch/).
2. Put the iPhone and computer on the same Wi-Fi. Run `npm start`, scan the terminal QR with iPhone Camera, and open in Expo Go. Allow Node through the local firewall if needed. If LAN discovery fails, try `npx expo start --tunnel`.
3. Grant location **while using the app**. Without a Google key, check the existing Apple Maps / GPS / demo flow first.
4. Add the REST key and restart Metro. Search a city, address, or business; select a result to calculate the route. Test the five actions, Add as stop, stop removal in Trips, Start Trip, and Cancel.
5. If your Expo Go build has no native Google provider, ROAM displays a setup message. Places and route summaries can still load, but map geometry requires a Google-enabled development build. Setting an SDK key in `.env` cannot add native support to an installed Expo Go binary.

On Windows, use an EAS cloud iOS development build for that fallback (Apple development signing and device registration are required):

```sh
npx eas-cli login
npx eas-cli build:configure
npx eas-cli device:create
npx eas-cli build --platform ios --profile development
npx expo start --dev-client --clear
```

The included `eas.json` development profile sets `"developmentClient": true` and `"distribution": "internal"`. Before building, set the iOS SDK key and set `EXPO_PUBLIC_GOOGLE_IOS_BUNDLE_IDENTIFIER=com.prithvighale.roam`. Supply the public variables to the selected EAS build environment; your ignored local `.env` is not a reliable cloud build configuration. Install the resulting build on the registered iPhone, then scan Metro's QR in that app. EAS/device builds have not been executed here. On a Mac, `npx expo run:ios --device` is another option; the required `expo-dev-client` is included.

No simulator runs on Windows. Follow [the device checklist](docs/device-checklist.md) while stationary; do not operate the prototype while driving.

## Route-aware discovery and API usage

Project the driver onto the decoded route, then sample approximately **2 km and 8 km ahead**, clamped to the destination and merged when within 500 m. Search a 2 km circle at each point (maximum ten results per call), deduplicate place IDs, and reject candidates more than 100 m behind or 2 km from the route. Rank mainly by lateral offset, then forward distance, known rating, and known closed status. Show at most twelve results. More than 3 km off route, fall back to nearby search and label it accordingly. This geometric algorithm can misjudge loops, divided roads, exits, rivers, and road access; it does **not** calculate driving detours or guarantee convenience.

Calls happen on explicit interactions: debounced autocomplete (two-character minimum), one Details request on selection, one nearby request without a route or at most two with a route, and one Routes request per destination / stop change or manual retry/refresh. Opening/retrying a sheet snapshots GPS and route; GPS updates alone do not issue Places or Routes calls. Repeated route taps are guarded, requests have 12-second timeouts, and superseded requests are canceled or ignored. Cancellation may still leave a billable server request. There are no automatic retries or persistent Google-result caches. Results exist only in the current in-memory interaction/trip.

Field masks request only the fields the UI uses. Ratings and opening-hours fields can use higher billing tiers; autocomplete session tokens do not make every request free. Check current [Places billing](https://developers.google.com/maps/documentation/places/web-service/usage-and-billing) and [Routes billing](https://developers.google.com/maps/documentation/routes/usage-and-billing) before testing at scale.

## Privacy and attribution

The app requests foreground location only, stops subscriptions in the background, and stores no long-term location history. No analytics, accounts, or tracking libraries were added. Location/bias goes to the configured Google services only for user-requested search/routing; native Google Maps also handles its normal map requests. Logs omit keys, coordinates, raw provider responses, and URLs. Theme preference is stored locally; trips and conversation are in memory.

Google geometry and place markers are displayed only on a Google basemap. Google Maps attribution is shown with non-map results, with supplied third-party attributions. Before public distribution, add public Terms of Use and Privacy Policy and review [Places policies](https://developers.google.com/maps/documentation/places/web-service/policies) and [Routes policies](https://developers.google.com/maps/documentation/routes/policies). V0.2 does not add public legal pages or persistent Google data storage.

## Checks

V0.3 validation: **64 tests passed** (53 app/service, 11 server), both TypeScript checks passed, Expo Doctor passed 18/18, iOS/web exports succeeded, Worker dry-run build succeeded, and local `/health` / missing-key error responses were smoke-tested. `npm ci` succeeded. No physical iPhone or live provider calls were tested.

V0.2 checkpoint validation on Windows: TypeScript passed, 34 tests passed, Expo Doctor passed 18/18 checks, and iOS/web bundle exports succeeded. V0.3 checks also include the Worker and assistant suites. Live APIs and physical-device checks remain pending.

```sh
npm run check
npx expo-doctor
npx expo export --platform ios --platform web --max-workers 2
```

Tests cover GPS/demo behavior, formatting, malformed polylines, Google contracts/errors, route ranking, trip lifecycle/cancellation, and V0.3 tool/reference/consent/security flows. They use injected responses, not a real key. Windows exports cannot prove device rendering, native key validity, billing, provider coverage, or physical GPS. No live credentials or physical iPhone were available. `npm audit` currently reports 45 upstream findings (19 moderate, 26 high), including SDK 54 dependencies and Worker development tooling's image library. The attempted tooling patch override did not resolve that workspace dependency and was removed; these advisories remain. The server bundle does not import that image library. No forced Expo upgrade was made.

## Limitations and V0.4

- Without a backend URL the assistant remains a labeled demo; configured Gemini requires server secrets and connectivity. Actual speech input needs a development build. No wake word, live weather/traffic/police reports, fuel prices, accounts, background navigation, CarPlay, or Navigation SDK.
- Start Trip is state management and a HUD, not turn-by-turn navigation. Google traffic-aware duration is a snapshot at calculation. Remaining distance/time is explicitly labeled as a local geometric estimate; GPS updates do not refresh traffic. Off-route recovery requires Refresh route.
- Stops retain insertion order, maximum five; there is no optimization, automatic arrival, or automatic removal of completed stops. Remove a completed stop before refreshing so it is not routed again.
- Nearby distances and route offsets are geometric estimates, never presented as driving-detour times. Ratings/hours/restroom availability may be absent; public bathroom access is not guaranteed.
- No offline routing or persisted trip history. Google native support, attribution placement, small-screen/large-text layout, and real API errors still need device QA.

For V0.4, prioritize physical iPhone QA, per-user backend authentication/rate limits, stop-arrival tracking, and measured driving-detour estimates before expanding navigation features. Gemini cannot change route preferences or choose a new destination in V0.3; use the normal map UI for those.

See [architecture](docs/architecture.md) for service boundaries. V0.1 `7467212` is retained; V0.2 was checkpointed as `5c9ea61` before V0.3 changes.
