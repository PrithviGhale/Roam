import { test } from "node:test";
import assert from "node:assert/strict";
import { formatDistance, formatDuration } from "../utils/format";
import { decodePolyline } from "../utils/polyline";

test("US distance and duration formatting handles boundaries and missing data", () => {
  assert.equal(formatDistance(1609.344), "1.0 mi");
  assert.equal(formatDistance(0), "0 ft");
  assert.equal(formatDistance(100), "330 ft");
  assert.equal(formatDistance(160934.4), "100 mi");
  assert.equal(formatDuration(30), "1 min");
  assert.equal(formatDuration(3600), "1 hr");
  assert.equal(formatDuration(4320), "1 hr 12 min");
  for (const value of [null, undefined, -1, NaN, Infinity]) {
    assert.equal(formatDistance(value), "—");
    assert.equal(formatDuration(value), "—");
  }
});
test("Google encoded polylines decode without a dependency", () => {
  assert.deepEqual(decodePolyline("_p~iF~ps|U_ulLnnqC_mqNvxq`@"), [
    { latitude: 38.5, longitude: -120.2 },
    { latitude: 40.7, longitude: -120.95 },
    { latitude: 43.252, longitude: -126.453 },
  ]);
});
test("truncated, invalid and empty route lines fail cleanly", () => {
  for (const encoded of [
    "",
    "_",
    "??",
    "~~~~~~~",
    "\u0000\u0000",
    "_p~iF~ps|U_ulLnnqC_mqNvxq`",
  ])
    assert.throws(() => decodePolyline(encoded), /invalid route/);
});
