import { test } from "node:test";
import assert from "node:assert/strict";
import { GenerateContentResponse } from "@google/genai";
import { createHandler, type ServerEnv } from "../src/index";
import { googleRequest } from "../src/google";
import {
  initialContents,
  normalizeModelReply,
  runRound,
  seal,
  unseal,
  type Generate,
} from "../src/gemini";
import { buildContext } from "../../src/services/assistant/context";
import { type AssistantTurn } from "../../shared/assistant";
import { authorize } from "../src/auth";
import { lowerLimit } from "../src/costControls";
import { enforceRateLimits } from "../src/rateLimits";

const input: AssistantTurn = {
  message: "I'm hungry",
  history: [],
  context: buildContext(null, null, false, [], null),
};
function environment(overrides: Partial<ServerEnv> = {}): ServerEnv {
  return {
    GEMINI_MODEL: "gemini-3.8-flash",
    ALLOWED_ORIGINS: "http://localhost:8081,http://localhost:19006",
    AUTH_MODE: "prototype",
    ENABLE_DEV_DIAGNOSTICS: "false",
    MAX_PLACE_RESULTS: "5",
    MAX_STOPS: "5",
    MAX_AI_HISTORY_MESSAGES: "12",
    PLACES_LIMITER: {
      async limit() {
        return { success: true };
      },
    },
    ROUTES_LIMITER: {
      async limit() {
        return { success: true };
      },
    },
    DIAGNOSTIC_LIMITER: {
      async limit() {
        return { success: true };
      },
    },
    REQUEST_LIMITER: {
      async limit() {
        return { success: true };
      },
    },
    AI_LIMITER: {
      async limit() {
        return { success: true };
      },
    },
    GEMINI_API_KEY: "fixture-only",
    GOOGLE_MAPS_API_KEY: "fixture-only",
    ...overrides,
  };
}

