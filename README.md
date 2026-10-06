# ROAM · V0.1

**Your AI for the road.** An iPhone-first React Native / Expo prototype with an original graphite-and-mint identity. This is a map and assistant foundation; it does not provide turn-by-turn navigation yet.

## Run on your iPhone

Use Node.js 20.19+ (Node 24 was used for validation). From this folder:

```sh
npm ci
npm start
```

1. Install **Expo Go** on your iPhone. This project intentionally uses **Expo SDK 54** to match the App Store build. Expo currently documents that SDK 55+ on physical iOS requires a compatible TestFlight / EAS Go build or a development build: [Expo Go compatibility](https://docs.expo.dev/troubleshooting/expo-go-version-mismatch/).
2. Put the computer and iPhone on the same Wi-Fi network. Allow Node/Expo through the local firewall if prompted.
3. Scan the terminal QR code with the iPhone Camera, then open it in Expo Go. If asked, sign into the same Expo account in the CLI (`npx expo login`) and Expo Go.
4. Allow location **while using the app**. ROAM centers on the first GPS fix. No background permission is requested.
5. Pan, pinch to zoom, rotate, and tap the recenter button. Search sample destinations, try the quick actions, or open **Ask ROAM**.

If LAN discovery fails, try `npx expo start --tunnel` (Expo may offer to install its tunnel helper). If Metro has cached an older bundle, use `npx expo start --clear`. On Windows, `npm run ios` cannot launch an iOS Simulator; scan the QR code on your physical phone instead.

**No API keys or `.env` file are needed for V0.1 on iPhone.** The native iOS map uses Apple Maps in Expo Go. [Expo's react-native-maps documentation](https://docs.expo.dev/versions/v54.0.0/sdk/map-view/) confirms Expo Go needs no extra map setup.

## What works

- Interactive native map, current GPS marker, recentering, native compass, pinch zoom, and rotation.
- Foreground location permissions, denied-access explanation, retry / Settings link, and GPS timeout / stale-signal states. Subscriptions stop while the app is in the background.
- GPS speed in MPH; stationary readings become `0`. Negative, missing, stale, inaccurate, non-finite, and implausible readings display as unavailable. Road name is explicitly unavailable.
- Destination search with debounced demo results, empty and error states, and destination pin previews.
- Horizontally scrollable Food, Gas, Restroom, Coffee, and Parking actions with recommendation sheets.
- Shared ROAM conversation across the Map sheet and ROAM tab, intent-based demo replies, place suggestions, text input, and optional read-aloud responses.
- Microphone **demo** UI with idle, listening-preview, processing, and speaking states. No microphone permission, audio recording, speech recognition, or wake-word detection is performed.
- Default ROAM Dark and optional ROAM Light, with a saved local theme preference.
- Map, Trips, ROAM, and Profile tabs; safe-area spacing, keyboard-aware sheets, large touch targets, and compact layouts for smaller iPhones.

The browser preview (`npm run web`) uses a labeled, illustrative map instead of native maps. It is a UI preview, not a navigation surface. The actual interactive map is on iPhone / Android. Apple Maps follows the selected light/dark interface; the theme's custom map-style arrays are for Google Maps providers when those are enabled later.

## Project structure

```text
app/                 Expo Router root and four tab screens
components/          MapCanvas, SearchBar, DrivingHUD, sheets, assistant, shared UI
contexts/            Foreground GPS / destination session and shared conversation
hooks/               Location lifecycle and debounced places loading
services/            maps, places, routes, ai, weather adapters
types/               Coordinates, places, routes, assistant context and contracts
constants/           Quick-action definitions and fallback map center
themes/              ROAM Dark / Light tokens, map styles and persistence
utils/               GPS validation and speed / heading formatting
tests/               GPS and service behavior tests
docs/                Architecture notes and on-device verification checklist
```

## Packages

Runtime: `expo`, `react`, `react-native`, `expo-router`, `react-native-maps`, `expo-location`, `react-native-safe-area-context`, `react-native-screens`, `@expo/vector-icons`, `expo-font`, `expo-speech`, `@react-native-async-storage/async-storage`, `expo-linking`, `expo-constants`, and `expo-status-bar`. `react-dom` and `react-native-web` enable browser UI previews. Development: TypeScript, React types, and `tsx` for Node's test runner. The lockfile records exact installed versions.

No dedicated bottom-sheet, animation, voice-recognition, AI SDK, or backend dependency is required.

## Demo boundaries and environment

Search/recommendations use **fictional places** and sample pins near the map center. There are no live ratings, prices, opening hours, distances, ETA, traffic, weather, or route geometry. These fixtures are labeled throughout the UI. Choosing a fixture only previews a pin; it never begins guidance. Trips and accounts are placeholders. Conversations remain in memory and reset when the app restarts; only theme selection is persisted locally. Map providers still load tiles and may process the displayed map area.

`services/ai.ts` is the replaceable `sendMessageToRoam(message, context)` adapter. The typed context includes position, destination, route, speed, time, weather, and conversation history. Future tool names are defined in `types/domain.ts`. Routes and weather adapters fail explicitly until verified providers are connected.

See `.env.example` for reserved configuration:

- `EXPO_PUBLIC_GOOGLE_MAPS_API_KEY`: optional future client map SDK key; restrict by application and platform. V0.1 does not consume it.
- `EXPO_PUBLIC_ROAM_API_URL`: future backend URL; V0.1 does not consume it.
- `GEMINI_API_KEY`: **server-side only** for a future backend. Do not create an `EXPO_PUBLIC_GEMINI_API_KEY`: Expo public variables are bundled into the client. [Expo environment variable guidance](https://docs.expo.dev/guides/environment-variables/).

## Validation

```sh
npm run check
npx expo-doctor
npx expo export --platform ios --platform web --max-workers 2
```

TypeScript, eight behavior tests, all 18 Expo Doctor checks, and production iOS / browser bundle exports were validated. These checks are not a physical iPhone runtime or visual test. No connected browser or iOS device was available during implementation. Follow [the on-device checklist](docs/device-checklist.md) before treating the prototype as device-verified.

Compatible dependency fixes were applied with `npm audit fix`. The SDK 54 dependency graph still reports 39 npm advisories (16 moderate, 23 high), including inherited Metro/Jest/Expo tooling and Router dependencies. The offered blanket fixes change the React Native / Expo SDK versions and would break this Expo Go target; no forced upgrade was applied. Revisit these dependencies when moving to a development build, before production distribution.

## Build next

1. Verify on your actual iPhone and refine marker, keyboard, GPS, and smaller-screen behavior using the checklist.
2. Connect verified Places and Routes adapters through a backend; add destination confirmation, real route geometry, ETA, and route-aware stops.
3. Connect Gemini on that backend using tool/function calling. Validate tool arguments and verified API results; require user confirmation before modifying an active journey.
4. Move to an Expo Development Build for native speech recognition, wake-word experiments, background navigation, Google Navigation SDK / 3D, and eventually CarPlay. Upgrade Expo and re-audit dependencies during that migration. [Development builds](https://docs.expo.dev/develop/development-builds/introduction/) support custom native code; [background iOS location](https://docs.expo.dev/versions/v54.0.0/sdk/location/) requires one.
5. Add real saved places, trips, preferences, accounts, and original custom map themes.

This initial version is committed to the existing Roam repository. Future changes should only be committed or pushed when requested.
