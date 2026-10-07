import { z } from "zod";
export type DiagnosticState =
  | "notTested"
  | "checking"
  | "configured"
  | "connected"
  | "notConfigured"
  | "unauthorized"
  | "limited"
  | "unavailable";
export interface DiagnosticResult {
  state: DiagnosticState;
  detail: string;
}
const service = z.enum(["gemini", "places", "routes"]);
export type DiagnosticService = z.infer<typeof service>;
const configSchema = z
  .object({
    authenticated: z.literal(true),
    mode: z.enum(["prototype", "development", "user"]),
    services: z
      .object({
        gemini: z.enum(["configured", "notConfigured"]),
        places: z.enum(["configured", "notConfigured"]),
        routes: z.enum(["configured", "notConfigured"]),
      })
      .strict(),
  })
  .strict();
const probeSchema = z
  .object({
    service,
    state: z.enum(["connected", "notConfigured"]),
    detail: z.string().max(250),
  })
  .strict();
export function diagnosticFailure(status?: number): DiagnosticResult {
  return status === 401 || status === 403
    ? {
        state: "unauthorized",
        detail:
          "Access rejected; check your prototype token and browser origin.",
      }
    : status === 429
      ? {
          state: "limited",
          detail: "Rate limit reached. Wait a minute before checking again.",
        }
      : {
          state: "unavailable",
          detail:
            "Request failed. Check endpoint, network, and development diagnostics settings.",
        };
}
export function createDiagnosticClient(
  url: string,
  token = "",
  fetcher: typeof fetch = fetch,
) {
  const request = async (
    path: string,
    body?: unknown,
    signal?: AbortSignal,
  ): Promise<unknown> => {
    if (!url) throw new Error("notConfigured");
    const response = await fetcher(`${url.replace(/\/$/, "")}${path}`, {
      method: body === undefined ? "GET" : "POST",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      signal: AbortSignal.any([
        signal ?? new AbortController().signal,
        AbortSignal.timeout(15_000),
      ]),
    });
    if (!response.ok) throw response.status;
    return response.json();
  };
  const failure = (error: unknown) =>
    !url
      ? {
          state: "notConfigured" as const,
          detail: "Set EXPO_PUBLIC_ROAM_API_URL and restart Expo.",
        }
      : diagnosticFailure(typeof error === "number" ? error : undefined);
  return {
    async health(signal?: AbortSignal): Promise<DiagnosticResult> {
      try {
        z.object({ ok: z.literal(true), version: z.string().max(20) })
          .strict()
          .parse(await request("/health", undefined, signal));
        return {
          state: "connected",
          detail: "Worker reachable; provider access has not been tested.",
        };
      } catch (error) {
        return failure(error);
      }
    },
    async authentication(
      signal?: AbortSignal,
    ): Promise<{
      result: DiagnosticResult;
      services?: z.infer<typeof configSchema>["services"];
    }> {
      try {
        const config = configSchema.parse(
          await request("/diagnostics", {}, signal),
        );
        return {
          result: {
            state: "connected",
            detail: `Authenticated (${config.mode}). Credential configuration is not connectivity proof.`,
          },
          services: config.services,
        };
      } catch (error) {
        return { result: failure(error) };
      }
    },
    async probe(
      provider: DiagnosticService,
      signal?: AbortSignal,
    ): Promise<DiagnosticResult> {
      try {
        return probeSchema.parse(
          await request("/diagnostics/probe", { service: provider }, signal),
        );
      } catch (error) {
        return failure(error);
      }
    },
  };
}
