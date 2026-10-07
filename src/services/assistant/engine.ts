import {
  callSchema,
  toolSchemas,
  type ResponsePlan,
  type ToolCall,
  type ToolReceipt,
} from "../../../shared/assistant";
import type {
  ActiveTrip,
  Coordinate,
  Message,
  Place,
  VoiceState,
} from "../../types/domain";
import {
  formatArrivalTime,
  formatDetour,
  formatDistance,
  formatDuration,
} from "../../utils/format";
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
import type { DetourService } from "../detours";
import { detourInsertionIndex, freshDetour } from "../detours";
import { distanceBetween } from "../../utils/geo";
import { LIMITS } from "../../../shared/limits";

export interface AssistantReply {
  text: string;
  spokenText: string;
  places?: Place[];
  error?: boolean;
  retryKind?: "conversation" | "failed-action" | "executed-action";
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
  private searchedTrip: ActiveTrip | null = null;
  private searchedOrigin: Coordinate | null = null;
  constructor(
    private transport: AssistantTransport,
    private places: PlacesService,
    private trip: TripPort,
    private getLocation: () => Coordinate | null,
    private now = Date.now,
    private detours?: DetourService,
    private getAccuracy?: () => number | null,
  ) {}
  recentResults() {
    if (this.results && this.results.expires > this.now())
      return this.results.places.map((place) => this.currentResult(place));
    this.results = null;
    return [];
  }
  hasPendingConfirmation() {
    return this.currentPending() !== null;
  }
  clearPendingConfirmation() {
    this.pending = null;
  }
  private trackedProjection() {
    const { trip, progress } = this.trip.getSnapshot();
    // Older mock ports have no progress field; keep their pure projection behavior.
    if (progress === undefined) return undefined;
    return progress &&
      progress.route === trip?.route &&
      this.now() - progress.timestamp <= 15000
      ? progress.projection
      : null;
  }
  private currentResult(place: Place): Place {
    const location = this.getLocation();
    if (
      this.searchedTrip === this.trip.getSnapshot().trip &&
      location &&
      this.searchedOrigin &&
      distanceBetween(location, this.searchedOrigin) <=
        LIMITS.DETOUR_CACHE_MOVEMENT_METERS &&
      freshDetour(place, this.now())
    )
      return place;
    const { verifiedDetour: _old, ...withoutDetour } = place;
    return withoutDetour;
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
  private status(input = ""): Outcome {
    const context = buildContext(
      this.trip.getSnapshot().trip,
      this.getLocation(),
      Boolean(this.getLocation()),
      [],
      null,
      this.now(),
      this.getAccuracy?.(),
      this.trackedProjection(),
      this.trip.getSnapshot().navigation,
    );
    if (!context.destination)
      return this.reply(
        "You don’t have an active destination. Choose one on the map first.",
        { kind: "status" },
      );
    const timing =
      context.routeAvailable && context.etaSeconds !== null
        ? `${formatDuration(context.etaSeconds)} and ${formatDistance(context.distanceMeters)}${context.estimatedRemaining ? " remaining, estimated from GPS progress" : context.routeProvider === "mapbox" ? " remaining, from live navigation" : " on the route, from the last Google calculation"}.`
        : "The route estimate is unavailable right now.";
    const arrival = context.arrivalTime
      ? ` Arrival around ${formatArrivalTime(context.arrivalTime)}.`
      : context.tripStarted
        ? " Arrival is unavailable until GPS is back on route."
        : "";
    if (context.tripStarted) {
      if (/\b(stops|stop list)\b/i.test(input))
        return this.reply(
          context.stops.length
            ? `Your stops: ${context.stops.map((s, i) => `${i + 1}. ${s.name}`).join(", ")}.`
            : "You have no added stops.",
          { kind: "status" },
        );
      if (/\b(where|destination|heading)\b/i.test(input))
        return this.reply(`You’re heading to ${context.destination.name}.`, {
          kind: "status",
        });
      if (/\b(progress|percent|completed|how far)\b/i.test(input))
        return this.reply(
          context.percentageCompleted !== null &&
            context.percentageCompleted !== undefined
            ? `${Math.round(context.percentageCompleted)}% of your revised journey. ${formatDistance(context.distanceMeters)} remaining, estimated from GPS progress.`
            : "Progress is unavailable until accurate GPS is back on route.",
          { kind: "status" },
        );
      return this.reply(
        `${context.estimatedRemaining ? `${formatDuration(context.etaSeconds)} remaining.` : `${formatDuration(context.etaSeconds)} on the last route snapshot.`}${arrival}${context.estimatedRemaining ? " Estimated from GPS progress." : ""}`,
        { kind: "status" },
      );
    }
    const stops = context.stops.length
      ? ` Stops: ${context.stops.map((stop) => stop.name).join(", ")}.`
      : " No added stops.";
    return this.reply(
      `You’re heading to ${context.destination.name}. ${timing}${arrival}${context.offRoute ? " You may be off route; refresh on the map." : ""}${stops}`,
      {
        kind: "status",
        spokenText: `You’re heading to ${context.destination.name}. ${timing}${arrival}`,
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
        const searchTrip = this.trip.getSnapshot().trip;
        const searchOrigin = this.getLocation();
        const tools = createTripTools(
          this.places,
          this.trip,
          this.getLocation,
          this.detours,
        );
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
        this.searchedTrip = searchTrip;
        this.searchedOrigin = searchOrigin;
        const outcome = this.reply(
          found.length
            ? `I found ${found.length} verified option${found.length === 1 ? "" : "s"}. ${found.some((p) => p.verifiedDetour) ? "Detours shown compare Google driving routes." : "Driving detours are unavailable for these results."}${call.args.timeAheadMinutes ? " The time-ahead search region is approximate." : ""}`
            : call.args.maxDetourMinutes !== undefined
              ? "No checked candidates met your verified detour limit. Unchecked places are excluded; try a different search."
              : "I couldn’t find matching places. Try a different search.",
          { kind: "search", places: found },
        );
        return make(outcome, {
          status: "success",
          places: found.map((place) => placeFact(place, this.now())),
          distances:
            "only-verifiedDetour-fields-are-driving-comparisons; other-distances-are-geometric",
          restroomAccess: "not-guaranteed",
          prices: "unavailable",
        });
      }
      if (call.name === "getTripStatus") {
        const outcome = this.status(input);
        return make(outcome, {
          status: "success",
          trip: buildContext(
            this.trip.getSnapshot().trip,
            this.getLocation(),
            Boolean(this.getLocation()),
            [],
            null,
            this.now(),
            this.getAccuracy?.(),
            this.trackedProjection(),
            this.trip.getSnapshot().navigation,
          ),
        });
      }
      if (call.name === "rerouteTrip") {
        const current = this.trip.getSnapshot().trip;
        if (
          !/\b(reroute|refresh|recalculate)\b/i.test(input) ||
          /\b(don['’]?t|do not|never|should|maybe)\b/i.test(input) ||
          !current ||
          current !== initialTrip ||
          !this.trip.refreshAtomic
        )
          return make(
            this.reply("Ask me explicitly to refresh your current route."),
            { status: "not-authorized" },
          );
        const success = await this.trip.refreshAtomic(current, signal);
        return make(
          this.reply(
            success
              ? "Your route is refreshed."
              : "I couldn’t refresh the route. Your existing route is kept.",
            { kind: success ? "mutation" : "error", error: !success },
          ),
          {
            status: success ? "success" : "error",
            trip: buildContext(
              this.trip.getSnapshot().trip,
              this.getLocation(),
              Boolean(this.getLocation()),
              [],
              null,
              this.now(),
              this.getAccuracy?.(),
              this.trackedProjection(),
              this.trip.getSnapshot().navigation,
            ),
          },
        );
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
      let stops =
        action === "add"
          ? [...current.stops, { id: target!.id, place: target! }]
          : current.stops.filter((stop) => stop.place.id !== target!.id);
      if (action === "add" && target!.verifiedDetour) {
        stops = [...current.stops];
        stops.splice(detourInsertionIndex(current, target!), 0, {
          id: target!.id,
          place: target!,
        });
      }
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
          ? `${target!.name} is added as stop ${stops.findIndex((s) => s.id === target!.id) + 1}. Your route is updated.`
          : `${target!.name} is removed. Your route is updated.`;
      return make(this.reply(text, { kind: "mutation" }), {
        status: "success",
        action,
        place: placeFact(target!, this.now()),
        trip: buildContext(
          this.trip.getSnapshot().trip,
          this.getLocation(),
          Boolean(this.getLocation()),
          [],
          null,
          this.now(),
          this.getAccuracy?.(),
          this.trackedProjection(),
          this.trip.getSnapshot().navigation,
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
      const driving = Boolean(this.trip.getSnapshot().trip?.startedAt);
      if (result.places)
        result.places = result.places.map((place) => this.currentResult(place));
      const chosen = driving
        ? result.places?.[0]
        : result.places?.find(
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
        const text = `${driving ? chosen.name + " is the top option." : `I found ${result.places!.length} verified options.`}${chosen.rating !== undefined ? ` Rated ${chosen.rating.toFixed(1)}.` : ""}${chosen.verifiedDetour ? ` ${formatDetour(chosen.verifiedDetour.durationSeconds)} compared with your route.` : " Driving detour unavailable."} Want to add ${driving ? "it" : chosen.name} as a stop?`;
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
          "I don’t have live traffic, police, or hazard reports. Route time comes from your current routing provider.",
        fuelPrices: "I don’t have verified fuel prices.",
        detour:
          "Ask me to find a stop with a detour limit. I can compare top candidates when your route and GPS are ready.",
        price:
          "I don’t have verified prices to compare. Try a specific restaurant or category.",
        timedStop:
          "I can search around an estimated time ahead on your route. Exact arrival at a stop isn’t guaranteed.",
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
    const finish = (reply: AssistantReply): AssistantReply => ({
      ...reply,
      retryKind: outcomes.some((outcome) => outcome.kind === "mutation")
        ? "executed-action"
        : mutationAttempted
          ? "failed-action"
          : "conversation",
    });
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
            this.now(),
            this.getAccuracy?.(),
            this.trackedProjection(),
            this.trip.getSnapshot().navigation,
          ),
        },
        signal,
      );
      for (let round = 0; round < 3; round++) {
        if (signal?.aborted)
          throw new ServiceError("cancelled", "Request cancelled.");
        if (response.type === "response")
          return finish(this.render(response.plan, outcomes));
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
            "rerouteTrip",
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
      if (outcomes.length)
        return finish(this.render({ kind: "chat" }, outcomes));
      if (isCancelled(error)) throw error;
      return finish(
        this.reply(
          error instanceof ServiceError
            ? error.message
            : "I couldn’t reach ROAM AI. Your map and trip controls are still available.",
          { kind: "error", error: true },
        ),
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
