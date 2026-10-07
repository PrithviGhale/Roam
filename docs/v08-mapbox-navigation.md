# ROAM V0.8: Mapbox navigation

Implementation date: October 7, 2026. Base: clean V0.7 `17dad939389e2c8e53e53df0533921fb52468a7e`.

This milestone adds the native integration and provider-aware routing. Passing TypeScript tests and exports alone do **not** establish a working iPhone navigation build. Native build evidence and device checks are recorded below.

## Selected SDKs and installation

- Navigation Core: **3.32.0**, the latest stable official release when checked (October 2, 2026).
- Maps: **11.32.0**, pinned by Navigation's package manifest.
- Navigation Native: **324.32.0**; Mapbox Common **24.32.0**; Turf **4.0.0**.
- Only the `MapboxNavigationCore` SPM product is explicitly linked. It includes `NavigationMapView` in this release. No `MapboxNavigationUIKit`, stock `NavigationViewController`, Mapbox Search, or second voice engine.
- Local Expo CocoaPod `RoamNavigation` uses React Native 0.86.3's `spm_dependency` hook, with an **exactVersion** requirement. React Native attaches the package to the Pods project during its post-install step. Expo 57 uses precompiled static React/Expo libraries, so ROAM uses static CocoaPods frameworks. `withRoamNavigation` sets that linkage in generated Podfile properties. Core is linked only through the native pod target; Xcode packages its static SPM objects in `RoamNavigation`. It must not also be added to the app target, which duplicates SDK symbols. A separate idempotent Xcode build phase copies the resolved Mapbox Common/CoreMaps/NavigationNative dynamic frameworks into the app and codesigns them for signed builds; static pod linkage alone does not embed those runtime dependencies.
- The root `postinstall` applies a version-guarded compatibility patch to Picovoice Voice Processor 1.2.3's old iOS podspec. It uses React Native's `install_modules_dependencies` helper instead of obsolete direct Folly dependencies, preserving the wake engine. An unexpected upstream podspec fails for review rather than silently changing dependencies.
- Official requirements: Swift 5.9 and Xcode 16 or newer, iOS 14 or newer; ROAM's pod minimum is 16.4 and Expo 57 sets its own generated app minimum. The selected EAS image must also satisfy Expo 57's requirements.

