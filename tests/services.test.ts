import { test } from "node:test";
import assert from "node:assert/strict";
import { mockReply } from "../src/services/ai";
import { demoPlacesService as placesService } from "../src/services/demoPlaces";
import { unconfiguredRoutesService as routesService } from "../src/services/routes";
import { weatherService } from "../src/services/weather";
import type { RoamContext, PlaceCategory } from "../src/types/domain";
import { validCoordinate } from "../src/utils/location";

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
test("configured assistant points to verified search and trip UI without pretending to navigate", () => {
  const configured: RoamContext = { ...context, placesMode: "google" };
  const coffee = mockReply("Add Starbucks as a stop", configured);
  assert.equal(coffee.category, "coffee");
  assert.match(coffee.text, /Google Places/);
  assert.doesNotMatch(coffee.text, /added|fictional|demo ideas/i);
  const route = mockReply("Navigate home", configured);
  assert.match(route.text, /Google driving route/);
  assert.match(route.text, /Turn-by-turn guidance is not implemented/);
  assert.doesNotMatch(route.text, /doesn’t calculate routes/);
  const traffic = mockReply("Any traffic?", configured);
  assert.match(traffic.text, /Refresh route/);
  assert.doesNotMatch(traffic.text, /explore the demo places/);
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
