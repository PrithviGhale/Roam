# ROAM V0.6 reliability

V0.6 extends V0.5 (`17400930dd36908e1489e711fabb43074d9c5718`). It retains Expo SDK 57, React Native 0.86.3, Porcupine 4.0.0, Voice Processor 1.2.3, speech recognition 57.1.0, Google provider adapters and the existing Worker contract. The backend continues to identify itself as V0.4. No new provider architecture or navigation SDK is introduced.

## Audit and changes

The V0.5 audit covered VoiceController/native ports, speech/TTS callbacks, AppState cleanup, foreground location subscriptions, TripController/deviation/progress, Driving Mode, all sheets/screens, diagnostics, native config/plugins, EAS and existing tests. Concrete gaps were a two-tap TTS interruption, build-flag-only model readiness, retained wake engines at lifecycle boundaries, recognition claiming Listening during permission/startup, noisy speed/compass display and global nearest-segment progress at crossings.

`VoiceController` remains the authoritative audio coordinator. It serializes short handoffs, cancels stale callbacks by generation, and aborts obsolete assistant requests. Native initialization now lives in one `WakeRuntime`, with single-flight startup, current callbacks on rearm and explicit unavailable / initializing / armed / wakeDetected / pausedForRecognition / error states. Reused Porcupine callbacks cannot retain an old command generation. Stop failures prevent the next consumer from starting.

Runtime model validation uses `new File(Paths.bundle, "hey-roam_ios.ppn")`, checking existence and nonzero size in the installed binary. The config flag is only a build hint. A missing model produces **Hey ROAM model is not configured.** Missing keys, authorization/license errors, permission errors and general initialization errors are separate safe states. Native error payloads and AccessKeys never enter diagnostic snapshots or event logs. Key persistence stays centralized in SecureStore on the device. A readable but incompatible/corrupt model remains an initialization failure, not a successful model validation.

The foreground-trip flow is:

1. Eligible trip, enabled preference, installed model and key → initialize local wake engine → confirm native recording started → Armed.
2. Detection → one restrained haptic → stop local wake recorder → prepare command recognition.
3. Native recognition `start` event → Listening. A final transcript is submitted only after recognition is stopped and inactive; interim-only or empty captures never go to Gemini.
4. One Gemini/tool request, with audio capture released. Existing verified receipts and atomic trip mutations remain authoritative.
5. Queue TTS → Preparing spoken reply → native `onStart` → Speaking.
6. Native playback completion → stop TTS → ten-second recognition window only for a valid typed confirmation, otherwise cooldown → rearm.

**True acoustic wake/TTS barge-in is disabled.** Simultaneous wake recording, playback, echo and AVAudioSession categories are not validated on an iPhone. The supported fallback is **one microphone tap**, which invalidates playback callbacks, stops TTS and opens recognition without requiring a working wake engine. Permission prompts may still require interaction. No background wake recording is enabled.

Recognition has a 12-second command cap and 10-second follow-up cap, beginning after actual native start. Native startup has a five-second timeout after permissions resolve. Silence/error paths release capture; a native no-speech result after startup closes the empty command. “Never mind”, “Cancel” and “Stop listening” cancel the conversation while preserving the trip. “Cancel my route” remains an explicit grounded assistant action. TTS has a 45-second watchdog. Wake cooldown is 1.2 seconds; detections within 1.8 seconds are ignored. Duplicate wake callbacks cannot launch parallel commands. Permission changes on foreground return are checked again.

Backgrounding, app-provider unmount, trip end, disabling Hey ROAM, audio interruption and diagnostic leases release wake resources. Temporary recognition/TTS handoffs pause the engine for reuse. The adapter checks the Voice Processor recording state even when its manager failed before setting its private listening flag. Foreground return rearms only with an enabled preference and active verified trip; failed/denied configuration remains a fallback state. An audio interruption waits for deliberate retry or foreground return rather than repeatedly fighting a call.

Sensitivity defaults to **0.5**. Development diagnostics offers **0.35 / 0.5 / 0.65**, with safe accepted bounds **0.2–0.8**. Changes require released audio and last only for this app session. Higher values can increase sensitivity and false activations. This is a balanced starting value, not a measured acoustic calibration.

## Location and progress

Location permission is requested after the contextual Allow location / retry action, rather than automatically alongside launch. Microphone/speech prompts occur on voice actions. Denied speech has text fallback and a Settings action. Existing granted location permission starts the foreground listener; background removes it. A location error rechecks permissions, and revocation removes the listener. No always-location or background-audio permission is added.

GPS rejects invalid Earth coordinates, nonfinite timestamps, fixes older than 15 seconds and timestamps more than one second ahead. Speed rejects missing/negative/nonfinite readings, speeds above 90 m/s and accuracy worse than 65 m. It uses a rolling three-sample median followed by 65% new / 35% previous smoothing; two distinct low-speed fixes (<0.8 m/s) settle to zero. Gaps over eight seconds reset smoothing. Invalid/stale measurements display unavailable rather than carrying old speed forward. This filter has not been road-calibrated.

Heading uses moving GPS course (speed ≥2 m/s, accuracy ≤25 m), briefly holds the last reliable moving bearing while stationary, and expires it after ten seconds. No stationary compass subscription runs. An unavailable bearing draws a position dot, not an invented north arrow.

