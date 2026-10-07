import { z } from "zod";
import { continuationSchema, turnSchema } from "../../shared/assistant";
import { ServiceError } from "../../src/services/errors";
import { createGenerate, runRound, type Generate } from "./gemini";
import { googleRequest, proxyGoogle } from "./google";
import { authorize, type UserTokenVerifier } from "./auth";
import { enforceRateLimits } from "./rateLimits";
import { diagnosticProbe, probeGemini } from "./diagnostics";
import { enforceBudget } from "./costControls";
import { RequestError } from "./http";

export type ServerEnv = Cloudflare.Env & {
  GEMINI_API_KEY?: string;
  GOOGLE_MAPS_API_KEY?: string;
  ROAM_ACCESS_TOKEN?: string;
};
async function readBody(request: Request): Promise<unknown> {
  const max = 128 * 1024;
  if (Number(request.headers.get("content-length")) > max)
    throw new RequestError(413, "Request is too large.");
  if (!request.headers.get("content-type")?.startsWith("application/json"))
    throw new RequestError(415, "Use a JSON request.");
  const reader = request.body?.getReader();
  if (!reader) throw new RequestError(400, "Request body is missing.");
  const chunks: Uint8Array[] = [];
  let total = 0,
    timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    void reader.cancel().catch(() => {});
  }, 10000);
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      total += value.length;
      if (total > max) {
        await reader.cancel();
        throw new RequestError(413, "Request is too large.");
      }
      chunks.push(value);
    }
    if (timedOut) throw new RequestError(408, "Request body took too long.");
    const bytes = new Uint8Array(total);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.length;
    }
    try {
      return JSON.parse(new TextDecoder().decode(bytes));
    } catch {
      throw new RequestError(400, "Request JSON is invalid.");
    }
  } finally {
    clearTimeout(timer);
    reader.releaseLock();
  }
}
export function createHandler(
  dependencies: {
    generate?: Generate;
    google?: typeof proxyGoogle;
    verifyUser?: UserTokenVerifier;
    probeGemini?: typeof probeGemini;
  } = {},
) {
  return async (request: Request, env: ServerEnv): Promise<Response> => {
    const url = new URL(request.url),
      origin = request.headers.get("origin");
    const allowed = env.ALLOWED_ORIGINS.split(",").map((value) => value.trim());
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
      Vary: "Origin",
      "X-Content-Type-Options": "nosniff",
    };
    if (origin && allowed.includes(origin))
      headers["Access-Control-Allow-Origin"] = origin;
    const json = (body: unknown, status = 200) =>
      new Response(JSON.stringify(body), { status, headers });
    try {
      if (origin && !allowed.includes(origin))
        throw new RequestError(403, "This origin is not allowed.");
      if (request.method === "OPTIONS")
        return new Response(null, {
          status: 204,
          headers: {
            ...headers,
            "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
            "Access-Control-Allow-Headers": "Content-Type, Authorization",
          },
        });
      if (url.pathname === "/health" && request.method === "GET")
        return json({ ok: true, version: "0.4.0" });
      if (request.method !== "POST")
        throw new RequestError(405, "Use POST for this endpoint.");
      const identity = await authorize(request, env, dependencies.verifyUser);
      const diagnostic =
        url.pathname === "/diagnostics" ||
        url.pathname === "/diagnostics/probe";
      const ai = url.pathname === "/ai/turn" || url.pathname === "/ai/continue";
      const operation = url.pathname.startsWith("/google/")
        ? url.pathname.slice(8)
        : null;
      if (!ai && !operation && !diagnostic)
        throw new RequestError(404, "Endpoint not found.");
      await enforceRateLimits(
        env,
        identity,
        diagnostic
          ? "diagnostics"
          : ai
            ? "ai"
            : operation === "routes"
              ? "routes"
              : "places",
      );
      const body = await readBody(request);
      const signal = AbortSignal.any([
        request.signal,
        AbortSignal.timeout(30000),
      ]);
      if (diagnostic) {
        if (url.pathname === "/diagnostics") {
          z.object({}).strict().parse(body);
          return json({
            authenticated: true,
            mode: identity.kind,
            services: {
              gemini: env.GEMINI_API_KEY ? "configured" : "notConfigured",
              places: env.GOOGLE_MAPS_API_KEY ? "configured" : "notConfigured",
              routes: env.GOOGLE_MAPS_API_KEY ? "configured" : "notConfigured",
            },
          });
        }
        return json(
          await diagnosticProbe(
            body,
            new Request(request.url, { signal }),
            env,
            dependencies.google,
            dependencies.probeGemini,
          ),
        );
      }
      if (ai) {
        const input =
          url.pathname === "/ai/turn"
            ? turnSchema.parse(body)
            : continuationSchema.parse(body);
        if (url.pathname === "/ai/turn") enforceBudget(input, "turn", env);
        if (!env.GEMINI_API_KEY)
          throw new RequestError(
            503,
            "Gemini is not configured on this backend.",
          );
        return json(
          await runRound(
            dependencies.generate ??
              createGenerate(env.GEMINI_API_KEY, env.GEMINI_MODEL),
            env.GEMINI_API_KEY,
            input,
            signal,
          ),
        );
      }
      const validated = googleRequest(operation!, body); // Fixed URLs/masks and bounded provider budgets.
      enforceBudget(validated.body ?? {}, "google", env);
      if (!env.GOOGLE_MAPS_API_KEY)
        throw new RequestError(
          503,
          "Google services are not configured on this backend.",
        );
      return json(
        await (dependencies.google ?? proxyGoogle)(
          operation!,
          body,
          env.GOOGLE_MAPS_API_KEY,
          signal,
        ),
      );
    } catch (error) {
      if (error instanceof RequestError)
        return json({ error: error.message }, error.status);
      if (error instanceof z.ZodError)
        return json(
          {
            error:
              "ROAM received an invalid request or AI response. Please retry.",
          },
          400,
        );
      if (error instanceof ServiceError)
        return json(
          { error: error.message },
          error.code === "quota"
            ? 429
            : error.code === "permission" || error.code === "configuration"
              ? 503
              : 502,
        );
      // Never log raw prompts, coordinates, upstream bodies, auth headers, or secrets.
      console.warn("ROAM backend request failed", {
        kind: "upstream-or-continuation",
      });
      return json(
        { error: "ROAM could not complete this request. Please retry." },
        502,
      );
    }
  };
}
export default { fetch: createHandler() } satisfies ExportedHandler<ServerEnv>;
