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
import { buildContext } from "../../services/assistant/context";
import { type AssistantTurn } from "../../shared/assistant";

const input: AssistantTurn = {
  message: "I'm hungry",
  history: [],
  context: buildContext(null, null, false, [], null),
};
function environment(overrides: Partial<ServerEnv> = {}): ServerEnv {
  return {
    GEMINI_MODEL: "gemini-3.8-flash",
    ALLOWED_ORIGINS: "http://localhost:8081,http://localhost:19006",
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
