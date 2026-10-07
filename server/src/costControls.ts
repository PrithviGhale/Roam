import { RequestError } from "./http";
import { LIMITS } from "../../shared/limits";
export function lowerLimit(value: string | undefined, ceiling: number): number {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 1
    ? Math.min(parsed, ceiling)
    : ceiling;
}
export function enforceBudget(
  body: Record<string, unknown>,
  kind: "turn" | "google",
  env: Cloudflare.Env,
) {
  const count =
    kind === "turn"
      ? Array.isArray(body.history)
        ? body.history.length
        : 0
      : Math.max(Number(body.maxResultCount ?? 0), Number(body.pageSize ?? 0));
  const maximum =
    kind === "turn"
      ? lowerLimit(env.MAX_AI_HISTORY_MESSAGES, LIMITS.MAX_AI_HISTORY_MESSAGES)
      : lowerLimit(env.MAX_PLACE_RESULTS, LIMITS.MAX_PLACE_RESULTS);
  if (
    count > maximum ||
    (Array.isArray(body.intermediates) &&
      body.intermediates.length > lowerLimit(env.MAX_STOPS, LIMITS.MAX_STOPS))
  )
    throw new RequestError(
      400,
      "This request exceeds the configured service budget.",
    );
}
