# V0.8 simulator and iPhone checklist

Record build ID, SDK versions, device/OS, pass/fail, and a short observation. Do not record tokens or a GPS history. Automated tests do not mark any hardware item below as passed.

## Native build

- [x] EAS simulator build compiles Mapbox Core 3.32.0 / Maps 11.32.0 through SPM, including the final local module. Build [a0cb6efd](https://expo.dev/accounts/pghale/projects/roam/builds/a0cb6efd-0353-4e3f-af6a-f301b6e3b571) finished October 7, 2026 at 16:20 UTC.
- [x] Downloaded archive contains all three Mapbox runtime frameworks for both app architectures and no vendored Google Navigation/Maps SDK.
- [ ] Configure the Mapbox public token in EAS development, then rebuild; diagnostics shows token configured without its value.
- [ ] Install the simulator build on a Mac; launch with Metro and verify foreground permissions.
- [ ] Create a signed development device build and install on a registered iPhone.
- [ ] Confirm module unavailable/token missing/invalid token/network failure shows usable planning fallback without a crash.

## Map and simulation

- [ ] Search in attributed Google lists/cards. Google discovery markers do not appear on the Mapbox map.
- [ ] Mapbox route preview matches the route passed to Start Trip.
- [ ] Dark and light map styles, road labels, warm alloy route/puck/stops remain readable.
- [ ] Logo and attribution button stay visible and tappable above overlays on small/large iPhones, including assistant sheets.
- [ ] Theme changes and React rerenders do not recreate the core or start another location session.
- [ ] Use diagnostics to simulate the active route. Steps, remaining distance/time, fraction, snapped position, and arrival advance.
- [ ] Simulation stops on request and trip end, then a new trip uses live GPS.
- [ ] FOLLOW is useful; OVERVIEW fits remaining route; manual pan stays FREE through progress, reroute, and stop updates until deliberate recenter.
- [ ] Route line follows SDK changes and traversed portion fades; no old preview polyline remains underneath.
- [ ] Missing road/exit/lane data is unavailable rather than fabricated.

## Route updates and stops

- [ ] Add coffee through Hey ROAM: spoken added time agrees with a Mapbox baseline/candidate comparison.
- [ ] Add a stop immediately after Start Trip while parked/uncertain; a successful SDK route must not time out because session state stayed the same.
- [ ] Add/remove a stop while driving; old guidance runs during calculation and the plan commits after SDK route acceptance.
- [ ] Disable network during a candidate update; existing route, guidance, stop order, and UI remain intact.
- [ ] Cancel/change destination during a pending route request; late results do not restore a cancelled trip.
- [ ] SDK intermediate arrival pauses progression; Continue marks the correct stop only after NextLegStarted.
- [ ] A failed Continue retains the stop and can retry.
- [ ] Reroute after an already visited stop; next waypoint ID still maps to the right ROAM stop.
- [ ] Final arrival releases native guidance/location and leaves an arrival summary.
- [ ] Off-route SDK rerouting updates geometry/ETA while fallback geometric rerouting stays disabled.

## Audio and assistant

- [ ] Only one guidance voice; SDK-timed text uses ROAM TTS.
- [ ] Critical turn guidance preempts lower-priority speech; ordinary assistant/status cannot interrupt it.
- [ ] PTT, Hey ROAM, confirmations, and wake rearming work before/after navigation speech.
- [ ] A pending card mutation/audio lease does not permanently suppress subsequent turn guidance or wake detection.
- [ ] Repeat/next turn/exit/current road/remaining time/arrival use fresh SDK facts.
- [ ] Recenter/overview/stop speaking execute locally without Gemini calls.
- [ ] Stale/rerouting guidance is not spoken; no delayed obsolete instruction plays after background or trip end.
- [ ] Phone call, audio-route change, headphones, and microphone permission revoke recover safely.

## Physical foreground drive

- [ ] Parked start, slow movement, ordinary turns, highway exit, roundabout, and weak GPS are tested with a passenger operating diagnostics.
- [ ] Snapped puck is stable while raw speed/accuracy remain honest; no invented direction when heading is unavailable.
- [ ] Background/lock stops this foreground prototype's navigation/location; foreground resumes retained route with no stale speech.
- [ ] End trip releases resources; repeated trips do not create duplicate SDK cores or voices.
- [ ] Inspect Mapbox billing usage after simulation/drives; no assertion that navigation is always free.

V0.8 does not include offline-region downloads, background guidance, CarPlay, or an alternative-route selector. Keep [V0.6 voice checks](v06-iphone-checklist.md) and [V0.7 fallback checks](v07-iphone-checklist.md) alongside this checklist.
