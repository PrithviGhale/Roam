# V0.9 physical iPhone validation

Status recorded October 14, 2026. This is setup and testing for the existing V0.9 app, not a new feature milestone.

## Setup result

The starting branch was clean `main` at `d64300a4a2fe41f9dc89c5861e7f0d4a909e8d26`. The Worker deployed from that revision. A small maintenance fix now avoids showing fallback instructions while native-map availability is being checked and removes the outdated request for a Google-enabled iPhone build. Navigation and AI behavior were not redesigned.

| Item | Status |
| --- | --- |
| EAS account/project | Authenticated; `pghale/roam`, project `e9fd4c61-2786-4fd6-9938-9596719a06f3` |
| Bundle ID | Configured: `com.prithvighale.roam` |
| EAS development Mapbox public runtime token | Configured, sensitive visibility; value not recorded |
| EAS development backend URL | Configured: `https://roam-api.prithvighale01.workers.dev` |
| EAS development prototype access token | Configured, sensitive visibility; same local value uploaded to Worker |
| Local backend URL | Updated in ignored `.env` to the permanent Worker origin |
| Worker | `roam-api` deployed; V0.9 planner/composer source |
| Worker active version after secret configuration | `e5756891-5597-4eae-be3c-8bf83239d13c` |
| Gemini configuration | Configured; `gemini-3.8-flash` |
| Google Places/Routes configuration | Configured |
| Worker access protection | Configured; authenticated diagnostics return 200, missing authentication returns 401 |
| Health | `GET /health` returns 200 and `ok: true` |
| Physical iPhone registration | Pending: device query reported no Apple teams linked to `pghale` |
| Apple signing | Pending Apple login/team selection; certificates/profiles not yet verified |
| Physical device build / ID / URL | Not started; no physical `.ipa` produced |
| Token/frameworks in physical artifact | Pending artifact inspection; no claim of inclusion yet |
| Hey ROAM model | Missing: `assets/wake/hey-roam_ios.ppn` |
| Picovoice AccessKey | Device SecureStore setting; not verifiable from this computer; no local environment key found |

The original code deployment was version `3fbef83b-179a-46a7-8087-35b612596fb7`; adding secrets created the active version above. `/health` still reports the backend package version `0.4.0`. That historical package number is separate from the app's V0.9 milestone; deployment used the V0.9 source. Authenticated configuration checks made no Gemini, Places, or Routes provider calls. Presence does not prove provider billing, restrictions, or inference quota.

The initial attempt to upload secrets was rejected by automatic approval review because the Worker did not yet exist. The V0.9 code was then deployed with the requested deployment command, the named Worker and version were verified, and secret upload was approved and completed. No approval block remains for the backend.

## Checks completed before a device build

- `npm run check`: 265 tests pass (241 app/shared + 24 Worker), with app and Worker TypeScript passing.
- `npm run native:check`: passes. Final map-message maintenance change also passes app TypeScript.
- `npx expo-doctor`: 21/21 checks pass; no dependency upgrade performed.
- `npm run server:build`: Worker dry-run passes.
- Native configuration introspection with the real local public token confirms the same token reaches `MBXAccessToken`, the provider is Mapbox, Google Navigation is disabled, and microphone/speech descriptions and bundle ID are correct. Only booleans were printed.
- EAS CLI 24.13.0 confirms all three development variables exist. Public client tokens use sensitive visibility; values are still public within the compiled app, not private server credentials.
- Mapbox Navigation stays at 3.32.0 and Maps at 11.32.0. Native module/view, bundled Night/Day JSON resources, optional Studio URI loading, dev client, and V0.9 launch code remain present. A Studio URI is optional and currently unset.
- The previous V0.9 simulator build proved native compilation and framework/resource packaging only. It cannot be installed on an iPhone and does not validate this physical build.

## Manual step now: Apple login and device registration

The registration flow reached **Apple ID** and was stopped there so credentials can be entered privately. Run this in the project terminal:

```powershell
npx eas-cli@latest device:create
```

1. Choose the existing `pghale` Expo account.
2. Enter your Apple Developer account credentials and 2FA in the terminal/login flow, then select your Apple team. EAS ad hoc device distribution needs access to a suitable Apple Developer team. Membership has not been verified here.
3. Choose website registration if offered. Open the exact generated registration URL/QR in **Safari on your iPhone**. No registration URL has been generated yet.
4. Allow the registration profile download. In iOS Settings, open **Profile Downloaded** (or General → VPN & Device Management), install the Expo device registration profile, then return to Safari and confirm registration succeeded.
5. Tell the agent registration completed, or provide the non-secret error. Do not send passwords, 2FA codes, certificates, or tokens in chat.

After registration, re-check EAS devices, then use normal EAS-managed signing for the existing bundle ID. If EAS needs Apple login or certificate/profile confirmation, complete that exact prompt yourself. Do not revoke or replace unrelated credentials.

## Physical build and installation — after registration

The `development` profile is an internal development-client build. It does not set `ios.simulator`; `development-simulator` is a separate profile and must not be used here.

```powershell
npx eas-cli@latest build --platform ios --profile development
```

Before submission, confirm the three EAS development variables, current Git SHA, selected Apple team, and registered iPhone. After completion record build ID, URL, SHA, profile, bundle ID, and signing status. Inspect the `.ipa` for the configured runtime token (presence/equality only), Mapbox frameworks, both theme resources, splash assets, microphone/speech configuration, device architecture, and a provisioning profile containing the intended registered device. Never print the token or full provisioning profile.

Once an actual successful build URL is available:

