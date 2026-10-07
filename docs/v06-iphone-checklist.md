# ROAM V0.6 physical iPhone validation

Status: **not yet performed**. Source checks, mocked tests and Metro export are not physical-device evidence. Record device/iOS/build, font setting, network, model version/sensitivity, pass/fail and a reproducible observation for each row. Test audio/controls while parked; use a passenger for road observations.

## Build and installation

From the ROAM repository in PowerShell:

```powershell
npm ci
npx eas-cli login
npx eas-cli init
npx eas-cli device:create
npx eas-cli build --platform ios --profile development
npx expo start --dev-client --clear
```

Run `eas init` once if this checkout is not already linked to your Expo project. Log in with the account that owns it. Device registration must precede the ad-hoc build; install using the resulting EAS link on the registered iPhone, enable iOS Developer Mode if prompted, and open ROAM's development client. Keep Metro on the same reachable network or use an appropriate development tunnel. Windows can request EAS cloud builds; local iOS project generation/compilation requires macOS (Expo also permits project generation on Linux). Account/device registration and Apple signing are interactive user steps.

The existing development profile uses `developmentClient: true`, internal distribution and the `development` EAS environment. Bundle ID: **com.prithvighale.roam**. Set the native Maps SDK variables in that EAS environment before building; ignored local `.env` files are not uploaded by this project's `.easignore`. Set matching runtime API URL/token for Metro. Native module, model, permission or compiled map-key changes require a new build, not a Metro reload.

Add manually:

- `assets/wake/hey-roam_ios.ppn`: an iOS Hey ROAM model generated for Porcupine 4 from Picovoice Console. Keep this exact filename; the plugin copies it into the app bundle. It is excluded from Git but included in EAS upload. Do not rename another platform's model to pretend it is compatible.
- `.env`: copy `.env.example` and configure app-visible API URL, testing gate, native iOS SDK key and bundle ID. Prefer HTTPS for the backend. A native SDK key is extractable and must be restricted to Maps SDK for iOS and the bundle ID.
- `server/.dev.vars`: copy its example for local Worker development, or configure the equivalent Worker secrets for the deployed backend. Private Gemini/Google REST credentials do not belong in any EXPO_PUBLIC field.

Configure manually:

- Expo project/account and Apple Developer team/signing credentials, plus registered device. Let EAS manage certificates/profiles; keep them outside Git.
- Google billing and enabled Maps SDK for iOS, Places API (New), Routes API. Keep the restricted native SDK key separate from the restricted server REST key.
- Gemini key/model access, Worker URL and matching prototype gate. Existing diagnostics distinguish configured credentials from a successful live provider probe; live tests may incur provider charges.
- Picovoice AccessKey in **Profile → Device diagnostics → Save device key**. It stays in SecureStore on that phone; only configured/missing status is displayed. Supply a suitable Picovoice license. Enable Hey ROAM only for a foreground active trip.

