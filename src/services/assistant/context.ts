import type { AssistantContext, PlaceFact } from "../../../shared/assistant";
import type {
  ActiveTrip,
  Coordinate,
  Message,
  Place,
} from "../../types/domain";
import { tripProgress } from "../../utils/tripProgress";
import type { PendingAction } from "./references";
import { LIMITS } from "../../../shared/limits";
import { freshDetour } from "../detours";
import type { NavigationState } from "../navigation/NavigationController";
export function placeFact(place: Place, now = Date.now()): PlaceFact {
  const detour = freshDetour(place, now);
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
    ...(detour
      ? {
          verifiedDetourSeconds: detour.durationSeconds,
          verifiedDetourMeters: detour.distanceMeters,
          detourCalculatedAt: detour.calculatedAt,
          detourProvider: detour.provider ?? "google",
        }
      : {}),
  };
}
export function buildContext(
  trip: ActiveTrip | null,
  location: Coordinate | null,
  fresh: boolean,
  results: Place[],
  pending: PendingAction | null,
  now = Date.now(),
  accuracy?: number | null,
  trackedProjection?: import("../../utils/geo").RouteProjection | null,
  navigation?: NavigationState,
): AssistantContext {
  const guidance =
    navigation?.mode === "native" &&
    !navigation.rerouting &&
    navigation.updatedAt !== null &&
    now - navigation.updatedAt >= 0 &&
    now - navigation.updatedAt <= 15000
      ? navigation.guidance
      : null;
  const progress =
    navigation?.mode === "native"
      ? guidance
        ? {
            distanceMeters: guidance.remainingDistanceMeters,
            durationSeconds: guidance.remainingDurationSeconds,
            arrivalTime: new Date(
              now + guidance.remainingDurationSeconds * 1000,
            ).toISOString(),
            completedMeters: guidance.distanceTraveledMeters ?? 0,
            percentageCompleted: (guidance.fractionTraveled ?? 0) * 100,
            progressAvailable: guidance.fractionTraveled !== undefined,
            estimated: false,
            offRoute: false,
          }
        : null
      : tripProgress(trip, location, fresh, now, accuracy, trackedProjection);
  return {
    destination:
      trip?.destination.source === "verified"
        ? { id: trip.destination.id, name: trip.destination.name }
        : null,
    stops:
      trip?.stops.map((stop) => ({ id: stop.id, name: stop.place.name })) ?? [],
    routeAvailable: Boolean(trip?.route),
    tripStarted: Boolean(trip?.startedAt),
    ...(navigation?.provider || trip?.route?.provider
      ? { routeProvider: navigation?.provider ?? trip!.route!.provider }
      : {}),
    distanceMeters: progress?.distanceMeters ?? null,
    etaSeconds: progress?.durationSeconds ?? null,
    calculatedAt: trip?.route?.calculatedAt ?? null,
    estimatedRemaining: progress?.estimated ?? false,
    offRoute: progress?.offRoute ?? false,
    arrivalTime: progress?.arrivalTime ?? null,
    completedMeters: progress?.progressAvailable
      ? progress.completedMeters
      : null,
    percentageCompleted: progress?.progressAvailable
      ? progress.percentageCompleted
      : null,
    recentResults: results.slice(0, 5).map((place) => placeFact(place, now)),
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
    .slice(-LIMITS.MAX_AI_HISTORY_MESSAGES)
    .map(({ role, text }) => ({ role, text: text.slice(0, 1200) }));
}
