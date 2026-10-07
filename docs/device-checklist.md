# Physical iPhone verification · V0.4

**Not yet executed on a physical iPhone.** Record device/iOS, app build, backend version/model and sanitized failures. Test while parked; movement tests need a passenger operating the phone or a controlled route. Never paste keys/GPS traces into logs/issues.

## Build, permissions and GPS

- Install a compatible SDK 54 Expo Go or signed ROAM development build. Verify no-config fictional demo and configured failures without fabricated routes/results.
- Development build: restricted iOS Maps SDK key, bundle `com.prithvighale.roam`, speech module/permissions and foreground location. Native keys/modules require rebuild.
- Profile → Diagnostics: read permissions; verify live latitude/longitude, timestamp, accuracy, speed, heading and freshness. Compare speed/heading while stationary and moving. Deny permissions, disable location, retry/Settings, background/resume. Confirm no background watcher/audio.
- Expo Go microphone fallback must explain development-build requirement once tapped; text/TTS remain usable. Production build must hide diagnostics and redirect direct navigation to the route.

## Network / secrets

- Start/connect Worker using LAN IPv4 or HTTPS. Health means reachability only. Auth diagnostic reports configured/untested without provider calls. Invalid/absent token and malformed headers must reject published requests.
- Explicit Places/Routes probes each make one paid fixed-sample call without phone GPS. Gemini metadata probe is not inference proof: run a normal text turn afterwards. Check missing-key/network/429 states; wait a minute after limits.
- Published probes require an explicit development flag; turn it off afterwards. Check browser allowlist and native no-Origin behavior. Validate server API restrictions and native bundle restrictions separately; no general REST/Gemini key in mobile environment/bundle.

## Map, places, stops and detours

- Search city/address/business; verify debounce, details, actual Google geometry, camera fit, destination/stop markers, attribution and pan/recenter. Cancel/select-new-destination mid-request must suppress old results.
- Food/Gas/Restroom/Coffee/Parking before and during a trip. Parking and explicit near-destination coffee use destination anchor. Known ratings/review counts/hours only; restroom access and parking inventory not guaranteed.
- Route recommendations: top checked candidates show signed Google detour minutes/miles; unchecked/failed results show no driving-detour number. Compare original versus candidate routes at similar times. Confirm existing ordered stops are retained and candidate insertion matches preview policy.
- Repeat within sixty seconds/150 m to observe cache use; move further/change route/visited state to force fresh comparisons. Check a full five-stop plan doesn't issue candidate routes. Monitor provider dashboards for at most one baseline + three candidate requests per cold search.
- “Find gas within a five-minute detour”: every returned result must have a verified comparison ≤ 300 seconds. Fail candidate/baseline requests: unchecked places must not pass that limit. Empty results mean checked finalists didn't qualify.
- “Find coffee about 30 minutes from now”: check estimated search region lies ahead on route, one Places request, qualifier matches within region, and no guaranteed scheduled stop arrival. Requests beyond trip end should anchor near destination.
- Add first/second/third cards; recommendation alone must not add. Accept pending recommendation; unknown/expired/ambiguous/negated targets must not mutate. Add/remove stop recalculates ETA/arrival/geometry. Assistant transaction failures keep previous plan.
- Three accurate fixes within 40 m of the next stop mark it visited without paid refresh. If missed, Mark visited in Trips. Refresh must skip visited stops; remove remains usable and duplicate/full-plan guards remain.

## Driving, progress and rerouting

- Start Trip: prominent speed/destination/time/distance/arrival/mic, reduced setup controls, readable quick actions and large targets. Dark/Light, small iPhone, notch/Dynamic Island, large text and long names must remain usable.
- Move along route: completed/remaining distance, percent and estimated remaining duration change with projected progress. Arrival is a local clock time, distinct from duration. Stops/refresh update it. Stale/inaccurate/off-route GPS must suppress current arrival/progress.
- Check slow/fast legs, parallel roads, loops/intersections, GPS jumps and route end. Progress aggregate survives reroute; percentage is relative to revised journey. No turn guidance or Navigation SDK claim.
- One noisy off-route reading must not reroute. Three accurate distinct updates over six seconds beyond max(70 m, accuracy × 3) can request one route. Verify sixty-second cooldown on both success and failure; ordinary on-route movement/planning doesn't call Routes.
- During reroute old line remains and “Finding a better route…” appears. Network failure retains exact route/stops with recoverable message. Cancel/change destination while rerouting must defeat late completion.

## Assistant and voice

- “I'm hungry,” burger/brand query, gas/restroom, max detour, time-ahead, destination parking/coffee: verify actual cards, receipt-backed detours and no fictional prices/conditions.
- “What's my ETA?”, “What time will I get there?”, “When do we arrive?”, “How much longer?”: compare current duration/arrival/progress and estimate labels. Explicit “refresh my route” recalculates once; no accidental reroutes from search/questions.
- Started-trip responses should be short with one top suggestion; no automatic long spoken lists. Add/remove/cancel still require authorization. Normal map buttons work if Gemini is unavailable.
- Diagnostics recognition: read/grant/deny microphone and speech permissions, start/stop, transcript/confidence if provided, twenty-second cap, no submission to Gemini. Test TTS voices/audible playback/stop and iPhone silent/audio-route behavior.
- Assistant recognition: transcript sends once; concise spoken response, interrupt with mic/Stop; background/dismiss stops everything. Test Siri/call/audio interruption, network recognition failure and permission dialogs dismissed while leaving the screen. No recordings persisted or wake word.

Record actual results and known failures. Passing automated mocks/exports is not physical-device validation or proof of provider billing/model access.
