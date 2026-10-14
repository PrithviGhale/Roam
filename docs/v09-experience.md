# ROAM V0.9 — the product experience

V0.9 rebuilds the interface on the V0.8 navigation foundation. Mapbox Navigation **3.32.0** and Maps **11.32.0** stay pinned. Routing, native guidance, snapped location, rerouting, ordered stops, arrival, verified detours, speech priority, and the disabled Google Navigation reference remain in place.

## The interface

The map has a compact floating destination search, lightweight category shortcuts, a small recenter control, and a voice entry point built around Pulse. The permanent top wordmark and PLAN/DRIVE badge are removed. A floating dock replaces the full-width tab strip and large selected backgrounds. Developer tools remain inside development/Profile settings.

Driving Mode hides category shortcuts and the repeated destination row. ManeuverRail uses an alloy edge, original maneuver geometry, a strong distance, and quieter road/instruction text. The lower bar prioritizes time, remaining distance, arrival, and progress. Map camera/attribution padding includes the dock and safe area. Lower chrome is scrollable and bounded to 42% of the viewport; maneuver distance supports text scaling up to 1.4× while long road/instruction labels wrap within two lines.

Trips prioritizes the actual current/recoverable plan and keeps its journey rail. Settings groups appearance, map theme, voice, units, privacy, and development links. No trip history is fabricated. Assistant messages are editorial text, with structured, attributed place results; they do not use alternating chat bubbles. Shared surfaces use spacing and contrast instead of borders around every item. Search includes a clear control and keeps its existing autocomplete, keyboard handling, current-destination context, and explicit destination selection.

## Map themes

- `src/map/themes.ts` defines ROAM Night and ROAM Day, theme decoding, and Studio URI validation.
- `scripts/build-map-themes.ts` generates the JSON resources in `modules/roam-navigation/ios/map/themes/`.
- `RoamMapTheme.swift` loads the CocoaPods resource bundle. The view retains the same navigation core.
- `MapThemeProvider` stores only the preference (`automatic`, `night`, or `day`) in AsyncStorage. Automatic follows app appearance. A late storage read cannot overwrite a new user selection, and writes are serialized.

Run `npx tsx scripts/build-map-themes.ts` after changing the theme generator. Tests check the generated resources match their source. Native resource changes require a new development build.

Night uses charcoal ground, warm-neutral land, cool water, subdued building footprints, parks, separate motorway/primary/secondary/local road layers and casings, paths at close zoom, tiered city/neighborhood labels, road names, and verified highway reference text. Day uses warm pale land and stronger dark-label contrast. Both use one non-composited Mapbox Streets v8 source. Generic business POIs and Google discovery markers are omitted. Google Places remains in attributed lists/cards. No terrain or building extrusion is added.

The warm route keeps a dark casing and a quieter traversed portion. Alternative-route color is subdued; V0.9 does not add an alternative-route selector. The puck is a compact faceted direction/vehicle mark with a dark center lane, replacing the larger arrow. The SDK still owns its enhanced location and rotation.

### Optional Mapbox Studio style

Set `EXPO_PUBLIC_MAPBOX_STYLE_URL=mapbox://styles/YOUR_USERNAME/YOUR_STYLE_ID` locally and in the EAS development environment, then rebuild. Only a public style URI is accepted; query strings and token-bearing URLs are rejected. The existing public runtime `pk.` token remains required. Never put a private token in the app.

To create a Studio version: create a blank style, add Mapbox Streets v8, reproduce the road hierarchy/land/building/label layers, keep POI clutter low, preview at navigation zooms, and publish. Keep compositing disabled if future predictive map caching is needed. Retain Mapbox attribution. The configured URI overrides both bundled theme choices; separate Studio Day/Night URIs are a future extension. If the URI fails to load, ROAM tries the bundled theme. If that also fails, the planning map and controls remain available with a calm notice. Style generations prevent a cancelled older theme request from triggering fallback or overriding the latest selection.

