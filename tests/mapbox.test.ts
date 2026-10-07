import { test } from "node:test";
import assert from "node:assert/strict";
import {
  createProviderRoutes,
  nativeRouteSchema,
} from "../src/services/navigation/ProviderRoutes";
import {
  NavigationController,
  initialNavigation,
  navigationReducer,
} from "../src/services/navigation/NavigationController";
import {
  GuidanceSpeech,
  speechPriority,
} from "../src/services/navigation/GuidanceSpeech";
import {
  eventSchema,
  maneuvers,
  type NativeNavigation,
  type NavigationEvent,
} from "../modules/roam-navigation/src/types";
import { compareRoutes, DetourService } from "../src/services/detours";
import { buildContext, placeFact } from "../src/services/assistant/context";
import { navigationCommand } from "../src/services/navigation/commands";
import { contextSchema } from "../shared/assistant";
import { TripController } from "../src/services/tripController";
import { destination, origin, routeFor, stop, deferred } from "./fixtures";

const now = Date.now();
const g = {
  maneuver: "right" as const,
  instruction: "Turn right onto Elm Street.",
  roadName: "Elm Street",
  step: 2,
  leg: 1,
  distanceToManeuverMeters: 150,
  remainingDistanceMeters: 4000,
  remainingDurationSeconds: 400,
  fractionTraveled: 0.4,
  distanceTraveledMeters: 2600,
};
const rawRoute = (id = "mapbox-route") => ({
  ...routeFor(destination),
  id,
  provider: "mapbox" as const,
  legs: [
    {
      start: origin,
      end: destination.coordinate,
      distanceMeters: 6000,
      durationSeconds: 600,
    },
  ],
  calculatedAt: new Date(now).toISOString(),
});
const trip = () => ({
  destination,
  route: rawRoute(),
  stops: [],
  startedAt: new Date(now).toISOString(),
});
const event = (
  kind: NavigationEvent["kind"],
  sequence: number,
  extra: Partial<NavigationEvent> = {},
): NavigationEvent => ({
  session: "session",
  sequence,
  timestamp: now,
  provider: "mapbox",
  kind,
  ...extra,
});
const state = () => ({
  ...initialNavigation(),
  mode: "native" as const,
  provider: "mapbox" as const,
  session: "session",
  guidance: g,
  updatedAt: now,
});
function harness() {
  let listener: ((event: unknown) => void) | undefined;
  let calculations = 0,
    fallbacks = 0;
  let accepted = true;
  const calls: { waypoints: unknown; id?: string }[] = [];
  const native: NativeNavigation = {
    availability: async () => ({
      available: true,
      provider: "mapbox",
      version: "3.32.0",
    }),
    calculateRoute: async () => {
      calculations++;
      return rawRoute();
    },
    start: async (session, waypoints, id) => {
      calls.push({ waypoints, id });
      listener?.(event("started", 1, { session }));
      return accepted;
    },
    update: async (waypoints, id) => {
      calls.push({ waypoints, id });
      return accepted;
    },
    stop: async () => {},
    continueTrip: async () => accepted,
    simulate: async () => {},
    licenses: async () => "Mapbox",
    addListener: (_name, fn) => {
      listener = fn;
      return {
        remove: () => {
          listener = undefined;
        },
      };
    },
  };
  const fallback = {
    getRoute: async () => {
      fallbacks++;
      return { ...routeFor(destination), provider: "google" as const };
    },
  };
  return {
    native,
    fallback,
    calls,
    accept: (value: boolean) => {
      accepted = value;
    },
    emit: (value: NavigationEvent) => listener?.(value),
    counts: () => ({ calculations, fallbacks }),
  };
}

