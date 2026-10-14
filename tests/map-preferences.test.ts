import test from "node:test";
import assert from "node:assert/strict";
import { MapPreferences } from "../src/map/MapPreferences";
import { deferred } from "./fixtures";
test("late persisted theme cannot overwrite a new map selection", async () => {
  const read = deferred<string | null>();
  let saved = "";
  const store = new MapPreferences({
    getItem: () => read.promise,
    setItem: async (_key, value) => {
      saved = value;
    },
  });
  const hydrate = store.hydrate();
  store.set("day");
  read.resolve("night");
  await hydrate;
  await store.flush();
  assert.equal(store.getSnapshot(), "day");
  assert.equal(saved, "day");
});
test("rapid theme selections are persisted in order", async () => {
  const first = deferred<void>();
  let writes = 0,
    saved = "";
  const store = new MapPreferences({
    getItem: async () => null,
    setItem: async (_key, value) => {
      if (++writes === 1) await first.promise;
      saved = value;
    },
  });
  await store.hydrate();
  store.set("night");
  store.set("day");
  first.resolve();
  await store.flush();
  assert.equal(saved, "day");
  assert.equal(writes, 2);
});
test("failed preference writes do not poison the next selection", async () => {
  let writes = 0,
    saved = "";
  const store = new MapPreferences({
    getItem: async () => null,
    setItem: async (_key, value) => {
      if (++writes === 1) throw Error("storage");
      saved = value;
    },
  });
  await store.hydrate();
  store.set("night");
  store.set("day");
  await store.flush();
  assert.equal(saved, "day");
});
test("a restarted preference store hydrates the saved theme", async () => {
  const store = new MapPreferences({
    getItem: async (key) => (key === "roam.map-theme" ? "day" : null),
    setItem: async () => {},
  });
  await store.hydrate();
  assert.equal(store.getSnapshot(), "day");
});
