# V0.5 interface review

The code audit is recorded in `v05-ui-audit.md`. Shared tokens, layout modes,
overlay exclusivity and text contrast have automated coverage. iOS/web exports
compile the actual screens. These checks do not establish visual correctness.

The available computer-use connection returned no enabled browsers or apps.
No screenshot, simulator or physical-device visual review was possible in this
environment; none is claimed. Development **Profile → Interface review states**
provides labeled, non-navigating fixtures for Pulse phases, status/loading/error
states, long place names and autocomplete. It redirects out of production.

Review on small and large iPhones (360, 375, 393 and 430-point widths), both
themes, standard/larger accessibility text and reduced motion. Record device,
iOS, build, text size and screenshots locally. Use real configured services for
the functional states below; review fixtures are not verified destinations.

| Screen | Required states |
| --- | --- |
| Map | initial illustration/native map, GPS allowed/denied/stale, search, selected route, driving, rerouting/failure, recenter, Google attribution |
| Assistant | idle, typing/keyboard, thinking/tools, real results, local wake armed, command/listening/transcribing, follow-up, speaking/stop, failure |
| Places | loading/autocomplete/details, empty/failure/retry, real detour cards, selected place, add stop, route replacement, close with keyboard |
| Trips | no trip, planned route, driving, multiple/visited stops, remove/mark visited, refresh failure, end trip |
| Profile | appearance, voice toggles persisted, US units, privacy, unavailable native/model fallback, development-only diagnostics/review entry |
| Diagnostics | key entry/save/remove without exposure, audio suspension, counters, permission/provider tests, return/background cleanup |

Check that the composer and send remain visible above the keyboard, sheets
shrink within safe areas, destination names wrap, targets remain at least 44pt,
VoiceOver announces selected/current voice states, large text can scroll map
chrome instead of colliding with its header, and route/labels/Google attribution
remain legible. Map camera fitting uses measured overlays; GPS doesn't repeatedly
refit a panned camera. Pulse transform/opacity runs on the native animation driver.
No measured frame-rate/GPS performance profile is claimed.

Originality code review: warm alloy accent on graphite/neutral light surfaces,
three slanted lane strokes, an editorial response stream, a thin journey rail,
squared waypoint tiles and inset tab selection compose ROAM's identity. No
proprietary assets, Siri orb, turn-instruction clone or lane-level guidance is
used. Map data and ordinary familiar controls retain their provider conventions.

Known review limitations: native keyboard/safe-area/VoiceOver behavior, extreme
font scaling and Google labels/markers/attribution need device observation.
Web is an explicitly labeled illustration rather than a live navigation map.
No observed screenshot defect is being concealed; the visual review itself is
pending. Wake/TTS concurrent barge-in is intentionally unavailable in V0.5.