test("configured native Mapbox supplies the preview and keeps provider metadata", async () => {
  const h = harness();
  const router = createProviderRoutes(() => h.native, h.fallback);
  const route = await router.getRoute(origin, destination);
  assert.equal(route.provider, "mapbox");
  assert.equal(route.destination, destination);
  assert.deepEqual(h.counts(), { calculations: 1, fallbacks: 0 });
});
test("missing native module uses Google planning without attempting navigation", async () => {
  const h = harness();
  const route = await createProviderRoutes(() => null, h.fallback).getRoute(
    origin,
    destination,
  );
  assert.equal(route.provider, "google");
  assert.equal(h.counts().calculations, 0);
});
test("missing public token selects planning fallback", async () => {
  const h = harness();
  h.native.availability = async () => ({
    available: false,
    provider: "mapbox",
    reason: "missing-public-token",
  });
  assert.equal(
    (
      await createProviderRoutes(() => h.native, h.fallback).getRoute(
        origin,
        destination,
      )
    ).provider,
    "google",
  );
});
test("initialization failures recover through planning fallback", async () => {
  const h = harness();
  h.native.availability = async () => {
    throw Error("native-init");
  };
  await createProviderRoutes(() => h.native, h.fallback).getRoute(
    origin,
    destination,
  );
  assert.equal(h.counts().fallbacks, 1);
});
test("Google Navigation cannot be selected even if a legacy bridge says available", async () => {
  const h = harness();
  h.native.availability = async () => ({ available: true, provider: "google" });
  const nav = new NavigationController(h.native);
  assert.equal((await nav.available()).reason, "unsupported-provider");
  assert.equal(await nav.start(trip()), false);
  assert.equal(h.calls.length, 0);
});
test("planning route failure can fall back, active Mapbox failure cannot switch engines", async () => {
  const h = harness();
  h.native.calculateRoute = async () => {
    throw Error("network");
  };
  const router = createProviderRoutes(() => h.native, h.fallback);
  assert.equal((await router.getRoute(origin, destination)).provider, "google");
  await assert.rejects(
    createProviderRoutes(
      () => h.native,
      h.fallback,
      () => "mapbox",
    ).getRoute(origin, destination),
  );
  assert.equal(h.counts().fallbacks, 1);
});
test("pinned Mapbox comparisons fail when module disappears", async () => {
  const h = harness();
  await assert.rejects(
    createProviderRoutes(() => null, h.fallback).getRoute(
      origin,
      destination,
      [],
      { requiredProvider: "mapbox" },
    ),
  );
  assert.equal(h.counts().fallbacks, 0);
});
test("pinned Google comparison remains Google even with Mapbox configured", async () => {
  const h = harness();
  await createProviderRoutes(() => h.native, h.fallback).getRoute(
    origin,
    destination,
    [],
    { requiredProvider: "google" },
  );
  assert.deepEqual(h.counts(), { calculations: 0, fallbacks: 1 });
});
test("cancelled native calculation cannot return a late route or issue a fallback", async () => {
  const h = harness();
  const wait = deferred<unknown>();
  h.native.calculateRoute = async () => wait.promise;
  const abort = new AbortController();
  const pending = createProviderRoutes(() => h.native, h.fallback).getRoute(
    origin,
    destination,
    [],
    { signal: abort.signal },
  );
  await new Promise((resolve) => setImmediate(resolve));
  abort.abort();
  wait.resolve(rawRoute());
  await assert.rejects(pending);
  assert.equal(h.counts().fallbacks, 0);
});
test("waypoint conversion keeps order and omits visited stops", async () => {
  const h = harness();
  let ids: string[] = [];
  h.native.calculateRoute = async (_origin, points) => {
    ids = points.map((p) => p.id);
    return rawRoute();
  };
  await createProviderRoutes(() => h.native, h.fallback).getRoute(
    origin,
    destination,
    [{ id: stop.id, place: stop, visited: true }],
  );
  assert.deepEqual(ids, [destination.id]);
});
test("malformed native geometry and inconsistent leg counts cannot become verified routes", async () => {
  const h = harness();
  h.native.calculateRoute = async () => ({
    ...rawRoute(),
    geometry: [{ latitude: 95, longitude: 0 }],
  });
  await assert.rejects(
    createProviderRoutes(() => h.native, h.fallback).getRoute(
      origin,
      destination,
      [],
      { requiredProvider: "mapbox" },
    ),
  );
  h.native.calculateRoute = async () => rawRoute();
  await assert.rejects(
    createProviderRoutes(() => h.native, h.fallback).getRoute(
      origin,
      destination,
      [{ id: stop.id, place: stop }],
      { requiredProvider: "mapbox" },
    ),
  );
});
test("native route normalization rejects NaN, negative metrics and missing timestamps", () => {
  for (const invalid of [
    { ...rawRoute(), durationSeconds: NaN },
    { ...rawRoute(), distanceMeters: -1 },
    { ...rawRoute(), calculatedAt: "yesterday" },
  ])
    assert.equal(nativeRouteSchema.safeParse(invalid).success, false);
});
test("start and transactional update reuse the calculated native route IDs", async () => {
  const h = harness();
  const nav = new NavigationController(h.native, () => now);
  assert.equal(await nav.start(trip()), true);
  assert.equal(h.calls[0]?.id, "mapbox-route");
  assert.equal(
    await nav.update({ ...trip(), route: rawRoute("candidate") }),
    true,
  );
  assert.equal(h.calls[1]?.id, "candidate");
});

