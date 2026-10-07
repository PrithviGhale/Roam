import {
  eventSchema,
  nativeRouteSchema,
  type NativeNavigation,
  type NavigationEvent,
  type Guidance,
  type CameraMode,
  type Waypoint,
} from "../../../modules/roam-navigation/src/types";
import type { ActiveTrip, Coordinate } from "../../types/domain";

export function waypointPlan(trip: ActiveTrip): Waypoint[] {
  return [
    ...trip.stops.filter((s) => !s.visited).map((s) => s.place),
    trip.destination,
  ].map((p) => ({ id: p.id, name: p.name, ...p.coordinate }));
}
export function drivingDistance(meters: number): string {
  if (!Number.isFinite(meters) || meters < 0) return "—";
  if (meters < 402.336)
    return `${Math.max(0, Math.round((meters * 3.28084) / 50) * 50)} ft`;
  return `${(meters / 1609.344).toFixed(meters < 16093.44 ? 1 : 0)} mi`;
}
export function normalizeManeuver(value: string) {
  const aliases: Record<string, Guidance["maneuver"]> = {
    turnLeft: "left",
    turnRight: "right",
    turnSlightLeft: "slightLeft",
    turnSlightRight: "slightRight",
    turnSharpLeft: "sharpLeft",
    turnSharpRight: "sharpRight",
    offRampLeft: "exitLeft",
    offRampRight: "exitRight",
    onRampLeft: "merge",
    onRampRight: "merge",
    keepLeft: "forkLeft",
    turnKeepLeft: "forkLeft",
    forkLeft: "forkLeft",
    forkRight: "forkRight",
    keepRight: "forkRight",
    turnKeepRight: "forkRight",
    uTurnLeft: "uTurn",
    uTurnRight: "uTurn",
    destination: "arrive",
    destinationLeft: "arrive",
    destinationRight: "arrive",
    roundaboutLeft: "roundabout",
    roundaboutRight: "roundabout",
    straight: "straight",
    merge: "merge",
  };
  return aliases[value] ?? "unknown";
}
export interface NavigationState {
  provider: "mapbox" | "google" | "fallback" | null;
  voice: {
    text: string;
    critical: boolean;
    sequence: number;
    timestamp: number;
  } | null;
  mode: "idle" | "starting" | "native" | "fallback" | "arrived";
  session: string | null;
  sequence: number;
  guidance: Guidance | null;
  geometry: NavigationEvent["geometry"];
  route: NavigationEvent["route"] | null;
  location: NavigationEvent["location"] | null;
  currentRoad: string | null;
  rerouting: boolean;
  waypointId: string | null;
  camera: CameraMode;
  updatedAt: number | null;
  notice: string | null;
  events: { timestamp: number; label: string }[];
}
export const initialNavigation = (): NavigationState => ({
  provider: null,
  voice: null,
  mode: "idle",
  session: null,
  sequence: -1,
  guidance: null,
  geometry: undefined,
  route: null,
  location: null,
  currentRoad: null,
  rerouting: false,
  waypointId: null,
  camera: "OVERVIEW",
  updatedAt: null,
  notice: null,
  events: [],
});
export function navigationReducer(
  state: NavigationState,
  event: NavigationEvent,
): NavigationState {
  if (
    event.session !== state.session ||
    event.sequence <= state.sequence ||
    ["idle", "fallback", "arrived"].includes(state.mode)
  )
    return state;
  const next = {
    ...state,
    provider: event.provider ?? state.provider,
    sequence: event.sequence,
    events: [
      ...state.events,
      { timestamp: event.timestamp, label: event.kind },
    ].slice(-80),
  };
  switch (event.kind) {
    case "started":
      return {
        ...next,
        mode: "native",
        camera: state.mode === "native" ? state.camera : "FOLLOW",
      };
    case "guidance":
      return event.guidance
        ? {
            ...next,
            guidance: event.guidance,
            updatedAt: event.timestamp,
            rerouting: next.provider === "mapbox" ? state.rerouting : false,
            location: event.location ?? state.location,
            currentRoad: event.road ?? state.currentRoad,
            notice: null,
          }
        : next;
    case "rerouting":
      return { ...next, rerouting: true, voice: null };
    case "rerouted":
      return { ...next, rerouting: false };
    case "voice":
      return event.voice && !next.rerouting
        ? {
            ...next,
            voice: {
              ...event.voice,
              sequence: event.sequence,
              timestamp: event.timestamp,
            },
          }
        : next;
    case "route":
      return {
        ...next,
        geometry: event.geometry ?? next.geometry,
        route: event.route ?? next.route,
        voice: null,
        rerouting: false,
      };
    case "location":
      return { ...next, location: event.location ?? next.location };
    case "road":
      return { ...next, currentRoad: event.road ?? null };
    case "waypoint":
      return { ...next, waypointId: event.waypointId ?? null };
    case "arrival":
      return {
        ...next,
        mode: "arrived",
        guidance: null,
        location: null,
        currentRoad: null,
        rerouting: false,
      };
    case "error":
      return {
        ...next,
        notice: "Navigation needs attention. Your trip is kept.",
      };
    case "stopped":
      return { ...initialNavigation(), events: next.events };
  }
}
export class NavigationController {
  private state = initialNavigation();
  private listeners = new Set<() => void>();
  private subscription: { remove(): void } | null = null;
  private epoch = 0;
  private serial = 0;
  private queue: Promise<unknown> = Promise.resolve();
  constructor(
    private native: NativeNavigation | null,
    private now = Date.now,
  ) {}
  getSnapshot = () => this.state;
  subscribe = (fn: () => void) => {
    this.listeners.add(fn);
    return () => {
      this.listeners.delete(fn);
    };
  };
  private set(state: NavigationState) {
    this.state = state;
    this.listeners.forEach((fn) => fn());
  }
  private accept = (raw: unknown) => {
    const parsed = eventSchema.safeParse(raw);
    if (parsed.success) {
      this.set(navigationReducer(this.state, parsed.data));
      if (this.state.mode === "arrived") {
        this.subscription?.remove();
        this.subscription = null;
        void this.native?.stop().catch(() => {});
      }
    }
  };
  available = async () => {
    try {
      const status = (await this.native?.availability()) ?? {
        available: false,
        reason: "missing-module",
      };
      return status.provider === "google"
        ? { ...status, available: false, reason: "unsupported-provider" }
        : status;
    } catch {
      return { available: false, reason: "initialization" };
    }
  };
  start = async (trip: ActiveTrip, origin?: Coordinate | null) => {
    if (this.state.mode === "starting" || this.state.mode === "native")
      return false;
    const epoch = ++this.epoch;
    this.set({
      ...initialNavigation(),
      mode: "starting",
      session: `${this.now()}-${++this.serial}`,
    });
    try {
      const available = await this.available();
      if (epoch !== this.epoch) return false;
      if (!available.available || !this.native) throw new Error("unavailable");
      let routeID =
        trip.route?.provider === "mapbox" ? trip.route.id : undefined;
      if (available.provider === "mapbox" && !routeID) {
        this.set({
          ...this.state,
          provider: "mapbox",
          notice: "Updating this route for turn-by-turn guidance.",
        });
        if (!origin || !this.native.calculateRoute) throw new Error("origin");
        const route = nativeRouteSchema.parse(
          await this.native.calculateRoute(origin, waypointPlan(trip)),
        );
        if (epoch !== this.epoch) return false;
        if (route.legs.length !== waypointPlan(trip).length)
          throw new Error("route-plan");
        routeID = route.id;
      }
      this.subscription = this.native.addListener(
        "onNavigationEvent",
        this.accept,
      );
      const accepted = await this.native.start(
        this.state.session!,
        waypointPlan(trip),
        routeID,
      );
      if (epoch !== this.epoch) return false;
      if (!accepted) throw new Error("start");
      this.set({ ...this.state, mode: "native", camera: "FOLLOW" });
      return true;
    } catch {
      if (epoch === this.epoch) {
        await this.native?.stop().catch(() => {});
        if (epoch !== this.epoch) return false;
        this.subscription?.remove();
        this.subscription = null;
        this.set({
          ...initialNavigation(),
          mode: "fallback",
          camera: "FOLLOW",
          notice: "Turn-by-turn guidance is unavailable. Your trip is kept.",
        });
      }
      return false;
    }
  };
  update = (trip: ActiveTrip, signal?: AbortSignal): Promise<boolean> => {
    const epoch = this.epoch;
    const work = async () => {
      if (
        signal?.aborted ||
        epoch !== this.epoch ||
        this.state.mode !== "native" ||
        this.state.waypointId
      )
        return false;
      try {
        return (
          !!(await this.native?.update(
            waypointPlan(trip),
            trip.route?.provider === "mapbox" ? trip.route.id : undefined,
          )) && epoch === this.epoch
        );
      } catch {
        return false;
      }
    };
    const result = this.queue.then(work);
    this.queue = result.catch(() => false);
    return result;
  };
  continueTrip = async () => {
    if (!this.state.waypointId) return false;
    const epoch = this.epoch;
    try {
      if ((await this.native?.continueTrip()) && epoch === this.epoch) {
        this.set({ ...this.state, waypointId: null });
        return true;
      }
    } catch {}
    return false;
  };
  setCamera = (camera: CameraMode) => this.set({ ...this.state, camera });
  repeatLastGuidance = () =>
    this.state.rerouting ||
    this.state.mode !== "native" ||
    this.state.updatedAt === null ||
    this.now() - this.state.updatedAt > 15000
      ? null
      : (this.state.guidance?.instruction ?? null);
  simulate = async (enabled: boolean) => {
    if (typeof __DEV__ !== "undefined" && __DEV__)
      await this.native?.simulate(enabled);
  };
  licenses = () =>
    this.native?.licenses() ??
    Promise.resolve(
      "Native navigation SDK is not installed. Mapbox: https://www.mapbox.com/about/maps/",
    );
  stop = async () => {
    ++this.epoch;
    this.subscription?.remove();
    this.subscription = null;
    this.set(initialNavigation());
    await this.native?.stop().catch(() => {});
  };
}
