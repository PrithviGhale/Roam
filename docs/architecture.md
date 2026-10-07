# V0.5 architecture

Expo Router retains Map/Trips/ROAM/Profile. ThemeProvider persists only the theme. RoamProvider owns one foreground GPS watcher and a subscribable TripController. AssistantProvider owns bounded conversation, optional native capture and read-aloud. No app/server database is added.

## Verified recommendations

Both `usePlaces` quick actions and `AssistantEngine` call `createTripTools` with the shared app-session `detourService`. V0.2 Google adapters normalize the same fixed Places/Routes contracts. Autocomplete remains debounced and separate from recommendation searches. Sheets snapshot GPS at opening/retry and rerun after route changes, never on ordinary GPS updates.

`routeAware.ts` projects driver/candidates onto the active polyline, excludes behind/outside-corridor results and pre-ranks them with pure scoring. `routeTiming.ts` maps verified leg duration to geometric fraction, including time-ahead inversion. Destination-biased searches use destination coordinates; detour calculations always use the driver origin. Timed searches use one region and exclude matches beyond 3 km of it.

`DetourService` checks three finalists: one fresh baseline through unvisited ordered stops, then one candidate route each. All comparisons in a batch use the same origin/plan. Candidate insertion retains the existing stop order. Signed differences and original/candidate totals are typed `VerifiedDetour` values. Failed/unchecked candidates never get synthetic zeroes. Max-detour filtering accepts only computed values within the requested seconds. Cache: 60 s / 150 m movement / thirty entries / route+plan+visited-state identity, app memory only.

Default cold budget is two Places + four Routes calls maximum, one Places call for timed/destination searches. Cache hits can eliminate all Routes calls. The assistant has three model rounds, six tools, one mutation; messages/tools/history/body sizes are bounded. Workers apply provider-wide rate bindings. None of these is a global spending cap.

## Trip tracking / transactions

Route records own verified geometry, duration, distance, legs and calculation time. `tripProgress` projects fresh accurate GPS, scales Google's distance and leg-duration distribution, and calculates a distinct arrival timestamp. Stale/inaccurate/off-route GPS suppresses current arrival/progress. Completed distance is a scalar aggregate carried across successful recalculations; no GPS history. Percent is relative to completed plus revised remaining distance.

`RouteDeviationMonitor` retains only route reference, confirmation count/timestamps and last attempt time. Started trip only; accuracy ≤ 50 m, fresh distinct fixes, offset > max(70 m, accuracy × 3), three fixes over six seconds, sixty-second attempt cooldown. Ordinary motion generates no API calls. `refreshAtomic` leaves the old trip/geometry intact while loading and commits only success. Cancel/destination generations defeat late results. A failed refresh returns to ready with old route and a recoverable tracking error. Assistant stop transactions also preserve old plans on failure. Ordinary UI stop edits retain V0.2 requested-plan/retry semantics.

Three accurate near-stop fixes mark the next stop visited locally; manual Mark visited covers missed fixes. Refresh/detour/stop-change route requests exclude visited stops. Stops remain visible/removable in their original order. Detection is proximity, not proof of business access. Complex loops/parallel roads and GPS behavior need physical validation.

## Assistant trust boundary

`shared/assistant.ts` declares eleven small tools with strict argument/context/response schemas. The phone sends compact driving/arrival/progress/recent-result facts, never GPS coordinates/geometry. Gemini chooses tools; the phone invokes the existing verified services/controller and returns receipts. Arrival/detour facts are rendered from receipts; free-form model prose cannot inject factual values.

The Worker uses `@google/genai` 2.27.0 and `gemini-3.8-flash`, preserves original model parts/thought signatures in signed two-minute stateless continuation, and matches receipts to issued calls. `tripStarted` selects short driving templates. New search controls extend existing tools; `rerouteTrip` requires an explicit refresh/reroute command. Recommendations still need acceptance, ordinals use displayed order, ambiguous removals require clarification, and only success acknowledges mutation.

## Backend / security

App Places/Routes REST config is Worker-only. Native Maps rendering uses a separate public application-restricted SDK key. The generic HTTP adapter can still run direct injected-server/test calls, but no general REST credential is read by the app or native config.

`auth.ts` strictly parses one bearer credential and compares fixed-size hashes timing-safely. Identity is development/prototype/user. Current published protection is a shared testing token; future user mode needs an injected trusted verifier and otherwise fails closed. No client-provided subject/IP is used as authenticated identity. `rateLimits.ts` handles overall/provider/diagnostic bindings, including per-subject plus shared provider keys for future users.

`google.ts` allowlists endpoint/body/type/field masks; `costControls.ts` enforces configurable lower budgets. Existing 128 KiB streaming body/timeout, CORS, sanitized error, no-store response and secret boundaries remain. Cloudflare rate limits are per location/eventually consistent, not global quotas. No module-global Worker request state, raw coordinate/prompt/audio logs or stored sessions.

## Device diagnostics / voice

Development-only Profile route reports foreground sensor state/permissions, native recognition availability, transcript/confidence and TTS playback. `services/diagnostics.ts` distinguishes untested/configured/connectivity/error states. Health/auth are free of provider calls. Explicit probes use fixed Boston samples (one Places/Routes call) or Gemini model metadata. No phone GPS is sent. Production UI redirects; published paid probes default disabled and require an explicit backend flag.

Optional native lookup preserves Expo Go text/TTS. `VoiceController` serializes wake/STT/TTS audio handoffs, while generation checks and abort signals invalidate stale callbacks. Porcupine locally detects a bundled custom Hey ROAM model during opted-in, foreground, started verified trips. Commands have a twelve-second window; verified pending confirmations allow ten-second follow-up. No background recording or audio persistence. Wake pauses during TTS; concurrent barge-in is disabled pending physical validation. Diagnostics temporarily suspends the global audio owner. See [voice architecture/setup](v05-voice.md).

`design/tokens.ts` centralizes semantic palettes and presentation scales. `design/layout.ts` distinguishes planning/driving and exclusive map overlays. Map uses measured camera padding, a shared Pulse and compact DriveBar; Trips owns route/stop controls. Recommendations share verified detour cards; the assistant presents an editorial response stream. Exports and behavior tests don't validate native permissions, signing, visual layout, acoustic accuracy or audio routing. See [UI review](v05-ui-review.md).