test("cancelling during failed-start cleanup cannot restore fallback state", async () => {
  const h = harness();
  const nav = new NavigationController(h.native);
  const cleanup = deferred<void>();
  let stops = 0;
  h.accept(false);
  h.native.stop = async () => {
    if (++stops === 1) await cleanup.promise;
  };
  const pending = nav.start(trip());
  await new Promise((resolve) => setImmediate(resolve));
  await nav.stop();
  cleanup.resolve();
  assert.equal(await pending, false);
  assert.equal(nav.getSnapshot().mode, "idle");
});
test("pending replacement keeps old guidance flowing and a failure preserves the active route", async () => {
  const h = harness();
  const nav = new NavigationController(h.native, () => now);
  await nav.start(trip());
  const session = nav.getSnapshot().session!;
  h.emit(event("route", 2, { session, geometry: rawRoute().geometry }));
  const replacement = deferred<boolean>();
  h.native.update = async () => replacement.promise;
  const updating = nav.update(trip());
  await new Promise((resolve) => setImmediate(resolve));
  h.emit(
    event("guidance", 3, {
      session,
      guidance: { ...g, remainingDurationSeconds: 350 },
    }),
  );
  h.emit(
    event("voice", 4, {
      session,
      voice: { text: "Turn right.", critical: true },
    }),
  );
  const old = nav.getSnapshot();
  assert.equal(old.guidance?.remainingDurationSeconds, 350);
  assert.equal(new GuidanceSpeech().next(old, now)?.text, "Turn right.");
  replacement.resolve(false);
  assert.equal(await updating, false);
  assert.equal(nav.getSnapshot(), old);
  assert.equal(nav.getSnapshot().mode, "native");
});

test("Google preview recalculates from the fresh origin before native start and explains the update", async () => {
  const h = harness();
  const nav = new NavigationController(h.native);
  let notice = "";
  let suppliedOrigin: unknown;
  h.native.calculateRoute = async (value) => {
    suppliedOrigin = value;
    notice = nav.getSnapshot().notice ?? "";
    return rawRoute("recalculated");
  };
  assert.equal(
    await nav.start(
      { ...trip(), route: { ...rawRoute(), provider: "google" } },
      origin,
    ),
    true,
  );
  assert.deepEqual(suppliedOrigin, origin);
  assert.match(notice, /Updating this route/);
  assert.equal(h.calls[0]?.id, "recalculated");
});

