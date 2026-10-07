import { z } from "zod";
import { LIMITS } from "./limits";

export const toolNames = [
  "searchFood",
  "searchGas",
  "searchRestrooms",
  "searchCoffee",
  "searchParking",
  "searchPlaces",
  "getTripStatus",
  "rerouteTrip",
  "addTripStop",
  "removeTripStop",
  "cancelTrip",
] as const;
export type ToolName = (typeof toolNames)[number];
const text = z.string().trim().min(1).max(200);
const search = z
  .object({
    query: text.optional(),
    maxResults: z.number().int().min(1).max(5).optional(),
    minRating: z.number().min(0).max(5).optional(),
    nearDestination: z.boolean().optional(),
    timeAheadMinutes: z.number().min(1).max(120).optional(),
    maxDetourMinutes: z.number().min(0).max(60).optional(),
  })
  .strict();
const reference = z
  .object({
    placeId: text.optional(),
    resultIndex: z.number().int().min(1).max(5).optional(),
    name: text.optional(),
  })
  .strict();
export const toolSchemas = {
  searchFood: search,
  searchGas: search,
  searchRestrooms: search,
  searchCoffee: search,
  searchParking: search,
  searchPlaces: search.extend({ query: text }),
  getTripStatus: z.object({}).strict(),
  rerouteTrip: z.object({}).strict(),
  addTripStop: reference,
  removeTripStop: reference.extend({ stopId: text.optional() }),
  cancelTrip: z.object({}).strict(),
};
export const callSchema = z
  .object({
    id: z.string().min(1).max(200),
    name: z.enum(toolNames),
    args: z.record(z.string(), z.unknown()),
  })
  .strict();
export type ToolCall = z.infer<typeof callSchema>;
export const planSchema = z
  .object({
    kind: z.enum([
      "results",
      "status",
      "mutation",
      "clarification",
      "unsupported",
      "chat",
    ]),
    recommendationPlaceId: text.optional(),
    clarification: z
      .enum(["whichPlace", "whichStop", "confirmAdd", "clarifyRequest"])
      .optional(),
    unsupported: z
      .enum([
        "weather",
        "traffic",
        "fuelPrices",
        "detour",
        "price",
        "timedStop",
        "navigation",
      ])
      .optional(),
  })
  .strict();
export type ResponsePlan = z.infer<typeof planSchema>;
export interface PlaceFact {
  id: string;
  name: string;
  address?: string;
  rating?: number;
  openNow?: boolean;
  distanceMeters?: number;
  aheadMeters?: number;
  routeOffsetMeters?: number;
  verifiedDetourSeconds?: number;
  verifiedDetourMeters?: number;
  detourCalculatedAt?: string;
  detourProvider?: "mapbox" | "google" | "fallback";
}
export const placeFactSchema = z
  .object({
    id: text,
    name: text,
    address: z.string().max(300).optional(),
    rating: z.number().min(0).max(5).optional(),
    openNow: z.boolean().optional(),
    distanceMeters: z.number().min(0).optional(),
    aheadMeters: z.number().min(0).optional(),
    routeOffsetMeters: z.number().min(0).optional(),
    verifiedDetourSeconds: z.number().finite().optional(),
    verifiedDetourMeters: z.number().finite().optional(),
    detourCalculatedAt: z.string().datetime().optional(),
    detourProvider: z.enum(["mapbox", "google", "fallback"]).optional(),
  })
  .strict();
export const contextSchema = z
  .object({
    destination: z.object({ id: text, name: text }).strict().nullable(),
    stops: z.array(z.object({ id: text, name: text }).strict()).max(5),
    routeAvailable: z.boolean(),
    tripStarted: z.boolean(),
    routeProvider: z.enum(["mapbox", "google", "fallback"]).optional(),
    navigation: z
      .object({
        nextInstruction: z.string().max(500),
        distanceToManeuverMeters: z.number().finite().nonnegative(),
        remainingDistanceMeters: z.number().finite().nonnegative(),
        remainingDurationSeconds: z.number().finite().nonnegative(),
      })
      .strict()
      .nullable()
      .optional(),
    distanceMeters: z.number().finite().min(0).nullable(),
    etaSeconds: z.number().finite().min(0).nullable(),
    calculatedAt: z.string().max(40).nullable(),
    estimatedRemaining: z.boolean(),
    offRoute: z.boolean(),
    arrivalTime: z.string().datetime().nullable().optional(),
    completedMeters: z.number().min(0).nullable().optional(),
    percentageCompleted: z.number().min(0).max(100).nullable().optional(),
    recentResults: z.array(placeFactSchema).max(5),
    pending: z
      .object({
        action: z.enum(["add", "remove", "cancel"]),
        id: text.optional(),
        name: text.optional(),
      })
      .strict()
      .nullable(),
  })
  .strict();
