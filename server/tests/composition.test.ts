import test from "node:test";
import assert from "node:assert/strict";
import { runRound, plannerReasoning, type Generate } from "../src/gemini";
import type { AssistantTurn } from "../../shared/assistant";
const turn: AssistantTurn = {
  message: "I'm starving",
  history: [],
  context: {
    destination: null,
    stops: [],
    routeAvailable: false,
    tripStarted: false,
    distanceMeters: null,
    etaSeconds: null,
    calculatedAt: null,
    estimatedRemaining: false,
    offRoute: false,
    recentResults: [],
    pending: null,
  },
};
const generate: Generate = async () => ({
  calls: [],
  text: '{"kind":"chat"}',
  content: { role: "model", parts: [{ text: '{"kind":"chat"}' }] },
});
test("planner keeps driving reasoning low even for complex discovery", () =>
  assert.equal(
    plannerReasoning("Coffee but not Starbucks in twenty minutes", true),
    "low",
  ));
test("parked constrained discovery gets medium reasoning", () =>
  assert.equal(
    plannerReasoning("Coffee but not Starbucks in twenty minutes", false),
    "medium",
  ));
test("simple requests keep low reasoning", () =>
  assert.equal(plannerReasoning("Find coffee", false), "low"));
test("composer runs only after planning ends, with a separate contract", async () => {
  let called = 0;
  const response = await runRound(
    generate,
    "test",
    turn,
    undefined,
    async (request, driving, receipts) => {
      called++;
      assert.equal(request, turn.message);
      assert.equal(driving, false);
      assert.deepEqual(receipts, []);
      return { opening: "got-you", detail: "brief" };
    },
  );
  assert.equal(called, 1);
  assert.equal(response.type, "response");
  if (response.type === "response")
    assert.equal(response.plan.phrasing?.opening, "got-you");
});
test("composer failure keeps the planner result and tool authority", async () => {
  const response = await runRound(
    generate,
    "test",
    turn,
    undefined,
    async () => {
      throw new Error("offline");
    },
  );
  assert.equal(response.type, "response");
  if (response.type === "response") assert.equal(response.plan.kind, "chat");
});
