import { GoogleGenAI } from "@google/genai";
import { z } from "zod";
import { RequestError } from "./http";
import { localHost } from "./auth";
import { proxyGoogle } from "./google";
import type { ServerEnv } from "./index";
export const diagnosticSchema = z
  .object({ service: z.enum(["gemini", "places", "routes"]) })
  .strict();
export async function probeGemini(key: string, model: string) {
  // Metadata only, no generation or tools; proves key/model access, not inference quota.
  await new GoogleGenAI({
    apiKey: key,
    httpOptions: { timeout: 10_000 },
  }).models.get({ model });
}
export async function diagnosticProbe(
  body: unknown,
  request: Request,
  env: ServerEnv,
  google = proxyGoogle,
  gemini = probeGemini,
) {
  if (
    !localHost(new URL(request.url).hostname) &&
    String(env.ENABLE_DEV_DIAGNOSTICS) !== "true"
  )
    throw new RequestError(404, "Diagnostics are disabled.");
  const { service } = diagnosticSchema.parse(body);
  const key =
    service === "gemini" ? env.GEMINI_API_KEY : env.GOOGLE_MAPS_API_KEY;
  if (!key)
    return {
      service,
      state: "notConfigured",
      detail: "Server credential is not configured.",
    };
  if (service === "gemini") await gemini(key, env.GEMINI_MODEL);
  else if (service === "places")
    await google(
      "text-search",
      { textQuery: "Boston Common", pageSize: 1 },
      key,
      request.signal,
    );
  else
    await google(
      "routes",
      {
        origin: {
          location: { latLng: { latitude: 42.355, longitude: -71.065 } },
        },
        destination: {
          location: { latLng: { latitude: 42.36, longitude: -71.06 } },
        },
        travelMode: "DRIVE",
        routingPreference: "TRAFFIC_AWARE",
        computeAlternativeRoutes: false,
        polylineQuality: "HIGH_QUALITY",
        polylineEncoding: "ENCODED_POLYLINE",
        units: "IMPERIAL",
        languageCode: "en-US",
      },
      key,
      request.signal,
    );
  return {
    service,
    state: "connected",
    detail:
      service === "gemini"
        ? "Model metadata reachable; inference quota is untested."
        : "One provider request succeeded using a fixed sample, without your GPS.",
  };
}
