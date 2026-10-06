import { test } from "node:test";
import assert from "node:assert/strict";
import { TripController } from "../services/tripController";
import { ServiceError } from "../services/errors";
import type { Route, RoutesService } from "../types/domain";
import { deferred, destination, origin, routeFor, stop } from "./fixtures";

test("select, start, add/remove stops and cancel form one consistent trip", async () => {
  const calls: string[][] = [];
  const service: RoutesService = {
    async getRoute(_origin, place, stops = []) {
      calls.push(stops.map((stop) => stop.id));
      return { ...routeFor(place), id: `route-${calls.length}` };
    },
  };
  const controller = new TripController(service, () => origin);
  await controller.selectDestination(destination);
  assert.equal(controller.getSnapshot().status, "ready");
  assert.equal(controller.getSnapshot().trip?.route?.durationSeconds, 1500);
  controller.start();
  const startedAt = controller.getSnapshot().trip?.startedAt;
  assert.ok(startedAt);
  await controller.addStop(stop);
  assert.deepEqual(calls, [[], ["stop"]]);
  assert.equal(controller.getSnapshot().trip?.destination.id, destination.id);
  assert.equal(controller.getSnapshot().trip?.startedAt, startedAt);
  await controller.addStop(stop);
  await controller.addStop(destination);
  assert.equal(calls.length, 2);
  await controller.removeStop("stop");
  assert.deepEqual(calls.at(-1), []);
  assert.deepEqual(controller.getSnapshot().trip?.stops, []);
  controller.cancel();
  assert.deepEqual(controller.getSnapshot(), {
    trip: null,
    status: "idle",
    error: null,
  });
});
test("duplicate taps do not send duplicate route requests", async () => {
  const pending = deferred<Route>();
  let calls = 0;
  const controller = new TripController(
    {
      getRoute() {
        calls++;
        return pending.promise;
      },
    },
    () => origin,
  );
  const selection = controller.selectDestination(destination);
  await controller.selectDestination(destination);
  await controller.addStop(stop);
  await controller.retry();
  controller.start();
  assert.equal(calls, 1);
  assert.equal(controller.getSnapshot().trip?.startedAt, undefined);
  pending.resolve(routeFor());
  await selection;
  await controller.selectDestination(destination);
  assert.equal(calls, 1);
});
test("cancel prevents an old request from restoring the route", async () => {
  const pending = deferred<Route>();
  let signal: AbortSignal | undefined;
  const controller = new TripController(
    {
      getRoute(_o, _d, _s, options) {
        signal = options?.signal;
        return pending.promise;
      },
    },
    () => origin,
  );
  const selection = controller.selectDestination(destination);
  controller.cancel();
  assert.equal(signal?.aborted, true);
  pending.resolve(routeFor());
  await selection;
  assert.equal(controller.getSnapshot().trip, null);
});
test("new destination wins when an older request finishes later", async () => {
  const first = deferred<Route>(),
    second = deferred<Route>();
  let count = 0;
  const controller = new TripController(
    {
      getRoute() {
        return ++count === 1 ? first.promise : second.promise;
      },
    },
    () => origin,
  );
  const one = controller.selectDestination(destination),
    two = controller.selectDestination(stop);
  second.resolve(routeFor(stop));
  await two;
  first.resolve(routeFor());
  await one;
  assert.equal(controller.getSnapshot().trip?.destination.id, stop.id);
  assert.equal(controller.getSnapshot().trip?.route?.destination.id, stop.id);
});
test("stop recalculation clears old route metadata, including on failure and retry", async () => {
  const pending = deferred<Route>();
  let calls = 0;
  const controller = new TripController(
    {
      getRoute() {
        return ++calls === 2 ? pending.promise : Promise.resolve(routeFor());
      },
    },
    () => origin,
  );
  await controller.selectDestination(destination);
  const adding = controller.addStop(stop);
  assert.equal(controller.getSnapshot().trip?.route, null);
  assert.equal(controller.getSnapshot().status, "loading");
  pending.reject(new ServiceError("network", "No connection."));
  await adding;
  assert.equal(controller.getSnapshot().status, "error");
  assert.equal(controller.getSnapshot().trip?.route, null);
  assert.equal(controller.getSnapshot().trip?.stops[0]?.id, stop.id);
  await controller.retry();
  assert.equal(controller.getSnapshot().status, "ready");
});
test("GPS, invalid data, and demo destinations do not cause unintended API calls", async () => {
  let calls = 0;
  const service: RoutesService = {
    async getRoute() {
      calls++;
      return routeFor();
    },
  };
  const controller = new TripController(service, () => null);
  await controller.selectDestination(destination);
  assert.match(controller.getSnapshot().error ?? "", /GPS/);
  assert.equal(calls, 0);
  const invalid = new TripController(service, () => origin);
  await invalid.selectDestination({
    ...destination,
    coordinate: { latitude: NaN, longitude: 0 },
  });
  assert.equal(invalid.getSnapshot().status, "error");
  assert.equal(calls, 0);
  await invalid.selectDestination({ ...destination, source: "mock" });
  assert.equal(invalid.getSnapshot().status, "idle");
  assert.equal(invalid.getSnapshot().trip?.route, null);
  assert.equal(calls, 0);
  await invalid.addStop(stop);
  assert.equal(invalid.getSnapshot().trip?.stops.length, 0);
  assert.equal(calls, 0);
});

test("stop limits and failed removal keep the requested plan without stale route data", async () => {
  let fail = false,
    calls = 0;
  const controller = new TripController(
    {
      async getRoute() {
        calls++;
        if (fail) throw new ServiceError("network", "No connection.");
        return routeFor();
      },
    },
    () => origin,
  );
  await controller.selectDestination(destination);
  for (let index = 0; index < 5; index++)
    await controller.addStop({ ...stop, id: `stop-${index}` });
  assert.equal(calls, 6);
  await controller.addStop({ ...stop, id: "sixth" });
  assert.equal(calls, 6);
  assert.equal(controller.getSnapshot().trip?.stops.length, 5);
  fail = true;
  await controller.removeStop("stop-2");
  assert.equal(controller.getSnapshot().status, "error");
  assert.equal(controller.getSnapshot().trip?.route, null);
  assert.deepEqual(
    controller.getSnapshot().trip?.stops.map((stop) => stop.id),
    ["stop-0", "stop-1", "stop-3", "stop-4"],
  );
  fail = false;
  await controller.retry();
  assert.equal(controller.getSnapshot().status, "ready");
});