Expo's [device build instructions](https://docs.expo.dev/tutorial/eas/ios-development-build-for-devices/) and [internal distribution instructions](https://docs.expo.dev/build/internal-distribution/) describe account/signing/device requirements. Picovoice's [React Native quick start](https://picovoice.ai/docs/quick-start/porcupine-react-native/) describes model/key setup. No usable Apple signing/device/model/provider credentials were supplied for this validation run.

## Launch and UI

- [ ] Registered-device install succeeds; launch has no native crash or missing-module error.
- [ ] SDK/build in diagnostics matches the newly installed binary; an old SDK 54/57 V0.5 binary is not reused.
- [ ] Map, Trips, ROAM and Profile remain reachable; status bar contrast and tab selection work in both themes.
- [ ] Test a compact iPhone, a notch/Dynamic Island model and a larger model. Top chrome clears the cutout; bottom tabs and standalone diagnostics clear the home indicator.
- [ ] Normal, large and accessibility text: destination/ETA/remaining distance/voice status stay readable, cards wrap, buttons remain ≥44 pt and chrome scrolls without covering its header.
- [ ] Assistant keyboard: composer/send remain visible; dismissal restores controls; switching tabs does not leave an invisible keyboard overlay.
- [ ] Search keyboard: suggestions/results and selected-place Route/Add Stop/Back actions remain tappable; close/backdrop dismissal feels natural.
- [ ] Sheets avoid clipping at top/bottom with keyboard and large text. VoiceOver labels describe interruption, disabled controls and current Pulse state.
- [ ] Portrait lock remains intentional; rotating the phone does not strand controls.

## Native map

- [ ] Configured Google native map, roads and verified route render; missing native SDK/key yields an honest setup fallback.
- [ ] Google logo/legal attribution remains visible above chrome. Also check Apple logo/legal position when using the fallback provider.
- [ ] Destination/stops/recommendation markers are correct, labels remain readable, visited stops are understandable.
- [ ] Current location is shown only with a fresh ready fix. Missing heading draws a dot, not a directional arrow.
- [ ] Route framing clears measured chrome; continuous GPS updates do not steal a panned camera; recenter works.

## GPS and navigation

- [ ] First launch explains location before asking. Denial retains text and route UI; Allow location / Settings / retry reconnect correctly.
- [ ] Outdoors: coordinates/accuracy/fix age are plausible; stale/poor fixes make speed and live estimates unavailable.
- [ ] Stationary speed settles to 0 MPH after distinct low-speed fixes; no negative speed or extreme single-fix spike is displayed.
- [ ] Moving course is plausible; stopped marker stays stable then loses direction gracefully; no stationary compass spin.
- [ ] Progress at an intersection/self-crossing does not jump to another route branch; test a parallel road and inspect GPS uncertainty rather than assuming lane precision.
- [ ] Real forward progress updates remaining distance/time/arrival consistently on Map and assistant. Noisy backward fixes do not dramatically reverse it.
- [ ] Start, add, remove, mark visited, refresh, stop/end and cancel maintain one coherent trip.
- [ ] Deviate from the route safely: multiple accurate fixes and time confirmation precede reroute. Offset/sample count/cooldown/reason are visible in diagnostics.
- [ ] Reroute failure keeps the previous geometry and trip; recovery on network return works without a storm of requests.
- [ ] During active navigation, failed UI add/remove or AI mutation preserves the existing route.
- [ ] Reload: Trips offers saved destination/remaining stops; recalculate uses fresh GPS and requires Start trip. Old ETA/geometry, completed stops and microphone sessions are not restored. End/discard removes the slot.

## Wake and audio

- [ ] With model + AccessKey + foreground trip + enabled preference, observe initializing → armed only after native success. Repeated React renders do not create another engine.
- [ ] Missing-model build reports **Hey ROAM model is not configured.** Push-to-talk, text and route controls work.
- [ ] Remove key, invalid key/license, wrong/corrupt model and initialization failure: safe status, no secret payload, no active microphone claim; text/PTT fallback survives.
- [ ] Speak Hey ROAM at several parked-car distances/noise levels; note detection counts and failures at sensitivity 0.5.
- [ ] At least 10 minutes of speech/music without the phrase: record false detections, empty/canceled sessions and active durations. Do not treat absence in one sample as a guarantee.
- [ ] Repeated wake callbacks/cooldown produce one command and one subtle haptic, no concurrent assistant requests.
- [ ] Observe wake release → recognition start → final transcript → AI/tools → TTS → cooldown/rearm. The microphone indicator agrees with native diagnostics.
- [ ] Interim-only/empty/silent commands make no Gemini call; the finite window ends and wake resumes.
- [ ] Final short/long commands send once. Recognition error closes input and offers text/retry.
- [ ] During a long spoken reply, **one mic tap** stops TTS and starts recognition, including with Hey ROAM unavailable. Old playback completion must not restart a stale follow-up.
- [ ] Valid “Want me to add it?” confirmation opens recognition after playback, accepts Yes without another wake phrase, times out after ten seconds, handles silence/Cancel and rearms without duplicate requests.
- [ ] Ordinary replies do not create confirmation windows. “Never mind” retains the route; explicit “Cancel my route” follows grounded route cancellation.
- [ ] Disable Hey ROAM/end trip/background/unmount: recording stops, resources release, OS mic indicator clears. Foreground only rearms with eligible trip/config/permissions.
- [ ] Revoke microphone/speech permissions in Settings and return: no armed/listening claim after denial.
- [ ] Safely test a phone call, Siri/system interruption, Bluetooth connection/disconnection and optional music coexistence; observe release and deliberate recovery. If the mic persists, record it, close ROAM and do not continue the audio test.
- [ ] **Acoustic barge-in is unsupported in this build**: saying Hey ROAM during TTS is not advertised as functional. Validate the tap fallback; enable concurrent acoustic experiments only after a separate AVAudioSession/echo investigation.

## Network and assistant

- [ ] Wi-Fi → cellular → Wi-Fi during navigation: route remains present. Observe authenticated Worker and provider diagnostics on the new connection.
- [ ] Disconnect/reconnect, timeout and quota/error responses: generic readable failure, retained trip, explicit retry, no invented places/ETAs.
- [ ] “I'm hungry”, gas, restroom, add second result, remove a stop, ETA and arrival use verified state/results.
- [ ] Failed conversational request exposes Retry. Failed action may retry only within the same trip and token lifetime. A completed stop action followed by an AI failure must not offer a replay or add twice.
- [ ] Background during reasoning/tool execution prevents late replies/audio or restoration of a canceled trip.

## Battery and evidence

- [ ] Compare similar parked/road sessions with Hey ROAM off/on, same brightness/network/GPS use. Record OS battery consumption and armed/recognition/TTS/GPS durations, detections and successful commands.
- [ ] Low Power Mode appears in diagnostics and reduces decorative animation; navigation is still available.
- [ ] Event log retains only 80 timestamped labels; key status is configured/missing, never its value. No audio recording file or GPS trail is persisted.
- [ ] Attach private test notes/screenshots to your local report with device/build and outcomes; avoid publishing diagnostic coordinates, transcripts or credentials.

Until these checks are recorded, wake accuracy, audio coexistence, road smoothing, native rendering and battery performance remain **unverified**.
