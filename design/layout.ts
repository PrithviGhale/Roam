import type { TripState } from "../types/domain";
export function tripMode(state: TripState): "planning" | "driving" {
  return state.trip?.startedAt &&
    state.trip.destination.source === "verified" &&
    state.trip.route
    ? "driving"
    : "planning";
}
export function phoneLayout(width: number, height: number) {
  return {
    compact: height < 740 || width < 375,
    gutter: width < 375 ? 16 : 20,
    contentMax: 560,
    tabHeight: 64,
  };
}
export type MapOverlay =
  | { kind: "closed" }
  | { kind: "assistant" }
  | {
      kind: "places";
      category: import("../types/domain").PlaceCategory | null;
    };
export function overlayReducer(
  _previous: MapOverlay,
  next: MapOverlay,
): MapOverlay {
  return next;
}