1. Open that build's install link in Safari on the registered iPhone and tap **Install**.
2. If iOS requests Developer Mode, enable Settings → Privacy & Security → Developer Mode, restart, and confirm.
3. Open **ROAM**, the installed development client.
4. In the project terminal run:

```powershell
npx expo start --dev-client --tunnel --clear
```

Keep Metro running and scan its QR code/open its development link in ROAM. If Expo requests its tunnel helper installation, complete that prompt. The development JS connection still depends on the laptop and tunnel service; the backend now runs independently at its permanent HTTPS origin. Expo Go is a fallback preview, not the final native ROAM experience. [Expo internal distribution](https://docs.expo.dev/build/internal-distribution/) · [iOS Developer Mode](https://docs.expo.dev/guides/ios-developer-mode/)

## Parked device session

Record device model, iOS version, build ID/SHA, theme, text size, and pass/fail notes. All items below are **pending physical review**. Use parked testing first, then SDK simulation, then a passenger for interactive road testing. Do not interact with the phone while personally driving.

### Native detection and maps

- [ ] Profile → Device diagnostics: native module, Mapbox provider/runtime token, speech input/native voice, and development-client environment are available. Check presence only; do not copy keys.
- [ ] Map screen opens the native custom map without Expo Go/Google-enabled build instructions.
- [ ] ROAM Night: road hierarchy, buildings at close zoom, parks, water, labels, warm alloy route, custom puck, destination/stop treatment, and accessible attribution.
- [ ] Repeat the same checks in ROAM Day.
- [ ] Change themes, restart ROAM, and confirm the selection persists. Check Automatic follows app appearance.
- [ ] Search results keep Google attribution in lists/cards; Google discovery markers are not drawn onto the Mapbox map.

### Launch

- [ ] Fully terminate ROAM, reopen, and observe the native splash, three strokes, road/path motion, and map reveal. Configured animation time is about 1.38 seconds; measure actual time separately.
- [ ] Record any white/black flash, duplicate logo, loading gap, or layout jump.
- [ ] Return from another app: full animation does not replay.
- [ ] Enable Reduce Motion: short dissolve replaces the path animation.
- [ ] Repeat with Low Power Mode and a slow network.

Development clients have their own startup UI. Record observations here, but final native splash fidelity must also be checked in a signed preview/release build later; Expo warns that dev-client splash behavior can differ. No extra preview build is started by this setup task. [Expo splash guidance](https://docs.expo.dev/develop/user-interface/splash-screen-and-app-icon/)

### AI quality — keep these exact prompts

Use a real planned route and the deployed Worker. While parked, test:

1. `I'm starving.`
2. `Find me coffee but not Starbucks.`
3. `Find something quick to eat.`
4. `I don't want to leave the route much.`
5. `Find food around twenty minutes from now.`

After a result list, test:

6. `What about the second one?`
7. `Actually add the first.`
8. `Something closer.`
9. `Not that one.`

| Prompt | Reply text | Latency | Tool/category correct? | Facts match results/detour receipts? | Reference/confirmation correct? | Natural? |
| --- | --- | --- | --- | --- | --- | --- |
| Record one row per request | Pending | Pending | Pending | Pending | Pending | Pending |

During an active simulated route, check replies stay around one or two short sentences, with no spoken ratings/address list. Verify local ETA, repeat direction, recenter, overview, and stop-speaking commands. Do not treat displayed model prose as proof of a successful stop insertion. Collect results before changing AI behavior.

### Navigation and voice

- [ ] Destination search → route preview → Start Trip; verify snapped position and ManeuverRail.
- [ ] ETA, remaining distance, arrival time, and progress advance in SDK simulation through Profile diagnostics where available.
- [ ] Reroute updates the current route; stop insertion/removal agrees with the displayed verified added time.
- [ ] Intermediate arrival/Continue preserves stop order; final arrival ends guidance correctly.
- [ ] Push-to-talk permission, recognition, assistant reply, and TTS work.
- [ ] Navigation directions interrupt/defer assistant speech correctly; tapping the microphone interrupts assistant playback.
- [ ] Hey ROAM is optional: bundle the approved iOS `.ppn` file and rebuild, then enter the Picovoice AccessKey through Device diagnostics (stored in device SecureStore). Missing wake setup must not block text or push-to-talk.

### UI observations — document before redesigning

- [ ] Dynamic Island/notch/top safe area, home indicator, bottom dock, search, quick actions, and Pulse.
- [ ] Trips, Profile, assistant, ManeuverRail, search keyboard, long labels, and large text.
- [ ] Map logo/attribution remains visible and tappable beneath overlays.

Record the state, screenshot if useful, expected behavior, and actual behavior. No physical screenshot/visual pass has been performed by the agent.

## Approved app icon handoff

No custom home-screen icon is currently configured in `app.config.ts`; `assets/splash-mark.png` is a splash asset, not an approved app icon. No icon was generated or substituted.

When the approved final image is supplied, save it as **`assets/icon.png`**, a **1024 × 1024 opaque PNG**, exactly square, with no baked-in rounded corners. Add `icon: "./assets/icon.png"` to the existing top-level `config` object in **`app.config.ts`**. Do not add the config entry before the image exists. Expo prebuild generates the iOS icon sizes; a new native build and installation are required. No separate signing credential is needed for the icon. [Expo icon requirements](https://docs.expo.dev/develop/user-interface/splash-screen-and-app-icon/)

## Remaining gate

The backend and development environment are ready. Apple login/team/device registration and signing are the current gate. No physical build ID or installation link exists yet. Installation, live native detection, map rendering, audio, routing, and AI quality must be recorded after that gate is completed. Prioritize this device feedback before V1.0.