Sources: [release](https://github.com/mapbox/mapbox-navigation-ios/releases/tag/3.32.0), [Navigation package](https://github.com/mapbox/mapbox-navigation-ios/blob/3.32.0/Package.swift), [Maps package](https://github.com/mapbox/mapbox-maps-ios/blob/11.32.0/Package.swift), [React Native SPM implementation](https://github.com/facebook/react-native/blob/v0.86.3/scripts/cocoapods/spm.rb).

## Architecture and route authority

```text
Google Places -> attributed discovery cards/lists
                         |
ROAM trip plan -> ProviderRoutes -> Mapbox native routing
                         |             |
                         |       Navigation SDK v3
                         |             |
                         +--- normalized bridge events
                                       |
                  ROAM state / maneuver rail / assistant / audio
                                       |
                     custom React UI over NavigationMapView
```

`RoamNavigationProvider` is the native contract. `NavigationProviderRegistry` selects one persistent `MapboxRoamProvider`; it never selects Google. `NativeNavigation`, `NavigationController`, and Zod schemas form the JavaScript boundary. Mapbox SDK types stay in Swift.

The full V0.7 Google sources remain under `modules/roam-navigation/ios/providers/google/`. Only the small disabled provider conforming to the neutral protocol is compiled. Google frameworks/resources and the old vendor preparation are excluded from active builds. Even an old enabled Google bridge is rejected by provider selection. The archived preparation script is reference-only.

The configured native provider calculates driving-with-traffic previews through its SDK routing provider and holds a bounded cache of native routes. Start and stop updates pass the cached route ID, retaining the actual SDK route instead of rebuilding it from an unrelated polyline. Unconfigured platforms use Google Routes planning. If a preview falls back to Google, it remains labeled internally as Google and is rendered only by the legacy map; Start Trip displays a route-update notice and calculates a Mapbox route from fresh foreground GPS before entering native guidance; failure retains planning fallback.

Once native guidance starts, Mapbox owns geometry, remaining distance/duration, fraction traveled, distance traveled, leg/step, snapped fix, rerouting, stops, and final arrival. The raw GPS feed remains available for speed and diagnostics. `TripController.nativeAuthority` suppresses the old projection, off-route refresh, and automatic proximity-based stop monitor. SDK route updates also replace the trip's route data when no plan mutation is pending, so subsequent searches use the authoritative geometry.

## Native files

| File                                           | Role                                                                   |
| ---------------------------------------------- | ---------------------------------------------------------------------- |
| `NavigationProvider.swift`                     | Neutral protocol, waypoint records, provider selection                 |
| `RoamNavigationModule.swift`                   | Expo functions, events, view props                                     |
| `providers/mapbox/MapboxRoamProvider.swift`    | Persistent core, routes, progress, lifecycle, transactions, simulation |
| `providers/mapbox/MapboxGuidanceAdapter.swift` | SDK maneuvers and progress to ROAM fields                              |
| `providers/mapbox/MapboxRoamView.swift`        | Embedded map, custom style/puck/route, camera, attribution             |
| `providers/google/`                            | Disabled adapter and retained V0.7 reference                           |

Native progress is coalesced to at most two JavaScript guidance updates per second. The map consumes native publishers directly, avoiding raw GPS bridge traffic. Route changes, voice cues, arrivals, and errors remain immediate. JS diagnostics retain only 80 timestamped event labels in RAM, not a GPS history. Mapbox's own standard billing/telemetry behavior is left intact; the app does not enable copilot or navigation-history recording.

## Stops, rerouting, and arrival

The route plan is current origin, remaining stops in user order, then destination. Up to five stops are allowed. Updating a plan calculates a candidate while the old progress, snapped puck, and timed voice cues continue. Only the brief SDK set-route/acknowledgement window suppresses candidate events. Native replacement waits for the SDK's accepted-route publications. In pinned 3.32.0, the first route publication is optimistic and the second follows native set-route success. ROAM combines that confirmation with session/progress state, including the case where an already-uncertain session suppresses a duplicate state event. The optimistic route publisher alone cannot commit the UI. This version-specific SDK publication contract must be reviewed when upgrading. Calculation failure keeps the existing SDK session untouched; failed SDK acceptance restores the old route. An intermediate arrival during calculation rejects the replacement and preserves the stop pause. A successful native acknowledgement allows the existing trip transaction to commit. Cancelling invalidates late completions.

Mapbox automatically handles off-route rerouting and route refresh. ROAM keeps the old visible route while rerouting and clears the rerouting flag on completion/failure. No second geometric reroute request runs in parallel.

Multileg advancement is manual. SDK intermediate arrival identifies the correct ROAM stop. Continue waits for `NextLegStarted` before marking it visited. Final arrival ends the SDK session, clears live guidance, and preserves the trip summary. Foreground navigation stops location tracking on background and resumes the retained route on return. This release deliberately has no background audio/location capability.

The SDK's set-route acknowledgement, rollback after a low-level native error, waypoint rebasing during rerouting, and background/foreground transitions still need real native simulation and device validation; mocked JS tests cannot prove them.

## Detours and assistant facts

Routes carry `provider: mapbox | google | fallback`. Older fixtures without metadata retain Google compatibility, but both real adapters always label routes. A detour records its provider and `mapbox-routes-comparison` or `google-routes-comparison` source.

The detour service requests a fresh baseline from the current origin and remaining plan, then pins each candidate to that provider. Mixed-provider arithmetic is rejected. Active Mapbox failures stay unverified rather than silently using Google. Signed deltas remain valid: a different route can legitimately be shorter or quicker. The bounded, short-lived comparison cache and previous request budgets remain in place.

Assistant receipts and compact context include provider provenance. While native guidance is active, trip status uses SDK remaining metrics and fraction, not geometric projection. Stale native progress yields unavailable timing. Full polylines and snapped-location history are not sent to Gemini. Nearby discovery still needs a fresh raw GPS fix under the existing privacy/permissions rules.

Local commands include repeat direction, next turn, exit distance, current road, remaining time, arrival time, recenter, overview, and stop speaking. Missing road names or exit data are reported as unavailable, never invented. Gemini remains responsible for discovery and explicit stop transactions, not generating navigation instructions.

## Maneuvers, map, and camera

The existing 16 ROAM maneuvers remain unchanged. The Swift adapter maps Mapbox type/modifier values, uses the upcoming step for the next turn, and supplies exit codes/roundabout exit index only when present. Secondary instruction comes from the following step. Lane arrows/signs are not fabricated.

ROAM Dark and ROAM Light are original sparse Mapbox Streets vector styles with subdued land/water, restrained road labels, no busy POI layer, and warm alloy route emphasis. The original arrow puck, waypoint circles, route casing, and faint traversed route are customized. Traffic informs routing/ETA; rainbow congestion or incident claims are not shown. Theme changes reload the style without recreating the navigation core.

FOLLOW, OVERVIEW, and FREE map to the native navigation camera. Following pitch is restrained to 25 degrees. A manual gesture enters FREE and stays there across progress/reroutes. Explicit recenter returns to FOLLOW. Overlay measurements feed viewport padding. Mapbox's logo and attribution button move above the bottom chrome and remain visible and tappable. [Attribution rules](https://docs.mapbox.com/help/getting-started/attribution/)

Google Places remains the search provider. Google requires Places results plotted on a map to use a Google map, so the Mapbox view does not plot discovery results or use their names as native POI labels. Attributed Google result cards/lists stay in ROAM. Mapbox renders its own calculated navigation geometry and SDK waypoints. [Places display policy](https://developers.google.com/maps/documentation/places/web-service/policies)

## Voice, Hey ROAM, and simulation

Mapbox's `voiceInstructions` publisher supplies instruction text and timing. ROAM's existing `VoiceController` plays it through Expo TTS. The provider never accesses Mapbox's lazy `routeVoiceController`, so there is one speech authority and no duplicate voice. Mapbox sessions bypass the old distance-band scheduler.

Priorities remain critical navigation, navigation, assistant confirmation, assistant, and status. Old SDK instructions are discarded during rerouting, waypoint pauses, or after their short freshness window. Push-to-talk, Hey ROAM, wake/STT/TTS handoffs, audio leases, and interruption handling stay in the V0.6/V0.7 controller. Existing tests verify wake resumes after navigation speech. Hardware audio timing still needs validation.

Diagnostics exposes provider/version, token-configured boolean, initialization, session, route, maneuver, progress, snapped-fix presence, current road, rerouting, waypoint, camera, and recent voice/event labels. Simulation is available only in development and active native sessions. It changes the existing provider's location source to SDK simulation; stopping simulation/trip returns to live location. Release builds ignore simulation. No simulated facts are used in production.

## Credentials and builds

1. Create a Mapbox account, configure billing, and review the selected Navigation pricing plan.
2. Create a public runtime `pk.` token with the needed runtime permissions. Put it in local `.env` as `EXPO_PUBLIC_MAPBOX_ACCESS_TOKEN`, and in EAS's **development** environment with **Sensitive** visibility before building. The plugin writes `MBXAccessToken` to Info.plist. It is inherently extractable from a mobile app; never use a secret `sk.` token here.
3. Stable 3.32.0's official README states that stable Navigation/Core binaries require **no secret download token**. The general installation guide still describes `Downloads:Read` and `.netrc`. If an authenticated download is needed for a future package/account setup, create that secret with only `Downloads:Read` and store `MAPBOX_DOWNLOADS_TOKEN` as an EAS **Secret**, never in public extra or an `EXPO_PUBLIC_` name.
4. The pre-install hook configures an optional secret only in the macOS build machine's `~/.netrc` (permissions 0600), before dependency resolution. It preserves an existing Mapbox machine entry. No token values are logged or committed. Local `.env`, `.netrc`, signing files, and SDK caches are ignored.
5. ROAM is linked to EAS project `@pghale/roam`; its UUID is public project metadata. Device builds use the `development` profile and require Apple signing plus a registered device. `development-simulator` inherits development and needs no Apple device signing. No App Store submission is performed.
6. Run the matching Worker locally, or update your published Worker to this revision before using the V0.8 assistant. Its shared validation now accepts route/detour provider metadata. Existing Google/Gemini secrets and backend protection still apply. Only a deployment dry-run was performed here.

```sh
# On the linked account, configure runtime token via EAS dashboard/environment.
# Optional download token is Secret visibility, development environment.
npx eas-cli@latest build --platform ios --profile development
npx eas-cli@latest build --platform ios --profile development-simulator
npm run start:dev
```

A rebuild is required when the native Info.plist token changes. Expo Go cannot load this custom module. Android/web currently use the existing planning UI; this milestone does not add Android Navigation SDK. Tokens were **not configured** in this working environment. The successful simulator compile therefore tests the unconfigured fallback binary, not live Mapbox requests.

Sources: [version-pinned README](https://github.com/mapbox/mapbox-navigation-ios/blob/3.32.0/README.md), [Mapbox install guide](https://docs.mapbox.com/ios/navigation/guides/install/), [EAS environments](https://docs.expo.dev/eas/environment-variables/), [EAS hooks](https://docs.expo.dev/build-reference/npm-hooks/), [simulator builds](https://docs.expo.dev/build-reference/simulators/).

## Cost and usage monitoring

Pricing checked October 7, 2026. The Mapbox v3 **metered** plan includes 100 Navigation MAUs and 1,000 trips per billing month. The first paid tiers are $0.30 per extra MAU and $0.08 per trip, with lower trip rates at higher volumes. These are account/billing-period allowances, not a promise of unlimited free navigation. Unlimited-trip plans differ; check the account's actual plan.

Monitor Navigation MAUs, active-guidance/free-drive trips, standalone Maps MAUs, and route requests. Maps used outside Navigation's included usage may be billed separately; the standalone mobile Maps tier currently includes 25,000 MAUs. Search would have separate usage if introduced later, but ROAM adds no Mapbox Search. Google Places/Routes, Gemini, Cloudflare, and EAS retain separate costs. Diagnostics does not replace the providers' billing dashboards or enforce a Mapbox spending cap.

Sources: [current pricing](https://www.mapbox.com/pricing), [Navigation billing guide](https://docs.mapbox.com/ios/navigation/guides/pricing/).

## Validation and remaining work

- **228 tests pass**: 209 app/services and 19 Worker tests. All previous 190 remain, plus 38 V0.8 tests.
- App and Worker TypeScript checks pass.
- Expo Doctor: **21/21 pass**.
- Native config introspection passes; Expo autolinking finds `RoamNavigationModule` v0.8.
- iOS, Android, and web JavaScript exports pass. Worker deployment dry-run passes; no Worker deployment was performed.
- **Actual EAS native compilation: FINISHED successfully**, build [`a0cb6efd-0353-4e3f-af6a-f301b6e3b571`](https://expo.dev/accounts/pghale/projects/roam/builds/a0cb6efd-0353-4e3f-af6a-f301b6e3b571), completed October 7, 2026 at 16:20 UTC. The `development-simulator` Debug app compiled the final Swift bridge and Mapbox SPM products and linked the application on macOS/Xcode with iPhoneSimulator 26.5 SDK. The downloaded archive audit verified both app architectures, all three required Mapbox dynamic frameworks, minimum iOS 16.4, and no vendored Google Navigation/Maps SDK. This is not a signed device build or a simulator launch/drive test.
- iPhone driving, native simulation, native TTS timing, map appearance/attribution gutters, token-authenticated route requests, and real reroute/stop transactions: **pending**, not represented by mocked tests.

New tests cover configured/missing-token/module/provider selection, Google rejection, route failures, provider pinning, cancellation, ordered waypoints, native payload validation, route ID reuse, failed replacement, normalized progress/maneuvers/fix, reroute/arrival, SDK voice freshness/priorities, detour provenance, native assistant context, local commands, route authority, and development simulation gating. Additional tests cover the Picovoice podspec compatibility patch and idempotent runtime-framework packaging without duplicate Core linkage. Native configuration checks cover the pinned SPM package/product; actual EAS builds verify the Xcode integration. The V0.7 native contract test now reads the preserved Google reference adapter at its new path.

Offline-ready boundaries retain the SDK routing provider, tile-store/predictive-cache configuration, and persistent native core. Full downloadable regions, route alternatives UI, native voice rendering/speech API, background navigation, and offline guarantees are deferred. The Core-only map initializer is currently marked `ExperimentalMapboxAPI` in the pinned SDK; the adapter uses that initializer but avoids internal camera/route-width APIs. SDK upgrades require native compile and device review. V0.9 should first close token-authenticated simulator and iPhone driving verification, then add tested alternatives and deliberate offline route downloads.

Use the [V0.8 simulator/iPhone checklist](v08-iphone-checklist.md) before treating this as a usable driving release.
