import { ServiceError } from "../errors";
import type { RequestOptions } from "../../types/domain";

export interface GoogleRequest {
  operation: "autocomplete" | "details" | "nearby" | "text-search" | "routes";
  body?: Record<string, unknown>;
  placeId?: string;
  fieldMask: string;
}
export interface GoogleClient {
  request(request: GoogleRequest, options?: RequestOptions): Promise<unknown>;
}
export interface ClientConfiguration {
  apiKey?: string;
  proxyUrl?: string;
  iosBundleIdentifier?: string;
  fetch?: typeof fetch;
  timeoutMs?: number;
}
export function createGoogleClient(
  configuration: ClientConfiguration,
): GoogleClient {
  const fetcher = configuration.fetch ?? fetch;
  return {
    async request(request, options = {}) {
      if (!configuration.apiKey && !configuration.proxyUrl)
        throw new ServiceError(
          "configuration",
          "Google services are not connected. Add a Maps API key or ROAM API URL, then restart Expo.",
        );
      if (options.signal?.aborted)
        throw new ServiceError("cancelled", "Request cancelled.");
      const controller = new AbortController();
      let timedOut = false;
      const cancel = () => controller.abort();
      options.signal?.addEventListener("abort", cancel, { once: true });
      const timer = setTimeout(() => {
        timedOut = true;
        controller.abort();
      }, configuration.timeoutMs ?? 12000);
      try {
        const proxy = configuration.proxyUrl;
        let url: string;
        let method = "POST";
        let body = request.body;
        const headers: Record<string, string> = {
          "Content-Type": "application/json",
        };
        if (proxy) {
          // A backend must implement this bounded contract, validate requests, authenticate clients,
          // inject its server key and set field masks. Never forward arbitrary client URLs.
          url = `${proxy}/google/${request.operation}`;
          body = {
            ...body,
            ...(request.placeId ? { placeId: request.placeId } : {}),
            ...(options.sessionToken
              ? { sessionToken: options.sessionToken }
              : {}),
          };
        } else {
          headers["X-Goog-Api-Key"] = configuration.apiKey!;
          headers["X-Goog-FieldMask"] = request.fieldMask;
          headers["X-Ios-Bundle-Identifier"] =
            configuration.iosBundleIdentifier ?? "host.exp.Exponent";
          const endpoints = {
            autocomplete: "places:autocomplete",
            nearby: "places:searchNearby",
            "text-search": "places:searchText",
          };
          if (request.operation === "routes")
            url = "https://routes.googleapis.com/directions/v2:computeRoutes";
          else if (request.operation === "details") {
            url = `https://places.googleapis.com/v1/places/${encodeURIComponent(request.placeId ?? "")}`;
            if (options.sessionToken)
              url += `?sessionToken=${encodeURIComponent(options.sessionToken)}`;
            method = "GET";
          } else
            url = `https://places.googleapis.com/v1/${endpoints[request.operation]}`;
        }
        const response = await fetcher(url, {
          method,
          headers,
          ...(method === "POST" ? { body: JSON.stringify(body ?? {}) } : {}),
          signal: controller.signal,
        });
        if (!response.ok) {
          // Do not print URLs, user coordinates, response bodies or keys into logs.
          if (typeof __DEV__ !== "undefined" && __DEV__)
            console.warn("ROAM Google request failed", {
              operation: request.operation,
              status: response.status,
            });
          if (response.status === 401 || response.status === 403)
            throw new ServiceError(
              "permission",
              "Google rejected this API configuration. Check enabled APIs, billing and key restrictions.",
            );
          if (response.status === 429)
            throw new ServiceError(
              "quota",
              "Google’s request limit was reached. Wait a moment, then try again.",
            );
          if (response.status === 400)
            throw new ServiceError(
              "invalid-data",
              "Google could not process this request. Check the API configuration or choose another place.",
            );
          throw new ServiceError(
            "network",
            "Google services are unavailable right now. Please try again.",
          );
        }
        try {
          return await response.json();
        } catch {
          throw new ServiceError(
            "invalid-data",
            "Google returned an unreadable response. Please retry.",
          );
        }
      } catch (error) {
        if (timedOut)
          throw new ServiceError(
            "timeout",
            "This request took too long. Check your connection and retry.",
          );
        if (controller.signal.aborted)
          throw new ServiceError("cancelled", "Request cancelled.");
        if (error instanceof ServiceError) throw error;
        throw new ServiceError(
          "network",
          "Couldn’t connect to Google. Check your connection and try again.",
        );
      } finally {
        clearTimeout(timer);
        options.signal?.removeEventListener("abort", cancel);
      }
    },
  };
}
