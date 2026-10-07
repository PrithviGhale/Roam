import type {
  ActiveTrip,
  Coordinate,
  Place,
  RoutesService,
  TripState,
} from "../types/domain";
import { validCoordinate } from "../utils/location";
import { errorMessage, isCancelled, ServiceError } from "./errors";
import { RouteDeviationMonitor, type TrackingFix } from "./routeTracking";
import { LIMITS } from "../shared/limits";
import { detourInsertionIndex } from "./detours";
import { distanceBetween } from "../utils/geo";
import { tripProgress } from "../utils/tripProgress";
import { ProgressTracker } from "./progressTracker";
import type { RecoveredPlan } from "./tripRecovery";

export class TripController {
  private state: TripState = { trip: null, status: "idle", error: null };
  private listeners = new Set<() => void>();
  private request: AbortController | null = null;
  private generation = 0;
  private deviation = new RouteDeviationMonitor();
  private progress = new ProgressTracker();
  diagnostics = () => this.deviation.diagnostics(this.now());
  private completedOnRoute = 0;
  private stopConfirmations = 0;
  private lastStopFix = 0;
  constructor(
    private routes: RoutesService,
    private getOrigin: () => Coordinate | null,
    private now = Date.now,
  ) {}
  getSnapshot = () => this.state;
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
  private update(state: TripState) {
    if (
      state.trip?.route !== this.state.trip?.route &&
      state.progress === undefined &&
      this.state.progress !== undefined &&
      state.trip
    )
      state = { ...state, progress: null };
    this.state = state;
    for (const listener of this.listeners) listener();
  }
  cancel = () => {
    this.progress.reset();
    this.deviation.reset();
    this.completedOnRoute = this.stopConfirmations = this.lastStopFix = 0;
    this.generation++;
    this.request?.abort();
    this.request = null;
    this.update({ trip: null, status: "idle", error: null });
  };
  dispose = () => {
    this.generation++;
    this.request?.abort();
    this.request = null;
  };
  restorePlan = async (plan: RecoveredPlan) => {
    if (this.state.trip || !this.getOrigin()) return false;
    await this.calculate({
      destination: plan.destination,
      stops: plan.stops.map((place) => ({ id: place.id, place })),
      route: null,
    });
    return this.state.status === "ready";
  };
  selectDestination = async (destination: Place) => {
    if (
      this.state.trip?.destination.id === destination.id &&
      (this.state.status === "loading" || this.state.status === "ready")
    )
      return;
    this.deviation.reset();
    this.completedOnRoute = this.stopConfirmations = this.lastStopFix = 0;
    this.request?.abort();
    await this.calculate({ destination, route: null, stops: [] });
  };
  addStop = async (place: Place) => {
    const trip = this.state.trip;
    if (!trip || this.state.status === "loading") return;
    if (trip.destination.source !== "verified") {
      this.update({
        ...this.state,
        error: "Choose a real destination before adding stops.",
      });
      return;
    }
    if (
      place.id === trip.destination.id ||
      trip.stops.some((stop) => stop.place.id === place.id)
    )
      return;
    if (trip.stops.length >= LIMITS.MAX_STOPS) {
      this.update({
        ...this.state,
        error:
          "ROAM supports up to five stops. Remove one before adding another.",
      });
      return;
    }
    if (place.source !== "verified" || !validCoordinate(place.coordinate)) {
      this.update({
        ...this.state,
        error:
          "Only real places with valid coordinates can be added to a route.",
      });
      return;
    }
    const stops = [...trip.stops];
    stops.splice(
      place.verifiedDetour ? detourInsertionIndex(trip, place) : stops.length,
      0,
      { id: place.id, place },
    );
    if (trip.startedAt && trip.route) {
      await this.applyStopsAtomic(trip, stops);
      return;
    }
    await this.calculate({
      ...trip,
      route: null,
      stops,
    });
  };
  removeStop = async (id: string) => {
    const trip = this.state.trip;
    if (
      !trip ||
      this.state.status === "loading" ||
      !trip.stops.some((stop) => stop.id === id)
    )
      return;
    if (trip.startedAt && trip.route) {
      await this.applyStopsAtomic(
        trip,
        trip.stops.filter((stop) => stop.id !== id),
      );
      return;
    }
    await this.calculate({
      ...trip,
      route: null,
      stops: trip.stops.filter((stop) => stop.id !== id),
    });
  };
  retry = async () => {
    if (this.state.trip && this.state.status !== "loading") {
      if (this.state.trip.route) await this.refreshAtomic(this.state.trip);
      else await this.calculate({ ...this.state.trip, route: null });
    }
  };
  observeLocation = (fix: TrackingFix, now = this.now()) => {
    let trip = this.state.trip;
    if (!trip?.startedAt || !trip.route || this.state.status !== "ready")
      return;
    const projection = this.progress.observe(trip.route, fix, now);
    this.update({
      ...this.state,
      progress: projection
        ? { projection, timestamp: fix.timestamp, route: trip.route }
        : null,
    });
    const progress = tripProgress(
      trip,
      fix.coordinate,
      fix.fresh && now - fix.timestamp <= 15_000,
      now,
      fix.accuracy,
      projection,
    );
    if (progress?.estimated)
      this.completedOnRoute = Math.max(
        this.completedOnRoute,
        progress.completedMeters - (trip.completedBeforeRouteMeters ?? 0),
      );
    const nextStop = trip.stops.find((s) => !s.visited);
    if (nextStop && fix.timestamp > this.lastStopFix) {
      this.lastStopFix = fix.timestamp;
      const nearStop =
        fix.fresh &&
        now - fix.timestamp <= 15_000 &&
        fix.timestamp <= now + 1000 &&
        fix.accuracy !== null &&
        fix.accuracy >= 0 &&
        fix.accuracy <= 25 &&
        distanceBetween(fix.coordinate, nextStop.place.coordinate) <= 40;
      this.stopConfirmations = nearStop ? this.stopConfirmations + 1 : 0;
      if (this.stopConfirmations >= 3) {
        trip = {
          ...trip,
          stops: trip.stops.map((s) =>
            s === nextStop ? { ...s, visited: true } : s,
          ),
        };
        this.stopConfirmations = 0;
        this.update({ ...this.state, trip });
      }
    }
    const result = this.deviation.observe(trip.route!, fix, now);
    if (this.state.tracking?.state !== result.state)
      this.update({ ...this.state, tracking: { state: result.state } });
    if (result.reroute)
      void this.refreshAtomic(
        trip,
        undefined,
        "Repeated accurate off-route fixes",
      );
  };
  refreshAtomic = async (
    expected: ActiveTrip,
    signal?: AbortSignal,
    reason = "Route refresh requested",
  ): Promise<boolean> => {
    const previous = this.state;
    if (
      signal?.aborted ||
      previous.trip !== expected ||
      previous.status !== "ready" ||
      !expected.route
    )
      return false;
    const origin = this.getOrigin();
    if (!origin || !validCoordinate(origin)) return false;
    this.deviation.markAttempt(this.now(), reason);
    const generation = ++this.generation;
    this.request?.abort();
    const request = new AbortController();
    this.request = request;
    const abort = () => request.abort();
    signal?.addEventListener("abort", abort, { once: true });
    this.update({
      ...previous,
      status: "loading",
      error: null,
      tracking: { state: "rerouting" },
    });
    let succeeded = false;
    try {
      const route = await this.routes.getRoute(
        origin,
        expected.destination,
        expected.stops.filter((s) => !s.visited),
        { signal: request.signal },
      );
      if (generation !== this.generation || request.signal.aborted)
        return false;
      succeeded = true;
      this.update({
        trip: {
          ...expected,
          route,
          completedBeforeRouteMeters:
            (expected.completedBeforeRouteMeters ?? 0) + this.completedOnRoute,
        },
        status: "ready",
        error: null,
        tracking: { state: "onRoute" },
      });
      this.completedOnRoute = 0;
      return true;
    } catch {
      return false;
    } finally {
      signal?.removeEventListener("abort", abort);
      if (generation === this.generation) {
        if (!succeeded)
          this.update({
            ...previous,
            tracking: {
              state:
                previous.tracking?.state === "possiblyOffRoute"
                  ? "possiblyOffRoute"
                  : "onRoute",
              error:
                "Route refresh failed. Your existing route is kept; retry when GPS and network are ready.",
            },
          });
        this.request = null;
      }
    }
  };
  markStopVisited = (id: string) => {
    const trip = this.state.trip;
    if (
      !trip?.startedAt ||
      this.state.status !== "ready" ||
      !trip.stops.some((s) => s.id === id && !s.visited)
    )
      return;
    this.stopConfirmations = 0;
    this.update({
      ...this.state,
      trip: {
        ...trip,
        stops: trip.stops.map((s) =>
          s.id === id ? { ...s, visited: true } : s,
        ),
      },
    });
  };
  start = () => {
    if (
      this.state.status !== "ready" ||
      !this.state.trip?.route ||
      this.state.trip.startedAt
    )
      return;
    this.update({
      ...this.state,
      trip: {
        ...this.state.trip,
        startedAt: new Date(this.now()).toISOString(),
      },
    });
  };
  // Assistant mutations are transactional: never replace a valid plan on API failure.
  applyStopsAtomic = async (
    expected: ActiveTrip,
    stops: ActiveTrip["stops"],
    signal?: AbortSignal,
  ): Promise<boolean> => {
    const previous = this.state;
    if (
      signal?.aborted ||
      previous.trip !== expected ||
      previous.status !== "ready" ||
      !expected.route ||
      stops.length > LIMITS.MAX_STOPS ||
      stops.some(
        (stop) =>
          stop.place.source !== "verified" ||
          !validCoordinate(stop.place.coordinate) ||
          stop.place.id === expected.destination.id,
      ) ||
      new Set(stops.map((stop) => stop.id)).size !== stops.length
    )
      return false;
    const origin = this.getOrigin();
    if (!origin || !validCoordinate(origin)) return false;
    const generation = ++this.generation;
    this.request?.abort();
    const request = new AbortController();
    this.request = request;
    const abort = () => request.abort();
    signal?.addEventListener("abort", abort, { once: true });
    this.update({ ...previous, status: "loading", error: null });
    try {
      const route = await this.routes.getRoute(
        origin,
        expected.destination,
        stops.filter((s) => !s.visited),
        { signal: request.signal },
      );
      if (generation !== this.generation || request.signal.aborted)
        return false;
      this.update({
        trip: {
          ...expected,
          stops,
          route,
          completedBeforeRouteMeters:
            (expected.completedBeforeRouteMeters ?? 0) + this.completedOnRoute,
        },
        status: "ready",
        error: null,
      });
      this.completedOnRoute = 0;
      return true;
    } catch {
      return false;
    } finally {
      signal?.removeEventListener("abort", abort);
      if (generation === this.generation) {
        if (this.state.status === "loading") this.update(previous);
        this.request = null;
      }
    }
  };
  private async calculate(trip: ActiveTrip) {
    const generation = ++this.generation;
    this.request?.abort();
    const request = new AbortController();
    this.request = request;
    // Clear old geometry, ETA and distance immediately when route inputs change.
    this.update({
      trip: { ...trip, route: null },
      status: trip.destination.source === "mock" ? "idle" : "loading",
      error: null,
    });
    if (trip.destination.source === "mock") {
      this.request = null;
      return;
    }
    try {
      const origin = this.getOrigin();
      if (!origin || !validCoordinate(origin))
        throw new ServiceError(
          "location",
          "A fresh GPS location is needed to calculate a route. Enable location or retry GPS, then retry the route.",
        );
      if (!validCoordinate(trip.destination.coordinate))
        throw new ServiceError(
          "invalid-data",
          "This destination has invalid coordinates. Choose another result.",
        );
      const route = await this.routes.getRoute(
        origin,
        trip.destination,
        trip.stops.filter((s) => !s.visited),
        { signal: request.signal },
      );
      if (generation !== this.generation || request.signal.aborted) return;
      this.update({
        trip: {
          ...trip,
          route,
          completedBeforeRouteMeters:
            (trip.completedBeforeRouteMeters ?? 0) + this.completedOnRoute,
        },
        status: "ready",
        error: null,
      });
      this.completedOnRoute = 0;
    } catch (error) {
      if (
        generation !== this.generation ||
        request.signal.aborted ||
        isCancelled(error)
      )
        return;
      this.update({
        trip: { ...trip, route: null },
        status: "error",
        error: errorMessage(error),
      });
    } finally {
      if (generation === this.generation) this.request = null;
    }
  }
}
