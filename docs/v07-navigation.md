# ROAM V0.7 navigation

V0.7 implements the native navigation bridge and custom ROAM guidance interface. **It does not enable Google Navigation for this personal project.** The owner selected personal use and requested that the integration stay disabled. Both EAS profiles set `ROAM_ENABLE_NAVIGATION=false`; the config plugin also defaults to false.

Google's [Navigation SDK policy](https://developers.google.com/maps/documentation/navigation/ios-sdk/policies) limits this SDK to commercial applications. Leave the flag disabled while ROAM is a personal project. There are no terms prompts, navigation requests, or navigation sessions when it is disabled. A separate Maps SDK key can still power the planning map. The existing Worker Places/Routes, GPS progress, conservative rerouting, stops, assistant, text, and supported voice functions remain available.

## Architecture and files

```text
Google Navigation SDK 11.2.0
  NavigationCoordinator.swift (session / route / snapped location)
  GuidanceAdapter.swift (verified feed -> ROAM fields)
  RoamNavigationModule.swift (Expo methods / one typed event channel)
  NavigationController.ts (validation / ordering / lifecycle)
  RoamProvider + existing TripController
  ManeuverRail / ROAM map / existing VoiceController
```

`modules/roam-navigation/ios/` holds the Swift files, native map view, and local podspec. `modules/roam-navigation/src/` holds the optional module loader and runtime-validated event types. Supporting app code is grouped under `src/`; Expo Router's `app/` folder stays at the root. Shared app/Worker imports and all tests were updated for the move.

## SDK version and installation

