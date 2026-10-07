import {
  responseSchema,
  type AssistantResponse,
  type AssistantTurn,
  type ToolReceipt,
} from "../../../shared/assistant";
import { ServiceError } from "../errors";
export interface AssistantTransport {
  turn(input: AssistantTurn, signal?: AbortSignal): Promise<AssistantResponse>;
  continue(
    continuation: string,
    results: ToolReceipt[],
    signal?: AbortSignal,
  ): Promise<AssistantResponse>;
}
export function createAssistantTransport(
  url: string,
  accessToken = "",
  fetcher: typeof fetch = fetch,
  getNavigation?: () => import("../../../shared/assistant").AssistantContext["navigation"],
): AssistantTransport {
  const post = async (path: string, body: unknown, parent?: AbortSignal) => {
    if (!url)
      throw new ServiceError(
        "configuration",
        "Connect the ROAM backend to use Gemini. Your map and trip controls still work.",
      );
    if (parent?.aborted)
      throw new ServiceError("cancelled", "Request cancelled.");
    const controller = new AbortController(),
      abort = () => controller.abort();
    parent?.addEventListener("abort", abort, { once: true });
    const timer = setTimeout(abort, 35000);
    try {
      const response = await fetcher(`${url.replace(/\/$/, "")}${path}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
      if (!response.ok)
        throw new ServiceError(
          response.status === 429 ? "quota" : "network",
          response.status === 429
            ? "ROAM AI is busy. Try again shortly."
            : "I couldn’t reach ROAM AI. Your map and trip controls are still available.",
        );
      const parsed = responseSchema.safeParse(await response.json());
      if (!parsed.success)
        throw new ServiceError(
          "invalid-data",
          "ROAM AI returned an unreadable response. Please retry.",
        );
      return parsed.data;
    } catch (error) {
      if (parent?.aborted)
        throw new ServiceError("cancelled", "Request cancelled.");
      if (error instanceof ServiceError) throw error;
      throw new ServiceError(
        "network",
        "I couldn’t reach ROAM AI. Your map and trip controls are still available.",
      );
    } finally {
      clearTimeout(timer);
      parent?.removeEventListener("abort", abort);
    }
  };
  return {
    turn: (input, signal) =>
      post(
        "/ai/turn",
        {
          ...input,
          context: {
            ...input.context,
            ...(getNavigation ? { navigation: getNavigation() } : {}),
          },
        },
        signal,
      ),
    continue: (continuation, results, signal) =>
      post("/ai/continue", { continuation, results }, signal),
  };
}
