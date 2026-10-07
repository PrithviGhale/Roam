import { test } from "node:test";
import assert from "node:assert/strict";
import {
  tripMode,
  phoneLayout,
  overlayReducer,
  type MapOverlay,
} from "../design/layout";
import { palettes } from "../design/tokens";
import { destination, routeFor } from "./fixtures";
test("planning and driving require a started verified trip with route", () => {
  assert.equal(
    tripMode({ trip: null, status: "idle", error: null }),
    "planning",
  );
  const trip = { destination, route: routeFor(destination), stops: [] };
  assert.equal(tripMode({ trip, status: "ready", error: null }), "planning");
  assert.equal(
    tripMode({
      trip: { ...trip, startedAt: new Date().toISOString() },
      status: "ready",
      error: null,
    }),
    "driving",
  );
  assert.equal(
    tripMode({
      trip: { ...trip, route: null, startedAt: "now" },
      status: "error",
      error: "route unavailable",
    }),
    "planning",
  );
});
test("assistant and search overlays cannot be visible simultaneously", () => {
  let state: MapOverlay = { kind: "assistant" };
  state = overlayReducer(state, { kind: "places", category: "coffee" });
  assert.equal(state.kind, "places");
  state = overlayReducer(state, { kind: "closed" });
  assert.deepEqual(state, { kind: "closed" });
});
test("small and large iPhone layout uses bounded content and usable map gutters", () => {
  for (const [width, height] of [
    [360, 740],
    [375, 667],
    [393, 852],
    [430, 932],
  ]) {
    const layout = phoneLayout(width!, height!);
    assert.ok(layout.gutter * 2 + 44 * 4 < width!);
    assert.equal(layout.contentMax, 560);
    assert.ok(layout.tabHeight >= 44);
  }
  assert.equal(phoneLayout(360, 740).compact, true);
  assert.equal(phoneLayout(430, 932).compact, false);
});
function luminance(hex: string) {
  const c = hex
    .slice(1)
    .match(/../g)!
    .map((value) => parseInt(value, 16) / 255)
    .map((value) =>
      value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4,
    );
  return c[0]! * 0.2126 + c[1]! * 0.7152 + c[2]! * 0.0722;
}
test("both themes keep primary, secondary and actionable text readable", () => {
  for (const colors of Object.values(palettes))
    for (const [foreground, background] of [
      [colors.text, colors.background],
      [colors.muted, colors.surface],
      [colors.accent, colors.surface],
      [colors.onAccent, colors.accent],
    ]) {
      const a = luminance(foreground!),
        b = luminance(background!);
      assert.ok(
        (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05) >= 4.5,
        `${foreground} on ${background}`,
      );
    }
});