test("failed start recalculation keeps planning fallback without starting an unrelated route", async () => {
  const h = harness();
  const nav = new NavigationController(h.native);
  h.native.calculateRoute = async () => {
    throw Error("routing");
  };
  assert.equal(
    await nav.start(
      { ...trip(), route: { ...rawRoute(), provider: "google" } },
      origin,
    ),
    false,
  );
  assert.equal(h.calls.length, 0);
  assert.equal(nav.getSnapshot().mode, "fallback");
});
test("normalized Mapbox progress carries maneuver, fraction, leg and snapped road state", () => {
  const s = navigationReducer(
    state(),
    event("guidance", 1, {
      guidance: g,
      location: { ...origin, heading: 90 },
      road: "Current Road",
    }),
  );
  assert.equal(s.guidance?.leg, 1);
  assert.equal(s.guidance?.fractionTraveled, 0.4);
  assert.equal(s.location?.heading, 90);
  assert.equal(s.currentRoad, "Current Road");
  for (const maneuver of maneuvers)
    assert.equal(
      navigationReducer(
        state(),
        event("guidance", 1, { guidance: { ...g, maneuver } }),
      ).guidance?.maneuver,
      maneuver,
    );
});
test("invalid normalized progress and snapped fixes are rejected at the bridge", () => {
  for (const invalid of [
    { guidance: { ...g, fractionTraveled: 2 } },
    { guidance: { ...g, leg: -1 } },
    { location: { latitude: -91, longitude: 0 } },
    { voice: { text: "", critical: false } },
  ])
    assert.equal(
      eventSchema.safeParse(
        event("guidance", 1, invalid as Partial<NavigationEvent>),
      ).success,
      false,
    );
});
test("rerouting preserves the old route and clears only on completion", () => {
  const old = {
    ...state(),
    geometry: rawRoute().geometry,
    camera: "FREE" as const,
  };
  const updating = navigationReducer(old, event("rerouting", 1));
  assert.equal(updating.geometry, old.geometry);
  assert.equal(updating.rerouting, true);
  const done = navigationReducer(updating, event("rerouted", 2));
  assert.equal(done.rerouting, false);
  assert.equal(done.camera, "FREE");
});
test("accepted route metadata follows authoritative reroute geometry", () => {
  const next = navigationReducer(
    state(),
    event("route", 1, {
      geometry: rawRoute().geometry,
      route: rawRoute("reroute"),
    }),
  );
  assert.equal(next.route?.id, "reroute");
  assert.equal(next.provider, "mapbox");
});
test("SDK waypoint arrival requires a successful continue acknowledgement", async () => {
  const h = harness();
  const nav = new NavigationController(h.native);
  await nav.start(trip());
  h.emit(
    event("waypoint", 2, {
      session: nav.getSnapshot().session!,
      waypointId: stop.id,
    }),
  );
  h.accept(false);
  assert.equal(await nav.continueTrip(), false);
  assert.equal(nav.getSnapshot().waypointId, stop.id);
  h.accept(true);
  assert.equal(await nav.continueTrip(), true);
  assert.equal(nav.getSnapshot().waypointId, null);
});
test("final arrival ends live state and ignores late SDK updates", () => {
  const arrived = navigationReducer(state(), event("arrival", 1));
  assert.equal(arrived.mode, "arrived");
  assert.equal(
    navigationReducer(arrived, event("guidance", 2, { guidance: g })),
    arrived,
  );
});
test("SDK voice timing replaces the legacy distance-band speech scheduler", () => {
  const speech = new GuidanceSpeech();
  assert.equal(speech.next(state(), now), null);
  const s = navigationReducer(
    state(),
    event("voice", 1, {
      voice: { text: "In 500 feet, turn right.", critical: false },
    }),
  );
  assert.deepEqual(speech.next(s, now), {
    text: "In 500 feet, turn right.",
    priority: speechPriority.NAVIGATION,
  });
  assert.equal(speech.next(s, now), null);
  const critical = navigationReducer(
    s,
    event("voice", 2, { voice: { text: "Turn right.", critical: true } }),
  );
  assert.equal(
    speech.next(critical, now)?.priority,
    speechPriority.CRITICAL_NAVIGATION,
  );
});
test("stale, rerouting and stopped-waypoint voice instructions never play", () => {
  const s = navigationReducer(
    state(),
    event("voice", 1, { voice: { text: "Turn right.", critical: true } }),
  );
  for (const blocked of [
    { ...s, rerouting: true },
    { ...s, waypointId: stop.id },
    { ...s, mode: "arrived" as const },
  ])
    assert.equal(new GuidanceSpeech().next(blocked, now), null);
  assert.equal(new GuidanceSpeech().next(s, now + 6000), null);
  const rerouting = navigationReducer(s, event("rerouting", 2));
  assert.equal(rerouting.voice, null);
  const progress = navigationReducer(
    rerouting,
    event("guidance", 3, { guidance: g }),
  );
  assert.equal(progress.rerouting, true);
  const ignored = navigationReducer(
    progress,
    event("voice", 4, { voice: { text: "Old direction.", critical: true } }),
  );
  assert.equal(ignored.voice, null);
  assert.equal(
    new GuidanceSpeech().next(
      navigationReducer(ignored, event("rerouted", 5)),
      now,
    ),
    null,
  );
  assert.equal(
    navigationReducer(s, event("route", 2, { route: rawRoute() })).voice,
    null,
  );
});
test("provider detours retain signed verified deltas and reject mixed-provider arithmetic", () => {
  const value = compareRoutes(
    rawRoute(),
    { ...rawRoute(), durationSeconds: rawRoute().durationSeconds - 60 },
    0,
    now,
  );
  assert.equal(value.durationSeconds, -60);
  assert.equal(value.source, "mapbox-routes-comparison");
  assert.equal(value.provider, "mapbox");
  assert.throws(() =>
    compareRoutes(rawRoute(), { ...rawRoute(), provider: "google" }, 0, now),
  );
});
test("Mapbox detour candidate is pinned to its fresh baseline provider", async () => {
  const providers: unknown[] = [];
  let requests = 0;
  const detours = new DetourService(
    {
      getRoute: async (_origin, _dest, _stops, options) => {
        providers.push(options?.requiredProvider);
        requests++;
        return { ...rawRoute(), durationSeconds: requests * 100 };
      },
    },
    () => now,
  );
  const result = await detours.verify([stop], trip(), origin);
  assert.deepEqual(providers, [undefined, "mapbox"]);
  assert.equal(result[0]?.verifiedDetour?.durationSeconds, 100);
  assert.equal(result[0]?.verifiedDetour?.provider, "mapbox");
});
test("mixed-provider detour failure leaves the place visible and unverified", async () => {
  let count = 0;
  const detours = new DetourService(
    {
      getRoute: async () => ({
        ...rawRoute(),
        provider: count++ === 0 ? "mapbox" : "google",
      }),
    },
    () => now,
  );
  const result = await detours.verify([stop], trip(), origin);
  assert.equal(result[0]?.id, stop.id);
  assert.equal(result[0]?.verifiedDetour, undefined);
});
test("assistant context uses native remaining metrics instead of geometric tracking", () => {
  const c = buildContext(
    trip(),
    origin,
    true,
    [],
    null,
    now,
    10,
    null,
    state(),
  );
  assert.equal(c.etaSeconds, 400);
  assert.equal(c.distanceMeters, 4000);
  assert.equal(c.percentageCompleted, 40);
  assert.equal(c.routeProvider, "mapbox");
  assert.equal(c.arrivalTime, new Date(now + 400000).toISOString());
  assert.equal(contextSchema.safeParse(c).success, true);
});
test("stale native context does not substitute a Google/geometric ETA", () => {
  const c = buildContext(
    trip(),
    origin,
    true,
    [],
    null,
    now + 16000,
    10,
    null,
    state(),
  );
  assert.equal(c.etaSeconds, null);
  assert.equal(c.distanceMeters, null);
});
test("verified assistant place facts disclose Mapbox detour provenance", () => {
  const fact = placeFact(
    { ...stop, verifiedDetour: compareRoutes(rawRoute(), rawRoute(), 0, now) },
    now,
  );
  assert.equal(fact.detourProvider, "mapbox");
  assert.equal(fact.verifiedDetourSeconds, 0);
});
test("local overview, recenter, current road and timing commands are grounded", () => {
  assert.equal(navigationCommand("overview", state())?.action, "overview");
  assert.equal(navigationCommand("recenter", state())?.action, "recenter");
  assert.match(
    navigationCommand("how much longer", state())?.text ?? "",
    /7 minutes/,
  );
  assert.match(
    navigationCommand("when will I arrive?", state())?.text ?? "",
    /Arrival around/,
  );
  assert.match(
    navigationCommand("What road am I on?", {
      ...state(),
      currentRoad: "Main Road",
    })?.text ?? "",
    /Main Road/,
  );
});
test("native route authority updates trip geometry and suppresses fallback rerouting", async () => {
  const h = harness();
  const controller = new TripController(
    h.fallback,
    () => origin,
    () => now,
  );
  await controller.selectDestination(destination);
  controller.start();
  controller.nativeAuthority = true;
  controller.acceptNativeRoute(rawRoute("active"));
  assert.equal(controller.getSnapshot().trip?.route?.provider, "mapbox");
  controller.observeLocation({
    coordinate: { latitude: 0, longitude: 0 },
    timestamp: now + 5000,
    accuracy: 2,
    fresh: true,
  });
  assert.equal(h.counts().fallbacks, 1);
});
test("simulation is gated by development mode and does not persist navigation data", async () => {
  const h = harness();
  let runs = 0;
  h.native.simulate = async () => {
    runs++;
  };
  const nav = new NavigationController(h.native);
  const prior = (globalThis as { __DEV__?: boolean }).__DEV__;
  try {
    (globalThis as { __DEV__?: boolean }).__DEV__ = false;
    await nav.simulate(true);
    assert.equal(runs, 0);
    (globalThis as { __DEV__?: boolean }).__DEV__ = true;
    await nav.simulate(true);
    assert.equal(runs, 1);
    assert.equal(nav.getSnapshot().events.length, 0);
  } finally {
    (globalThis as { __DEV__?: boolean }).__DEV__ = prior;
  }
});
