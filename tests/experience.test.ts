import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { LaunchSession, launchDuration } from "../src/design/launch";
import {
  buildMapTheme,
  mapPreference,
  resolveMapTheme,
  studioStyle,
} from "../src/map/themes";
import { groundedPhrasing, composerInput } from "../shared/composition";
import { recommendationText } from "../src/services/assistant/composition";
import { planSchema, toolSchemas } from "../shared/assistant";
import { navigationCommand } from "../src/services/navigation/commands";
import { initialNavigation } from "../src/services/navigation/NavigationController";
import { createTripTools } from "../src/services/tools";
import type { Place } from "../src/types/domain";
const place: Place = {
  id: "test",
  name: "Verified Cafe",
  subtitle: "Test fixture",
  source: "verified",
  category: "coffee",
  coordinate: { latitude: 1, longitude: 1 },
  rating: 4.5,
};
test("launch session claims one cold start and all subsequent resumes are warm", () => {
  const launch = new LaunchSession();
  assert.equal(launch.claim(), "cold");
  assert.equal(launch.claim(), "warm");
  assert.equal(launch.claim(), "warm");
});
test("launch timing stays short and reduced motion uses a dissolve", () => {
  assert.ok(launchDuration(false) >= 1000 && launchDuration(false) <= 1600);
  assert.ok(launchDuration(true) < 300);
});
test("map preference only accepts supported persisted values", () => {
  assert.equal(mapPreference("night"), "night");
  assert.equal(mapPreference("day"), "day");
  assert.equal(mapPreference("malformed"), "automatic");
  assert.equal(mapPreference(null), "automatic");
});
test("automatic map follows appearance and explicit themes remain independent", () => {
  assert.equal(resolveMapTheme("automatic", "light"), "day");
  assert.equal(resolveMapTheme("automatic", "dark"), "night");
  assert.equal(resolveMapTheme("night", "light"), "night");
  assert.equal(resolveMapTheme("day", "dark"), "day");
});
test("Studio configuration accepts a public style URI and rejects tokens/URLs", () => {
  assert.equal(
    studioStyle(" mapbox://styles/roam/night "),
    "mapbox://styles/roam/night",
  );
  for (const input of [
    "https://example.com",
    "sk.secret",
    "mapbox://styles/roam/night?access_token=secret",
  ])
    assert.equal(studioStyle(input), null);
});
for (const theme of ["night", "day"] as const) {
  test(`${theme} bundled resource matches the maintainable style generator`, () => {
    assert.deepEqual(
      JSON.parse(
        readFileSync(
          `modules/roam-navigation/ios/map/themes/roam-${theme}.json`,
          "utf8",
        ),
      ),
      buildMapTheme(theme),
    );
  });
  test(`${theme} has one non-composited Mapbox source and distinct road hierarchy`, () => {
    const style = buildMapTheme(theme);
    assert.equal(Object.keys(style.sources).length, 1);
    assert.ok(style.sources["roam-streets"].url.startsWith("mapbox://"));
    const primary = style.layers.find((layer) => layer.id === "motorway-road")!,
      local = style.layers.find((layer) => layer.id === "local-road")!;
    assert.notDeepEqual(primary.paint, local.paint);
    assert.ok(style.layers.some((layer) => layer.id === "buildings"));
    assert.ok(style.layers.some((layer) => layer.id === "highway-refs"));
  });
}
test("Day and Night retain different ground and water colors", () => {
  assert.notDeepEqual(
    buildMapTheme("night").layers[0],
    buildMapTheme("day").layers[0],
  );
});
test("composer rejects arbitrary prose, unsupported claims, and model numbers", () => {
  assert.equal(
    groundedPhrasing(
      {
        opening: "got-you",
        detail: "brief",
        spokenText: "Fake Cafe is 2 minutes away",
      },
      true,
    ),
    null,
  );
  assert.equal(
    groundedPhrasing({ opening: "scenic", detail: "brief" }, false),
    null,
  );
});
test("driving composition always uses brief cadence", () => {
  assert.equal(
    groundedPhrasing({ opening: "got-you", detail: "compare" }, true)?.detail,
    "brief",
  );
});
test("composer context remains bounded and separate from planning actions", () => {
  const input = composerInput(
    "x".repeat(1500),
    true,
    Array.from({ length: 10 }, (_, i) => ({ id: i })),
  );
  assert.equal(input.request.length, 1000);
  assert.equal(input.verifiedReceipts.length, 6);
  assert.deepEqual(input.allowedDetail, ["brief"]);
});
test("natural driving replies never read ratings or addresses", () => {
  const reply = recommendationText(
    { ...place, address: "123 Test Street" },
    true,
    { opening: "got-you", detail: "compare" },
  );
  assert.ok(!reply.spokenText.includes("4.5"));
  assert.ok(!reply.spokenText.includes("Street"));
  assert.ok(reply.spokenText.includes("unavailable"));
});
test("missing detours are never inferred from place distance or rating", () => {
  const reply = recommendationText({ ...place, distanceMeters: 600 }, true);
  assert.ok(!reply.spokenText.includes("minute"));
});
test("composer style cannot change verified names and numbers", () => {
  const p = {
    ...place,
    verifiedDetour: {
      durationSeconds: 180,
      distanceMeters: 500,
      baselineDurationSeconds: 1000,
      baselineDistanceMeters: 3000,
      candidateDurationSeconds: 1180,
      candidateDistanceMeters: 3500,
      insertionIndex: 0,
      source: "mapbox-routes-comparison" as const,
      calculatedAt: new Date().toISOString(),
      provider: "mapbox" as const,
    },
  };
  const reply = recommendationText(p, true);
  assert.match(reply.spokenText, /Verified Cafe adds about 3 minutes/);
  assert.ok(
    reply.spokenText.split(/[.!?]/).filter((s) => s.trim()).length <= 2,
  );
});
test("parked comparison includes only available verified ratings", () => {
  const reply = recommendationText(place, false, {
    opening: "heres-an-option",
    detail: "compare",
  });
  assert.match(reply.text, /Here's an option/);
  assert.match(reply.text, /4.5/);
  assert.ok(
    !recommendationText({ ...place, rating: undefined }, false, {
      opening: "none",
      detail: "compare",
    }).text.includes("rated"),
  );
});
test("new response phrasing remains validated and cannot perform actions", () => {
  assert.ok(
    planSchema.safeParse({
      kind: "results",
      phrasing: { opening: "on-it", detail: "brief" },
    }).success,
  );
  assert.ok(
    !planSchema.safeParse({
      kind: "results",
      phrasing: { opening: "on-it", detail: "brief", addStop: "fake" },
    }).success,
  );
});
test("excluded brands are filtered from provider results before ranking", async () => {
  const tools = createTripTools(
    {
      mode: "google",
      nearby: async () => [
        place,
        { ...place, id: "excluded", name: "Starbucks" },
      ],
    } as never,
    {
      getSnapshot: () => ({ trip: null, status: "idle", error: null }),
      cancel() {},
      applyStopsAtomic: async () => false,
    },
    () => place.coordinate,
  );
  const results = await tools.searchCoffee({ excludeTerms: ["starbucks"] });
  assert.deepEqual(
    results.map((p) => p.id),
    ["test"],
  );
});
test("exclusions are bounded and validated", () => {
  assert.ok(
    toolSchemas.searchCoffee.safeParse({ excludeTerms: ["Starbucks"] }).success,
  );
  assert.ok(
    !toolSchemas.searchCoffee.safeParse({ excludeTerms: ["a", "b", "c", "d"] })
      .success,
  );
});
test("local arrival query bypasses Gemini with fresh native facts", () => {
  const state = {
    ...initialNavigation(),
    mode: "native" as const,
    updatedAt: Date.now(),
    guidance: {
      instruction: "Continue",
      roadName: "",
      maneuver: "straight" as const,
      step: 0,
      distanceToManeuverMeters: 200,
      remainingDistanceMeters: 1000,
      remainingDurationSeconds: 600,
    },
  };
  assert.match(
    navigationCommand("When do I arrive?", state)?.text ?? "",
    /Arrival around/,
  );
});
test("native map bridge packages resources without changing guidance provider", () => {
  const pod = readFileSync(
    "modules/roam-navigation/ios/RoamNavigation.podspec",
    "utf8",
  );
  assert.match(pod, /RoamMapThemes/);
  assert.match(pod, /map\/\*\*\/\*\.swift/);
  assert.match(
    readFileSync("modules/roam-navigation/ios/map/RoamMapTheme.swift", "utf8"),
    /RoamMapStyleURL/,
  );
});
