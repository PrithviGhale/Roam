import {
  callSchema,
  toolSchemas,
  type ResponsePlan,
  type ToolCall,
  type ToolReceipt,
} from "../../shared/assistant";
import type {
  ActiveTrip,
  Coordinate,
  Message,
  Place,
  VoiceState,
} from "../../types/domain";
import { formatDistance, formatDuration } from "../../utils/format";
import { createTripTools, type TripPort } from "../tools";
import { ServiceError, isCancelled } from "../errors";
import type { PlacesService } from "../../types/domain";
import { buildContext, compactHistory, placeFact } from "./context";
import {
  accepted,
  explicit,
  referenceLifetime,
  resolveReference,
  type PendingAction,
  type ResultReference,
} from "./references";
import type { AssistantTransport } from "./client";

export interface AssistantReply {
  text: string;
  spokenText: string;
  places?: Place[];
  error?: boolean;
}
interface Outcome extends AssistantReply {
  kind:
    | "search"
    | "status"
    | "mutation"
    | "error"
    | "confirmation"
    | "clarification";
}
export class AssistantEngine {
  private results: ResultReference | null = null;
  private pending: PendingAction | null = null;
  private lastStopId: string | null = null;
  private busy = false;
  constructor(
    private transport: AssistantTransport,
    private places: PlacesService,
    private trip: TripPort,
    private getLocation: () => Coordinate | null,
    private now = Date.now,
  ) {}
  recentResults() {
    if (this.results && this.results.expires > this.now())
      return this.results.places;
    this.results = null;
    return [];
  }
  private currentPending(): PendingAction | null {
    if (
      this.pending &&
      this.pending.expires > this.now() &&
      this.pending.trip === this.trip.getSnapshot().trip
    )
      return this.pending;
    this.pending = null;
    return null;
  }
  private reply(text: string, extras: Partial<Outcome> = {}): Outcome {
    return { kind: "clarification", text, spokenText: text, ...extras };
  }
  private status(): Outcome {
    const context = buildContext(
      this.trip.getSnapshot().trip,
      this.getLocation(),
      Boolean(this.getLocation()),
      [],
      null,
    );
    if (!context.destination)
      return this.reply(
        "You don’t have an active destination. Choose one on the map first.",
        { kind: "status" },
      );
    const timing = context.routeAvailable
      ? `${formatDuration(context.etaSeconds)} and ${formatDistance(context.distanceMeters)}${context.estimatedRemaining ? " remaining, estimated from GPS progress" : " on the route, from the last Google calculation"}.`
      : "The route estimate is unavailable right now.";
    const stops = context.stops.length
      ? ` Stops: ${context.stops.map((stop) => stop.name).join(", ")}.`
      : " No added stops.";
    return this.reply(
      `You’re heading to ${context.destination.name}. ${timing}${context.offRoute ? " You may be off route; refresh on the map." : ""}${stops}`,
      {
        kind: "status",
        spokenText: `You’re heading to ${context.destination.name}. ${timing}`,
      },
    );
  }
  private async execute(
    call: ToolCall,
    input: string,
    initialTrip: ActiveTrip | null,
    signal?: AbortSignal,
    presentedResults?: Place[],
  ): Promise<{ receipt: ToolReceipt; outcome: Outcome }> {
    const make = (outcome: Outcome, result: Record<string, unknown>) => ({
      outcome,
      receipt: { id: call.id, name: call.name, result },
    });
    try {
      callSchema.parse(call);
      toolSchemas[call.name].parse(call.args);
      if (signal?.aborted)
        throw new ServiceError("cancelled", "Request cancelled.");
      if (call.name.startsWith("search")) {
        const tools = createTripTools(this.places, this.trip, this.getLocation);
        const searchName = call.name as keyof Omit<
          typeof tools,
          "getCurrentRoute"
        >;
        const found = await tools[searchName](
          toolSchemas.searchFood.parse(call.args),
          { signal },
        );
        if (signal?.aborted)
          throw new ServiceError("cancelled", "Request cancelled.");
        this.pending = null;
        const outcome = this.reply(
          found.length
            ? `I found ${found.length} verified option${found.length === 1 ? "" : "s"}. Distances shown are map estimates, not driving detours.`
            : "I couldn’t find matching places. Try a different search.",
          { kind: "search", places: found },
        );
        return make(outcome, {
          status: "success",
          places: found.map(placeFact),
          distances: "geometric-not-driving-detours",
          restroomAccess: "not-guaranteed",
          prices: "unavailable",
        });
      }
      if (call.name === "getTripStatus") {
        const outcome = this.status();
        return make(outcome, {
          status: "success",
          trip: buildContext(
            this.trip.getSnapshot().trip,
            this.getLocation(),
            Boolean(this.getLocation()),
            [],
            null,
          ),
        });
      }
      const current = this.trip.getSnapshot().trip;
      const action =
        call.name === "addTripStop"
          ? "add"
          : call.name === "removeTripStop"
            ? "remove"
            : "cancel";
      if (
        !current ||
        current !== initialTrip ||
        (action !== "cancel" &&
          (this.trip.getSnapshot().status !== "ready" || !current.route))
      )
        return make(
          this.reply(
            "Your trip changed or is not ready. Check the map, then try again.",
          ),
          { status: "clarification-required" },
        );
      const args =
        action === "remove"
          ? toolSchemas.removeTripStop.parse(call.args)
          : action === "add"
            ? toolSchemas.addTripStop.parse(call.args)
            : {};
      const pending = this.currentPending();
      const agreed = accepted(input) && pending?.action === action;
      let target: Place | null = null;
      if (action === "add")
        target = agreed
          ? (this.recentResults().find((place) => place.id === pending?.id) ??
            null)
          : resolveReference(
              presentedResults ?? this.recentResults(),
              input,
              args,
            );
      if (action === "remove") {
        const candidates = current.stops.map((stop) => stop.place);
        target = agreed
          ? (candidates.find((place) => place.id === pending?.id) ?? null)
          : resolveReference(candidates, input, {}, true);
        if (/\bthat\b/i.test(input) && this.lastStopId)
          target =
            candidates.find((place) => place.id === this.lastStopId) ?? null;
        if (!target && /\bcoffee\b/i.test(input)) {
          const coffee = candidates.filter(
            (place) =>
              place.category === "coffee" ||
              place.primaryType === "coffee_shop" ||
              place.primaryType === "cafe",
          );
          if (coffee.length === 1) target = coffee[0]!;
        }
      }
      if (action !== "cancel" && !target)
        return make(
          this.reply(
            action === "add"
              ? "Which place? Choose a name or number from the latest results. Older results expire after ten minutes."
              : "Which stop should I remove? Tell me its name or number.",
          ),
          { status: "clarification-required" },
        );
      // A question/recommendation is not authorization. Negated requests never arm consent.
      if (/\b(don['’]?t|do not|never)\b/i.test(input))
        return make(this.reply("I’ll keep your trip as it is."), {
          status: "not-authorized",
        });
      const direct =
        explicit(action, input) &&
        !/\b(should I|maybe|thinking about|if I)\b/i.test(input);
      const userNamedTarget =
        action === "cancel" ||
        Boolean(
          target &&
            (input.toLowerCase().includes(target.name.toLowerCase()) ||
              /\b(first|second|third|fourth|fifth|[1-5])\b/i.test(input) ||
              action === "remove"),
        );
      if (!agreed && (!direct || !userNamedTarget)) {
        this.pending = {
          action,
          ...(target ? { id: target.id, name: target.name } : {}),
          trip: current,
          expires: this.now() + referenceLifetime,
        };
        const question =
          action === "cancel"
            ? "Cancel your current route?"
            : `${action === "add" ? "Add" : "Remove"} ${target!.name}${action === "add" ? " as a stop" : " from the trip"}?`;
        return make(this.reply(question, { kind: "confirmation" }), {
          status: "confirmation-required",
          action,
          placeId: target?.id,
        });
      }
      this.pending = null;
      if (action === "cancel") {
        this.trip.cancel();
        this.lastStopId = null;
        return make(
          this.reply("Your route is canceled.", { kind: "mutation" }),
          { status: "success", action },
        );
      }
      if (
        action === "add" &&
        (current.destination.id === target!.id ||
          current.stops.some((stop) => stop.place.id === target!.id))
      )
        return make(this.reply("That place is already in your trip."), {
          status: "unchanged",
        });
      const stops =
        action === "add"
          ? [...current.stops, { id: target!.id, place: target! }]
          : current.stops.filter((stop) => stop.place.id !== target!.id);
      const success = await this.trip.applyStopsAtomic(current, stops, signal);
      if (!success)
        return make(
          this.reply(
            "I couldn’t change that stop. Your current trip was kept; check GPS and try again.",
            { kind: "error", error: true },
          ),
          {
            status: "error",
            tripUnchanged: this.trip.getSnapshot().trip === current,
          },
        );
      this.lastStopId = action === "add" ? target!.id : null;
      const text =
        action === "add"
          ? `${target!.name} is added as stop ${stops.length}. Your route is updated.`
          : `${target!.name} is removed. Your route is updated.`;
      return make(this.reply(text, { kind: "mutation" }), {
        status: "success",
        action,
        place: placeFact(target!),
        trip: buildContext(
          this.trip.getSnapshot().trip,
          this.getLocation(),
          Boolean(this.getLocation()),
          [],
          null,
        ),
      });
    } catch (error) {
      if (isCancelled(error)) throw error;
      return make(
        this.reply(
          error instanceof ServiceError
            ? error.message
            : "That request couldn’t be completed. Please try again.",
          { kind: "error", error: true },
        ),
        {
          status: "error",
          message: "Tool failed; no successful route mutation.",
        },
      );
    }
  }
  private render(plan: ResponsePlan, outcomes: Outcome[]): AssistantReply {
    const result = outcomes.findLast((outcome) => outcome.kind === "search");
    const present = (reply: AssistantReply) => {
      if (reply.places)
        this.results = {
          places: reply.places,
          expires: this.now() + referenceLifetime,
        };
      return reply;
    };
    const mutation = outcomes.find((outcome) => outcome.kind === "mutation");
    if (mutation) return mutation;
    const blocking = outcomes.find((outcome) =>
      ["error", "confirmation", "clarification"].includes(outcome.kind),
    );
    if (blocking)
      return present({
        ...blocking,
        ...(result?.places ? { places: result.places } : {}),
      });
    if (result) {
      const chosen = result.places?.find(
        (place) => place.id === plan.recommendationPlaceId,
      );
      const current = this.trip.getSnapshot().trip;
      if (
        chosen &&
        current?.route &&
        this.trip.getSnapshot().status === "ready"
      ) {
        this.pending = {
          action: "add",
          id: chosen.id,
          name: chosen.name,
          trip: current,
          expires: this.now() + referenceLifetime,
        };
        const text = `I found ${result.places!.length} verified options. Want to add ${chosen.name} as a stop?`;
        return present({ ...result, text, spokenText: text });
      }
      return present(result);
    }
    const status = outcomes.find((outcome) => outcome.kind === "status");
    if (status) return status;
    if (plan.kind === "unsupported") {
      const limitations = {
        weather: "I don’t have live weather connected yet.",
        traffic:
          "I don’t have live traffic, police, or hazard reports. The map’s route time is a Google calculation snapshot.",
        fuelPrices: "I don’t have verified fuel prices.",
        detour:
          "I can find places near your route, but I can’t calculate driving-detour times yet.",
        price:
          "I don’t have verified prices to compare. Try a specific restaurant or category.",
        timedStop:
          "I can search ahead, but I can’t reliably schedule a stop a specific number of minutes away yet.",
        navigation:
          "Turn-by-turn voice guidance and route preferences are not connected yet.",
      };
      return this.reply(limitations[plan.unsupported ?? "navigation"]);
    }
    return this.reply(
      plan.clarification === "whichStop"
        ? "Which stop do you mean? Tell me its name or number."
        : plan.clarification === "whichPlace"
          ? "Which place do you mean? Tell me its name or number."
          : "Tell me what you’d like to find, or ask about your current trip.",
    );
  }
  async send(
    input: string,
    history: Message[],
    signal?: AbortSignal,
    onState?: (state: VoiceState) => void,
  ): Promise<AssistantReply> {
    if (this.busy)
      throw new ServiceError(
        "invalid-data",
        "ROAM is already handling a request.",
      );
    this.busy = true;
    const initialTrip = this.trip.getSnapshot().trip;
    const presentedResults = this.recentResults();
    const outcomes: Outcome[] = [];
    let calls = 0,
      mutationAttempted = false;
    try {
      onState?.("thinking");
      let response = await this.transport.turn(
        {
          message: input.trim().slice(0, 1000),
          history: compactHistory(history),
          context: buildContext(
            initialTrip,
            this.getLocation(),
            Boolean(this.getLocation()),
            this.recentResults(),
            this.currentPending(),
          ),
        },
        signal,
      );
      for (let round = 0; round < 3; round++) {
        if (signal?.aborted)
          throw new ServiceError("cancelled", "Request cancelled.");
        if (response.type === "response")
          return this.render(response.plan, outcomes);
        onState?.("usingTool");
        const receipts: ToolReceipt[] = [];
        for (const call of response.calls) {
          if (++calls > 6)
            throw new ServiceError(
              "invalid-data",
              "That request needs too many steps. Try one request at a time.",
            );
          const mutation = [
            "addTripStop",
            "removeTripStop",
            "cancelTrip",
          ].includes(call.name);
          if (mutation && mutationAttempted) {
            receipts.push({
              id: call.id,
              name: call.name,
              result: {
                status: "error",
                message: "Only one route change per message is allowed.",
              },
            });
            continue;
          }
          if (mutation) mutationAttempted = true;
          const result = await this.execute(
            call,
            input,
            initialTrip,
            signal,
            presentedResults.length ? presentedResults : undefined,
          );
          receipts.push(result.receipt);
          outcomes.push(result.outcome);
        }
        onState?.("thinking");
        response = await this.transport.continue(
          response.continuation,
          receipts,
          signal,
        );
      }
      throw new ServiceError(
        "invalid-data",
        "That request took too many steps. Please try a simpler request.",
      );
    } catch (error) {
      // A successful tool receipt is authoritative even if Gemini's final call fails.
      if (outcomes.length) return this.render({ kind: "chat" }, outcomes);
      if (isCancelled(error)) throw error;
      return this.reply(
        error instanceof ServiceError
          ? error.message
          : "I couldn’t reach ROAM AI. Your map and trip controls are still available.",
        { kind: "error", error: true },
      );
    } finally {
      this.busy = false;
    }
  }
  async addFromCard(
    place: Place,
    signal?: AbortSignal,
  ): Promise<AssistantReply> {
    if (this.busy) return this.reply("Wait for the current request to finish.");
    const index = this.recentResults().findIndex(
      (result) => result.id === place.id,
    );
    if (index < 0)
      return this.reply(
        "Those results have expired. Search again before adding a stop.",
      );
    this.busy = true;
    try {
      return (
        await this.execute(
          { id: "card", name: "addTripStop", args: { resultIndex: index + 1 } },
          `Add number ${index + 1}`,
          this.trip.getSnapshot().trip,
          signal,
        )
      ).outcome;
    } finally {
      this.busy = false;
    }
  }
}
