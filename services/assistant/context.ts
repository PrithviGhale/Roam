import type { AssistantContext, PlaceFact } from "../../shared/assistant";
import type {
  ActiveTrip,
  Coordinate,
  Message,
  Place,
} from "../../types/domain";
import { tripProgress } from "../../utils/tripProgress";
import type { PendingAction } from "./references";
export function placeFact(place: Place): PlaceFact {
  const {
    id,
    name,
    address,
    rating,
    openNow,
    distanceMeters,
    aheadMeters,
    routeOffsetMeters,
  } = place;
  return {
    id,
    name,
    ...(address ? { address } : {}),
    ...(rating !== undefined ? { rating } : {}),
    ...(openNow !== undefined ? { openNow } : {}),
    ...(distanceMeters !== undefined ? { distanceMeters } : {}),
    ...(aheadMeters !== undefined ? { aheadMeters } : {}),
    ...(routeOffsetMeters !== undefined ? { routeOffsetMeters } : {}),
  };
}
export function buildContext(
  trip: ActiveTrip | null,
  location: Coordinate | null,
  fresh: boolean,
  results: Place[],
  pending: PendingAction | null,
): AssistantContext {
  const progress = tripProgress(trip, location, fresh);
  return {
    destination:
      trip?.destination.source === "verified"
        ? { id: trip.destination.id, name: trip.destination.name }
        : null,
    stops:
      trip?.stops.map((stop) => ({ id: stop.id, name: stop.place.name })) ?? [],
    routeAvailable: Boolean(trip?.route),
    tripStarted: Boolean(trip?.startedAt),
    distanceMeters: progress?.distanceMeters ?? null,
    etaSeconds: progress?.durationSeconds ?? null,
    calculatedAt: trip?.route?.calculatedAt ?? null,
    estimatedRemaining: progress?.estimated ?? false,
    offRoute: progress?.offRoute ?? false,
    recentResults: results.slice(0, 5).map(placeFact),
    pending: pending
      ? {
          action: pending.action,
          ...(pending.id ? { id: pending.id } : {}),
          ...(pending.name ? { name: pending.name } : {}),
        }
      : null,
  };
}
export function compactHistory(messages: Message[]) {
  return messages
    .filter((message) => !message.error)
    .slice(-12)
    .map(({ role, text }) => ({ role, text: text.slice(0, 1200) }));
}
