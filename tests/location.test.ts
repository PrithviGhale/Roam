import { test } from "node:test";
import assert from "node:assert/strict";
import { compassLabel, speedInMph, validCoordinate } from "../src/utils/location";

const now = 100000;
test("GPS speed converts meters per second to MPH and suppresses stationary drift", () => {
  assert.equal(speedInMph({ speed: 10, accuracy: 5, timestamp: now }, now), 22);
  assert.equal(speedInMph({ speed: 0, accuracy: 5, timestamp: now }, now), 0);
  assert.equal(speedInMph({ speed: 0.5, accuracy: 5, timestamp: now }, now), 0);
});
test("unavailable, inaccurate, stale and impossible readings do not become driving speeds", () => {
  assert.equal(speedInMph(null, now), null);
  for (const speed of [null, -1, NaN, Infinity, 91])
    assert.equal(speedInMph({ speed, accuracy: 5, timestamp: now }, now), null);
  for (const accuracy of [null, -1, NaN, Infinity, 66])
    assert.equal(
      speedInMph({ speed: 10, accuracy, timestamp: now }, now),
      null,
    );
  assert.equal(
    speedInMph({ speed: 10, accuracy: 5, timestamp: now - 15001 }, now),
    null,
  );
  assert.equal(
    speedInMph({ speed: 10, accuracy: 5, timestamp: now + 6000 }, now),
    null,
  );
  assert.equal(
    speedInMph({ speed: 10, accuracy: 5, timestamp: NaN }, now),
    null,
  );
});
test("compass handles cardinal boundaries and unavailable sensor values", () => {
  assert.equal(compassLabel(0), "N");
  assert.equal(compassLabel(359), "N");
  assert.equal(compassLabel(90), "E");
  assert.equal(compassLabel(225), "SW");
  for (const heading of [null, -1, NaN, Infinity, 360])
    assert.equal(compassLabel(heading), "—");
});
test("coordinates must lie on Earth and be finite", () => {
  assert.equal(validCoordinate({ latitude: 40, longitude: -73 }), true);
  assert.equal(validCoordinate({ latitude: 91, longitude: 0 }), false);
  assert.equal(validCoordinate({ latitude: NaN, longitude: Infinity }), false);
});
