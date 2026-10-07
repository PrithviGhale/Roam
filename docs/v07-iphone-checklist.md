# V0.7 simulator and iPhone checks

These are **pending manual checks**, not completed tests. Google Navigation stays disabled for the current personal project. The native guidance checks below apply only after eligibility is resolved; do not enable Google Navigation solely to test a personal application.

## Build and personal-use fallback

- [ ] Build on EAS/macOS with Xcode 26+, using the existing development profile and `ROAM_ENABLE_NAVIGATION=false`.
- [ ] Confirm the SDK preparation hook runs before prebuild/pods and the Swift module actually compiles.
- [ ] Install on a registered iPhone (iOS 16.4+). Start Metro with `npx expo start --dev-client --clear`.
- [ ] Open Map, Trips, ROAM, Profile, and Maps licenses. Check both themes and larger text.
- [ ] With Maps key/backend configured, plan/start/refresh/end a drive and add/remove stops. Confirm existing route progress/GPS speed/ETA and conservative rerouting.
- [ ] Confirm no Navigation SDK terms prompt/session/request occurs when disabled; diagnostics explains disablement without repeated popups.
- [ ] Check unavailable-key, older native build, Expo Go, web, and Android fallbacks without a crash.
- [ ] Verify PTT, TTS interruption, optional Hey ROAM, and trip recovery using the [V0.6 setup/checklist](v06-iphone-checklist.md).

## Future eligible navigation simulation

- [ ] Resolve commercial eligibility, billing, SDK API enablement, restricted native key, and terms first. Rebuild for any native setting change.
- [ ] Choose an actual route with 5-10 maneuvers: local streets, a highway exit, one intermediate waypoint, and the final destination.
- [ ] Start Trip: verify the original Google first-use terms/driver disclaimer, route acceptance, and native Driving Mode.
- [ ] In development Diagnostics, start SDK route simulation. Production must have no simulator controls.
- [ ] Verify left/right/slight/sharp/fork/merge/U-turn/straight/roundabout/exit/arrival icons in the review screen, then compare actual supplied maneuvers against the rail.
- [ ] Verify supplied road/instruction, exit/roundabout number, second maneuver, and distance countdown. No fabricated lanes/current-road names.
- [ ] Listen for one prompt per distance band and no Google/ROAM double speech. Ask repeat direction and next turn; disconnect Gemini and confirm these local commands still work.
- [ ] Pan into FREE, keep it through a maneuver and route replacement, then recenter into FOLLOW. OVERVIEW should show the accepted route. Tilt should be restrained.
- [ ] Reach a waypoint, pause, continue/mark complete, and confirm it becomes visited only after the remaining route is accepted.
- [ ] Safely inject a changed location/route through SDK-supported simulation tooling or test a reroute with a passenger. Confirm Updating route retains old guidance/geometry until replacement.
- [ ] Reach the final destination: guidance, native location listeners, navigation TTS, and wake trip mode stop; summary remains until Done.
- [ ] Stop simulation; verify it cannot leak into a later trip.

## Future physical navigation

- [ ] Use a passenger for UI/log observations; keep driving interaction minimal.
- [ ] Validate snapped marker, approximate raw-GPS speed, native ETA/distance, local-street turns, highway exit, stop, final arrival, and missed-turn rerouting.
- [ ] While navigating, ask Hey ROAM next turn/find gas, accept a verified stop, and test PTT interruption. Confirm navigation continues and urgent guidance interrupts lower-priority chatter.
- [ ] Interrupt with a phone call/backgrounding; navigation stays foreground-only and does not fight the OS audio session. Resume deliberately and check fresh guidance.
- [ ] Test network loss during add/remove/continue: keep old route/stop state, show usable failure feedback, and allow retry.
- [ ] Check a tunnel/poor signal only where safe, and parallel roads. Stale guidance must not be presented as a current countdown; do not assume the snapped fix is always correct.
- [ ] Inspect Dynamic Island/notch, small iPhone, home indicator, light/dark themes, reduced motion, and larger text.
- [ ] Confirm Google attribution is visible between overlays in FOLLOW/FREE/OVERVIEW; license text remains accessible.
- [ ] End/cancel during initialization, route staging, TTS, and after arrival. Confirm microphone/location listeners are released and no duplicate callbacks occur on the next trip.

Record device/iOS/build version and observed result next to each item. Do not mark simulation, native compilation, or physical driving as passed based on JavaScript exports or mocked tests.
