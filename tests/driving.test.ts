import { test } from "node:test";
import assert from "node:assert/strict";
import {
  DetourService,
  compareRoutes,
  detourInsertionIndex,
} from "../services/detours";
import {
  rankRecommendations,
  recommendationScore,
} from "../services/routeAware";
import { createTripTools } from "../services/tools";
import { RouteDeviationMonitor } from "../services/routeTracking";
import { TripController } from "../services/tripController";
import { tripProgress } from "../utils/tripProgress";
import { arrivalTimestamp, timeAheadPoint } from "../utils/routeTiming";
import { buildContext, placeFact } from "../services/assistant/context";
import {
  createDiagnosticClient,
  diagnosticFailure,
} from "../services/diagnostics";
import { demoPlacesService } from "../services/demoPlaces";
import { AssistantEngine } from "../services/assistant/engine";
import { toolSchemas, type AssistantResponse } from "../shared/assistant";
import type { ActiveTrip, Place, Route, RoutesService } from "../types/domain";
import { destination, stop, origin, routeFor, deferred } from "./fixtures";

const now = Date.parse("2026-10-06T12:00:00Z");
const trip: ActiveTrip = { destination, route: routeFor(), stops: [] };
const choices: Place[] = [1, 2, 3, 4].map((i) => ({
  ...stop,
  id: `choice-${i}`,
  name: `Coffee ${i}`,
  coordinate: { latitude: 0, longitude: i * 0.02 },
}));
test("expired detour facts are omitted from AI context while place references remain", () => {
  const place = {
    ...choices[0]!,
    verifiedDetour: compareRoutes(
      routeFor(),
      { ...routeFor(), durationSeconds: 1680 },
      0,
      now,
    ),
  };
  assert.equal(placeFact(place, now + 1000).verifiedDetourSeconds, 180);
  assert.equal(placeFact(place, now + 60_000).verifiedDetourSeconds, undefined);
  const context = buildContext(trip, origin, true, [place], null, now + 60_001);
  assert.equal(context.recentResults[0]!.id, place.id);
  assert.equal(context.recentResults[0]!.verifiedDetourSeconds, undefined);
});
test("verified detour deltas retain signed Google duration and distance differences", () => {
  const delta = compareRoutes(
    { durationSeconds: 1500, distanceMeters: 25000 },
    { durationSeconds: 1740, distanceMeters: 27900 },
    0,
    now,
  );
  assert.equal(delta.durationSeconds, 240);
  assert.equal(delta.distanceMeters, 2900);
  assert.equal(delta.source, "google-routes-comparison");
  assert.equal(
    compareRoutes(
      { durationSeconds: 100, distanceMeters: 100 },
      { durationSeconds: 90, distanceMeters: 80 },
      0,
      now,
    ).durationSeconds,
    -10,
  );
});
test("detours use a fresh common origin/remaining plan and at most baseline plus three routes", async () => {
  const calls: { point: typeof origin; stops: string[] }[] = [];
  const driver = { latitude: 0, longitude: 0.01 };
  const service = new DetourService(
    {
      async getRoute(point, _d, stops = []) {
        calls.push({ point, stops: stops.map((s) => s.id) });
        return { ...routeFor(), durationSeconds: stops.length ? 1620 : 1500 };
      },
    },
    () => now,
  );
  const checked = await service.verify(choices, trip, driver);
  assert.equal(calls.length, 4);
  assert.ok(calls.every((c) => c.point === driver));
  assert.deepEqual(calls[0]!.stops, []);
  assert.equal(checked[0]!.verifiedDetour!.durationSeconds, 120);
  assert.equal(checked[3]!.verifiedDetour, undefined);
});
test("detour cache expires, invalidates on movement and visited-stop changes", async () => {
  let time = now,
    calls = 0;
  const service = new DetourService(
    {
      async getRoute() {
        calls++;
        return routeFor();
      },
    },
    () => time,
  );
  await service.verify(choices.slice(0, 2), trip, origin);
  assert.equal(calls, 3);
  await service.verify(choices.slice(0, 2), trip, origin);
  assert.equal(calls, 3);
  time += 60_001;
  await service.verify(choices.slice(0, 2), trip, origin);
  assert.equal(calls, 6);
  await service.verify(choices.slice(0, 2), trip, {
    latitude: 0,
    longitude: 0.003,
  });
  assert.equal(calls, 9);
  const withStop = { ...trip, stops: [{ id: stop.id, place: stop }] };
  await service.verify(choices.slice(0, 1), withStop, origin);
  assert.equal(calls, 11);
  await service.verify(
    choices.slice(0, 1),
    { ...withStop, stops: [{ id: stop.id, place: stop, visited: true }] },
    origin,
  );
  assert.equal(calls, 13);
});
test("failed baseline/candidate never fabricates zero detours or destroys Places results", async () => {
  let calls = 0;
  const checked = await new DetourService({
    async getRoute() {
      if (++calls > 1) throw new Error("fixture");
      return routeFor();
    },
  }).verify(choices, trip, origin);
  assert.ok(checked.every((p) => !p.verifiedDetour));
  assert.equal(checked.length, 4);
  const baselineFailed = await new DetourService({
    async getRoute() {
      throw new Error("fixture");
    },
  }).verify(choices, trip, origin);
  assert.equal(baselineFailed.length, choices.length);
  assert.ok(baselineFailed.every((p) => !p.verifiedDetour));
});
test("detour insertion preserves ordered stops and skips visited waypoints", async () => {
  const before = { ...trip, stops: [{ id: stop.id, place: stop }] };
  assert.equal(detourInsertionIndex(before, choices[0]!), 0);
  const captured: string[][] = [];
  await new DetourService({
    async getRoute(_o, _d, stops = []) {
      captured.push(stops.map((s) => s.id));
      return routeFor();
    },
  }).verify(
    [choices[0]!],
    { ...before, stops: [{ id: stop.id, place: stop, visited: true }] },
    origin,
  );
  assert.deepEqual(captured, [[], [choices[0]!.id]]);
});
test("verified low detours outrank higher rated costly detours and unknown comparisons", () => {
  const low = {
    ...choices[0]!,
    rating: 4,
    verifiedDetour: compareRoutes(
      routeFor(),
      { ...routeFor(), durationSeconds: 1620 },
      0,
      now,
    ),
  };
  const high = {
    ...choices[1]!,
    rating: 5,
    ratingCount: 10000,
    verifiedDetour: compareRoutes(
      routeFor(),
      { ...routeFor(), durationSeconds: 1980 },
      0,
      now,
    ),
  };
  assert.deepEqual(
    rankRecommendations([choices[2]!, high, low]).map((p) => p.id),
    [low.id, high.id, choices[2]!.id],
  );
  assert.ok(
    recommendationScore({ ...low, ratingCount: 500 }) <
      recommendationScore(low),
  );
  assert.ok(
    recommendationScore({ ...low, openNow: false }) > recommendationScore(low),
  );
});
test("max detour filters unverified candidates and enforces exact seconds", async () => {
  const provider = {
    ...demoPlacesService,
    mode: "google" as const,
    async alongRoute() {
      return choices;
    },
  };
  const routes: RoutesService = {
    async getRoute(_o, _d, stops = []) {
      return {
        ...routeFor(),
        durationSeconds:
          1500 + (stops.length ? Number(stops[0]!.id.slice(-1)) * 180 : 0),
      };
    },
  };
  const port = {
    getSnapshot: () => ({ trip, status: "ready" as const, error: null }),
    applyStopsAtomic: async () => false,
    cancel() {},
  };
  const tools = createTripTools(
    provider,
    port,
    () => origin,
    new DetourService(routes),
  );
  const matches = await tools.searchCoffee({
    maxDetourMinutes: 5,
    maxResults: 5,
  });
  assert.deepEqual(
    matches.map((p) => p.id),
    [choices[0]!.id],
  );
  assert.equal(matches[0]!.verifiedDetour!.durationSeconds, 180);
  assert.deepEqual(
    await createTripTools(provider, port, () => origin).searchCoffee({
      maxDetourMinutes: 5,
    }),
    [],
  );
});
test("time-ahead selects route region from leg durations and clamps at destination", () => {
  const route = {
    ...routeFor(),
    durationSeconds: 3600,
    legs: [
      {
        start: origin,
        end: stop.coordinate,
        distanceMeters: 12500,
        durationSeconds: 2700,
      },
      {
        start: stop.coordinate,
        end: destination.coordinate,
        distanceMeters: 12500,
        durationSeconds: 900,
      },
    ],
  };
  const point = timeAheadPoint(route, origin, 30)!;
  assert.ok(Math.abs(point.longitude - 0.0666667) < 0.00001);
  assert.ok(
    Math.abs(timeAheadPoint(route, origin, 120)!.longitude - 0.2) < 0.00001,
  );
  assert.equal(
    timeAheadPoint(route, { latitude: 0.01, longitude: 0 }, 30),
    null,
  );
});
test("time-ahead searches once at estimated anchor; destination bias uses destination", async () => {
  const points: (typeof origin)[] = [];
  const current = { ...trip, route: { ...routeFor(), durationSeconds: 3600 } };
  const provider = {
    ...demoPlacesService,
    mode: "google" as const,
    async nearby(_c: unknown, point: typeof origin | null) {
      if (point) points.push(point);
      return [];
    },
  };
  const port = {
    getSnapshot: () => ({
      trip: current,
      status: "ready" as const,
      error: null,
    }),
    applyStopsAtomic: async () => false,
    cancel() {},
  };
  const tools = createTripTools(provider, port, () => origin);
  await tools.searchCoffee({ timeAheadMinutes: 30 });
  assert.equal(points.length, 1);
  assert.ok(Math.abs(points[0]!.longitude - 0.1) < 0.00001);
  await tools.searchCoffee({ nearDestination: true });
  assert.deepEqual(points.at(-1), destination.coordinate);
  await assert.rejects(
    tools.searchCoffee({ timeAheadMinutes: 30, nearDestination: true }),
  );
});
test("route progress uses projected geometry and distinct arrival time with leg weighting", () => {
  const active = { ...trip, startedAt: new Date(now).toISOString() };
  const progress = tripProgress(
    active,
    { latitude: 0, longitude: 0.1 },
    true,
    now,
    8,
  )!;
  assert.equal(progress.percentageCompleted, 50);
  assert.equal(progress.completedMeters, 12500);
  assert.equal(progress.distanceMeters, 12500);
  assert.equal(progress.durationSeconds, 750);
  assert.equal(progress.arrivalTime, new Date(now + 750000).toISOString());
  assert.equal(tripProgress(active, origin, false, now)!.arrivalTime, null);
  assert.equal(
    tripProgress(active, origin, true, now, 100)!.progressAvailable,
    false,
  );
  assert.equal(
    tripProgress(active, { latitude: NaN, longitude: 0 }, true, now)!.estimated,
    false,
  );
});
test("arrival calculation and revised-journey aggregate survive route changes", () => {
  assert.equal(arrivalTimestamp(42 * 60, now), "2026-10-06T12:42:00.000Z");
  assert.equal(arrivalTimestamp(NaN, now), null);
  const progress = tripProgress(
    { ...trip, startedAt: "started", completedBeforeRouteMeters: 25000 },
    origin,
    true,
    now,
    8,
  )!;
  assert.equal(progress.completedMeters, 25000);
  assert.equal(progress.percentageCompleted, 50);
});
test("deviation needs repeated accurate distinct fixes over time, not noisy readings", () => {
  const monitor = new RouteDeviationMonitor();
  const route = routeFor(),
    coordinate = { latitude: 0.002, longitude: 0.05 };
  const fix = { coordinate, accuracy: 8, timestamp: now, fresh: true };
  assert.equal(monitor.observe(route, fix, now).reroute, false);
  assert.equal(monitor.observe(route, fix, now).reroute, false);
  assert.equal(
    monitor.observe(route, { ...fix, timestamp: now + 3000 }, now + 3000)
      .reroute,
    false,
  );
  assert.equal(
    monitor.observe(route, { ...fix, timestamp: now + 6000 }, now + 6000)
      .reroute,
    true,
  );
  assert.equal(
    monitor.observe(
      route,
      { ...fix, accuracy: 100, timestamp: now + 9000 },
      now + 9000,
    ).state,
    "onRoute",
  );
});
test("reroute cooldown holds on failures and resets only after a minute", () => {
  const monitor = new RouteDeviationMonitor();
  const route = routeFor();
  const observe = (ms: number) =>
    monitor.observe(
      route,
      {
        coordinate: { latitude: 0.002, longitude: 0.05 },
        accuracy: 8,
        timestamp: now + ms,
        fresh: true,
      },
      now + ms,
    );
  observe(0);
  observe(3000);
  assert.equal(observe(6000).reroute, true);
  for (const ms of [9000, 12000, 15000, 55000, 58000, 61000])
    assert.equal(observe(ms).reroute, false);
  assert.equal(observe(66000).reroute, true);
});
test("failed reroute retains exact previous trip/route and shows a recoverable error", async () => {
  let fail = false;
  const controller = new TripController(
    {
      async getRoute() {
        if (fail) throw new Error("fixture");
        return routeFor();
      },
    },
    () => origin,
  );
  await controller.selectDestination(destination);
  controller.start();
  const previous = controller.getSnapshot().trip!;
  fail = true;
  assert.equal(await controller.refreshAtomic(previous), false);
  assert.equal(controller.getSnapshot().trip, previous);
  assert.equal(controller.getSnapshot().status, "ready");
  assert.match(controller.getSnapshot().tracking!.error!, /kept/);
});
test("cancel/new destination defeats late reroute; old geometry stays during request", async () => {
  const waiting = deferred<Route>();
  let calls = 0;
  const controller = new TripController(
    {
      async getRoute(_o, d) {
        return ++calls === 2 ? waiting.promise : routeFor(d);
      },
    },
    () => origin,
  );
  await controller.selectDestination(destination);
  const previous = controller.getSnapshot().trip!;
  const pending = controller.refreshAtomic(previous);
  assert.equal(controller.getSnapshot().trip, previous);
  assert.equal(controller.getSnapshot().tracking!.state, "rerouting");
  await controller.selectDestination(stop);
  waiting.resolve(routeFor());
  assert.equal(await pending, false);
  assert.equal(controller.getSnapshot().trip!.destination.id, stop.id);
});
test("auto deviation routes once, uses latest fix, and never refreshes while just planning", async () => {
  let calls = 0,
    time = now;
  let driver = origin;
  const controller = new TripController(
    {
      async getRoute(point) {
        calls++;
        return { ...routeFor(), origin: point };
      },
    },
    () => driver,
    () => time,
  );
  await controller.selectDestination(destination);
  const observe = (ms: number) => {
    time = now + ms;
    driver = { latitude: 0.002, longitude: 0.05 };
    controller.observeLocation({
      coordinate: driver,
      accuracy: 8,
      timestamp: time,
      fresh: true,
    });
  };
  observe(0);
  observe(3000);
  observe(6000);
  assert.equal(calls, 1);
  controller.start();
  observe(9000);
  observe(12000);
  observe(15000);
  assert.equal(calls, 2);
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(controller.getSnapshot().trip!.route!.origin, driver);
});
test("three near-stop accurate fixes mark visited without a paid refresh, then refresh skips it", async () => {
  const calls: string[][] = [];
  let time = now;
  const controller = new TripController(
    {
      async getRoute(_o, _d, stops = []) {
        calls.push(stops.map((s) => s.id));
        return routeFor();
      },
    },
    () => stop.coordinate,
    () => time,
  );
  await controller.selectDestination(destination);
  await controller.addStop(stop);
  controller.start();
  for (const ms of [0, 1500, 3000]) {
    time = now + ms;
    controller.observeLocation({
      coordinate: stop.coordinate,
      accuracy: 8,
      timestamp: time,
      fresh: true,
    });
  }
  assert.equal(controller.getSnapshot().trip!.stops[0]!.visited, true);
  assert.equal(calls.length, 2);
  await controller.retry();
  assert.deepEqual(calls.at(-1), []);
  assert.ok(controller.getSnapshot().trip!.completedBeforeRouteMeters! > 0);
});
test("driving-safe context and reply use grounded arrival and no coordinates", async () => {
  const controller = new TripController(
    {
      async getRoute() {
        return routeFor();
      },
    },
    () => origin,
    () => now,
  );
  await controller.selectDestination(destination);
  controller.start();
  const context = buildContext(
    controller.getSnapshot().trip,
    origin,
    true,
    [],
    null,
    now,
    8,
  );
  assert.equal(context.tripStarted, true);
  assert.equal(context.arrivalTime, "2026-10-06T12:25:00.000Z");
  assert.doesNotMatch(JSON.stringify(context), /latitude|longitude|geometry/);
  const tools: AssistantResponse = {
    type: "tools",
    calls: [{ id: "status", name: "getTripStatus", args: {} }],
    continuation: "fixture",
  };
  const engine = new AssistantEngine(
    {
      async turn() {
        return tools;
      },
      async continue() {
        return { type: "response", plan: { kind: "status" } };
      },
    },
    demoPlacesService,
    controller,
    () => origin,
    () => now,
  );
  const response = await engine.send("When do we arrive?", []);
  assert.match(response.text, /25 min.*Arrival around/);
  assert.ok(response.text.length < 150);
});
test("tool arguments accept bounded time/detour controls and reject excess", () => {
  assert.equal(
    toolSchemas.searchCoffee.safeParse({
      timeAheadMinutes: 30,
      maxDetourMinutes: 5,
    }).success,
    true,
  );
  assert.equal(
    toolSchemas.searchFood.safeParse({ timeAheadMinutes: 121 }).success,
    false,
  );
  assert.equal(
    toolSchemas.searchGas.safeParse({ maxDetourMinutes: -1 }).success,
    false,
  );
});
test("diagnostics distinguish configuration, authentication, rate limits and actual probes", async () => {
  assert.equal(
    (await createDiagnosticClient("").health()).state,
    "notConfigured",
  );
  assert.equal(diagnosticFailure(401).state, "unauthorized");
  assert.equal(diagnosticFailure(429).state, "limited");
  const seen: string[] = [];
  const fetcher: typeof fetch = async (url, options) => {
    seen.push(String(options?.body ?? ""));
    return new Response(
      JSON.stringify(
        String(url).endsWith("/health")
          ? { ok: true, version: "0.4.0" }
          : { service: "routes", state: "connected", detail: "fixed sample" },
      ),
      { status: 200 },
    );
  };
  const client = createDiagnosticClient(
    "http://localhost",
    "test-only",
    fetcher,
  );
  assert.equal((await client.health()).state, "connected");
  assert.equal((await client.probe("routes")).state, "connected");
  assert.doesNotMatch(seen.join(""), /latitude|longitude|test-only/);
  const denied = createDiagnosticClient(
    "http://localhost",
    "",
    async () => new Response("", { status: 401 }),
  );
  assert.equal((await denied.authentication()).result.state, "unauthorized");
});
