import {
  GoogleGenAI,
  ThinkingLevel,
  type Content,
  type GenerateContentResponse,
} from "@google/genai";
import {
  callSchema,
  declarations,
  planSchema,
  toolSchemas,
  type AssistantResponse,
  type AssistantTurn,
  type ToolCall,
  type ToolReceipt,
} from "../../shared/assistant";
import { SYSTEM_INSTRUCTION } from "./instructions";

export interface ModelReply {
  content: Content;
  calls: ToolCall[];
  text: string;
}
export type Generate = (
  contents: Content[],
  signal?: AbortSignal,
) => Promise<ModelReply>;
export function normalizeModelReply(
  response: GenerateContentResponse,
): ModelReply {
  const content = response.candidates?.[0]?.content;
  if (!content?.parts?.length) throw new Error("invalid-model-response");
  const calls = content.parts.flatMap((part) =>
    part.functionCall
      ? [
          callSchema.parse({
            id: part.functionCall.id ?? crypto.randomUUID(),
            name: part.functionCall.name,
            args: part.functionCall.args ?? {},
          }),
        ]
      : [],
  );
  if (
    calls.length > 4 ||
    new Set(calls.map((call) => call.id)).size !== calls.length
  )
    throw new Error("too-many-tools");
  for (const call of calls) toolSchemas[call.name].parse(call.args);
  return {
    content,
    calls,
    text: content.parts
      .filter((part) => !part.thought)
      .map((part) => part.text ?? "")
      .join(""),
  };
}
export function createGenerate(apiKey: string, model: string): Generate {
  const ai = new GoogleGenAI({ apiKey, httpOptions: { timeout: 25000 } });
  return async (contents, signal) =>
    normalizeModelReply(
      await ai.models.generateContent({
        model,
        contents,
        config: {
          systemInstruction: SYSTEM_INSTRUCTION,
          tools: [{ functionDeclarations: declarations }],
          thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
          temperature: 0.2,
          maxOutputTokens: 1800,
          abortSignal: signal,
        },
      }),
    );
}
interface Continuation {
  expires: number;
  rounds: number;
  contents: Content[];
  calls: ToolCall[];
}
const encoder = new TextEncoder();
const decoder = new TextDecoder();
function base64(bytes: Uint8Array): string {
  let text = "";
  for (const byte of bytes) text += String.fromCharCode(byte);
  return btoa(text);
}
function unbase64(text: string): Uint8Array<ArrayBuffer> {
  const decoded = atob(text);
  const bytes = new Uint8Array(decoded.length);
  for (let i = 0; i < decoded.length; i++) bytes[i] = decoded.charCodeAt(i);
  return bytes;
}
async function signingKey(secret: string) {
  return crypto.subtle.importKey(
    "raw",
    encoder.encode(`roam-continuation-v1:${secret}`),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
}
export async function seal(
  state: Continuation,
  secret: string,
): Promise<string> {
  const data = encoder.encode(JSON.stringify(state));
  if (data.length > 75000) throw new Error("context-too-large");
  const signature = await crypto.subtle.sign(
    "HMAC",
    await signingKey(secret),
    data,
  );
  return `${base64(data)}.${base64(new Uint8Array(signature))}`;
}
export async function unseal(
  token: string,
  secret: string,
): Promise<Continuation> {
  const pieces = token.split(".");
  if (pieces.length !== 2) throw new Error("invalid-continuation");
  const data = unbase64(pieces[0]!);
  if (
    data.length > 75000 ||
    !(await crypto.subtle.verify(
      "HMAC",
      await signingKey(secret),
      unbase64(pieces[1]!),
      data,
    ))
  )
    throw new Error("invalid-continuation");
  // Only our signed content can reach the SDK; preserve original parts / thought signatures.
  const state: Continuation = JSON.parse(decoder.decode(data));
  if (
    state.expires < Date.now() ||
    state.rounds >= 3 ||
    !Array.isArray(state.contents) ||
    !Array.isArray(state.calls)
  )
    throw new Error("expired-continuation");
  return state;
}
export function initialContents(turn: AssistantTurn): Content[] {
  const history: Content[] = [];
  for (const message of turn.history) {
    const role = message.role === "assistant" ? "model" : "user";
    if (!history.length && role === "model") continue;
    if (history.at(-1)?.role === role)
      history.at(-1)!.parts!.push({ text: message.text });
    else history.push({ role, parts: [{ text: message.text }] });
  }
  return [
    ...history,
    {
      role: "user",
      parts: [
        {
          text: JSON.stringify({
            request: turn.message,
            verifiedContext: turn.context,
          }),
        },
      ],
    },
  ];
}
export async function runRound(
  generate: Generate,
  secret: string,
  turn: AssistantTurn | { continuation: string; results: ToolReceipt[] },
  signal?: AbortSignal,
): Promise<AssistantResponse> {
  let contents: Content[],
    rounds = 0;
  if ("message" in turn) contents = initialContents(turn);
  else {
    const state = await unseal(turn.continuation, secret);
    if (
      turn.results.length !== state.calls.length ||
      turn.results.some(
        (result, index) =>
          result.id !== state.calls[index]?.id ||
          result.name !== state.calls[index]?.name,
      )
    )
      throw new Error("invalid-tool-results");
    contents = [
      ...state.contents,
      {
        role: "user",
        parts: turn.results.map((receipt, index) => ({
          functionResponse: {
            name: receipt.name,
            response: receipt.result,
            ...(state.contents
              .at(-1)
              ?.parts?.filter((part) => part.functionCall)[index]?.functionCall
              ?.id
              ? { id: receipt.id }
              : {}),
          },
        })),
      },
    ];
    rounds = state.rounds + 1;
  }
  const reply = await generate(contents, signal);
  for (const call of reply.calls) {
    callSchema.parse(call);
    toolSchemas[call.name].parse(call.args);
  }
  if (reply.calls.length) {
    if (rounds >= 2 || reply.calls.length > 4)
      throw new Error("tool-round-limit");
    return {
      type: "tools",
      calls: reply.calls,
      continuation: await seal(
        {
          expires: Date.now() + 120000,
          rounds,
          contents: [...contents, reply.content],
          calls: reply.calls,
        },
        secret,
      ),
    };
  }
  return { type: "response", plan: planSchema.parse(JSON.parse(reply.text)) };
}
