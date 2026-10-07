import { RequestError } from "./http";
import type { AuthIdentity } from "./auth";
export async function enforceRateLimits(
  env: Cloudflare.Env,
  identity: AuthIdentity,
  kind: "ai" | "places" | "routes" | "diagnostics",
) {
  if (!(await env.REQUEST_LIMITER.limit({ key: identity.rateKey })).success)
    throw new RequestError(429, "ROAM is busy. Try again shortly.");
  const binding =
    kind === "ai"
      ? env.AI_LIMITER
      : kind === "routes"
        ? env.ROUTES_LIMITER
        : kind === "places"
          ? env.PLACES_LIMITER
          : env.DIAGNOSTIC_LIMITER;
  if (!(await binding.limit({ key: `${identity.rateKey}:${kind}` })).success)
    throw new RequestError(
      429,
      `ROAM ${kind === "ai" ? "AI" : kind} reached its request limit. Try again shortly.`,
    );
  // A shared ceiling prevents many future user IDs from bypassing the prototype's spending protection.
  if (
    identity.kind === "user" &&
    !(await binding.limit({ key: `all-users:${kind}` })).success
  )
    throw new RequestError(
      429,
      "ROAM reached its shared request limit. Try again shortly.",
    );
}
