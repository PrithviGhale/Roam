import { test } from "node:test";
import assert from "node:assert/strict";
import { AssistantEngine } from "../src/services/assistant/engine";
import {
  createAssistantTransport,
  type AssistantTransport,
} from "../src/services/assistant/client";
import { buildContext, compactHistory } from "../src/services/assistant/context";
import {
  toolNames,
  toolSchemas,
  responseSchema,
  type AssistantResponse,
  type ToolCall,
} from "../shared/assistant";
import { TripController } from "../src/services/tripController";
import { createTripTools } from "../src/services/tools";
import { demoPlacesService } from "../src/services/demoPlaces";
import { ServiceError } from "../src/services/errors";
import type { Message, Place, PlacesService } from "../src/types/domain";
import { deferred, destination, origin, routeFor, stop } from "./fixtures";

const choices: Place[] = [1, 2, 3].map((index) => ({
  ...stop,
  id: `option-${index}`,
  name: ["Starbucks", "Dunkin'", "Aroma Joe's"][index - 1]!,
  category: "coffee",
  coordinate: { latitude: 0, longitude: 0.03 * index },
}));
const realPlaces: PlacesService = {
  ...demoPlacesService,
  mode: "google",
  async nearby() {
    return choices;
  },
  async alongRoute() {
    return choices;
  },
  async search() {
    return choices;
  },
};
const tool = (
  name: ToolCall["name"],
  args: Record<string, unknown> = {},
): AssistantResponse => ({
  type: "tools",
  calls: [{ id: "call", name, args }],
  continuation: "signed-fixture",
});
const final = (recommendationPlaceId?: string): AssistantResponse => ({
  type: "response",
  plan: {
    kind: "results",
    ...(recommendationPlaceId ? { recommendationPlaceId } : {}),
  },
});
function queued(responses: (AssistantResponse | Error)[]) {
  const inputs: unknown[] = [];
  const next = async (input: unknown) => {
    inputs.push(input);
    const response = responses.shift();
    if (response instanceof Error) throw response;
    if (!response) throw new Error("Missing model fixture");
    return response;
  };
  const transport: AssistantTransport = {
    turn: next,
    continue: (token, results) => next({ token, results }),
  };
  return { transport, inputs };
}
async function setup(
  responses: (AssistantResponse | Error)[],
  now?: () => number,
) {
  const model = queued(responses);
  let routeCalls = 0,
    fail = false;
  const trip = new TripController(
    {
      async getRoute(_o, place) {
        routeCalls++;
        if (fail) throw new Error("network fixture");
        return routeFor(place);
      },
    },
    () => origin,
  );
  await trip.selectDestination(destination);
  const engine = new AssistantEngine(
    model.transport,
    realPlaces,
    trip,
    () => origin,
    now,
  );
  return {
    engine,
    trip,
    model,
    calls: () => routeCalls,
    fail: () => {
      fail = true;
    },
  };
}