export type AssistantContext = z.infer<typeof contextSchema>;
export const turnSchema = z
  .object({
    message: z.string().trim().min(1).max(1000),
    history: z
      .array(
        z
          .object({
            role: z.enum(["user", "assistant"]),
            text: z.string().max(1200),
          })
          .strict(),
      )
      .max(LIMITS.MAX_AI_HISTORY_MESSAGES),
    context: contextSchema,
  })
  .strict();
export type AssistantTurn = z.infer<typeof turnSchema>;
export const resultSchema = z
  .object({
    id: z.string().min(1).max(200),
    name: z.enum(toolNames),
    result: z.record(z.string(), z.unknown()),
  })
  .strict();
export type ToolReceipt = z.infer<typeof resultSchema>;
export const continuationSchema = z
  .object({
    continuation: z.string().min(1).max(110000),
    results: z.array(resultSchema).min(1).max(4),
  })
  .strict();
export const responseSchema = z.discriminatedUnion("type", [
  z
    .object({
      type: z.literal("tools"),
      calls: z.array(callSchema).min(1).max(4),
      continuation: z.string().min(1).max(110000),
    })
    .strict(),
  z.object({ type: z.literal("response"), plan: planSchema }).strict(),
]);
export type AssistantResponse = z.infer<typeof responseSchema>;

// Strict JSON schemas are shared by SDK declarations and mobile-side validation.
export const declarations = toolNames.map((name) => ({
  name,
  description: (
    {
      searchFood:
        "Find verified food/brand/dietary matches. Top finalists get Google Routes detour comparisons. Optional maxDetourMinutes excludes unverified or excessive detours. timeAheadMinutes selects an approximate route region, not a guaranteed stop arrival. nearDestination anchors the search there.",
      searchGas:
        "Find gas ahead or nearby, with verified detours for finalists. Use maxDetourMinutes and timeAheadMinutes when requested. Fuel prices unavailable.",
      searchRestrooms:
        "Find Google-listed public bathrooms with finalist detours and optional maxDetourMinutes/timeAheadMinutes. Access not guaranteed. Use for pee requests.",
      searchCoffee:
        "Find coffee/cafes. timeAheadMinutes estimates a search point using route duration/geometry; maxDetourMinutes enforces verified detours only. nearDestination searches near arrival.",
      searchParking:
        "Find parking near the destination by default, with verified finalist detours when a route/GPS is available. Optional maxDetourMinutes. Availability/cost unknown.",
      searchPlaces:
        "Search specific businesses/places. Supports nearDestination, approximate timeAheadMinutes and verified maxDetourMinutes. No new destination is set by this tool.",
      getTripStatus:
        "Read verified route duration, local arrival timestamp, stops and GPS progress estimate. Use for when do we arrive, what time will I get there, how much longer or progress questions.",
      rerouteTrip:
        "Refresh the existing route from current GPS only when the user explicitly asks to refresh/reroute. Keep the route on failure. Never use this for detour searches.",
      addTripStop:
        "Add one recently presented verified result. Index is one-based and follows displayed cards. Execution requires explicit user acceptance; never claim success before receipt. Does not create a destination.",
      removeTripStop:
        "Remove an existing stop by stopId, name or one-based stop-list index. Ambiguous references need clarification. Requires explicit user request.",
      cancelTrip:
        "Cancel current trip only on an explicit cancel/end command. Otherwise request clarification. Never infer cancellation from frustration.",
    } satisfies Record<ToolName, string>
  )[name],
  parametersJsonSchema: z.toJSONSchema(toolSchemas[name]),
}));
