# ROAM

**Your AI for the road.** An iPhone-first app for planning a drive, finding useful stops, and talking to a driving assistant.

**Version: 0.8.0** · Expo SDK 57 · React Native · TypeScript

## What ROAM does

- Find destinations, food, gas, coffee, restrooms, and parking with Google Places.
- Plan a drive, add up to five stops, and compare verified detour times.
- Show foreground GPS, speed, trip progress, and arrival estimates.
- Talk to the Gemini assistant through text or push-to-talk.
- Use optional **Hey ROAM** with the local wake model and Picovoice key configured.
- Use ROAM's light and dark themes, custom Driving Mode, maneuver rail, and map controls.
- Recover your destination and remaining stops after a reload, then calculate a fresh route.

Without a backend, discovery uses clearly labeled fictional demo places.

## What V0.8 adds

Mapbox Navigation **3.32.0** and Maps **11.32.0** now sit behind ROAM's native iOS bridge. The new adapter handles route progress, snapped position, turns, rerouting, ordered stops, and arrival. ROAM keeps its own screens and uses its existing voice controller for Mapbox's timed spoken instructions.

Configured iOS builds prefer Mapbox for route previews and detour comparisons. Each route and comparison records its provider. A failed stop update keeps your current trip. Google Navigation remains disabled and excluded from the build; Google Places remains discovery, with results in attributed lists and cards rather than markers on a Mapbox map.

**The EAS iOS simulator development build compiled successfully.** Live Mapbox routing and physical iPhone driving still need your tokens and device checks. The [V0.8 guide](docs/v08-mapbox-navigation.md) records the build, setup, costs, and remaining checks.

## Run the project

Use Node 24.3 or newer and npm:

```powershell
npm ci
Copy-Item .env.example .env
Copy-Item server/.dev.vars.example server/.dev.vars
```

| File               | Settings                                                                                    |
| ------------------ | ------------------------------------------------------------------------------------------- |
| `.env`             | Backend URL, prototype access token, public Mapbox runtime token, Android map key if needed |
| `server/.dev.vars` | Private Gemini and Google Places/Routes keys                                                |

Mapbox needs an account and billing setup. Set `EXPO_PUBLIC_MAPBOX_ACCESS_TOKEN` to your public `pk.` token. Keep private keys out of public variables and Git. Stable Mapbox 3.32.0 downloads currently need no secret token; an optional `MAPBOX_DOWNLOADS_TOKEN` belongs only in the EAS build environment. [Token and EAS setup](docs/v08-mapbox-navigation.md#credentials-and-builds)

For an iPhone on your Wi-Fi, use your computer's LAN address in the backend URL, such as `http://YOUR_LAN_IP:8787`. A published backend should use HTTPS.

Use the Worker from this revision with the V0.8 app. If you use a published backend, update it so the assistant accepts the new route-provider fields.

Start these in separate terminals:

```sh
npm run server
npm run start:dev
```

Native module changes require a new development build:

```sh
npx eas-cli@latest build --platform ios --profile development
```

Install it on your registered iPhone, then open the Expo QR code. Apple signing is required for a device build. A Mac simulator build can use `--profile development-simulator`. Expo Go, Android, and web keep the planning fallback; they do not contain this iOS Mapbox engine.

## Accounts and cost

Navigation is not unlimited or always free. Mapbox's current metered v3 tier includes 100 monthly active users and 1,000 trips per billing month; paid usage starts at $0.30 per additional user and $0.08 per trip, with volume tiers. Check [current pricing](https://www.mapbox.com/pricing) and monitor your account's usage. Maps, route requests, Google Places, Gemini, and builds may have their own charges. ROAM does not add Mapbox Search.

## Where things live

| Folder                 | Purpose                                                   |
| ---------------------- | --------------------------------------------------------- |
| `app/`                 | Screens and Expo Router routes                            |
| `src/`                 | Components, themes, hooks, services, trip and voice state |
| `modules/`             | Native navigation providers and typed bridge              |
| `server/`, `shared/`   | Cloudflare backend and shared validation                  |
| `assets/`              | App assets and optional local wake model                  |
| `plugins/`, `scripts/` | Native setup and build checks                             |
| `tests/`, `docs/`      | Tests, setup guides, and device checklists                |

Generated builds, downloaded SDKs, local settings, and credentials stay out of Git.

## Checks and limits

```sh
npm run check
npm run native:check
npx expo-doctor
npm run server:build
```

V0.8 has **228 passing tests**, including all 190 previous tests. iOS, Android, and web exports check JavaScript bundles; they do not prove that native guidance works on an iPhone.

This is a development prototype. It does not yet provide background navigation, CarPlay, downloaded offline regions, a route-alternative selector, weather, fuel prices, or community reports. Native voice needs its own build and permissions. Messages and navigation details stay in memory; the recoverable trip plan lasts up to six hours.

Read the [V0.8 navigation guide](docs/v08-mapbox-navigation.md) and [simulator/iPhone checklist](docs/v08-iphone-checklist.md). Earlier work remains documented in the [V0.7 guide](docs/v07-navigation.md) and [V0.6 reliability notes](docs/v06-reliability.md).
