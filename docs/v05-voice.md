# V0.5 foreground voice

ROAM uses **Porcupine React Native 4.0.0** and **React Native Voice Processor
1.2.3** for the custom wake phrase. This is a dedicated local detector, not
continuous transcription. The maintained SDK supports iOS 16+ and React Native
0.73+; ROAM's Expo SDK 57 requires iOS 16.4+. Native compatibility must still be
confirmed in a signed development build on physical hardware.

## Device setup

1. In [Picovoice Console](https://console.picovoice.ai/), generate **Hey ROAM**,
   English, **iOS**, for **Porcupine 4.x**. Download and copy that single keyword
   model to `assets/wake/hey-roam_ios.ppn`. This is the manual model-generation
   step: this repository cannot train/download it without your Console account.
2. Run `npm ci`, then `npx eas-cli build --platform ios --profile development`.
   Supply the existing Google Maps SDK key, API URL/token and Apple signing
   configuration described in README. Install this new SDK 57 development build.
   `npx expo start --dev-client --clear` starts Metro for it.
3. Open **Profile → Device diagnostics**, enter your Picovoice AccessKey, and
   save it. No key belongs in source, `.env`, Expo public config, logs or Git.
   Start a verified trip; enable **Hey ROAM** in Profile and grant microphone
   permission. Once armed, the Pulse says **listening locally**.

`plugins/withRoamWakeWord.js` copies the optional model into the iOS application's
Xcode resource build phase during prebuild. The model is ignored by Git; the
dedicated `.easignore` includes exactly this local model in the build upload.
No built-in substitute phrase is used. A missing model doesn't break the app:
native push-to-talk stays available. Missing native modules in Expo Go/web use
the explicit development-build notice and retain text/read-aloud.

An AccessKey is stored in Expo SecureStore, device-only and available while
unlocked. Removing it in Diagnostics stops/releases the detector first. Mobile
storage is not a substitute for vendor-approved distribution/provisioning. This
version's key entry is development-only; a public release needs an agreed
Picovoice provisioning strategy rather than embedding a private key in JS.

## License and technical sources

[Official React Native quick start](https://picovoice.ai/docs/quick-start/porcupine-react-native/)
documents custom bundled models, AccessKeys and start/stop/delete. The React
Native bindings are Apache-2.0; the engine/model use Picovoice's proprietary
terms. [Current pricing/usage FAQ](https://picovoice.ai/docs/faq/general/) describes
an enterprise trial/subscription and no dedicated personal/noncommercial plan.
Check eligibility, device limits, trial expiration, model rights and commercial
terms with Picovoice before relying on this feature or distributing ROAM. This
implementation does not promise free or perpetual wake detection. Engine
initialization/license validation may require vendor connectivity; on-device
inference does not mean the complete app or licensing is offline.

## Ownership and lifecycle

`services/voice/VoiceController.ts` is platform-independent and owns audio
transitions. `nativePorts.ts` adapts Porcupine, optional
`expo-speech-recognition` and Expo Speech; AssistantProvider retains the existing
verified AssistantEngine, Google trip tools and session messages.

States: inactive → armed → wakeDetected → listening → transcribing → thinking /
usingTool → speaking → cooldown → armed. Every native handoff waits for the
previous consumer to stop; speech recognition must report inactive before wake
or TTS resumes. Audio transitions are queued, but network requests/playback
callbacks never hold that queue. Generation checks suppress stale permission,
recognition, network and TTS callbacks after cancellation, new trip or background.
Stop failures invalidate commands and prevent the next audio consumer starting.

- Wake arms only when opted in, foreground, and navigating a started verified
  trip with a route. Turning it off, ending/changing trip or backgrounding
  releases audio. No background audio mode, background location or hidden service.
- Detection pauses wake before recognition; a subtle haptic acknowledges it.
  A command window lasts **12 seconds** after permission/start. Only a final
  recognizer result is submitted, never a partial/interrupted transcript. Native
  silence/end can finish sooner. Audio files are not persisted.
- A **10-second** answer window follows a spoken verified pending confirmation.
  The engine exposes its typed, current, expiring pending action; the controller
  never guesses from a question mark. “Yes” reuses that action through the normal
  engine. Silence clears the pending confirmation and returns through cooldown.
- “Never mind”, “Nevermind”, “Cancel”, “Stop listening” end the conversation,
  clear pending confirmation and retain the trip. “Cancel my route” goes through
  the existing explicit trip-cancellation engine.
- **1.8-second wake debounce** and **1.2-second cooldown** prevent duplicates.
  Busy thinking/tool states cannot open another capture. Late results are ignored.
- Wake pauses during TTS. **Wake-word barge-in is disabled** pending physical
  iOS audio-session/echo validation. Tap the microphone to stop spoken playback;
  tap again for push-to-talk. The controller has a capability gate for a future
  verified concurrent detector, but the native adapter does not claim support.
- Recognition/wake errors and unexpected TTS stops release resources and show
  retry. OS interruptions don't trigger a restart loop. Foreground return or a
  deliberate retry re-arms safely. Diagnostics suspends the global audio owner
  before its independent parked microphone/TTS tests and resumes it on exit.

## Privacy, settings and battery

Before activation, microphone frames are processed by Porcupine on-device.
No wake audio is forwarded to Gemini, Cloudflare, Places or Routes. After
activation (or manual tap), Apple's speech service may process command audio
remotely. The resulting text and compact trip context follow the existing
Worker/Gemini pipeline. ROAM does not persist recordings, transcripts,
conversations, location traces or behavioral analytics between sessions.

Local preferences persist Hey ROAM (default off), automatic spoken replies,
short driving replies and system/softer volume. Softer passes volume 0.65 to
Expo Speech relative to device playback volume; it doesn't change hardware
volume. Wake AccessKey is separate SecureStore data, never preference storage.

Foreground wake capture increases power use alongside GPS, map rendering and
screen brightness. Diagnostics reports **wake-active milliseconds, activations
and recognition sessions** in RAM for this app session, excluding transcription
and paused playback. No battery percentage claim is made. Measure 10–30 minute
trips on real hardware with wake on/off and consistent brightness/audio/GPS;
record elapsed time, battery change, temperature and false/missed activations.

Automated tests exercise ownership, follow-up, cancellation, interruptions,
cooldown, background races, stop failures and fallbacks with fake ports. They
do not validate acoustic accuracy, audible TTS, Bluetooth routing, phone calls,
SDK licensing, native compilation or battery consumption. See the physical
device and UI review checklists before treating this as a driving release.