Sources: [Streets v8 fields](https://docs.mapbox.com/data/tilesets/reference/mapbox-streets-v8/), [Mapbox offline/style requirements](https://docs.mapbox.com/ios/navigation/guides/advanced/offline/), [Google Places policies](https://developers.google.com/maps/documentation/places/web-service/policies).

## Launch and motion

The native splash and React overlay share a dark background and original three-stroke mark. `LaunchTransition` uses React Native's native-driver transforms/opacity: the lanes advance independently, spread into road paths, and settle toward the dock's Pulse as the app appears. Services mount concurrently; no routing/network response gates the animation.

Normal timing is configured at **1,380 ms**, plus up to 150 ms to read motion preferences. Reduced motion or known Low Power Mode uses a centered mark and **220 ms dissolve**, without the lane/path transform. A 1.8-second watchdog releases the overlay; backgrounding ends it. `LaunchSession` permits one cold transition per JavaScript app session. Warm returns do not replay it. These are configured timings, not measurements from an iPhone.

Pulse 2.0 has three independently timed lanes without a box or orb. Armed, listening, thinking/searching, speaking, navigation update, and error have distinct state treatment. Animations stop in the background and respect reduced motion/Low Power Mode. Existing haptics remain restrained at meaningful actions. Permissions remain contextual: location through the map's location control, microphone/speech when the user chooses voice. No new background modes are added.

Source: [Expo SDK 57 splash handoff](https://docs.expo.dev/versions/v57.0.0/sdk/splash-screen/).

## Assistant: planner, receipts, composer

The existing tool planner remains conservative. Gemini **3.8 Flash** stays configured. Simple and driving requests use LOW thinking; complex parked requests with comparisons, exclusions, timing, or references can use MEDIUM. New `excludeTerms` arguments filter returned business names before recommendation ranking. Instructions handle hungry/restroom requests, contextual follow-ups, approximate time-ahead searches, and brand exclusions. Cheap/quick preferences remain search preferences, never verified prices or invented service-speed claims.

After planning/tools finish, a separate composer call chooses validated conversational opening/cadence. It uses the same configured model, LOW thinking, a 200-token output ceiling, and a five-second timeout. It cannot call tools. Deprecated `temperature` sampling controls are removed in accordance with current Gemini 3.8 guidance; neither layer sets a replacement arbitrary sampling value. The composer adds at most one model request per final planner response and may add latency/cost. It falls back safely when unavailable.

**Grounding is structural:** the composer returns approved phrase IDs, not arbitrary factual prose. Client-owned verified receipts provide business names, ratings, detours, and route facts. Unknown fields, names, numbers, unsupported claims, and actions in composer output are rejected. Model phrasing never creates consent or a successful mutation receipt. The client keeps confirmation and atomic route mutation rules. This deliberately limits free-form composition; live conversational quality and latency still need evaluation.

Driving speech omits addresses, ratings, review counts, and lists. A typical verified example (illustrative receipt: Cafe A, +180 seconds) changes from “Cafe A is the top option. Rated 4.5. +3 min compared with your route. Want to add it as a stop?” to **“Cafe A adds about 3 minutes. Want to add it?”** Parked replies can include verified ratings and a conversational opening, with the full structured result list visible. Missing detours are said to be unavailable.

“What was the second one?” and “Actually give me the first” can use the bounded displayed result session without another model request. They do not change the trip before acceptance. Expired references require a fresh request. Greetings/thanks and native repeat/recenter/overview/stop-speaking/next-turn/arrival questions remain deterministic. AI failure leaves the trip and navigation running; native guidance speech still has priority.

Use the Worker from this revision to enable the new planner/composer behavior. No Worker deployment is performed by this milestone. The client has deterministic natural wording if the composer or final AI call fails after successful tools.

Sources: [Gemini 3.8 Flash capabilities](https://ai.google.dev/gemini-api/docs/models/gemini-3.8-flash), [current parameter guidance](https://ai.google.dev/gemini-api/docs/generate-content/whats-new-gemini-3.8).

## Validation

- **265 tests pass**: 241 app/shared tests and 24 Worker tests. All 228 previous tests are preserved; 37 new tests cover cold/warm launch, reduced-motion timing, map theme selection/persistence/races, bundled theme contracts, planner/composer separation, factual grounding, driving reply length, context references/expiry/consent, and fallback behavior.
- App and Worker TypeScript pass. Expo Doctor passes **21/21** checks. iOS/Android/web production exports, native configuration checks, iOS autolinking, and Worker deployment dry-run pass. No Worker deployment was performed.
- Native EAS development-simulator build **[e54ed766](https://expo.dev/accounts/pghale/projects/roam/builds/e54ed766-8336-4499-b9dc-0a9f568dc915) succeeded**. Its archive reports app version 0.9.0 and minimum iOS 16.4, contains both simulator architectures and all three dynamically linked Mapbox frameworks, includes both 19-layer map theme resources and the native splash storyboard, and contains no Google Navigation/Maps framework. The final native source is included; subsequent JavaScript-only preference/error-message refinements were checked by tests/TypeScript/exports and load through Metro in this development client.
- The simulator artifact has **no configured Mapbox public runtime token**. Set `EXPO_PUBLIC_MAPBOX_ACCESS_TOKEN` in the EAS build environment and rebuild before evaluating native maps. No Studio URI is configured in that artifact. Compilation and archive inspection do not establish successful map rendering.
- Physical iPhone launch, map appearance, actual audio, live Gemini quality/latency, and road navigation: **not validated** here.
- Browser input review was stopped by the computer-use helper because it could not verify the current browser URL. No browser/screenshot visual pass is claimed. Source layout review and exports are not substitutes for rendered native review.

### Review on your device next

Build/install a signed development client using the existing bundle ID `com.prithvighale.roam`, configured Mapbox public token, reachable Worker URL/access token, and optional bundled Hey ROAM model/secure Picovoice key. Start Metro with `npm run start:dev`. Expo Go/web are fallback/UI previews; they cannot show the final native Mapbox map or native splash reliably.

Use parked controls or a passenger for interactive road testing. Follow the existing [V0.8 device checklist](v08-iphone-checklist.md) for guidance, stops, rerouting, audio, and permissions. Add these experience checks:

| Area      | States to review on small/standard/large iPhones, including large text                                  |
| --------- | ------------------------------------------------------------------------------------------------------- |
| Map       | Idle, search/keyboard/clear, results, destination preview, active guidance, rerouting, arrival          |
| Assistant | Idle, listening, thinking/searching, results, confirmation, failed request with navigation active       |
| Launch    | Force-close/cold launch, warm resume, reduced motion, Low Power Mode, slow map/network                  |
| Themes    | Night, Day, Automatic, persistence after restart, rapid theme changes, optional Studio failure fallback |
| Layout    | Dynamic Island/notch, safe areas, home indicator, dock, map attribution, maneuver text, keyboard        |

All rendered/device items above remain pending. Do not operate interactive tests while driving. No simulator or source fixture proves real-road behavior.

Known limits: foreground-only iOS guidance, unverified device visuals/audio, restricted composer vocabulary, no verified price/service-speed facts, no alternative-route selection/offline download UI/CarPlay, and one Studio URI overriding both theme choices. V1.0 should first complete the actual iPhone review, fix observed visual/audio problems, evaluate representative live conversations against verified receipts, and measure launch/AI latency before adding more features.
