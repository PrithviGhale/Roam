import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  NavigationController,
  initialNavigation,
  navigationReducer,
  drivingDistance,
  normalizeManeuver,
  waypointPlan,
  type NavigationState,
} from "../src/services/navigation/NavigationController";
import {
  GuidanceSpeech,
  speechPriority,
} from "../src/services/navigation/GuidanceSpeech";
import { navigationCommand } from "../src/services/navigation/commands";
import {
  eventSchema,
  maneuvers,
  type Guidance,
  type NativeNavigation,
  type NavigationEvent,
} from "../modules/roam-navigation/src/types";
import { TripController } from "../src/services/tripController";
import { contextSchema } from "../shared/assistant";
import { createAssistantTransport } from "../src/services/assistant/client";
import { destination, origin, routeFor, stop, deferred } from "./fixtures";
const trip = () => ({
  destination,
  route: routeFor(destination),
  stops: [{ id: stop.id, place: stop }],
});
const guidance: Guidance = {
  maneuver: "right",
  instruction: "Turn right onto Elm Street.",
  roadName: "Elm Street",
  step: 1,
  distanceToManeuverMeters: 250,
  remainingDistanceMeters: 5000,
  remainingDurationSeconds: 600,
  next: {
    maneuver: "left",
    instruction: "Turn left.",
    roadName: "Pine Street",
    step: 2,
  },
};
const state = (): NavigationState => ({
  ...initialNavigation(),
  session: "session",
  mode: "native",
  guidance,
  updatedAt: Date.now(),
});
const event = (
  kind: NavigationEvent["kind"],
  sequence = 1,
  fields: Partial<NavigationEvent> = {},
): NavigationEvent => ({
  kind,
  sequence,
  session: "session",
  timestamp: Date.now(),
  ...fields,
});
function harness() {
  let listener: ((e: unknown) => void) | null = null;
  let removals = 0,
    stops = 0,
    starts = 0;
  const native: NativeNavigation = {
    availability: async () => ({ available: true, version: "11.2.0" }),
    start: async (session) => {
      starts++;
      listener?.(event("started", 1, { session }));
      return true;
    },
    update: async () => true,
    continueTrip: async () => true,
    stop: async () => {
      stops++;
    },
    simulate: async () => {},
    licenses: async () => "Notices",
    addListener: (_name, fn) => {
      listener = fn;
      return {
        remove() {
          removals++;
          listener = null;
        },
      };
    },
  };
  const controller = new NavigationController(native);
  return {
    native,
    controller,
    emit: (e: unknown) => listener?.(e),
    get removals() {
      return removals;
    },
    get stops() {
      return stops;
    },
    get starts() {
      return starts;
    },
  };
}
test("missing native module reports unavailable and retains fallback", async () => {
  const c = new NavigationController(null);
  assert.equal((await c.available()).available, false);
  assert.equal(await c.start(trip()), false);
  assert.equal(c.getSnapshot().mode, "fallback");
});
test("personal project disabled availability never requests terms/start", async () => {
  const h = harness();
  h.native.availability = async () => ({
    available: false,
    reason: "project-not-enabled",
  });
  await h.controller.start(trip());
  assert.equal(h.starts, 0);
  assert.equal(h.controller.getSnapshot().mode, "fallback");
});
test("availability exceptions fail safely", async () => {
  const h = harness();
  h.native.availability = async () => {
    throw Error("SDK");
  };
  assert.equal((await h.controller.available()).available, false);
});
test("initialization failure cleans subscription/session", async () => {
  const h = harness();
  h.native.start = async () => {
    throw Error("configuration");
  };
  await h.controller.start(trip());
  assert.equal(h.removals, 1);
  assert.equal(h.stops, 1);
  assert.equal(h.controller.getSnapshot().mode, "fallback");
});
test("declined terms do not start guidance", async () => {
  const h = harness();
  h.native.start = async () => false;
  assert.equal(await h.controller.start(trip()), false);
  assert.equal(h.controller.getSnapshot().guidance, null);
});
test("native start enables follow and ordered verified waypoints", async () => {
  const h = harness();
  let ids: string[] = [];
  h.native.start = async (_s, points) => {
    ids = points.map((p) => p.id);
    return true;
  };
  await h.controller.start(trip());
  assert.deepEqual(ids, [stop.id, destination.id]);
  assert.equal(h.controller.getSnapshot().camera, "FOLLOW");
});
test("waypoint plans exclude visited stops and preserve order", () => {
  assert.deepEqual(
    waypointPlan({
      ...trip(),
      stops: [{ id: stop.id, place: stop, visited: true }],
    }).map((p) => p.id),
    [destination.id],
  );
});
test("natural driving units avoid tiny mile fractions", () => {
  assert.equal(drivingDistance(244), "800 ft");
  assert.equal(drivingDistance(152), "500 ft");
  assert.equal(drivingDistance(1609.344 * 0.3), "0.3 mi");
  assert.equal(drivingDistance(3862), "2.4 mi");
  assert.equal(drivingDistance(NaN), "—");
});
test("maneuvers normalize and unknown values stay unknown", () => {
  assert.equal(normalizeManeuver("turnLeft"), "left");
  assert.equal(normalizeManeuver("offRampRight"), "exitRight");
  assert.equal(normalizeManeuver("unsupported"), "unknown");
});
test("guidance feed replaces step/distance without fabricating road data", () => {
  const s = navigationReducer(state(), event("guidance", 2, { guidance }));
  assert.deepEqual(s.guidance, guidance);
  assert.equal(s.currentRoad, null);
});
test("late/out of order events cannot rewind directions", () => {
  const s = navigationReducer(state(), event("guidance", 3, { guidance }));
  assert.equal(
    navigationReducer(
      s,
      event("guidance", 2, { guidance: { ...guidance, step: 0 } }),
    ),
    s,
  );
});
test("events from ended/other session are ignored", () => {
  const s = state();
  assert.equal(
    navigationReducer(s, event("arrival", 5, { session: "old" })),
    s,
  );
  const idle = initialNavigation();
  assert.equal(navigationReducer(idle, event("guidance")), idle);
});
test("rerouting preserves guidance/route until replacement", () => {
  const s = { ...state(), geometry: [origin, destination.coordinate] };
  const r = navigationReducer(s, event("rerouting"));
  assert.equal(r.guidance, s.guidance);
  assert.equal(r.geometry, s.geometry);
  assert.equal(r.rerouting, true);
  assert.equal(
    navigationReducer(r, event("guidance", 2, { guidance })).rerouting,
    false,
  );
});
test("SDK route geometry and snapped location are separate from raw GPS", () => {
  const s = navigationReducer(
    state(),
    event("route", 1, { geometry: [origin] }),
  );
  const l = navigationReducer(
    s,
    event("location", 2, { location: { ...origin, heading: 85 } }),
  );
  assert.deepEqual(l.geometry, [origin]);
  assert.equal(l.location?.heading, 85);
});
test("stop arrival pauses advancement until acknowledged", async () => {
  const h = harness();
  await h.controller.start(trip());
  const session = h.controller.getSnapshot().session!;
  h.emit(event("waypoint", 2, { session, waypointId: stop.id }));
  assert.equal(h.controller.getSnapshot().waypointId, stop.id);
  assert.equal(await h.controller.continueTrip(), true);
  assert.equal(h.controller.getSnapshot().waypointId, null);
});
test("failed advancement keeps the stop arrival state", async () => {
  const h = harness();
  await h.controller.start(trip());
  h.emit(
    event("waypoint", 2, {
      session: h.controller.getSnapshot().session!,
      waypointId: stop.id,
    }),
  );
  h.native.continueTrip = async () => false;
  assert.equal(await h.controller.continueTrip(), false);
  assert.equal(h.controller.getSnapshot().waypointId, stop.id);
});
test("final arrival clears maneuver and road/location session data", () => {
  const s = navigationReducer(
    { ...state(), currentRoad: "Road", location: origin },
    event("arrival"),
  );
  assert.equal(s.mode, "arrived");
  assert.equal(s.guidance, null);
  assert.equal(s.location, null);
  assert.equal(s.currentRoad, null);
});
test("camera pan/free survives route replacement until recentered", () => {
  const s = navigationReducer({ ...state(), camera: "FREE" }, event("started"));
  assert.equal(s.camera, "FREE");
  const h = harness();
  h.controller.setCamera("FOLLOW");
  assert.equal(h.controller.getSnapshot().camera, "FOLLOW");
  h.controller.setCamera("OVERVIEW");
  assert.equal(h.controller.getSnapshot().camera, "OVERVIEW");
});
test("repeat direction and next turn work without AI", () => {
  assert.equal(
    navigationCommand("repeat that direction.", state())?.text,
    guidance.instruction,
  );
  assert.equal(
    navigationCommand("what's my next turn?", state())?.text,
    guidance.instruction,
  );
  assert.equal(navigationCommand("find gas", state()), null);
});
test("current-road question never substitutes upcoming road", () => {
  assert.match(
    navigationCommand("what road am i on", state())!.text,
    /not available/,
  );
});
test("local recenter and silence use explicit commands", () => {
  assert.equal(
    navigationCommand("recenter map", initialNavigation())?.action,
    "recenter",
  );
  assert.equal(
    navigationCommand("stop speaking", initialNavigation())?.action,
    "silence",
  );
});
test("stale/rerouting guidance is not spoken or answered as live", () => {
  const speech = new GuidanceSpeech();
  assert.equal(
    speech.next({ ...state(), updatedAt: Date.now() - 16000 }),
    null,
  );
  assert.equal(speech.next({ ...state(), rerouting: true }), null);
  assert.match(
    navigationCommand("repeat direction", { ...state(), rerouting: true })!
      .text,
    /Updating/,
  );
});
test("speech distance bands deduplicate and urgent direction supersedes", () => {
  const speech = new GuidanceSpeech();
  const s = state();
  assert.equal(speech.next(s)?.priority, speechPriority.NAVIGATION);
  assert.equal(speech.next(s), null);
  assert.equal(
    speech.next({
      ...s,
      guidance: { ...guidance, distanceToManeuverMeters: 40 },
    })?.priority,
    speechPriority.CRITICAL_NAVIGATION,
  );
});
test("new maneuver gets a new prompt without stale queued speech", () => {
  const speech = new GuidanceSpeech();
  speech.next(state());
  assert.ok(
    speech.next({
      ...state(),
      guidance: { ...guidance, step: 2, instruction: "Turn left." },
    }),
  );
});
test("failed native route mutation retains trip and fallback geometry", async () => {
  const c = new TripController(
    { getRoute: async () => routeFor(destination) },
    () => origin,
  );
  await c.selectDestination(destination);
  c.start();
  const old = c.getSnapshot().trip!;
  c.nativeAuthority = true;
  c.beforeNativeCommit = async () => false;
  assert.equal(
    await c.applyStopsAtomic(old, [{ id: stop.id, place: stop }]),
    false,
  );
  assert.equal(c.getSnapshot().trip, old);
});
test("UI stops commit only after native route acceptance", async () => {
  const c = new TripController(
    { getRoute: async () => routeFor(destination) },
    () => origin,
  );
  await c.selectDestination(destination);
  c.start();
  const old = c.getSnapshot().trip!;
  const gate = deferred<boolean>();
  c.nativeAuthority = true;
  c.beforeNativeCommit = () => gate.promise;
  const updating = c.applyStopsAtomic(old, [{ id: stop.id, place: stop }]);
  await Promise.resolve();
  assert.equal(c.getSnapshot().trip, old);
  gate.resolve(true);
  assert.equal(await updating, true);
  assert.equal(c.getSnapshot().trip?.stops.length, 1);
});
test("native authority suppresses geometric stop visit/reroute", async () => {
  const c = new TripController(
    { getRoute: async () => routeFor(destination) },
    () => origin,
  );
  await c.selectDestination(destination);
  c.start();
  c.nativeAuthority = true;
  const old = c.getSnapshot();
  for (let i = 0; i < 5; i++)
    c.observeLocation({
      coordinate: stop.coordinate,
      accuracy: 5,
      timestamp: Date.now(),
      fresh: true,
    });
  assert.equal(c.getSnapshot(), old);
});
test("finish exits driving while keeping destination/summary", async () => {
  const c = new TripController(
    { getRoute: async () => routeFor(destination) },
    () => origin,
  );
  await c.selectDestination(destination);
  c.start();
  c.finish();
  assert.equal(c.getSnapshot().trip?.startedAt, undefined);
  assert.equal(c.getSnapshot().trip?.destination.id, destination.id);
});
test("native session cleanup removes listener and ignores delayed start", async () => {
  const h = harness();
  const gate = deferred<boolean>();
  h.native.start = () => gate.promise;
  const starting = h.controller.start(trip());
  for (let i = 0; i < 10; i++) await Promise.resolve();
  await h.controller.stop();
  gate.resolve(true);
  assert.equal(await starting, false);
  assert.equal(h.controller.getSnapshot().mode, "idle");
  assert.equal(h.removals, 1);
});
test("navigation event log is bounded and contains no location history", () => {
  let s = state();
  for (let i = 1; i <= 100; i++)
    s = navigationReducer(s, event("location", i, { location: origin }));
  assert.equal(s.events.length, 80);
  assert.deepEqual(Object.keys(s.events[0]!), ["timestamp", "label"]);
});
test("bridge rejects bad coordinates/unsupported enums and schema drift", () => {
  assert.equal(
    eventSchema.safeParse(
      event("guidance", 1, {
        guidance: { ...guidance, maneuver: "fake" as never },
      }),
    ).success,
    false,
  );
  assert.equal(
    eventSchema.safeParse(
      event("location", 1, { location: { latitude: 100, longitude: 0 } }),
    ).success,
    false,
  );
  const swift = readFileSync(
    "modules/roam-navigation/ios/GuidanceAdapter.swift",
    "utf8",
  );
  for (const m of maneuvers) assert.ok(swift.includes(`"${m}"`), m);
  const module = readFileSync(
    "modules/roam-navigation/ios/RoamNavigationModule.swift",
    "utf8",
  );
  for (const method of [
    "start",
    "stop",
    "availability",
    "update",
    "continueTrip",
    "simulate",
    "licenses",
  ])
    assert.ok(module.includes(`AsyncFunction("${method}")`));
});
test("compact navigation context is validated and excludes geometry/location", () => {
  const compact = {
    nextInstruction: "Turn right.",
    distanceToManeuverMeters: 25,
    remainingDistanceMeters: 100,
    remainingDurationSeconds: 40,
  };
  const nav = contextSchema.shape.navigation;
  assert.equal(nav.safeParse(compact).success, true);
  assert.equal(
    nav.safeParse({ ...compact, geometry: [origin] }).success,
    false,
  );
});
test("assistant transport sends only compact verified navigation context", async () => {
  let body: any;
  const transport = createAssistantTransport(
    "https://example.test",
    "",
    async (_url, init) => {
      body = JSON.parse(init!.body as string);
      return new Response(
        JSON.stringify({ type: "response", plan: { kind: "chat" } }),
      );
    },
    () => ({
      nextInstruction: "Turn right.",
      distanceToManeuverMeters: 25,
      remainingDistanceMeters: 100,
      remainingDurationSeconds: 40,
    }),
  );
  await transport.turn({
    message: "coffee",
    history: [],
    context: {} as never,
  });
  assert.equal(body.context.navigation.nextInstruction, "Turn right.");
  assert.equal(body.context.navigation.geometry, undefined);
});
