import { test } from "node:test";
import assert from "node:assert/strict";
import { rankRoutePlaces, sampleAhead } from "../services/routeAware";
import { distanceBetween, projectOntoRoute } from "../utils/geo";
import { origin, routeFor, stop } from "./fixtures";

test("route search samples ahead and deduplicates short-route endpoints", () => {
  const driver = { latitude: 0, longitude: 0.05 };
  const samples = sampleAhead(routeFor(), driver);
  assert.equal(samples.length, 2);
  for (const sample of samples) assert.ok(sample.longitude > driver.longitude);
  assert.equal(
    sampleAhead(routeFor(), { latitude: 0, longitude: 0.1999 }).length,
    1,
  );
});
test("ranking excludes places behind the driver and outside the route corridor", () => {
  const driver = { latitude: 0, longitude: 0.05 };
  const places = [
    { ...stop, id: "behind", coordinate: origin, rating: 5 },
    { ...stop, id: "far-away", coordinate: { latitude: 0.05, longitude: 0.1 } },
    {
      ...stop,
      id: "near-road",
      coordinate: { latitude: 0.0002, longitude: 0.08 },
      rating: 4,
    },
    {
      ...stop,
      id: "detour",
      coordinate: { latitude: 0.01, longitude: 0.08 },
      rating: 5,
    },
  ];
  const ranked = rankRoutePlaces(places, routeFor(), driver);
  assert.deepEqual(
    ranked.map((place) => place.id),
    ["near-road", "detour"],
  );
  assert.ok(ranked.every((place) => (place.aheadMeters ?? -1) > 0));
  assert.ok((ranked[0]?.routeOffsetMeters ?? Infinity) < 30);
  assert.equal(ranked[0]?.openNow, undefined);
});
test("off-route driver uses nearby search rather than misleading ahead results", () => {
  const driver = { latitude: 0.05, longitude: 0.05 };
  assert.deepEqual(sampleAhead(routeFor(), driver), [driver]);
  const ranked = rankRoutePlaces([stop], routeFor(), driver);
  assert.equal(ranked[0]?.aheadMeters, undefined);
  assert.equal(ranked[0]?.routeOffsetMeters, undefined);
});
test("projection measures progress, supports zero-length segments and date-line routes", () => {
  const projection = projectOntoRoute({ latitude: 0.001, longitude: 0.05 }, [
    origin,
    origin,
    { latitude: 0, longitude: 0.1 },
  ]);
  assert.ok(projection);
  assert.ok(
    Math.abs(projection.progressMeters / projection.totalMeters - 0.5) < 0.001,
  );
  assert.ok(projection.offsetMeters > 100 && projection.offsetMeters < 120);
  const crossing = [
    { latitude: 0, longitude: 179.9 },
    { latitude: 0, longitude: -179.9 },
  ];
  const edge = projectOntoRoute({ latitude: 0, longitude: 180 }, crossing);
  assert.ok(edge);
  assert.ok(edge.offsetMeters < 1);
  assert.ok(edge.totalMeters < 23000);
  assert.ok(distanceBetween(crossing[0]!, crossing[1]!) < 23000);
});
