# Physical iPhone verification · V0.2

Status: not yet executed on a physical iPhone. Run these checks while stationary. Record model, iOS version, Expo Go / development-build version, key restriction mode (without the key), and failures.

## Configuration and launch

1. Run `npm ci` / `npm start` and open a compatible SDK 54 Expo Go QR. With no `.env`, confirm the explicit demo state, fictional results, Apple map/GPS, and no fabricated route or ETA.
2. Enable the APIs / billing and add environment variables from README. Restart with `npx expo start --clear`. If the Google map manager is absent, confirm the readable setup message and use the documented native development build. Native SDK key changes require rebuilding.
3. Grant foreground location, confirm actual position, recenter, pinch, rotate, and pan. Deny permission in a fresh session and verify Retry / Settings recovery. Disable location services and restore them. Background and resume; verify stale speed is suppressed and foreground GPS reconnects.
4. At rest, confirm valid speed settles to 0 MPH; invalid/unavailable speed stays a dash. No invented road names or maneuvers should appear.

## Places and routes

5. Search `Starbucks`, `Boston`, `123 Main Street`, `Walmart`, `Manchester Airport`, and `Chipotle`. Verify meaningful real suggestions and selected coordinates. Check empty/one-character input, no matches, fast typing, closing mid-request, and re-opening; old results must not reappear.
6. Select a destination. Confirm real Google geometry, destination marker, GPS marker, camera fit, duration, miles, and arrival estimate. Compare with a Google route at the same time; differences in options/traffic can occur. Check both endpoints remain visible above overlays and Google attribution stays visible.
7. Pan manually after route load. GPS updates must not snap the camera back. Recenter should return to current position. Cancel while a route is loading and confirm a late response cannot redraw it. Select two destinations rapidly; only the latest should win.
8. Test all five quick actions without a route. Verify multiple Google results, known rating/open status only, address, labeled straight-line distance, and third-party attribution if supplied. Restroom search includes only Google-listed public bathrooms; absence/access is possible.
9. With an active route, open quick actions. Verify ahead/corridor ranking, geometric distance labels, and no fabricated detour minutes. Test near route end and well off route; off-route search should be labeled nearby. Try closing/re-opening and retrying the sheet.
10. Select a result, inspect its details, then Add as stop. Confirm destination is retained, stop is numbered, duration/distance/geometry update together, and duplicate taps/duplicate places do not trigger duplicate stops. Add multiple stops up to five and check insertion order.
11. Remove a stop in Trips. Confirm recalculation and that old route information disappears during loading. Simulate failure: stop list should remain the requested plan, route should be absent, and Retry should recover. Remove completed stops before refreshing.
12. Start Trip: check MPH and explicitly estimated remaining time/distance. Move only with a passenger operating the phone. Off-route message should offer manual refresh; there is no turn guidance or automatic rerouting. End / Cancel should clear destination, stops, line, and summary while keeping theme preference.

## Errors and regression

13. Test invalid/restricted key, billing-disabled or quota-limited project, unreachable destination, airplane mode, and request timeout. Confirm readable errors and retry, with no fictional replacement results. Restore configuration/network and retry. Do not log or share credentials.
14. In Google Cloud verify restrictions reject an incorrect bundle identifier where supported. Verify each REST API independently; use the backend approach if mobile restriction support is insufficient. Check native map key restrictions independently from REST keys.
15. Switch Dark / Light on every tab, open/dismiss keyboard and sheets, check assistant shared conversation and read-aloud / stop speech. Assistant and microphone remain labeled demo. Test a small iPhone, notch/Dynamic Island, large text, long destination names, and scrolling/attribution visibility. Theme should survive restart; trips should not.

Record actual results; passing a bundle export is not evidence that any physical-device step above passed.
