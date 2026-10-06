# ROAM · V0.2

**Your AI for the road.** An iPhone-first Expo SDK 54 / React Native / TypeScript app with real Google Places and driving routes. V0.2 extends the V0.1 foundation; the assistant remains a clearly labeled demo. This is a route-planning prototype, without turn-by-turn guidance.

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

Legacy Places, Directions, Geocoding, Navigation SDK, and Gemini are not required. API names refer to Google Cloud's API Library. See [Places setup](https://developers.google.com/maps/documentation/places/web-service/cloud-setup), [Routes setup](https://developers.google.com/maps/documentation/routes/cloud-setup), and [Expo SDK 54 maps configuration](https://docs.expo.dev/versions/v54.0.0/sdk/map-view/).

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

Optional `EXPO_PUBLIC_ROAM_API_URL` switches REST requests to a backend **you provide**. No backend is implemented or deployed in V0.2. The adapter calls `POST <base>/google/{autocomplete|details|nearby|text-search|routes}` with the operation body and, where relevant, `placeId` / `sessionToken`; it expects the same JSON shape as the Google endpoint. A future backend must authenticate clients, validate and limit payloads, fix field masks / endpoints server-side, inject the server key, and enforce per-user limits. The prototype does not implement proxy authentication. Leave this variable empty unless that contract is implemented.

With neither REST key nor proxy URL, the app uses labeled fictional fixtures and previews pins, without calling Google or inventing routes. A configured request failure stays an error; it never silently substitutes demo results.

## Running locally

Use Node.js 20.19+ (Node 24 was used during validation).

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
npx expo install expo-dev-client
npx eas-cli login
npx eas-cli build:configure
npx eas-cli device:create
npx eas-cli build --platform ios --profile development
npx expo start --dev-client --clear
```

Ensure the generated `eas.json` development profile includes `"developmentClient": true` and `"distribution": "internal"`. Before building, set the iOS SDK key and set `EXPO_PUBLIC_GOOGLE_IOS_BUNDLE_IDENTIFIER=com.prithvighale.roam`. Supply the same environment variables to the selected EAS build environment; your ignored local `.env` is not a reliable cloud build configuration. Install the resulting build on the registered iPhone, then scan Metro's QR in that app. The EAS fallback adds local dependency/config changes and has not been executed here. On a Mac, `npx expo run:ios --device` is another option after installing `expo-dev-client`.

No simulator runs on Windows. Follow [the device checklist](docs/device-checklist.md) while stationary; do not operate the prototype while driving.

## Route-aware discovery and API usage

Project the driver onto the decoded route, then sample approximately **2 km and 8 km ahead**, clamped to the destination and merged when within 500 m. Search a 2 km circle at each point (maximum ten results per call), deduplicate place IDs, and reject candidates more than 100 m behind or 2 km from the route. Rank mainly by lateral offset, then forward distance, known rating, and known closed status. Show at most twelve results. More than 3 km off route, fall back to nearby search and label it accordingly. This geometric algorithm can misjudge loops, divided roads, exits, rivers, and road access; it does **not** calculate driving detours or guarantee convenience.

Calls happen on explicit interactions: debounced autocomplete (two-character minimum), one Details request on selection, one nearby request without a route or at most two with a route, and one Routes request per destination / stop change or manual retry/refresh. Opening/retrying a sheet snapshots GPS and route; GPS updates alone do not issue Places or Routes calls. Repeated route taps are guarded, requests have 12-second timeouts, and superseded requests are canceled or ignored. Cancellation may still leave a billable server request. There are no automatic retries or persistent Google-result caches. Results exist only in the current in-memory interaction/trip.

Field masks request only the fields the UI uses. Ratings and opening-hours fields can use higher billing tiers; autocomplete session tokens do not make every request free. Check current [Places billing](https://developers.google.com/maps/documentation/places/web-service/usage-and-billing) and [Routes billing](https://developers.google.com/maps/documentation/routes/usage-and-billing) before testing at scale.

## Privacy and attribution

The app requests foreground location only, stops subscriptions in the background, and stores no long-term location history. No analytics, accounts, or tracking libraries were added. Location/bias goes to the configured Google services only for user-requested search/routing; native Google Maps also handles its normal map requests. Logs omit keys, coordinates, raw provider responses, and URLs. Theme preference is stored locally; trips and conversation are in memory.

Google geometry and place markers are displayed only on a Google basemap. Google Maps attribution is shown with non-map results, with supplied third-party attributions. Before public distribution, add public Terms of Use and Privacy Policy and review [Places policies](https://developers.google.com/maps/documentation/places/web-service/policies) and [Routes policies](https://developers.google.com/maps/documentation/routes/policies). V0.2 does not add public legal pages or persistent Google data storage.

## Checks

Validation on Windows: TypeScript passed, 34 tests passed, Expo Doctor passed 18/18 checks, and iOS/web bundle exports succeeded. Live APIs and physical-device checks remain pending.

```sh
npm run check
npx expo-doctor
npx expo export --platform ios --platform web --max-workers 2
```

Tests cover the existing GPS / demo behavior plus formatting, malformed polylines, Google normalization / request contracts / errors, route-aware ranking, and trip lifecycle / stops / cancellation races. They use injected responses, not a real key. Windows bundle exports cannot prove device rendering, native SDK key validity, billing, Google coverage, or physical GPS behavior. No real Google credentials or physical iPhone were available for this milestone. SDK 54's dependency tree retains the baseline npm audit findings; no forced framework upgrade was made.

## Limitations and V0.3

- Assistant and microphone interaction remain simulated; text-to-speech still works. No Gemini, speech recognition, wake word, live weather, accounts, background navigation, CarPlay, or Navigation SDK.
- Start Trip is state management and a HUD, not turn-by-turn navigation. Google traffic-aware duration is a snapshot at calculation. Remaining distance/time is explicitly labeled as a local geometric estimate; GPS updates do not refresh traffic. Off-route recovery requires Refresh route.
- Stops retain insertion order, maximum five; there is no optimization, automatic arrival, or automatic removal of completed stops. Remove a completed stop before refreshing so it is not routed again.
- Nearby distances and route offsets are geometric estimates, never presented as driving-detour times. Ratings/hours/restroom availability may be absent; public bathroom access is not guaranteed.
- No offline routing or persisted trip history. Google native support, attribution placement, small-screen/large-text layout, and real API errors still need device QA.

For V0.3, first add an authenticated, rate-limited backend and secure Google credentials. Then connect Gemini to the existing typed search/trip tools, preserving verified service data as the source of map/place facts and requiring explicit UI action for trip changes. Add physical-device regression coverage before expanding navigation features.

See [architecture](docs/architecture.md) for service boundaries. V0.2 remains uncommitted; V0.1 `7467212` is preserved on `main` pending an explicit commit instruction.