test("registry has only allowed tools and rejects malformed/extra arguments", () => {
  assert.deepEqual(Object.keys(toolSchemas), [...toolNames]);
  assert.equal(
    toolSchemas.searchFood.safeParse({ maxResults: 6 }).success,
    false,
  );
  assert.equal(
    toolSchemas.addTripStop.safeParse({ latitude: 5 }).success,
    false,
  );
  assert.equal(
    toolSchemas.cancelTrip.safeParse({ force: true }).success,
    false,
  );
  assert.equal(
    responseSchema.safeParse({
      type: "tools",
      calls: [{ id: "x", name: "deleteEverything", args: {} }],
      continuation: "token",
    }).success,
    false,
  );
});
test("retry metadata distinguishes no action, failed action and completed action despite AI failure", async () => {
  const conversational = await setup([new Error("offline")]);
  assert.equal(
    (await conversational.engine.send("ETA", [])).retryKind,
    "conversation",
  );
  const failed = await setup([
    tool("searchCoffee"),
    final(),
    tool("addTripStop", { resultIndex: 2 }),
    final(),
  ]);
  await failed.engine.send("Coffee", []);
  failed.fail();
  const reply = await failed.engine.send("Add second", []);
  assert.equal(reply.retryKind, "failed-action");
  assert.equal(reply.error, true);
  const success = await setup([
    tool("searchCoffee"),
    final(),
    tool("addTripStop", { resultIndex: 2 }),
    new Error("final AI offline"),
    tool("addTripStop", { resultIndex: 2 }),
    final(),
  ]);
  await success.engine.send("Coffee", []);
  const done = await success.engine.send("Add second", []);
  assert.equal(done.retryKind, "executed-action");
  assert.ok(!done.error);
  await success.engine.send("Add second", []);
  assert.equal(success.trip.getSnapshot().trip!.stops.length, 1);
});
test("real search -> visible references -> add second; user ordinal beats model-selected ID", async () => {
  const s = await setup([
    tool("searchCoffee"),
    final(),
    tool("addTripStop", { placeId: choices[0]!.id }),
    final(),
  ]);
  const results = await s.engine.send("Find coffee", []);
  assert.deepEqual(
    results.places?.map((place) => place.id),
    choices.map((place) => place.id),
  );
  const reply = await s.engine.send("Add the second one", []);
  assert.equal(s.trip.getSnapshot().trip?.stops[0]?.place.id, choices[1]!.id);
  assert.match(reply.text, /Dunkin'.*added/);
  assert.equal(s.calls(), 2);
});
test("first and third presented references execute correctly", async () => {
  for (const [word, index] of [
    ["first", 0],
    ["third", 2],
  ] as const) {
    const s = await setup([
      tool("searchCoffee"),
      final(),
      tool("addTripStop", { resultIndex: 2 }),
      final(),
    ]);
    await s.engine.send("Coffee", []);
    await s.engine.send(`Add the ${word} one`, []);
    assert.equal(s.trip.getSnapshot().trip?.stops[0]?.id, choices[index]!.id);
  }
});
test("recommendation requires acceptance; yes refers to typed pending ID", async () => {
  const s = await setup([
    tool("searchCoffee"),
    final(choices[1]!.id),
    tool("addTripStop", { placeId: choices[0]!.id }),
    final(),
  ]);
  const reply = await s.engine.send("Find coffee", []);
  assert.match(reply.text, /Want to add Dunkin'/);
  assert.equal(s.calls(), 1);
  await s.engine.send("Yeah", []);
  assert.equal(s.trip.getSnapshot().trip?.stops[0]?.id, choices[1]!.id);
});
test("a premature model mutation asks first, and negated commands never modify", async () => {
  const s = await setup([
    tool("searchCoffee"),
    final(),
    tool("addTripStop", { placeId: choices[0]!.id }),
    final(),
    tool("addTripStop", { placeId: choices[0]!.id }),
    final(),
  ]);
  await s.engine.send("Coffee", []);
  const question = await s.engine.send("Maybe Starbucks", []);
  assert.match(question.text, /Add Starbucks/);
  assert.equal(s.calls(), 1);
  await s.engine.send("Don’t add Starbucks", []);
  assert.equal(s.calls(), 1);
});
test("expired references and unknown model IDs cannot become stops", async () => {
  let clock = 0;
  const s = await setup(
    [
      tool("searchCoffee"),
      final(),
      tool("addTripStop", { placeId: "invented" }),
      final(),
      tool("addTripStop", { resultIndex: 1 }),
      final(),
    ],
    () => clock,
  );
  await s.engine.send("Coffee", []);
  await s.engine.send("Add Imaginary Coffee", []);
  clock = 11 * 60 * 1000;
  const expired = await s.engine.send("Add the first one", []);
  assert.match(expired.text, /expire|Which place/);
  assert.equal(s.calls(), 1);
});
test("ambiguous stop removal ignores an arbitrary model-selected stop", async () => {
  const s = await setup([
    tool("removeTripStop", { stopId: choices[1]!.id }),
    final(),
  ]);
  await s.trip.addStop(choices[0]!);
  await s.trip.addStop(choices[1]!);
  const before = s.trip.getSnapshot().trip;
  const reply = await s.engine.send("Remove that stop", []);
  assert.match(reply.text, /Which stop/);
  assert.equal(s.trip.getSnapshot().trip, before);
});
test("add then remove that stop uses the last successful typed mutation", async () => {
  const s = await setup([
    tool("searchCoffee"),
    final(),
    tool("addTripStop", { resultIndex: 1 }),
    final(),
    tool("removeTripStop"),
    final(),
  ]);
  await s.engine.send("Coffee", []);
  await s.engine.send("Add first", []);
  const reply = await s.engine.send("Actually remove that stop", []);
  assert.deepEqual(s.trip.getSnapshot().trip?.stops, []);
  assert.match(reply.text, /removed/);
});
test("failed AI stop recalculation restores exact previous trip and does not claim success", async () => {
  const s = await setup([
    tool("searchCoffee"),
    final(),
    tool("addTripStop", { resultIndex: 2 }),
    final(),
  ]);
  await s.engine.send("Coffee", []);
  const before = s.trip.getSnapshot();
  s.fail();
  const reply = await s.engine.send("Add the second one", []);
  assert.equal(reply.error, true);
  assert.doesNotMatch(reply.text, /added|updated/);
  assert.deepEqual(s.trip.getSnapshot(), before);
});
test("AI unavailable keeps active route, and failure after tool success reports verified success", async () => {
  const unavailable = await setup([new Error("Gemini offline")]);
  const before = unavailable.trip.getSnapshot();
  assert.equal((await unavailable.engine.send("Food", [])).error, true);
  assert.deepEqual(unavailable.trip.getSnapshot(), before);
  const s = await setup([
    tool("searchCoffee"),
    final(),
    tool("addTripStop", { resultIndex: 1 }),
    new Error("final model response failed"),
  ]);
  await s.engine.send("Coffee", []);
  const reply = await s.engine.send("Add first", []);
  assert.match(reply.text, /Starbucks.*added/);
  assert.equal(s.trip.getSnapshot().trip?.stops.length, 1);
});
test("explicit cancel executes but ambiguous cancel requires acceptance", async () => {
  const s = await setup([
    tool("cancelTrip"),
    final(),
    tool("cancelTrip"),
    final(),
  ]);
  const reply = await s.engine.send("Maybe stop for now", []);
  assert.match(reply.text, /Cancel.*\?/);
  assert.ok(s.trip.getSnapshot().trip);
  await s.engine.send("Cancel my route", []);
  assert.equal(s.trip.getSnapshot().trip, null);
});
test("trip status uses real state and filters unsupported model-only facts", async () => {
  const s = await setup([
    tool("getTripStatus"),
    { type: "response", plan: { kind: "status" } },
  ]);
  const reply = await s.engine.send("What's my ETA?", []);
  assert.match(reply.text, /25 min/);
  assert.match(reply.text, /last Google calculation/);
  assert.equal(
    responseSchema.safeParse({
      type: "response",
      plan: { kind: "status", eta: "fake" },
    }).success,
    false,
  );
});
test("compact context excludes coordinates/polyline and history is bounded", () => {
  const context = buildContext(
    { destination, route: routeFor(), stops: [], startedAt: "now" },
    origin,
    true,
    choices,
    null,
  );
  const serialized = JSON.stringify(context);
  assert.doesNotMatch(serialized, /latitude|longitude|geometry|polyline|speed/);
  assert.equal(context.recentResults.length, 3);
  const history: Message[] = Array.from({ length: 30 }, (_, index) => ({
    id: String(index),
    role: "user",
    text: "x".repeat(1400),
  }));
  assert.equal(compactHistory(history).length, 12);
  assert.equal(compactHistory(history)[0]?.text.length, 1200);
});
test("parking is biased to destination, qualified food queries reuse route samples", async () => {
  const s = await setup([]);
  const calls: { query?: string; point: typeof origin | null }[] = [];
  const places: PlacesService = {
    ...realPlaces,
    async nearby(_category, point) {
      calls.push({ point });
      return choices;
    },
    async search(query, point) {
      calls.push({ query, point });
      return choices;
    },
  };
  const tools = createTripTools(places, s.trip, () => origin);
  await tools.searchParking();
  assert.deepEqual(calls[0]?.point, destination.coordinate);
  calls.length = 0;
  await tools.searchFood({ query: "burgers", maxResults: 2 });
  assert.equal(calls.length, 2);
  assert.equal(calls[0]?.query, "burgers restaurant");
});
test("transport fails cleanly on missing URL, quota, and malformed model tool requests", async () => {
  const input = {
    message: "Coffee",
    history: [],
    context: buildContext(null, null, false, [], null),
  };
  await assert.rejects(
    createAssistantTransport("").turn(input),
    /Connect.*backend/,
  );
  await assert.rejects(
    createAssistantTransport(
      "http://test",
      "",
      async () => new Response("{}", { status: 429 }),
    ).turn(input),
    /busy/,
  );
  await assert.rejects(
    createAssistantTransport("http://test", "", async () =>
      Response.json({
        type: "tools",
        calls: [{ id: "x", name: "arbitrary", args: {} }],
        continuation: "token",
      }),
    ).turn(input),
    /unreadable/,
  );
});
test("cancel during assistant transaction cannot restore a late route", async () => {
  const pending = deferred<ReturnType<typeof routeFor>>();
  let count = 0;
  const trip = new TripController(
    {
      getRoute() {
        return ++count === 1 ? Promise.resolve(routeFor()) : pending.promise;
      },
    },
    () => origin,
  );
  await trip.selectDestination(destination);
  const before = trip.getSnapshot().trip!;
  const updating = trip.applyStopsAtomic(before, [
    { id: stop.id, place: stop },
  ]);
  trip.cancel();
  pending.resolve(routeFor());
  assert.equal(await updating, false);
  assert.equal(trip.getSnapshot().trip, null);
});

test("trip changes during model reasoning invalidate old mutation targets", async () => {
  const s = await setup([tool("searchCoffee"), final()]);
  await s.engine.send("Coffee", []);
  const pending = deferred<AssistantResponse>();
  const engine = new AssistantEngine(
    {
      async turn() {
        return pending.promise;
      },
      async continue() {
        return final();
      },
    },
    realPlaces,
    s.trip,
    () => origin,
  );
  const sending = engine.send("Cancel my route", []);
  await s.trip.selectDestination(stop);
  pending.resolve(tool("cancelTrip"));
  assert.match((await sending).text, /trip changed/);
  assert.equal(s.trip.getSnapshot().trip?.destination.id, stop.id);
});
test("explicit cancellation works even when route calculation has failed", async () => {
  const model = queued([tool("cancelTrip"), final()]);
  const trip = new TripController(
    {
      async getRoute() {
        throw new Error("offline");
      },
    },
    () => origin,
  );
  await trip.selectDestination(destination);
  assert.equal(trip.getSnapshot().status, "error");
  const engine = new AssistantEngine(
    model.transport,
    realPlaces,
    trip,
    () => origin,
  );
  assert.match((await engine.send("Cancel my route", [])).text, /canceled/);
  assert.equal(trip.getSnapshot().trip, null);
});
test("malformed tool arguments fail before any trip mutation", async () => {
  const s = await setup([tool("cancelTrip", { force: true }), final()]);
  const before = s.trip.getSnapshot();
  assert.equal((await s.engine.send("Cancel my route", [])).error, true);
  assert.deepEqual(s.trip.getSnapshot(), before);
});