test("central auth rejects malformed headers and supports a separate future user verifier", async () => {
  for (const header of [
    "test-token",
    "Basic test-token",
    "Bearer",
    "Bearer test token",
    "Bearer a, Bearer b",
  ])
    await assert.rejects(
      authorize(post("/diagnostics", {}, { Authorization: header }), {
        ROAM_ACCESS_TOKEN: "test-token",
      }),
    );
  const prototype = await authorize(
    post("/diagnostics", {}, { Authorization: "Bearer test-token" }),
    { ROAM_ACCESS_TOKEN: "test-token" },
  );
  assert.equal(prototype.kind, "prototype");
  await assert.rejects(
    authorize(
      post("/diagnostics", {}, { Authorization: "Bearer test-token" }),
      { AUTH_MODE: "user" },
    ),
  );
  const user = await authorize(
    post("/diagnostics", {}, { Authorization: "Bearer test-token" }),
    { AUTH_MODE: "user" },
    async () => ({ subject: "fixture-user" }),
  );
  assert.equal(user.kind, "user");
  assert.match(user.rateKey, /^user:/);
  assert.doesNotMatch(user.rateKey, /fixture-user|test-token/);
});
test("Places and Routes independent limits reject before upstream execution", async () => {
  let calls = 0;
  const handler = createHandler({
    google: async () => {
      calls++;
      return {};
    },
  });
  const env = environment({
    PLACES_LIMITER: {
      async limit() {
        return { success: false };
      },
    },
    ROUTES_LIMITER: {
      async limit() {
        return { success: false };
      },
    },
  });
  assert.equal(
    (await handler(post("/google/details", { placeId: "place" }), env)).status,
    429,
  );
  assert.equal((await handler(post("/google/routes", {}), env)).status, 429);
  assert.equal(calls, 0);
});
test("future user rate identity also consumes a shared provider ceiling", async () => {
  const keys: string[] = [];
  const env = environment({
    ROUTES_LIMITER: {
      async limit({ key }) {
        keys.push(key);
        return { success: keys.length === 1 };
      },
    },
  });
  await assert.rejects(
    enforceRateLimits(env, { kind: "user", rateKey: "user:hashed" }, "routes"),
  );
  assert.deepEqual(keys, ["user:hashed:routes", "all-users:routes"]);
});
test("configured budgets reject excessive result counts without provider calls", async () => {
  let calls = 0;
  const handler = createHandler({
    google: async () => {
      calls++;
      return {};
    },
  });
  assert.equal(
    (
      await handler(
        post("/google/text-search", { textQuery: "coffee", pageSize: 10 }),
        environment(),
      )
    ).status,
    400,
  );
  assert.equal(
    (
      await handler(
        post("/google/text-search", { textQuery: "coffee", pageSize: 5 }),
        environment(),
      )
    ).status,
    200,
  );
  assert.equal(calls, 1);
  assert.equal(lowerLimit("3", 5), 3);
  assert.equal(lowerLimit("999", 5), 5);
  assert.equal(lowerLimit("bad", 5), 5);
});
test("proxy rejects invalid Earth coordinates, stops, histories and extra fields", async () => {
  const handler = createHandler({ generate: simple, google: async () => ({}) });
  const nearby = {
    includedTypes: ["coffee_shop"],
    maxResultCount: 5,
    rankPreference: "DISTANCE",
    locationRestriction: {
      circle: { center: { latitude: 91, longitude: 0 }, radius: 2000 },
    },
  };
  assert.equal(
    (await handler(post("/google/nearby", nearby), environment())).status,
    400,
  );
  assert.equal(
    (
      await handler(
        post("/ai/turn", {
          ...input,
          history: Array.from({ length: 13 }, () => ({
            role: "user",
            text: "hi",
          })),
        }),
        environment(),
      )
    ).status,
    400,
  );
  assert.throws(() =>
    googleRequest("routes", {
      origin: { location: { latLng: { latitude: 0, longitude: 181 } } },
      destination: { placeId: "destination" },
      intermediates: Array.from({ length: 6 }, () => ({ placeId: "stop" })),
    }),
  );
});
test("auth diagnostics prove only configuration and never call providers or leak keys", async () => {
  let calls = 0;
  const handler = createHandler({
    google: async () => {
      calls++;
      return {};
    },
    probeGemini: async () => {
      calls++;
    },
  });
  const response = await handler(post("/diagnostics", {}), environment());
  assert.equal(response.status, 200);
  const body = await response.text();
  assert.match(body, /configured/);
  assert.doesNotMatch(body, /fixture-only|connected/);
  assert.equal(calls, 0);
});
test("provider probes use fixed samples, no phone GPS, and separate dev-only gating", async () => {
  const calls: { operation: string; body: unknown }[] = [];
  let model = 0;
  const handler = createHandler({
    google: async (operation, body) => {
      googleRequest(operation, body);
      calls.push({ operation, body });
      return {};
    },
    probeGemini: async () => {
      model++;
    },
  });
  for (const service of ["places", "routes", "gemini"])
    assert.equal(
      (await handler(post("/diagnostics/probe", { service }), environment()))
        .status,
      200,
    );
  assert.equal(calls.length, 2);
  assert.equal(model, 1);
  assert.match(JSON.stringify(calls), /42.355/);
  assert.equal(
    (
      await handler(
        post("/diagnostics/probe", {
          service: "places",
          location: { latitude: 1, longitude: 1 },
        }),
        environment(),
      )
    ).status,
    400,
  );
  const remote = new Request("https://roam-api.example/diagnostics/probe", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: "Bearer test-token",
    },
    body: JSON.stringify({ service: "routes" }),
  });
  assert.equal(
    (await handler(remote, environment({ ROAM_ACCESS_TOKEN: "test-token" })))
      .status,
    404,
  );
  assert.equal(calls.length, 2);
});
test("diagnostic rate limit and missing credentials never trigger billable probes", async () => {
  let calls = 0;
  const handler = createHandler({
    google: async () => {
      calls++;
      return {};
    },
  });
  assert.equal(
    (
      await handler(
        post("/diagnostics/probe", { service: "places" }),
        environment({
          DIAGNOSTIC_LIMITER: {
            async limit() {
              return { success: false };
            },
          },
        }),
      )
    ).status,
    429,
  );
  const response = await handler(
    post("/diagnostics/probe", { service: "places" }),
    environment({ GOOGLE_MAPS_API_KEY: undefined }),
  );
  assert.equal(response.status, 200);
  assert.match(await response.text(), /notConfigured/);
  assert.equal(calls, 0);
});
function post(
  path: string,
  body: unknown,
  headers: Record<string, string> = {},
) {
  return new Request(`http://localhost:8787${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
}
const simple: Generate = async () => ({
  content: { role: "model", parts: [{ text: '{"kind":"chat"}' }] },
  calls: [],
  text: '{"kind":"chat"}',
});

test("backend validates turns before model execution and sanitizes upstream errors", async () => {
  let calls = 0;
  const handler = createHandler({
    generate: async () => {
      calls++;
      throw new Error("private upstream details fixture");
    },
  });
  assert.equal(
    (await handler(post("/ai/turn", { arbitrary: true }), environment()))
      .status,
    400,
  );
  assert.equal(calls, 0);
  const failed = await handler(post("/ai/turn", input), environment());
  assert.equal(failed.status, 502);
  assert.doesNotMatch(await failed.text(), /private|fixture-only/);
});
test("backend enforces payload, CORS, methods, and configured production protection", async () => {
  const handler = createHandler({ generate: simple });
  assert.equal(
    (
      await handler(
        post("/ai/turn", input, { Origin: "https://attacker.example" }),
        environment(),
      )
    ).status,
    403,
  );
  assert.equal(
    (await handler(new Request("http://localhost:8787/ai/turn"), environment()))
      .status,
    405,
  );
  assert.equal(
    (
      await handler(
        post("/ai/turn", { message: "x".repeat(140000) }),
        environment(),
      )
    ).status,
    413,
  );
  assert.equal(
    (
      await handler(
        new Request("https://roam-api.example/ai/turn", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(input),
        }),
        environment(),
      )
    ).status,
    503,
  );
  assert.equal(
    (await handler(post("/unknown", {}), environment())).status,
    404,
  );
});
test("prototype token and independent request/model rate limits are enforced", async () => {
  const handler = createHandler({ generate: simple });
  const env = environment({ ROAM_ACCESS_TOKEN: "test-prototype-token" });
  assert.equal((await handler(post("/ai/turn", input), env)).status, 401);
  assert.equal(
    (
      await handler(
        post("/ai/turn", input, {
          Authorization: "Bearer test-prototype-token",
        }),
        env,
      )
    ).status,
    200,
  );
  assert.equal(
    (
      await handler(
        post("/ai/turn", input),
        environment({
          REQUEST_LIMITER: {
            async limit() {
              return { success: false };
            },
          },
        }),
      )
    ).status,
    429,
  );
  assert.equal(
    (
      await handler(
        post("/ai/turn", input),
        environment({
          AI_LIMITER: {
            async limit() {
              return { success: false };
            },
          },
        }),
      )
    ).status,
    429,
  );
});
test("missing backend keys fail explicitly without provider calls", async () => {
  const handler = createHandler({ generate: simple });
  assert.equal(
    (
      await handler(
        post("/ai/turn", input),
        environment({ GEMINI_API_KEY: undefined }),
      )
    ).status,
    503,
  );
  assert.equal(
    (
      await handler(
        post("/google/details", { placeId: "place" }),
        environment({ GOOGLE_MAPS_API_KEY: undefined }),
      )
    ).status,
    503,
  );
});
test("Google proxy fixes masks and rejects arbitrary endpoints, types, and excessive budgets", () => {
  const details = googleRequest("details", {
    placeId: "verified-place",
    sessionToken: "session",
  });
  assert.equal(details.operation, "details");
  assert.match(details.fieldMask, /location/);
  assert.doesNotMatch(details.fieldMask, /\*/);
  assert.throws(() => googleRequest("https://attacker.example", {}));
  assert.throws(() =>
    googleRequest("details", { placeId: "place", fieldMask: "*" }),
  );
  assert.throws(() =>
    googleRequest("nearby", {
      includedTypes: ["police"],
      maxResultCount: 20,
      rankPreference: "DISTANCE",
      locationRestriction: {
        circle: { center: { latitude: 0, longitude: 0 }, radius: 100000 },
      },
    }),
  );
});
test("Google proxy reuses validated operation contract and does not forward arbitrary secrets", async () => {
  let operation: string | undefined, payload: unknown;
  const handler = createHandler({
    google: async (name, body) => {
      operation = name;
      payload = body;
      return { id: "place", displayName: { text: "Verified" } };
    },
  });
  const result = await handler(
    post("/google/details", { placeId: "place" }),
    environment(),
  );
  assert.equal(result.status, 200);
  assert.equal(operation, "details");
  assert.deepEqual(payload, { placeId: "place" });
  assert.doesNotMatch(await result.text(), /fixture-only/);
});
test("Gemini function response loop preserves original model parts/signatures", async () => {
  const seen: unknown[] = [];
  let count = 0;
  const generate: Generate = async (contents) => {
    seen.push(contents);
    return ++count === 1
      ? {
          content: {
            role: "model",
            parts: [
              {
                functionCall: { id: "call-1", name: "searchFood", args: {} },
                thoughtSignature: "opaque-signature",
              },
            ],
          },
          calls: [{ id: "call-1", name: "searchFood", args: {} }],
          text: "",
        }
      : {
          content: {
            role: "model",
            parts: [
              {
                text: '{"kind":"results","recommendationPlaceId":"real-place"}',
              },
            ],
          },
          calls: [],
          text: '{"kind":"results","recommendationPlaceId":"real-place"}',
        };
  };
  const first = await runRound(generate, "fixture-secret", input);
  assert.equal(first.type, "tools");
  if (first.type !== "tools") return;
  const second = await runRound(generate, "fixture-secret", {
    continuation: first.continuation,
    results: [
      {
        id: "call-1",
        name: "searchFood",
        result: {
          status: "success",
          places: [{ id: "real-place", name: "Real Cafe" }],
        },
      },
    ],
  });
  assert.equal(second.type, "response");
  assert.match(JSON.stringify(seen[1]), /opaque-signature/);
  assert.match(JSON.stringify(seen[1]), /functionResponse/);
});
test("signed continuation rejects tampering, expiration, and mismatched tool receipts", async () => {
  const token = await seal(
    {
      expires: Date.now() + 10000,
      rounds: 0,
      contents: [],
      calls: [{ id: "call", name: "getTripStatus", args: {} }],
    },
    "fixture-secret",
  );
  await assert.rejects(unseal(`${token}tamper`, "fixture-secret"));
  await assert.rejects(unseal(token, "wrong-secret"));
  await assert.rejects(
    unseal(
      await seal(
        { expires: 0, rounds: 0, contents: [], calls: [] },
        "fixture-secret",
      ),
      "fixture-secret",
    ),
  );
  await assert.rejects(
    runRound(simple, "fixture-secret", {
      continuation: token,
      results: [{ id: "wrong", name: "getTripStatus", result: {} }],
    }),
  );
});
test("SDK response conversion rejects unknown functions and malformed arguments", () => {
  const response = new GenerateContentResponse();
  response.candidates = [
    {
      content: {
        role: "model",
        parts: [{ functionCall: { name: "arbitrary", args: {} } }],
      },
    },
  ];
  assert.throws(() => normalizeModelReply(response));
  response.candidates = [
    {
      content: {
        role: "model",
        parts: [
          { functionCall: { name: "searchFood", args: { maxResults: 999 } } },
        ],
      },
    },
  ];
  assert.throws(() => normalizeModelReply(response));
});
test("unverified prose cannot become a grounded response plan", async () => {
  const hallucination: Generate = async () => ({
    content: { parts: [{ text: "Imaginary Cafe has a 4.9 rating" }] },
    calls: [],
    text: "Imaginary Cafe has a 4.9 rating",
  });
  await assert.rejects(runRound(hallucination, "fixture-secret", input));
  const contents = initialContents(input);
  assert.doesNotMatch(JSON.stringify(contents), /latitude|longitude|polyline/);
});

test("a domain resembling a private IP is not trusted as local development", async () => {
  const handler = createHandler({ generate: simple });
  const request = new Request("https://10.attacker.example/ai/turn", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  assert.equal((await handler(request, environment())).status, 503);
  const content = initialContents({
    ...input,
    history: [
      { role: "assistant", text: "Welcome" },
      { role: "user", text: "Coffee" },
    ],
  });
  assert.equal(content[0]?.role, "user");
});
