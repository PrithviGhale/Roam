import { test } from "node:test";
import assert from "node:assert/strict";
import {
  WakeRuntime,
  VoiceSetupError,
  type WakeDependencies,
} from "../services/voice/WakeRuntime";
import { VoiceEventLog } from "../services/voice/events";
import { SpeedFilter, HeadingFilter } from "../utils/motionFilter";
import { ProgressTracker } from "../services/progressTracker";
import { AssistantRetry } from "../services/assistant/retry";
import { decodeRecovery, encodeRecovery } from "../services/tripRecovery";
import { TripController } from "../services/tripController";
import { deferred, destination, origin, routeFor, stop } from "./fixtures";

function wake() {
  let starts = 0,
    stops = 0,
    deletes = 0,
    creates = 0;
  let callback: () => void = () => {};
  const manager = {
    async start() {
      starts++;
    },
    async stop() {
      stops++;
    },
    delete() {
      deletes++;
    },
  };
  const dependencies: WakeDependencies = {
    available: () => true,
    modelExists: () => true,
    async readKey() {
      return "test-only-not-a-real-key";
    },
    async permission() {
      return true;
    },
    async create(_key, _sensitivity, detected) {
      creates++;
      callback = detected;
      return manager;
    },
    async recoverStart() {},
  };
  const runtime = new WakeRuntime(dependencies);
  return {
    runtime,
    dependencies,
    manager,
    detected: () => callback(),
    counts: () => ({ starts, stops, deletes, creates }),
  };
}
test("installed model absence is explicit and starts no native audio", async () => {
  const h = wake();
  h.dependencies.modelExists = () => false;
  await assert.rejects(
    h.runtime.start(
      () => {},
      () => {},
    ),
    /Hey ROAM model is not configured\./,
  );
  assert.equal(h.runtime.diagnostics().modelFound, false);
  assert.equal(h.counts().creates, 0);
});
test("missing AccessKey is distinct from missing model without prompting microphone", async () => {
  const h = wake();
  h.dependencies.readKey = async () => null;
  let prompted = false;
  h.dependencies.permission = async () => {
    prompted = true;
    return true;
  };
  await assert.rejects(
    h.runtime.start(
      () => {},
      () => {},
    ),
    /AccessKey is not configured/,
  );
  assert.equal(prompted, false);
  assert.equal(h.runtime.diagnostics().accessKeyConfigured, false);
});
test("invalid license errors redact native payloads and keep explicit failure status", async () => {
  const h = wake();
  h.dependencies.create = async () => {
    const failure = new Error("secret fixture must never escape");
    failure.name = "PorcupineActivationError";
    throw failure;
  };
  await assert.rejects(
    h.runtime.start(
      () => {},
      () => {},
    ),
    (error) =>
      error instanceof VoiceSetupError &&
      error.reason === "invalid-key" &&
      !error.message.includes("secret fixture"),
  );
  assert.equal(h.runtime.diagnostics().initialized, false);
});
test("wake initialization is single flight and does not claim armed before native success", async () => {
  const h = wake(),
    start = deferred<void>();
  h.manager.start = () => start.promise;
  const first = h.runtime.start(
    () => {},
    () => {},
  );
  const second = h.runtime.start(
    () => {},
    () => {},
  );
  assert.equal(first, second);
  assert.equal(h.runtime.diagnostics().state, "initializing");
  start.resolve();
  await first;
  assert.equal(h.runtime.diagnostics().state, "armed");
  assert.equal(h.counts().creates, 1);
  await h.runtime.dispose();
});
test("reused engine receives fresh callbacks after recognition pause", async () => {
  const h = wake();
  let old = 0,
    next = 0;
  let active = true;
  await h.runtime.start(
    () => old++,
    () => {},
    () => active,
  );
  await h.runtime.stop();
  active = false;
  await h.runtime.start(
    () => next++,
    () => {},
  );
  h.detected();
  assert.equal(old, 0);
  assert.equal(next, 1);
  assert.equal(h.counts().creates, 1);
  await h.runtime.dispose();
});
test("dispose during delayed initialization deletes late native resources without starting capture", async () => {
  const h = wake(),
    creation = deferred<typeof h.manager>();
  h.dependencies.create = () => creation.promise;
  const start = h.runtime.start(
    () => {},
    () => {},
  );
  for (let i = 0; i < 6; i++) await Promise.resolve();
  const dispose = h.runtime.dispose();
  creation.resolve(h.manager);
  await Promise.all([start, dispose]);
  assert.equal(h.counts().starts, 0);
  assert.equal(h.counts().deletes, 1);
  assert.equal(h.runtime.diagnostics().initialized, false);
});
test("wake start failure recovers processor listeners and destroys engine", async () => {
  const h = wake();
  let recovered = 0;
  h.manager.start = async () => {
    throw new Error("capture failure");
  };
  h.dependencies.recoverStart = async () => {
    recovered++;
  };
  await assert.rejects(
    h.runtime.start(
      () => {},
      () => {},
    ),
  );
  assert.equal(recovered, 1);
  assert.equal(h.counts().deletes, 1);
});
test("wake permission failure does not initialize or arm", async () => {
  const h = wake();
  h.dependencies.permission = async () => false;
  await assert.rejects(
    h.runtime.start(
      () => {},
      () => {},
    ),
    /Settings/,
  );
  assert.equal(h.counts().creates, 0);
});
test("wake diagnostics omit the key and sensitivity is bounded and locked during capture", async () => {
  const h = wake();
  await h.runtime.inspect();
  assert.equal(
    JSON.stringify(h.runtime.diagnostics()).includes("test-only"),
    false,
  );
  assert.throws(() => h.runtime.setSensitivity(1));
  h.runtime.setSensitivity(0.35);
  await h.runtime.start(
    () => {},
    () => {},
  );
  assert.throws(() => h.runtime.setSensitivity(0.5));
  await h.runtime.dispose();
  h.runtime.setSensitivity(0.5);
  assert.equal(h.runtime.diagnostics().sensitivity, 0.5);
});
test("session voice log is bounded, chronological and contains only time and event labels", () => {
  let now = 0;
  const log = new VoiceEventLog(() => now++);
  for (let i = 0; i < 100; i++) log.add("Wake armed");
  const entries = log.snapshot();
  assert.equal(entries.length, 80);
  assert.equal(entries[0]!.timestamp, 20);
  assert.deepEqual(Object.keys(entries[0]!), ["timestamp", "event"]);
  entries[0]!.timestamp = -1;
  assert.equal(log.snapshot()[0]!.timestamp, 20);
});
test("speed smoothing suppresses a single spike and settles at stationary zero after distinct fixes", () => {
  const filter = new SpeedFilter();
  const sample = (speed: number, timestamp: number) =>
    filter.update({ speed, accuracy: 5, timestamp }, timestamp);
  assert.equal(sample(10, 10000), 22);
  sample(10, 11500);
  assert.ok(sample(50, 13000)! < 30);
  sample(0.3, 14500);
  assert.equal(sample(0.2, 16000), 0);
});
test("stale, poor, negative and impossible speeds clear smoothing rather than displaying an old value", () => {
  const filter = new SpeedFilter();
  filter.update({ speed: 10, accuracy: 5, timestamp: 10000 }, 10000);
  for (const speed of [-1, 100, NaN, null])
    assert.equal(
      filter.update({ speed, accuracy: 5, timestamp: 12000 }, 12000),
      null,
    );
  assert.equal(
    filter.update({ speed: 10, accuracy: 100, timestamp: 12000 }, 12000),
    null,
  );
  assert.equal(
    filter.update({ speed: 10, accuracy: 5, timestamp: 10000 }, 26000),
    null,
  );
  assert.equal(
    filter.update({ speed: 20, accuracy: 5, timestamp: 30000 }, 30000),
    45,
  );
});
test("heading freezes briefly while stationary then expires, and rejects unreliable bearings", () => {
  const filter = new HeadingFilter();
  assert.equal(filter.update(90, 10, 5, 10000, 10000), 90);
  assert.equal(filter.update(180, 0, 5, 12000, 12000), 90);
  assert.equal(filter.current(21000), null);
  assert.equal(filter.update(180, 0, 5, 21000, 21000), null);
  assert.equal(filter.update(90, 10, NaN, 22000, 22000), null);
  assert.equal(filter.update(null, 10, 5, 23000, 23000), null);
});
test("progress continuity rejects a distant jump and small backward jitter stays stable", () => {
  const route = routeFor();
  const tracker = new ProgressTracker();
  const fix = (longitude: number, timestamp: number) =>
    tracker.observe(
      route,
      {
        coordinate: { latitude: 0, longitude },
        accuracy: 5,
        timestamp,
        fresh: true,
      },
      timestamp,
    );
  const first = fix(0.01, 10000)!;
  assert.equal(fix(0.15, 11500), null);
  assert.equal(fix(0.0099, 13000)!.progressMeters, first.progressMeters);
  assert.ok(fix(0.0105, 14500)!.progressMeters > first.progressMeters);
});
test("crossing routes retain the nearby progress branch instead of leaping to the far branch", () => {
  const route = {
    ...routeFor(),
    geometry: [
      { latitude: 0, longitude: -0.01 },
      origin,
      { latitude: 0, longitude: 0.01 },
      { latitude: 0.01, longitude: 0.01 },
      { latitude: 0.01, longitude: 0 },
      origin,
      { latitude: -0.01, longitude: 0 },
    ],
  };
  const tracker = new ProgressTracker();
  const a = tracker.observe(
    route,
    {
      coordinate: { latitude: 0, longitude: -0.0002 },
      accuracy: 5,
      timestamp: 10000,
      fresh: true,
    },
    10000,
  )!;
  const b = tracker.observe(
    route,
    { coordinate: origin, accuracy: 5, timestamp: 11500, fresh: true },
    11500,
  )!;
  assert.ok(b.progressMeters - a.progressMeters < 40);
});
test("progress never estimates from stale fixes, poor accuracy or an off-route parallel road", () => {
  const tracker = new ProgressTracker(),
    route = routeFor();
  const fix = {
    coordinate: origin,
    accuracy: 5,
    timestamp: 10000,
    fresh: true,
  };
  assert.equal(tracker.observe(route, fix, 26000), null);
  assert.equal(tracker.observe(route, { ...fix, accuracy: 90 }, 10000), null);
  assert.equal(
    tracker.observe(
      route,
      { ...fix, coordinate: { latitude: 0.002, longitude: 0.01 } },
      10000,
    ),
    null,
  );
});
test("retry cannot replay a completed action, a changed trip, an expired request or a second tap", () => {
  let now = 10000;
  const retry = new AssistantRetry<object>(() => now);
  const trip = {};
  retry.record("Add second", "executed-action", trip, true);
  assert.equal(retry.take(trip), null);
  retry.record("Add second", "failed-action", trip, true);
  assert.equal(retry.status(trip), "failed-action");
  assert.equal(retry.take({}), null);
  retry.record("ETA", "conversation", trip, true);
  now += 60001;
  assert.equal(retry.take(trip), null);
  retry.record("ETA", "conversation", trip, true);
  assert.equal(retry.take(trip), "ETA");
  assert.equal(retry.take(trip), null);
});
test("trip recovery stores destination and unvisited stops without route, GPS history or active voice", () => {
  const encoded = encodeRecovery(
    {
      destination,
      route: routeFor(),
      startedAt: "fixture",
      completedBeforeRouteMeters: 100,
      stops: [
        { id: stop.id, place: stop },
        { id: "visited", place: { ...stop, id: "visited" }, visited: true },
      ],
    },
    10000,
  )!;
  const recovered = decodeRecovery(encoded, 12000)!;
  assert.equal(recovered.stops.length, 1);
  for (const field of [
    "route",
    "startedAt",
    "geometry",
    "completedBeforeRouteMeters",
    "speed",
    "heading",
  ])
    assert.equal(encoded.includes(`\"${field}\"`), false);
  assert.equal(decodeRecovery(encoded, 10000 + 6 * 3600000 + 1), null);
  assert.equal(decodeRecovery("corrupt"), null);
});
test("recovered plan recalculates once, stays in planning mode and never installs stale route data", async () => {
  let calls = 0;
  const controller = new TripController(
    {
      async getRoute() {
        calls++;
        return routeFor();
      },
    },
    () => origin,
  );
  const plan = decodeRecovery(
    encodeRecovery(
      { destination, route: routeFor(), startedAt: "fixture", stops: [] },
      10000,
    ),
    10000,
  )!;
  assert.equal(await controller.restorePlan(plan), true);
  assert.equal(calls, 1);
  assert.equal(controller.getSnapshot().trip?.startedAt, undefined);
  assert.equal(await controller.restorePlan(plan), false);
  controller.dispose();
});
test("live trip UI stop changes preserve the existing route during network failure", async () => {
  let fail = false;
  const controller = new TripController(
    {
      async getRoute() {
        if (fail) throw new Error("offline");
        return routeFor();
      },
    },
    () => origin,
  );
  await controller.selectDestination(destination);
  controller.start();
  const before = controller.getSnapshot().trip;
  fail = true;
  await controller.addStop(stop);
  assert.equal(controller.getSnapshot().trip, before);
  controller.dispose();
});
