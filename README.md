# ROAM

**Your AI for the road.** An iPhone-first app for planning a drive, finding useful stops, and talking to a driving assistant.

**Version: 0.9.0** · Expo SDK 57 · React Native · TypeScript

## What ROAM does

- Find destinations, food, gas, coffee, restrooms, and parking with Google Places.
- Plan a drive, add up to five stops, and compare verified detour times.
- Show foreground GPS, speed, trip progress, and arrival estimates.
- Talk to the Gemini assistant through text or push-to-talk.
- Use optional **Hey ROAM** with the local wake model and Picovoice key configured.
- Use ROAM's light and dark themes, custom Driving Mode, maneuver rail, and map controls.
- Recover your destination and remaining stops after a reload, then calculate a fresh route.

Without a backend, discovery uses clearly labeled fictional demo places.

## What V0.9 adds

- A map-first screen with compact search, lighter shortcuts, and a floating navigation dock.
- ROAM Night and Day maps with road hierarchy, parks, buildings, highway labels, and a smaller vehicle puck.
- A three-stroke launch transition and independently animated ROAM Pulse.
- Cleaner Driving Mode, Trips, settings, and assistant conversations.
- A conservative AI planner plus a grounded response composer, shorter driving replies, brand exclusions, and better session references.

Mapbox Navigation **3.32.0** and Maps **11.32.0** stay pinned. ROAM keeps its custom interface, verified detours, ordered stops, native guidance, and existing voice controller. Google Navigation stays disabled; Google Places remains discovery in attributed lists/cards.

Native build and device-review results are recorded in the [V0.9 experience guide](docs/v09-experience.md). Real iPhone visuals, audio, and driving still need device checks.

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

Use the Worker from this revision with the V0.9 app. If you use a published backend, update it to enable the new planner and response composer.

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

V0.9 has **265 passing tests**, including all 228 previous tests. TypeScript and Expo Doctor pass, and the iOS simulator build succeeds. iOS, Android, and web exports check JavaScript bundles; they do not prove that native guidance works on an iPhone.

This is a development prototype. It does not yet provide background navigation, CarPlay, downloaded offline regions, a route-alternative selector, weather, fuel prices, or community reports. Native voice needs its own build and permissions. Messages and navigation details stay in memory; the recoverable trip plan lasts up to six hours.

Read the [V0.9 experience guide](docs/v09-experience.md). Native setup remains in the [V0.8 navigation guide](docs/v08-mapbox-navigation.md) and [simulator/iPhone checklist](docs/v08-iphone-checklist.md). Earlier work remains documented in the [V0.7 guide](docs/v07-navigation.md) and [V0.6 reliability notes](docs/v06-reliability.md).
