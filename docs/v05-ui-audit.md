# V0.5 UI audit and review boundaries

The audit covered Map, Trips, Assistant, Profile, Diagnostics, shared controls, search/results, permission and error states, keyboard containers, themes, markers and navigation summaries before redesign. Existing SDK 57 and TypeScript fixes are retained on main; the user-authorized working changes were not discarded to manufacture a clean baseline.

| Existing issue | V0.5 response |
| --- | --- |
| Search, category chips, implementation notice, HUD/route card and oversized assistant CTA compete with the map | Planning header, compact lower utility rail, one Pulse dock; driving hides search/categories |
| Planning and started trips share the same dense route card | Dedicated Drive Bar with remaining time, arrival and progress; controls move to Trips |
| End/refresh/details controls repeated in card and Trips | One actionable trip workspace; map exposes trip details |
| 9–11 pt labels, varying radii/spacing, shadows on every panel | Shared typography/spacing/radius/color tokens; flat surfaces and restrained warm alloy accent |
| Assistant uses generic chat bubbles and extra fixed-height chrome | Editorial response stream, shared Pulse, compact context and anchored composer |
| Keyboard offsets assume a fixed tab bar height | Modal safe-area bounds and keyboard avoidance; flexible scrolling and a composer that can shrink |
| Place detours compete with geometric distances and action label | Verified route comparisons are the leading metric; explicit snapshot provenance |
| Profile lacks voice settings and diagnostics are prominent | Appearance/voice/privacy sections; developer tools remain conditional |
| Diagnostics can start an independent microphone consumer | Shared voice controller is suspended while diagnostics owns audio |

The computer-use connection initially returned no apps or browsers. No live browser screenshots or physical-device visual/audio review is claimed from that connection. Development review states and the device checklist provide reproducible cases at 360/375/430-point widths, dark/light, enlarged text, keyboard and all voice phases. Automated behavior and platform bundle checks supplement, but do not replace, device review.

Originality: ROAM uses a warm alloy accent, three lane-like Pulse strokes, an editorial assistant stream and a narrow journey rail. It has no turn-instruction clone, Siri orb, proprietary artwork, or copied navigation card composition. Familiar search, tabs and trip actions remain recognizable.
