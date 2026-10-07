# ROAM

**Your AI for the road.** An iPhone-first app for planning a drive, finding useful stops, and talking to a driving assistant.

**Version: 0.7.0** · Expo SDK 57 · React Native · TypeScript

## What works today

- Search for destinations and nearby places with Google Places.
- Plan a route, add up to five stops, and compare verified detour times.
- Track foreground GPS, approximate speed, route progress, and arrival estimates.
- Find food, gas, coffee, restrooms, or parking through the Gemini assistant.
- Use text, spoken replies, and push-to-talk in a supported development build.
- Use optional **Hey ROAM** after setting up the on-device wake model and key.
- Switch between light and dark themes. Driving Mode keeps the map and trip controls easy to read.
- Recover a saved destination and remaining stops after a reload, then recalculate and start again.

With no backend connected, ROAM uses clearly labeled fictional demo places.

## What V0.7 adds

A native iOS navigation integration, custom maneuver rail and icons, follow/overview/free camera modes, ordered waypoint handling, and navigation speech priority. The new bridge connects Google Navigation SDK **11.2.0** to ROAM's own interface. It also adds navigation diagnostics and development-only SDK simulation controls.

**Google Navigation is disabled for this personal project, as requested.** Google's current policy allows Navigation SDK only for commercial applications. Existing route planning, GPS tracking, stops, and assistant features remain available. The integration needs an eligible project, a native build, and device testing before turn-by-turn navigation can be used. It has not been compiled or verified on an iPhone yet. [Navigation setup and limits](docs/v07-navigation.md)

The repository is also cleaner: supporting app code now lives in `src/`, while Expo routes stay in `app/`.

## Run the project

Use Node 24.3 or newer and npm. From the project folder:

```powershell
npm ci
Copy-Item .env.example .env
Copy-Item server/.dev.vars.example server/.dev.vars
```

Fill the local files with your settings:

| File               | What belongs there                                                         |
| ------------------ | -------------------------------------------------------------------------- |
| `.env`             | Backend URL, prototype access token, and an app-restricted native Maps key |
| `server/.dev.vars` | Private Gemini and Google Places/Routes keys                               |

Keep `ROAM_ENABLE_NAVIGATION=false`. For an iPhone on your Wi-Fi, use your computer's LAN address in the backend URL, such as `http://YOUR_LAN_IP:8787`. A published backend should use HTTPS. Never put private server keys in an `EXPO_PUBLIC_` variable.

Start the backend in one terminal:

```sh
npm run server
```

Start the app in another:

```sh
npx expo start --dev-client --clear
```

A new iOS development build is required for native module changes:

```sh
npx eas-cli build --platform ios --profile development
```

Install it on your registered iPhone, then open the new Expo QR code. Apple signing and EAS account setup are required. Expo Go and web cannot run the native navigation or wake engine. [iPhone voice/build setup](docs/v06-iphone-checklist.md)

## Where things live

| Folder                 | Purpose                                                       |
| ---------------------- | ------------------------------------------------------------- |
| `app/`                 | Screens and Expo Router routes                                |
| `src/`                 | Components, themes, hooks, app services, and trip/voice state |
| `modules/`             | Local Swift navigation module and typed bridge                |
| `server/`              | Cloudflare backend for Gemini and Google REST requests        |
| `shared/`              | App/backend validation and request types                      |
| `assets/`              | App assets and optional local wake model                      |
| `plugins/`, `scripts/` | Native configuration and build checks                         |
| `tests/`, `docs/`      | Automated tests, setup notes, and device checklists           |

Generated builds, downloaded SDKs, local settings, and credentials are kept out of Git.

## Check your changes

```sh
npm run check
npm run native:check
npx expo-doctor
npm run server:build
```

V0.7 has **190 passing tests**, including all 153 previous tests. Native exports check JavaScript bundling; they do not prove that Swift compiles or that driving guidance works on a device.

## Current limits

ROAM is a development prototype. Navigation stays in the foreground; it does not provide background navigation, CarPlay, 3D cities, fuel prices, weather, or community reports. Native voice needs its own build, permissions, wake model, and Picovoice setup. Messages and navigation details stay in memory; the recoverable trip plan is stored locally for up to six hours.

For the full V0.7 architecture and pending verification, read the [navigation guide](docs/v07-navigation.md) and [simulation/iPhone checklist](docs/v07-iphone-checklist.md). Earlier reliability work is described in [V0.6 notes](docs/v06-reliability.md).
