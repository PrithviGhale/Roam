import type {
  ActiveTrip,
  Coordinate,
  Place,
  RoutesService,
  TripState,
} from "../types/domain";
import { validCoordinate } from "../utils/location";
import { errorMessage, isCancelled, ServiceError } from "./errors";

export class TripController {
  private state: TripState = { trip: null, status: "idle", error: null };
  private listeners = new Set<() => void>();
  private request: AbortController | null = null;
  private generation = 0;
  constructor(
    private routes: RoutesService,
    private getOrigin: () => Coordinate | null,
  ) {}
  getSnapshot = () => this.state;
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
  private update(state: TripState) {
    this.state = state;
    for (const listener of this.listeners) listener();
  }
  cancel = () => {
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
  selectDestination = async (destination: Place) => {
    if (
      this.state.trip?.destination.id === destination.id &&
      (this.state.status === "loading" || this.state.status === "ready")
    )
      return;
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
    if (trip.stops.length >= 5) {
      this.update({
        ...this.state,
        error:
          "V0.2 supports up to five stops. Remove one before adding another.",
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
    await this.calculate({
      ...trip,
      route: null,
      stops: [...trip.stops, { id: place.id, place }],
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
    await this.calculate({
      ...trip,
      route: null,
      stops: trip.stops.filter((stop) => stop.id !== id),
    });
  };
  retry = async () => {
    if (this.state.trip && this.state.status !== "loading")
      await this.calculate({ ...this.state.trip, route: null });
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
      trip: { ...this.state.trip, startedAt: new Date().toISOString() },
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
      stops.length > 5 ||
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
        stops,
        { signal: request.signal },
      );
      if (generation !== this.generation || request.signal.aborted)
        return false;
      this.update({
        trip: { ...expected, stops, route },
        status: "ready",
        error: null,
      });
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
        trip.stops,
        { signal: request.signal },
      );
      if (generation !== this.generation || request.signal.aborted) return;
      this.update({ trip: { ...trip, route }, status: "ready", error: null });
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
