import test from "node:test";
import assert from "node:assert/strict";
import { AssistantEngine } from "../src/services/assistant/engine";
import { TripController } from "../src/services/tripController";
import { demoPlacesService } from "../src/services/demoPlaces";
import { routeFor, origin, destination, stop } from "./fixtures";
import { mapChromeBudget } from "../src/design/layout";
import { localConversation } from "../src/services/assistant/composition";
async function context() {
  let clock = 1000,
    calls = 0;
  const choices = [1, 2].map((index) => ({
    ...stop,
    id: `option-${index}`,
    name: `Cafe ${index}`,
  }));
  const trip = new TripController(
    { getRoute: async (_origin, place) => routeFor(place) },
    () => origin,
  );
  await trip.selectDestination(destination);
  const engine = new AssistantEngine(
    {
      turn: async () => {
        calls++;
        return {
          type: "tools",
          calls: [{ id: "search", name: "searchCoffee", args: {} }],
          continuation: "fixture",
        };
      },
      continue: async () => ({
        type: "response",
        plan: { kind: "results", recommendationPlaceId: choices[0]!.id },
      }),
    },
    {
      ...demoPlacesService,
      mode: "google",
      nearby: async () => choices,
      alongRoute: async () => choices,
      search: async () => choices,
    },
    trip,
    () => origin,
    () => clock,
  );
  const first = await engine.send("Find coffee", []);
  return {
    engine,
    trip,
    first,
    calls: () => calls,
    expire: () => {
      clock += 610000;
    },
  };
}
test("second-option follow-up uses displayed session results without Gemini or mutation", async () => {
  const { engine, trip, first, calls } = await context();
  const expected = trip.getSnapshot().trip;
  const reply = await engine.send("What was the second one?", []);
  assert.ok(reply.text.includes(first.places![1]!.name));
  assert.equal(calls(), 1);
  assert.equal(trip.getSnapshot().trip, expected);
  assert.equal(reply.places?.length, first.places?.length);
});
test("changing the conversational selection does not change the trip before consent", async () => {
  const { engine, trip, first } = await context();
  const expected = trip.getSnapshot().trip;
  await engine.send("What was the second one?", []);
  const reply = await engine.send("Actually give me the first", []);
  assert.ok(reply.text.includes(first.places![0]!.name));
  assert.equal(trip.getSnapshot().trip, expected);
  assert.equal(engine.hasPendingConfirmation(), true);
});
test("expired conversational references are not answered from stale results", async () => {
  const c = await context();
  c.expire();
  await c.engine.send("What was the second one?", []);
  assert.equal(c.calls(), 2);
});
test("greetings and thanks have natural deterministic replies", () => {
  assert.equal(localConversation("Hello!"), "Hey. Where are we going?");
  assert.equal(localConversation("Thanks."), "Anytime. Enjoy the drive.");
  assert.equal(localConversation("Hey ROAM find coffee"), null);
});
test("small/large map layouts bound permanent lower chrome", () => {
  for (const height of [667, 844, 932]) {
    assert.ok(mapChromeBudget(height, 100) <= height * 0.42);
    assert.ok(mapChromeBudget(height, 100) >= 120);
  }
});
test("large maneuver chrome leaves the lower panel scrollable", () => {
  assert.equal(mapChromeBudget(667, 430), 120);
});
