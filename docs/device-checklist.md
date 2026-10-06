# Physical iPhone verification

Status: not yet executed on a physical iPhone. TypeScript, service tests, dependency compatibility, and bundle exports were checked on Windows.

Perform these checks while stationary:

1. Run `npm ci` and `npm start`. Open the QR code in Expo Go for SDK 54. Check there is no red error screen.
2. Accept location permission. Confirm the map moves to your actual location and the custom marker appears. Pinch, rotate, and recenter.
3. Stay stationary. Speed should settle to 0 MPH when the GPS returns an accurate valid speed. An unavailable reading should show a dash instead of an invented speed. Check compass direction when sensors are available.
4. Test denied permission on a fresh installation/session. Confirm the explanation is readable, the app remains usable, and Retry or Open Settings appears. Return after enabling location and confirm recovery.
5. Disable device location services and retry. Confirm an explanation and no fabricated speed. Restore services and retry.
6. Background the app and return. Confirm GPS reconnects, speech stops, and stale speed is not retained.
7. Search `coffee`, select Daybreak Coffee, and verify the demo pin/preview. Clear the destination. Search an unmatched string and confirm the empty state.
8. Tap each quick action, select a sample, and close/reopen its sheet. All sample results should be labeled demo; no live routes or ETA should appear.
9. Open Ask ROAM, tap “I’m hungry,” and view the demo places. Type a weather or traffic request; it should explain that live data is not connected.
10. Tap the microphone: confirm the explicit voice preview notice. Select a sample prompt or type. Tap a response's speaker icon and stop it with the microphone/stop button. iOS text-to-speech may be inaudible in silent mode; turn the ringer on for this check.
11. Switch to the ROAM tab; the same conversation should appear. Open and dismiss the keyboard; check the composer remains visible.
12. Change the theme in Profile or with the Map header button. Restart the app and confirm the preference persists.
13. Check all four tabs, destination previews, denied-location panels, and sheet scrolling on a small iPhone and on a phone with a notch/Dynamic Island. Increase text size and check touch targets and clipping.

Record the iPhone model, iOS version, Expo Go version, and any failures when reporting results. No turn-by-turn driving test is needed for V0.1 because guidance is not implemented.