Progress keeps one accepted route projection, not a GPS history. After an accurate on-route anchor, segment selection is constrained to 40 m backward and max(100 m, 55 m/s × elapsed seconds) forward. Nearby branches receive a small continuity preference at crossings. Small backward jitter holds the accepted progress; rejected jumps show the last route snapshot with unavailable live arrival. A route revision resets the anchor; a gap over 30 seconds allows a fresh accurate on-route anchor. UI and assistant context consume the accepted projection in the real app. These are conservative heuristics, not lane matching: closely parallel roads inside GPS uncertainty cannot be distinguished reliably.

Rerouting retains three distinct accurate fixes, at least six seconds of confirmation, accuracy ≤50 m, deviation >max(70 m, 3×accuracy), a 60-second cooldown and preservation of the old route during failure. Diagnostics shows offset, confirmation count, remaining cooldown and last refresh reason. Active-trip UI add/remove changes now use the existing atomic mutation path too, preserving navigation during a network failure. Planning-mode recalculation retains its existing behavior.

Assistant replies classify retry as conversation / failed action / already executed action. A retry token is session-only, single-use, expires after 60 seconds and requires the exact same trip context. A verified completed mutation cannot be replayed by Retry even if the final AI response fails. Existing stop-ID deduplication, bounded tool execution, reference expiry and atomic route application still apply. Retry never runs automatically.

## Diagnostics and session instrumentation

Diagnostics V2 includes OS version, app/build and Expo environment; location permission, coordinates, accuracy, raw/filtered speed, heading and fix age; model/key status, engine initialization/state, armed status, permissions, active recognition and last user message already used by the assistant; TTS/wake/recognition owner; route availability, progress, deviation and reroute state; existing explicit Worker/auth/Gemini/Places/Routes probes.

Default isolated diagnostics owns an audio lease. **Observe active trip audio** releases the lease so a parked tester can watch normal wake/recognition/TTS behavior. Switch back to isolated mode before microphone/TTS probes. Probes do not send diagnostic transcripts to Gemini. Provider probes retain their billable-request warning and existing budgets.

The event log keeps the latest **80 timestamped event labels in RAM**, with no transcripts or keys. Session counters include wake detections, successful voice commands, canceled/empty wake sessions, recognition session count, armed time, active recognition time, callback-observed TTS time and GPS listener session duration. Nothing is uploaded. Timings are instrumentation, not measured battery draw; stop latency is included.

`expo-battery ~57.0.3` reads Low Power Mode using its maintained API. It is optional in an older native binary and reported unavailable on unsupported surfaces. One app-wide provider listens for changes; the existing reduced-motion hook also reduces animations when low power is enabled. Navigation and GPS remain available.

## Recovery, UI and privacy

A started trip stores only a validated destination, remaining unvisited stops and save timestamp in local AsyncStorage. The saved plan expires after six hours. Trips offers **Recalculate saved plan** from fresh GPS; it restores no old route, ETA, started flag, microphone state or raw GPS history. The user must tap Start trip again. Cancel/end removes the plan. Invalid/oversize/duplicate/expired data is discarded. This is one recovery slot, not journey history.

Portrait remains locked, using safe-area insets and measured map chrome rather than device offsets. Page scroll content now reserves the home-indicator inset on standalone diagnostics too. Native Apple legal/logo insets complement Google map padding so legal marks sit above chrome. Missing direction uses a dot. Microphone icons/VoiceOver labels describe the one-tap interruption. Existing keyboard avoidance, flexible sheet height, scrollable actions, wrapping cards and normal font scaling are retained; original warm-alloy styling/Pulse/journey rail remain.

Physical Dynamic Island, keyboard, very large text, native map attribution/markers and Bluetooth/call behavior are still unverified. No enabled app/browser surface was returned by the available Computer Use connection, so there is no screenshot review claim. Follow the [iPhone checklist](v06-iphone-checklist.md).

## Validation and remaining work

Credential-free checks: **153 tests pass (134 app/service + 19 server)**, preserving the original 126 and adding 27. Both TypeScript checks and **21/21 Expo Doctor checks** pass. `npm run native:check` generates/introspects iOS permission configuration; model plugin tests cover absent/idempotent bundling. iOS, web and Android Metro exports pass (Hermes bundles for iOS/Android, browser bundle for web). Worker dry-run build passes with Wrangler 4.147.0 (1730.59 KiB upload / 243.90 KiB gzip). Nothing was deployed to Cloudflare.

`npx expo prebuild --platform ios --no-install` was attempted on Windows. Expo explicitly skipped iOS generation and required macOS/Linux. No actual Xcode project/CocoaPods compile or signed IPA is verified. EAS cloud/macOS is the next native build gate. SDK installation still reports 32 existing audit findings (10 moderate, 22 high); no forced dependency rewrite was applied.

V0.7 should first execute the physical checklist, measure wake false positives/detection distance, microphone release/call behavior, GPS road performance and battery usage, then adjust thresholds from those results. Keep acoustic barge-in disabled unless echo/audio-session experiments demonstrate reliable exclusive ownership.

API references checked: [Expo FileSystem](https://docs.expo.dev/versions/latest/sdk/filesystem/), [Expo Battery](https://docs.expo.dev/versions/latest/sdk/battery/), [speech recognition native events](https://github.com/jamsch/expo-speech-recognition), [Expo iPhone build flow](https://docs.expo.dev/tutorial/eas/ios-development-build-for-devices/), [internal distribution](https://docs.expo.dev/build/internal-distribution/). Installed SDK source was also reviewed for model paths, wake callbacks/processor teardown and native recording state.
