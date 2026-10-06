import { test } from "node:test";
import assert from "node:assert/strict";
import { mockReply } from "../services/ai";
import { placesService } from "../services/places";
import { routesService } from "../services/routes";
import { weatherService } from "../services/weather";
import type { RoamContext, PlaceCategory } from "../types/domain";
import { validCoordinate } from "../utils/location";

const context: RoamContext = {
  location: null,
  destination: null,
  activeRoute: null,
  speedMph: null,
  time: new Date().toISOString(),
  weather: null,
  previousConversation: [],
};
test("assistant routes requests to the relevant demo category", () => {
  const requests: [string, PlaceCategory][] = [
    ["I'm hungry", "food"],
    ["I need gas", "gas"],
    ["Find a bathroom", "restroom"],
    ["Add Starbucks as a stop", "coffee"],
    ["Find parking", "parking"],
  ];
  for (const [message, category] of requests) {
    const reply = mockReply(message, context);
    assert.equal(reply.category, category);
    assert.match(reply.text, /demo|sample/i);
  }
});
test("assistant does not invent live road conditions or navigation", () => {
  for (const message of [
    "What is the weather ahead?",
    "Any traffic?",
    "Police ahead?",
    "Avoid tolls",
    "Navigate home",
  ]) {
    const reply = mockReply(message, context);
    assert.equal(reply.category, undefined);
    assert.match(reply.text, /not connected|coming next/i);
  }
});
test("demo places are labeled, searchable, and anchored to the caller location", async () => {
  const origin = { latitude: 35, longitude: -100 };
  const places = await placesService.nearby("coffee", origin);
  assert.ok(places.length > 0);
  for (const place of places) {
    assert.equal(place.source, "mock");
    assert.ok(Math.abs(place.coordinate.latitude - origin.latitude) < 0.01);
  }
  assert.equal(
    (await placesService.search("Daybreak", origin))[0]?.name,
    "Daybreak Coffee",
  );
  assert.deepEqual(await placesService.search("no-such-place", origin), []);
  for (const place of await placesService.nearby("food", {
    latitude: 90,
    longitude: 180,
  }))
    assert.equal(validCoordinate(place.coordinate), true);
});
test("unconnected route and weather adapters fail explicitly", async () => {
  const origin = { latitude: 40, longitude: -73 };
  const destination = (await placesService.nearby("food", origin))[0]!;
  await assert.rejects(
    routesService.getRoute(origin, destination),
    /not connected/,
  );
  await assert.rejects(weatherService.getWeather(origin), /not connected/);
});
