# V0.1 architecture

Expo Router owns navigation. ThemeProvider owns persisted theme selection. RoamProvider owns one foreground location subscription and the destination preview, avoiding separate GPS watchers per tab. AssistantProvider owns the shared in-memory conversation and voice state. Screens compose reusable UI; service implementations are replaceable.

Location updates are guarded against unmount, retry, and background races. Subscriptions created after cleanup are immediately removed. A fresh-fix timer distinguishes slow GPS acquisition; a freshness clock suppresses stale speed. The HUD converts meters per second to MPH and rejects invalid timestamps, negative/null/non-finite speed, poor accuracy, and implausible values. Compass failure does not prevent map usage.

PlacesService returns typed Place records with an explicit `mock` or `verified` source. The V0.1 fixture adapter only returns `mock`. Routes must have a `verified` source; its unconnected adapter throws rather than synthesizing a driving route. Weather behaves similarly. The assistant does not mutate the destination or invent provider results. A user taps a place to select its preview.

For Gemini, replace AIService with a backend client. Keep credentials on the backend. Register schemas for the future RoamToolName tools, validate arguments, invoke provider adapters, and return verified structured results. Keep understanding an intent separate from approving and executing changes to an active route. The current route is null because navigation is not implemented.

Voice states are modeled explicitly: idle → listening preview → processing → idle. Reading an assistant response moves to speaking and returns to idle on completion/error/stop. Native recognition can later produce input for the same send path. No always-listening service is started. Speech cancellation is guarded against stale callbacks and stops on sheet dismissal, tab blur, app background, and provider teardown.

Native MapCanvas uses react-native-maps; its web sibling is explicitly illustrative. Native map providers own the basemap. Theme tokens style all ROAM overlays; Apple Maps uses light/dark appearance and Google Maps can consume custom style arrays. Adding another theme doesn't require rewriting UI components.