The integration uses **Google Navigation 11.2.0 and Google Maps 11.2.0**, the current releases checked on October 7, 2026. See [Navigation release notes](https://developers.google.com/maps/documentation/navigation/ios-sdk/release-notes), the official [Navigation package manifest](https://github.com/googlemaps/ios-navigation-sdk/blob/11.2.0/Package.swift), and [Maps package manifest](https://github.com/googlemaps/ios-maps-sdk/blob/11.2.0/Package.swift).

Google's current distribution uses Swift Package Manager. Expo's local module is linked through CocoaPods, so this integration packages the **same official binary XCFrameworks** and versioned resource bundles into the local pod. `scripts/prepare-navigation-sdk.mjs` downloads and verifies SHA-256 checksums for both binaries and resource archives on macOS. It reproduces the official manifest's framework/library links and copies the original resource bundles unchanged. Downloads go into ignored folders and are never committed.

This is the SDK's binary distribution linked through a local Expo pod, **not a Google CocoaPods 11.2 release or an SPM project integration**. It avoids `react-native-maps`' GoogleMaps 9.4.0 pin. The iOS app uses the local Google map view; `react-native-maps` remains for older builds and Android. Android's key/plugin is preserved. No node_modules or generated Xcode project patches are needed.

The EAS **pre-install** hook prepares SDKs before prebuild and `pod install`. Expo's [post-install hook runs after iOS pods](https://docs.expo.dev/build-reference/npm-hooks/), so it would be too late. For local macOS prebuild, run `npm run native:prepare` first. The helper skips Windows and Android EAS builds. Current Google [requirements](https://developers.google.com/maps/documentation/navigation/ios-sdk/setup-overview) include Xcode 26+, with iOS 16 minimum; ROAM/Expo use iOS 16.4+.

**This binary/pod integration and Swift code still need a real macOS/EAS compilation.** Header inspection, configuration checks, autolinking, and JavaScript export are not equivalent to compiling Swift, resolving CocoaPods, or signing an app.

## Native APIs and feed

The implementation uses the official [custom-navigation session approach](https://developers.google.com/maps/documentation/navigation/ios-sdk/create-customized-guidance): `GMSNavigationServices.createNavigationSession`, `GMSNavigationSession.navigator`, `GMSNavigator.setDestinations`, `GMSNavigatorListener.didUpdateNavInfo`, route-change and waypoint-arrival listeners, `routeLegs[].path`, and `GMSRoadSnappedLocationProvider`.

`GuidanceAdapter` reads `GMSNavigationNavInfo` and `GMSNavigationStepInfo`: normalized maneuver, full instruction, upcoming road, step number, remaining maneuver distance, remaining final distance/time, second maneuver, supplied exit number, and supplied roundabout exit count. SDK enum values are isolated in Swift. JavaScript uses ROAM names such as `left`, `exitRight`, `uTurn`, and `roundabout`. Icons are original line geometry, not provider assets.

**Upcoming road is not current road.** The selected location/feed API does not expose a reliable current-road name. ROAM answers that it is unavailable rather than treating the upcoming road as the road currently being traveled. Separate current-road event support exists for a future verified source. Lane guidance is exposed by the SDK, but its UI and lane adapter are deferred in V0.7. No lane, speed-limit, traffic-delay, or sign data is invented. Full supplied instructions may already contain lane/sign information.

## Bridge contract

Methods: `availability`, `start`, `update`, `continueTrip`, `stop`, `simulate`, `licenses`.

All events use `onNavigationEvent` and include a session ID, increasing sequence, timestamp, and normalized kind. Kinds are `started`, `stopped`, `guidance`, `rerouting`, `route`, `location`, `road`, `waypoint`, `arrival`, and `error`. The current SDK adapter emits all relevant implemented kinds; `road` and `error` are reserved for future verified callback sources. Route/start failures return false through the promise and become safe UI/fallback state. Maneuver, progress, and next-road changes are carried together in the guidance event, not separate unsynchronized messages.

Zod validates the native payload. Old sessions and non-increasing sequence numbers are ignored. Guidance is retained during rerouting until a replacement arrives. The event log contains only the latest 80 timestamp/kind labels; it never stores GPS samples or road history.

## Start, route changes, stops, arrival

Start checks availability, uses Google's terms dialog if eligible/enabled, stages the waypoint route, accepts it, then starts native guidance and Driving Mode. Stops remain ordered and visited stops are excluded. Failed availability, declined terms, missing native module, or failed initialization falls back to V0.6 behavior. The development-only availability message is in diagnostics, not a repeated popup.

Native guidance is authoritative for route changes, timing, and arrivals. The old geometric tracker is suppressed while native navigation is active; raw foreground GPS remains available for speed, diagnostics, and fallback. The map receives native snapped fixes and draws the native route legs. It does not draw the Worker route while the native session is active.

Add/remove/refresh first calculate the proposed Worker plan, then wait for native route acceptance, and only then commit the trip UI. A separate candidate native session stages the new route while the existing session remains active. Failure or a 30-second SDK route timeout releases the candidate and keeps the old session. Successful acceptance swaps sessions and releases the old one. Cancel/end invalidates pending callbacks and releases both sessions. Cancellation before SDK submission prevents changes; once the native acceptance succeeds, the accepted plan is committed even if an assistant request was canceled during submission. This avoids leaving the phone and trip UI on different plans.

At an intermediate stop, guidance pauses. **Continue Trip** and **Mark Complete** both advance to the accepted remaining plan and mark the reached stop visited; a failed advancement leaves the stop arrival intact. The SDK's deprecated no-callback advancement API is not used. Final arrival removes guidance, navigation listeners, and native speech; Driving Mode exits and the destination/route summary remains until Done. Arrival clears live maneuver/current-road/snapped-position state. End trip restores planning and clears the recoverable plan.

## Camera and UI

FOLLOW tracks the native fix; OVERVIEW fits the accepted route; a gesture enters FREE and stays there until recenter. A route update preserves FREE. The native camera uses a restrained 25-degree tilt above 8 m/s, otherwise top-down, without fake interpolated fixes. The marker is an original geometric vehicle pointer. The fallback map uses a top-down camera. The Maneuver Rail prioritizes distance and upcoming road/instruction, with a quieter second maneuver. Feet are used below a quarter mile and miles above that. After 15 seconds without a new guidance update, the rail shows Waiting for guidance and stops presenting a live distance countdown.

The native map is a plain `GMSMapView` with custom route and marker, not Google's standard maneuver header/footer. Insets move map attribution into the space between measured ROAM overlays; Google's attribution/resources remain unchanged. The rail uses `Google Maps` attribution and Profile links the SDK's original open-source license text. Original Pulse, journey rail, themes, typography, and touch controls remain.

## Speech and assistant

Google SDK speech is set to **silent**, including staged sessions. ROAM's existing VoiceController and native TTS port are the sole speech authority. `GuidanceSpeech` produces one prompt per step/distance band (within 1,000m, 300m, and 60m), with the close prompt carrying critical priority. It drops stale/rerouting/arrived-stop prompts instead of queuing obsolete directions.

Speech priority order: critical navigation, navigation, assistant confirmation, assistant, status. Guidance interrupts assistant speech and cancels stale assistant processing through the same audio coordinator. Lower-priority speech cannot interrupt active navigation speech. PTT can deliberately interrupt playback; wake detection resumes after playback. Diagnostics' exclusive audio lease still silences coordinated audio while isolated microphone checks run. Navigation sessions continue through assistant requests; there is no second speech engine.

An explicit local command layer answers repeat direction, next turn, distance to turn, destination, and current road availability. Recenter and stop speaking are local commands. Existing AI tools handle cancel navigation and finding gas/stops with the established confirmation rules. Flexible phrasing still goes to Gemini; this is intentionally a small command list. The backend receives only a validated compact live guidance summary, without native route geometry or snapped coordinates. No navigation feed is persisted. Session-only data is not written into the saved recovery plan.

## Configuration and development build

**For the current personal project, leave navigation disabled.** Continue using the existing Maps/Places/Routes settings and voice build setup in [the V0.6 checklist](v06-iphone-checklist.md).

Only if ROAM later becomes eligible for commercial Navigation SDK use, review Google's policy/project requirements first. The owner must arrange billing/access, enable Navigation SDK for iOS and Maps SDK for iOS, and create a separate native key restricted to iOS bundle `com.prithvighale.roam` and those SDKs. Google's original terms/driver disclaimer is presented by `showTermsAndConditionsDialogIfNeeded(with: GMSNavigationTermsAndConditionsOptions(companyName: "ROAM"))`; acceptance is managed by Google. Nothing rewrites, hides, or pre-accepts it. Do not enable the flag to bypass eligibility. No Google Cloud/account changes were performed in this task.

The native key is supplied as `EXPO_PUBLIC_GOOGLE_MAPS_IOS_KEY`, copied into the generated Info.plist, and extractable from the binary by design; app/API restrictions are necessary. Server REST/Gemini keys stay in Worker secrets or ignored `server/.dev.vars`. Picovoice stays device-only. No credentials, signing files, downloaded SDK binaries, or provisioning profiles belong in Git.

For a new development build with the current disabled setting:

```sh
npx eas-cli build --platform ios --profile development
npx expo start --dev-client --clear
```

Supply the selected EAS development environment's native Maps key/backend URL and arrange Apple signing/device registration. Every native source, SDK, compiled key, or permission change requires rebuilding; a Metro reload is insufficient. Windows cannot run local Xcode/prebuild iOS compilation. Expo Go, web, and Android use the non-native fallback.

## Simulation and verification

In a future eligible/enabled development build, Diagnostics can start/stop the SDK's `simulateLocationsAlongExistingRoute`/`stopSimulation`. Both JavaScript and Swift restrict simulation to development builds. Select and start a real route first; simulation follows that accepted route rather than an invented trace. This has not been run on a native simulator or device here.

See [the V0.7 device checklist](v07-iphone-checklist.md) for 5-10 maneuvers, highway/local roads, a waypoint, rerouting, arrival, voice, poor GPS, camera, safe areas, themes, and attribution. The checklist remains pending, not a claim of passing hardware checks.

Automated coverage adds **37 tests**: 33 navigation/contract/context behaviors and 4 audio behaviors, for **190 total** (171 app/services + 19 backend). All previous 153 remain. Tests mock native interfaces and require no Google key. They cover availability/disablement, terms decline/init failure, normalization/units, event order/session guards, progress/location, rerouting retention, stops/arrival, transactional failure/commit, camera modes, local commands, speech priority/deduplication, cleanup/log bounds, and compact context validation.

Recorded checks on Windows:

| Check | Result |
| --- | --- |
| App and backend TypeScript | Passed |
| App/service tests | 171 passed |
| Backend tests | 19 passed |
| Expo Doctor | 21/21 passed |
| iOS prebuild/config introspection | Passed |
| Expo local-module autolinking | RoamNavigation pod and Swift class resolved |
| iOS, Android, web JavaScript exports | Passed |
| Worker build | Dry-run bundle passed; no deployment |
| Official SDK binary checksums | Both matched 11.2.0 manifests |
| Native iOS project prebuild | Windows platform limitation; use macOS/EAS |
| Swift/CocoaPods/signing/EAS compilation | Not performed |
| SDK simulation / physical iPhone | Not performed |

## Remaining work

Swift/CocoaPods linking, actual SDK map rendering, audio timing, dual-session route staging, simulation, terms presentation, and physical iPhone behavior require native verification. Current-road names, lane UI, speed-limit UI, traffic detail/alternatives, background navigation, CarPlay, and 3D cities are not implemented. ROAM remains a prototype, with native navigation disabled for personal use. Existing npm audit findings were not force-upgraded during this milestone.

Recommended V0.8: choose a navigation engine whose terms fit the intended personal use, then compile and validate that engine on iPhone before expanding features. If commercial eligibility changes later, validate this Google bridge and its candidate-session route swaps first.
